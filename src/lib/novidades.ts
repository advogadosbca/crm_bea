import type { SupabaseClient } from '@supabase/supabase-js'
import type { TipoComunicacao } from './ia-classificacao'

/**
 * Aprovação de uma comunicação: vira um cartão no Quadro de Tarefas do /geral,
 * com o TEOR da publicação na descrição.
 *
 * UM LUGAR SÓ, DE PROPÓSITO. Por um tempo a aprovação criava também uma linha
 * em `Pendências Processuais`, e o resultado foi a mesma tarefa em dois lugares:
 * duas listas para conferir, duas para dar baixa, e nenhuma garantia de que
 * concordassem. O quadro ganhou porque é onde a equipe trabalha o dia a dia — e
 * porque ele carrega o que a pendência não carregava: o texto da publicação
 * dentro do próprio cartão, sem obrigar a voltar à Central de Novidades.
 *
 * Nada se perdeu no caminho: a data de retorno virou o prazo do cartão, os
 * responsáveis viraram os membros, a prioridade virou etiqueta e o cliente virou
 * o vínculo que faz a tarefa aparecer na ficha dele.
 *
 * `Audiências` continua sendo criada à parte quando for o caso — ali não é
 * controle de tarefa, é o fluxo de 1ª/2ª Comunicação e Confirmação com o
 * cliente, que o quadro não substitui.
 */

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
 * Prioridade escolhida na aprovação -> etiqueta do Quadro. Usa as etiquetas que
 * o escritório já criou; se o nome não existir no quadro, o cartão fica sem
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
  tipoTarefa: string
  prioridade: string
  dataRetorno: string | null      // prazo final ou data do evento
  membros: string[]               // profile ids
  observacao: string              // vai para o campo de contato/resumo
  criarAudiencia: boolean
  audienciaData: string | null
  audienciaHora: string | null
}

export interface ResultadoAprovacao {
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
 * Cria o cartão (e a linha de audiência, quando for o caso). Idempotência é do
 * chamador: a rota só chama isto enquanto a comunicação não está aprovada, para
 * aprovar duas vezes não gerar duas tarefas.
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
  const out: ResultadoAprovacao = { audienciaRowId: null, cartaoId: null }

  // ---------- Cartão no Quadro de Tarefas ----------
  // Primeiro, e deixando o erro subir: agora o cartão é o resultado da
  // aprovação, não um extra. Engolir a falha aqui marcaria a comunicação como
  // aprovada e tirava ela da caixa sem ter gerado tarefa nenhuma — o advogado
  // veria "tratada" e a intimação não existiria em lugar nenhum.
  out.cartaoId = await criarCartao({ admin, workspaceId, autorId, cnj, cliente, clienteRowId, dados, teor })

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
  if (dados.tipoTarefa) linhas.push(`Tipo de tarefa: ${dados.tipoTarefa}`)
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
 * Estoura se o quadro não tiver coluna nenhuma, em vez de criar uma: quadro
 * vazio é escolha do escritório, e inventar estrutura na aprovação de uma
 * intimação é o tipo de surpresa que ninguém pediu. Melhor a aprovação recusar
 * com o motivo à vista do que aprovar em silêncio sem gerar tarefa.
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
}): Promise<string> {
  const { data: listas } = await admin.from('board_lists')
    .select('id, title').eq('workspace_id', workspaceId).order('position')
  if (!listas?.length) throw new Error('O Quadro de Tarefas não tem nenhuma coluna — crie uma (ex.: "A fazer") na aba Geral antes de aprovar.')
  const lista = listas.find(l => String(l.title).trim().toLowerCase() === 'a fazer') || listas[0]

  const { count } = await admin.from('board_cards')
    .select('id', { count: 'exact', head: true }).eq('list_id', lista.id)

  // "Prazo · Fulano de Tal — 0010187-76.2026.5.03.0057": o que a tarefa é, de
  // quem é, e em qual processo. Sem cliente cadastrado sobra tipo + processo.
  const titulo = [
    dados.tipoTarefa || ROTULO_TIPO[dados.tipo] || 'Comunicação',
    cliente ? `${cliente} — ${formatarCnj(cnj)}` : formatarCnj(cnj),
  ].join(' · ')

  const { data: cartao, error } = await admin.from('board_cards').insert({
    workspace_id: workspaceId,
    list_id: lista.id,
    title: titulo,
    description: descricaoDoCartao(cnj, cliente, dados, teor),
    due_date: aoMeioDia(dados.dataRetorno),
    position: count ?? 0,
    created_by: autorId,
  }).select('id').single()
  if (error || !cartao) throw new Error(`não deu para criar o cartão no Quadro de Tarefas: ${error?.message || 'resposta vazia'}`)
  const cardId = cartao.id as string

  // responsáveis escolhidos na aprovação: a tarefa nasce com dono
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
