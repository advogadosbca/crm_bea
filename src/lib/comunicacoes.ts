import type { SupabaseClient } from '@supabase/supabase-js'
import { limparTexto, soData, soDigitos, textoDe, type ColsProcessos } from './processos-sync'

/**
 * Ingestão das comunicações processuais na tabela append-only `comunicacoes`.
 *
 * A célula "Atualização Comunica" da fonte de Processos continua existindo como
 * prévia, mas quem guarda o histórico é esta tabela: uma linha por publicação,
 * imutável, com o texto inteiro.
 */

/** Item cru do DJEN, como a API `comunicaapi.pje.jus.br` devolve. */
export interface ItemDjen {
  id?: number | string
  hash?: string
  texto?: string
  data_disponibilizacao?: string
  tipoComunicacao?: string
  tipoDocumento?: string
  nomeClasse?: string
  nomeOrgao?: string
  siglaTribunal?: string
  meio?: string
  link?: string
  ativo?: boolean
  motivo_cancelamento?: string
  destinatarios?: { nome?: string; polo?: string }[]
  destinatarioadvogados?: { advogado?: { nome?: string; numero_oab?: string; uf_oab?: string } }[]
}

export interface ResultadoIngestao {
  recebidas: number
  inseridas: number
  jaExistiam: number
  /** das inseridas, quantas entraram já tratadas por serem acervo antigo */
  historicas: number
  ids: string[]
}

/** só os dígitos da OAB — o DJEN às vezes manda "205660" e o perfil "MG 205.660" */
const normOab = (v: unknown) => textoDe(v).replace(/\D/g, '')

/**
 * Quem trata o processo no escritório. Vem da coluna "Responsável" (tipo
 * `people` = array de profile ids). Não confundir com o advogado intimado: só
 * dois advogados aparecem nas comunicações do DJEN, mas quem faz a reunião com
 * o cliente costuma ser outra pessoa da equipe.
 */
function responsaveisDaLinha(data: Record<string, unknown>, cols: ColsProcessos): string[] {
  if (!cols.responsavel) return []
  const v = data[cols.responsavel]
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  return v ? [String(v)] : []
}

/**
 * Casa `destinatarioadvogados` do DJEN com os perfis do sistema pela OAB.
 * Quando não há perfil com aquela OAB, o advogado é registrado mesmo assim
 * (com `profile_id: null`) — a informação de quem foi intimado não se perde só
 * porque ninguém preencheu a OAB no perfil.
 */
function advogadosIntimados(item: ItemDjen, porOab: Map<string, string>) {
  return (item.destinatarioadvogados || [])
    .map(d => d.advogado)
    .filter(Boolean)
    .map(a => ({
      nome: textoDe(a!.nome),
      oab: textoDe(a!.numero_oab),
      uf: textoDe(a!.uf_oab),
      profile_id: porOab.get(normOab(a!.numero_oab)) || null,
    }))
}

/**
 * Insere as publicações ainda desconhecidas.
 *
 * A checagem do que já existe é feita por consulta antes do insert (barato: um
 * processo tem poucas publicações) e o índice único do banco é a rede de
 * segurança — se duas execuções correrem juntas, a segunda leva 23505 e o erro
 * é ignorado de propósito. Reprocessar nunca duplica.
 */
export async function ingerirPublicacoes({ admin, workspaceId, cols, rowId, cnj, linha, itens }: {
  admin: SupabaseClient
  workspaceId: string
  cols: ColsProcessos
  rowId: string | null
  cnj: string
  linha: Record<string, unknown>
  itens: ItemDjen[]
}): Promise<ResultadoIngestao> {
  const validas = itens.filter(i => limparTexto(i.texto) && i.data_disponibilizacao)
  if (!validas.length) return { recebidas: itens.length, inseridas: 0, jaExistiam: 0, historicas: 0, ids: [] }

  // perfis com OAB preenchida, para marcar qual advogado do escritório foi intimado
  const { data: perfis } = await admin
    .from('profiles').select('id, oab').eq('workspace_id', workspaceId).not('oab', 'is', null)
  const porOab = new Map<string, string>()
  for (const p of perfis || []) {
    const k = normOab((p as { oab: string }).oab)
    if (k) porOab.set(k, (p as { id: string }).id)
  }

  // o que já está gravado para este processo
  const { data: existentes } = await admin
    .from('comunicacoes').select('external_id, hash_origem')
    .eq('workspace_id', workspaceId).eq('cnj', cnj)

  // Primeira vez que este processo aparece na base. Importa porque o DJEN não
  // devolve "o que mudou": devolve TODAS as publicações do processo, desde
  // sempre. Sem distinguir, a estreia de um processo despeja anos de histórico
  // na caixa como se fosse novidade do dia — foi o que aconteceu em 14/08/2026,
  // quando 104 das 106 entradas do dia eram acervo (a mais antiga de fev/2025)
  // e só 2 eram publicação daquele dia.
  const primeiraVezDesteProcesso = !(existentes || []).length
  const idsConhecidos = new Set((existentes || []).map(e => textoDe((e as { external_id: string }).external_id)).filter(Boolean))
  const hashConhecidos = new Set((existentes || []).map(e => textoDe((e as { hash_origem: string }).hash_origem)).filter(Boolean))

  const responsaveis = responsaveisDaLinha(linha, cols)

  const novas = validas.filter(i => {
    const eid = textoDe(i.id)
    const h = textoDe(i.hash)
    if (eid && idsConhecidos.has(eid)) return false
    if (!eid && h && hashConhecidos.has(h)) return false
    return true
  })

  if (!novas.length) {
    return { recebidas: itens.length, inseridas: 0, jaExistiam: validas.length, historicas: 0, ids: [] }
  }

  // Corte do que é histórico: ONTEM, não hoje. A rodada é diária e roda de
  // madrugada, então publicação de verdade nova tem no máximo um dia de idade.
  // Usar a data de ontem em vez de "hoje" também tira do caminho a diferença
  // de fuso entre o servidor (UTC) e o Brasil, que perto da meia-noite faria
  // a publicação do próprio dia parecer véspera.
  const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const agora = new Date().toISOString()

  /**
   * Publicação anterior à entrada do processo no monitoramento entra JÁ TRATADA:
   * fica registrada e pesquisável em "Tratadas", mas não disputa a atenção de
   * quem abre a caixa. Só o que for publicado depois que o escritório passou a
   * acompanhar o processo conta como novidade.
   *
   * A regra vale só na estreia do processo. Depois disso, publicação antiga
   * detectada com atraso é notícia de verdade — o tribunal pode demorar a
   * mandar ao DJEN, e esconder isso seria perder prazo.
   */
  const ehHistorico = (i: ItemDjen) =>
    primeiraVezDesteProcesso && soData(i.data_disponibilizacao) < ontem

  const registros = novas.map(i => ({
    workspace_id: workspaceId,
    processo_row_id: rowId,
    cnj,
    fonte: 'djen',
    ...(ehHistorico(i)
      ? {
          status: 'dispensada',
          dispensada_motivo: 'histórico do processo, anterior ao monitoramento',
          lida_em: agora,
          aprovada_em: agora,
        }
      : {}),
    external_id: textoDe(i.id) || null,
    hash_origem: textoDe(i.hash) || null,
    texto: limparTexto(i.texto),
    data_publicacao: soData(i.data_disponibilizacao) || null,
    tipo_comunicacao: textoDe(i.tipoComunicacao) || null,
    tipo_documento: textoDe(i.tipoDocumento) || null,
    nome_classe: textoDe(i.nomeClasse) || null,
    orgao: textoDe(i.nomeOrgao) || null,
    tribunal: textoDe(i.siglaTribunal) || null,
    meio: textoDe(i.meio) || null,
    link: textoDe(i.link) || null,
    advogados_intimados: advogadosIntimados(i, porOab),
    partes: (i.destinatarios || []).map(d => ({ nome: textoDe(d.nome), polo: textoDe(d.polo) })),
    responsaveis,
    // o tribunal pode cancelar uma publicação já divulgada
    cancelada: i.ativo === false || !!i.motivo_cancelamento,
    cancelada_motivo: textoDe(i.motivo_cancelamento) || null,
  }))

  const { data: inseridas, error } = await admin
    .from('comunicacoes').insert(registros).select('id')

  // 23505 = corrida com outra execução; o índice único fez o trabalho dele
  if (error && error.code !== '23505') throw new Error(`falha ao gravar comunicações: ${error.message}`)

  return {
    recebidas: itens.length,
    inseridas: (inseridas || []).length,
    jaExistiam: validas.length - novas.length,
    historicas: novas.filter(ehHistorico).length,
    ids: (inseridas || []).map(r => (r as { id: string }).id),
  }
}

/**
 * Mantém `comunicacoes.responsaveis` alinhado com a coluna "Responsável" do
 * processo. Sem isso, trocar o responsável no CRM não mudaria o dono das
 * novidades que já estão na caixa — que é justamente quando a troca importa.
 * Só mexe nas ainda não tratadas: comunicação aprovada é registro histórico.
 */
export async function sincronizarResponsaveis({ admin, workspaceId, cnj, linha, cols }: {
  admin: SupabaseClient
  workspaceId: string
  cnj: string
  linha: Record<string, unknown>
  cols: ColsProcessos
}) {
  const responsaveis = responsaveisDaLinha(linha, cols)
  await admin.from('comunicacoes')
    .update({ responsaveis })
    .eq('workspace_id', workspaceId).eq('cnj', cnj).eq('status', 'nova')
}

/** dígitos do CNJ a partir de qualquer formato, para uso das rotas */
export const cnjNormalizado = (v: unknown) => soDigitos(v)
