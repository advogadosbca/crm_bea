import type { SupabaseClient } from '@supabase/supabase-js'
import type { TipoComunicacao } from './ia-classificacao'

/**
 * Aprovação de uma comunicação: vira tarefa no quadro que já existe.
 *
 * Não há quadro novo. `Pendências Processuais` já tem a forma certa (Número do
 * Processo, Status, Data de Retorno, Membros, Prioridade, Tipo de Pendência), e
 * `Audiências` já tem o fluxo de lembrete ao cliente (1ª/2ª Comunicação e
 * Confirmação). Aprovar cria sempre uma pendência e, quando for audiência,
 * também a linha de audiência.
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
}

/**
 * Cria as linhas. Idempotência é do chamador: a rota só chama isto quando
 * `pendencia_row_id` ainda está nulo, para aprovar duas vezes não gerar duas
 * tarefas.
 */
export async function criarTarefas({ admin, workspaceId, cnj, cliente, dados }: {
  admin: SupabaseClient
  workspaceId: string
  cnj: string
  cliente: string
  dados: DadosAprovacao
}): Promise<ResultadoAprovacao> {
  const out: ResultadoAprovacao = { pendenciaRowId: null, audienciaRowId: null }

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

  return out
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
