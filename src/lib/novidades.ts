import type { SupabaseClient } from '@supabase/supabase-js'
import type { TipoComunicacao } from './ia-classificacao'

/**
 * Aprovação de uma comunicação: vira tarefa nos quadros que já existem.
 *
 * Não há quadro novo. `Pendências Processuais` já tem a forma certa (Número do
 * Processo, Status, Data de Retorno, Membros, Prioridade, Tipo de Pendência), e
 * `Audiências` já tem o fluxo de lembrete ao cliente (1ª/2ª Comunicação e
 * Confirmação). Aprovar cria sempre uma pendência e, quando for audiência,
 * também a linha de audiência.
 *
 * E cria também um cartão no Quadro de Tarefas do /geral, com o TEOR da
 * publicação na descrição. A pendência é o controle (prazo, status, quem
 * responde); o cartão é onde a equipe trabalha o dia a dia — sem o teor ali
 * dentro, ler o que o juiz mandou exigia voltar à Central de Novidades.
 */

/** Sugestão de "Tipo de Pendência" a partir do que a IA leu. Vazio = o advogado escolhe. */
const TIPO_PENDENCIA: Record<TipoComunicacao, string> = {
  audiencia: 'Conversar com cliente',
  pericia: 'Conversar com cliente',
  prazo: 'Manifestar no Processo',
  sentenca: 'Manifestar no Processo',
  acordao: 'Manifestar no Processo',
  alvara: 'Alvará judicial',
  despacho: '',
  arquivamento: '',
  outro: '',
}

export const tipoPendenciaSugerido = (t?: TipoComunicacao | null) => (t ? TIPO_PENDENCIA[t] || '' : '')

/** Rótulo humano do tipo — abre o título do cartão no Quadro de Tarefas. */
const ROTULO_TIPO: Record<TipoComunicacao, string> = {
  audiencia: 'Audiência',
  pericia: 'Perícia',
  prazo: 'Prazo',
  sentenca: 'Sentença',
  acordao: 'Acórdão',
  alvara: 'Alvará',
  despacho: 'Despacho',
  arquivamento: 'Arquivamento',
  outro: 'Comunicação',
}

/**
 * Prioridade da pendência -> etiqueta do Quadro. Usa as etiquetas que o
 * escritório já criou; se o nome não existir no quadro, o cartão fica sem
 * etiqueta. Criar etiqueta nova por conta própria encheria a paleta de
 * duplicatas ("Alta" ao lado de "alta prioridade") sem ninguém pedir.
 */
const ETIQUETA_PRIORIDADE: Record<string, string> = {
  Urgente: 'alta prioridade',
  Alta: 'alta prioridade',
  Média: 'média prioridade',
  Baixa: 'baixa prioridade',
}

/** Formata 20 dígitos no padrão CNJ. */
export const formatarCnj = (d: string) =>
  d.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}` : d

interface Coluna { id: string; name: string; type: string; config: { options?: { id: string; label: string }[] } }

/**
 * Resolve o valor a gravar numa coluna de etiqueta. As linhas guardam ora o id
 * da opção, ora o rótulo — a leitura aceita os dois, então aqui prefere-se o id
 * quando a opção existe, e o texto puro quando não existe (a célula mostra o
 * texto e o advogado ajusta depois).
 */
function valorDeOpcao(col: Coluna | undefined, rotulo: string): string | null {
  if (!col || !rotulo) return null
  const achada = (col.config?.options || []).find(o => o.label.toLowerCase() === rotulo.toLowerCase())
  return achada ? achada.id : rotulo
}

async function colunasDe(admin: SupabaseClient, workspaceId: string, moduleKey: string) {
  const { data: t } = await admin.from('db_tables').select('id')
    .eq('workspace_id', workspaceId).eq('module_key', moduleKey).maybeSingle()
  if (!t) return null
  const { data: cols } = await admin.from('db_columns').select('id, name, type, config').eq('table_id', t.id)
  const lista = (cols || []) as Coluna[]
  return {
    tableId: t.id as string,
    lista,
    por: (nome: string) => lista.find(c => c.name === nome),
  }
}

async function proximaPosicao(admin: SupabaseClient, tableId: string) {
  const { count } = await admin.from('db_rows')
    .select('id', { count: 'exact', head: true }).eq('table_id', tableId)
  return count ?? 0
}

export interface DadosAprovacao {
  tipo: TipoComunicacao
  tipoPendencia: string
  prioridade: string
  dataRetorno: string | null      // prazo final ou data do evento
  membros: string[]               // profile ids
  observacao: string              // vai para o campo de contato/resumo
  criarAudiencia: boolean
  audienciaData: string | null
  audienciaHora: string | null
}

export interface ResultadoAprovacao {
  pendenciaRowId: string | null
  audienciaRowId: string | null
  cartaoId: string | null
}

/**
 * O que a comunicação traz para dentro do cartão. Vem da linha de
 * `comunicacoes` — o teor inteiro, não o resumo: quem abre a tarefa precisa ler
 * a publicação como ela saiu no diário, sem confiar na leitura da IA.
 */
export interface TeorComunicacao {
  texto: string
  resumo: string
  link: string
  tribunal: string
  orgao: string
  dataPublicacao: string | null
}

/**
 * Cria as linhas. Idempotência é do chamador: a rota só chama isto quando
 * `pendencia_row_id` ainda está nulo, para aprovar duas vezes não gerar duas
 * tarefas.
 */
export async function criarTarefas({ admin, workspaceId, autorId, cnj, cliente, clienteRowId, dados, teor }: {
  admin: SupabaseClient
  workspaceId: string
  /** quem aprovou: vira o autor do cartão e das entradas de histórico */
  autorId: string
  cnj: string
  cliente: string
  /** linha do cliente na fonte Clientes — sem ela a tarefa não aparece na ficha dele */
  clienteRowId: string | null
  dados: DadosAprovacao
  teor: TeorComunicacao
}): Promise<ResultadoAprovacao> {
  const out: ResultadoAprovacao = { pendenciaRowId: null, audienciaRowId: null, cartaoId: null }

  // ---------- Pendência ----------
  const pend = await colunasDe(admin, workspaceId, 'pendencias')
  if (pend) {
    const d: Record<string, unknown> = {}
    const set = (nome: string, valor: unknown) => {
      const c = pend.por(nome)
      if (c && valor !== null && valor !== undefined && valor !== '') d[c.id] = valor
    }
    set('Número do Processo', formatarCnj(cnj))
    set('Status', valorDeOpcao(pend.por('Status'), 'Pendente'))
    set('Tipo de Pendência', valorDeOpcao(pend.por('Tipo de Pendência'), dados.tipoPendencia))
    set('Prioridade', valorDeOpcao(pend.por('Prioridade'), dados.prioridade))
    set('Data de Retorno', dados.dataRetorno)
    set('Contato', cliente)
    if (dados.membros.length) set('Membros', dados.membros)

    const { data } = await admin.from('db_rows').insert({
      table_id: pend.tableId, data: d, position: await proximaPosicao(admin, pend.tableId),
    }).select('id').single()
    out.pendenciaRowId = (data?.id as string) || null
  }

  // ---------- Audiência ----------
  if (dados.criarAudiencia && dados.audienciaData) {
    const aud = await colunasDe(admin, workspaceId, 'audiencias')
    if (aud) {
      const d: Record<string, unknown> = {}
      const set = (nome: string, valor: unknown) => {
        const c = aud.por(nome)
        if (c && valor !== null && valor !== undefined && valor !== '') d[c.id] = valor
      }
      set('Data da Audiência', dados.audienciaData)
      set('1ª Comunicação', valorDeOpcao(aud.por('1ª Comunicação'), 'Pendente'))
      set('2ª Comunicação', valorDeOpcao(aud.por('2ª Comunicação'), 'Pendente'))
      if (dados.membros.length) set('Advogado Responsável', dados.membros)

      const { data } = await admin.from('db_rows').insert({
        table_id: aud.tableId, data: d, position: await proximaPosicao(admin, aud.tableId),
      }).select('id').single()
      out.audienciaRowId = (data?.id as string) || null
    }
  }

  // ---------- Cartão no Quadro de Tarefas ----------
  // Depois das linhas, e sem derrubar a aprovação se falhar: a pendência já
  // está gravada e a comunicação já saiu da caixa. Perder o cartão é chato;
  // estourar aqui deixaria a rota respondendo erro para uma aprovação que
  // aconteceu, e o advogado aprovaria de novo achando que não pegou.
  try {
    out.cartaoId = await criarCartao({ admin, workspaceId, autorId, cnj, cliente, clienteRowId, dados, teor })
  } catch { /* quadro indisponível — a pendência continua valendo */ }

  return out
}

/** dd/mm/aaaa a partir de um YYYY-MM-DD, sem passar por Date (fuso não entra nisso). */
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : iso
}

/**
 * Prazo ao meio-dia, não à meia-noite.
 *
 * `due_date` é timestamptz e a tela formata em horário de Brasília. Gravar
 * "2026-08-25" cru vira meia-noite UTC = 21h do dia 24 no fuso daqui, e o
 * cartão passa a exibir um prazo um dia mais cedo do que o advogado digitou.
 */
const aoMeioDia = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toISOString() : null)

/**
 * Descrição do cartão: cabeçalho curto para bater o olho + o teor inteiro.
 *
 * O resumo da IA vem primeiro porque é o que se lê em três segundos, mas ele
 * não substitui a publicação — logo abaixo vai o texto como saiu no diário,
 * para conferência sem sair do cartão.
 */
function descricaoDoCartao(cnj: string, cliente: string, dados: DadosAprovacao, teor: TeorComunicacao) {
  const linhas: string[] = []
  if (teor.resumo) linhas.push(teor.resumo, '')

  linhas.push(`Processo: ${formatarCnj(cnj)}`)
  if (cliente) linhas.push(`Cliente: ${cliente}`)
  const foro = [teor.tribunal, teor.orgao].filter(Boolean).join(' · ')
  if (foro) linhas.push(`Órgão: ${foro}`)
  if (teor.dataPublicacao) linhas.push(`Publicado em: ${dataBr(teor.dataPublicacao)}`)
  if (dados.tipoPendencia) linhas.push(`Tipo de pendência: ${dados.tipoPendencia}`)
  if (dados.dataRetorno) linhas.push(`Prazo / data de retorno: ${dataBr(dados.dataRetorno)}`)
  if (dados.criarAudiencia && dados.audienciaData) {
    linhas.push(`Audiência: ${dataBr(dados.audienciaData)}${dados.audienciaHora ? ` às ${dados.audienciaHora}` : ''}`)
  }
  if (teor.link) linhas.push(`Publicação: ${teor.link}`)

  linhas.push('', '--- Teor da comunicação ---', '', teor.texto.trim())
  return linhas.join('\n')
}

/**
 * Cria o cartão no Quadro de Tarefas (o do /geral).
 *
 * Cai na primeira coluna do quadro — "A fazer" quando ela existe com esse nome,
 * senão a de menor posição. Entrar direto numa coluna de andamento seria mentir
 * sobre o estado da tarefa: ninguém começou nada ainda.
 *
 * Devolve null quando o quadro não tem nenhuma coluna. Não cria coluna sozinho:
 * quadro vazio é escolha do escritório, e inventar estrutura na aprovação de uma
 * intimação é o tipo de surpresa que ninguém pediu.
 */
async function criarCartao({ admin, workspaceId, autorId, cnj, cliente, clienteRowId, dados, teor }: {
  admin: SupabaseClient
  workspaceId: string
  autorId: string
  cnj: string
  cliente: string
  clienteRowId: string | null
  dados: DadosAprovacao
  teor: TeorComunicacao
}): Promise<string | null> {
  const { data: listas } = await admin.from('board_lists')
    .select('id, title').eq('workspace_id', workspaceId).order('position')
  if (!listas?.length) return null
  const lista = listas.find(l => String(l.title).trim().toLowerCase() === 'a fazer') || listas[0]

  const { count } = await admin.from('board_cards')
    .select('id', { count: 'exact', head: true }).eq('list_id', lista.id)

  // "Prazo · Fulano de Tal — 0010187-76.2026.5.03.0057": o que a tarefa é, de
  // quem é, e em qual processo. Sem cliente cadastrado sobra tipo + processo.
  const titulo = [
    dados.tipoPendencia || ROTULO_TIPO[dados.tipo] || 'Comunicação',
    cliente ? `${cliente} — ${formatarCnj(cnj)}` : formatarCnj(cnj),
  ].join(' · ')

  const { data: cartao } = await admin.from('board_cards').insert({
    workspace_id: workspaceId,
    list_id: lista.id,
    title: titulo,
    description: descricaoDoCartao(cnj, cliente, dados, teor),
    due_date: aoMeioDia(dados.dataRetorno),
    position: count ?? 0,
    created_by: autorId,
  }).select('id').single()
  if (!cartao) return null
  const cardId = cartao.id as string

  // mesmos responsáveis da pendência: a tarefa nasce com dono
  if (dados.membros.length) {
    await admin.from('board_card_members')
      .insert(dados.membros.map(profile_id => ({ card_id: cardId, profile_id })))
  }

  const nomeEtiqueta = ETIQUETA_PRIORIDADE[dados.prioridade]
  if (nomeEtiqueta) {
    const { data: etiquetas } = await admin.from('board_labels')
      .select('id, name').eq('workspace_id', workspaceId)
    const achada = (etiquetas || []).find(e => String(e.name).trim().toLowerCase() === nomeEtiqueta)
    if (achada) await admin.from('board_card_labels').insert({ card_id: cardId, label_id: achada.id })
  }

  // Vínculo com o cliente. É este registro que faz a tarefa aparecer na ficha
  // dele (RecordTasks lê board_activity kind 'contact'), então o formato do
  // texto precisa ser exatamente o que o botão "Cliente" do cartão grava.
  if (clienteRowId) {
    await admin.from('board_activity').insert({
      card_id: cardId, user_id: autorId, kind: 'contact',
      text: JSON.stringify({ contactId: clienteRowId, name: cliente || 'Cliente' }),
    })
  }

  await admin.from('board_activity').insert({
    card_id: cardId, user_id: autorId, kind: 'event',
    text: 'criou o cartão ao aprovar uma comunicação na Central de Novidades',
  })

  return cardId
}

/**
 * Prioridade sugerida. Prazo curto sobe para Urgente porque é o caso em que
 * chegar tarde custa caro; audiência e perícia entram como Alta por terem data
 * marcada.
 */
export function prioridadeSugerida(tipo: TipoComunicacao, dataAlvo: string | null): string {
  if (dataAlvo) {
    const dias = Math.ceil((new Date(`${dataAlvo}T12:00:00Z`).getTime() - Date.now()) / 86400000)
    if (dias <= 5) return 'Urgente'
    if (dias <= 15) return 'Alta'
  }
  if (tipo === 'audiencia' || tipo === 'pericia') return 'Alta'
  if (tipo === 'prazo') return 'Alta'
  return 'Média'
}
