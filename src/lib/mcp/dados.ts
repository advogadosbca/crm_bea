import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/db-rows'
import {
  type DBColumn, type DBRow, type DataSource,
  filterAdminOnly, formatNumber, recordTitle, relationLabel, rollupText,
} from '@/types/dynamic'

/**
 * Leitura do CRM para o conector do Claude — SÓ LEITURA, sempre.
 *
 * Tudo aqui é `select`. O conector usa a service role (o Claude não tem sessão
 * do Supabase), então quem garante que nada é gravado é este arquivo e as
 * ferramentas que o usam: não existe caminho de escrita no /api/mcp.
 *
 * Os dados do escritório moram quase todos nas tabelas dinâmicas (db_tables /
 * db_columns / db_rows): Clientes, Leads, Processos Judiciais, Pendências,
 * Audiências, Financeiro... As colunas são achadas pelo NOME e o valor é
 * traduzido para texto do jeito que a tela mostra (opção de seleção pelo
 * rótulo, relação pelo nome do registro, pessoa pelo nome) — o Claude nunca
 * vê UUID de coluna.
 */

export interface Contexto {
  admin: SupabaseClient
  workspaceId: string
  isAdmin: boolean
}

export interface Fonte extends DataSource {
  module_key?: string | null
}

export interface Retrato {
  fontes: Fonte[]
  /** id da linha -> onde ela mora */
  linhas: Map<string, { fonte: Fonte; row: DBRow }>
  /** id do perfil -> nome */
  pessoas: Map<string, string>
  equipe: { id: string; nome: string; papel: string }[]
  workspaceNome: string
}

/* ------------------------------------------------------------------ texto */

/** minúsculo e sem acento, para busca tolerante ("Audiência" == "audiencia") */
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')
export const corta = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const FUSO = 'America/Sao_Paulo'

/** "2026-11-17" -> "17/11/2026"; com hora, no fuso de Brasília (o servidor roda em UTC) */
export function dataBR(v: unknown, comHora = false): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { start?: unknown; end?: unknown }
    if (o.start) return [dataBR(o.start, comHora), o.end ? dataBR(o.end, comHora) : ''].filter(Boolean).join(' até ')
    return ''
  }
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return comHora
    ? d.toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
    : d.toLocaleDateString('pt-BR', { timeZone: FUSO })
}

/** data ISO (AAAA-MM-DD) de um valor de data, no fuso de Brasília — para filtrar por período */
export function diaISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object' && !Array.isArray(v)) return diaISO((v as { start?: unknown }).start)
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO })
}

export const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO })

/* --------------------------------------------------------------- carregar */

/** Todas as fontes com colunas e linhas (paginado — o PostgREST corta em mil). */
export async function carregarRetrato(ctx: Contexto): Promise<Retrato> {
  const { admin, workspaceId } = ctx
  const [{ data: tabelas }, { data: perfis }, { data: ws }] = await Promise.all([
    admin.from('db_tables').select('id, name, module_key, position').eq('workspace_id', workspaceId).order('position'),
    admin.from('profiles').select('id, full_name, role').eq('workspace_id', workspaceId).order('full_name'),
    admin.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
  ])
  const ids = (tabelas || []).map(t => t.id as string)

  let colunas: DBColumn[] = []
  if (ids.length) {
    const { data } = await admin.from('db_columns').select('*').in('table_id', ids).order('position')
    // coluna "somente admins" (ex.: honorários) não sai para quem não é admin
    colunas = filterAdminOnly(((data || []) as DBColumn[]).map(c => ({ ...c, config: c.config || {} })), ctx.isAdmin)
  }

  const linhas = ids.length
    ? await fetchAllRows<DBRow>((de, ate) =>
      admin.from('db_rows')
        .select('id, table_id, data, position, created_at, updated_at, created_by, updated_by, arquivado_em')
        .in('table_id', ids).order('position').order('id').range(de, ate))
    : []

  const fontes: Fonte[] = (tabelas || []).map(t => ({
    id: t.id as string,
    name: t.name as string,
    module_key: t.module_key as string | null,
    columns: colunas.filter(c => c.table_id === t.id),
    rows: linhas.filter(r => r.table_id === t.id),
  }))

  const mapa = new Map<string, { fonte: Fonte; row: DBRow }>()
  for (const f of fontes) for (const r of f.rows) mapa.set(r.id, { fonte: f, row: r })

  const pessoas = new Map<string, string>((perfis || []).map(p => [p.id as string, (p.full_name as string) || '(sem nome)']))
  return {
    fontes,
    linhas: mapa,
    pessoas,
    equipe: (perfis || []).map(p => ({ id: p.id as string, nome: (p.full_name as string) || '(sem nome)', papel: (p.role as string) || '' })),
    workspaceNome: (ws?.name as string) || 'Escritório',
  }
}

/** acha a fonte pelo nome (sem acento, aceita pedaço) ou pelo id */
export function acharFonte(r: Retrato, nome: string): Fonte | null {
  const n = norm(nome)
  if (!n) return null
  return r.fontes.find(f => f.id === nome)
    || r.fontes.find(f => norm(f.name) === n)
    || r.fontes.find(f => norm(f.name).includes(n))
    || r.fontes.find(f => n.includes(norm(f.name)))
    || null
}

export function acharColuna(f: Fonte, nome: string): DBColumn | null {
  const n = norm(nome)
  return f.columns.find(c => norm(c.name) === n) || f.columns.find(c => norm(c.name).includes(n)) || null
}

/* ----------------------------------------------------------------- valores */

/** valor de uma célula como texto legível (vazio = '') */
export function valorCampo(col: DBColumn, row: DBRow, fonte: Fonte, r: Retrato): string {
  const v = row.data?.[col.id]
  switch (col.type) {
    case 'created_at': return dataBR(row.created_at, true)
    case 'updated_at': return dataBR(row.updated_at, true)
    case 'created_by': return row.created_by ? r.pessoas.get(row.created_by) || '' : ''
    case 'updated_by': return row.updated_by ? r.pessoas.get(row.updated_by) || '' : ''
    case 'rollup': return rollupText(col, row, fonte.columns, r.fontes)
  }
  if (v === null || v === undefined || v === '') return ''
  const opts = col.config?.options || []
  switch (col.type) {
    case 'select': case 'status':
      return opts.find(o => o.id === v || o.label === v)?.label || String(v)
    case 'multi_select':
      return (Array.isArray(v) ? v : [v]).map(x => opts.find(o => o.id === x || o.label === x)?.label || String(x)).join(', ')
    case 'number':
      return formatNumber(v, col.config?.format)
    case 'checkbox':
      return v ? 'sim' : 'não'
    case 'date':
      return dataBR(v, !!col.config?.withTime)
    case 'person': case 'people':
      return (Array.isArray(v) ? v : [v]).map(x => r.pessoas.get(String(x)) || String(x)).join(', ')
    case 'relation': {
      const alvo = r.fontes.find(f => f.id === col.config?.sourceTableId)
      const ids = Array.isArray(v) ? v.map(String) : [String(v)]
      return ids.map(id => {
        const linha = r.linhas.get(id)
        const rotulo = linha && alvo ? relationLabel(linha.row, alvo, col) : '(registro apagado)'
        return `${rotulo} [id ${id}]`
      }).join('; ')
    }
    case 'files': {
      const arr = Array.isArray(v) ? v : [v]
      return arr.map(a => (a && typeof a === 'object' ? String((a as { name?: unknown }).name || 'arquivo') : String(a))).join(', ')
    }
    default:
      if (typeof v === 'object') return Array.isArray(v) ? v.map(String).join(', ') : JSON.stringify(v)
      return String(v)
  }
}

export const titulo = (row: DBRow, fonte: Fonte, r: Retrato) => recordTitle(row, fonte, r.fontes)

/** campos preenchidos de uma linha, na ordem das colunas */
export function camposPreenchidos(row: DBRow, fonte: Fonte, r: Retrato, apenas?: DBColumn[]): [string, string][] {
  const cols = (apenas || [...fonte.columns].sort((a, b) => a.position - b.position))
  const out: [string, string][] = []
  for (const c of cols) {
    const t = valorCampo(c, row, fonte, r).trim()
    if (t) out.push([c.name, t])
  }
  return out
}

/** registros (de qualquer fonte) que apontam para este, por coluna de relação */
export function quemApontaPara(id: string, r: Retrato): { fonte: Fonte; coluna: DBColumn; row: DBRow }[] {
  const out: { fonte: Fonte; coluna: DBColumn; row: DBRow }[] = []
  for (const f of r.fontes) {
    const rels = f.columns.filter(c => c.type === 'relation')
    if (!rels.length) continue
    for (const row of f.rows) {
      for (const c of rels) {
        const v = row.data?.[c.id]
        const ids = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []
        if (ids.includes(id)) { out.push({ fonte: f, coluna: c, row }); break }
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ quadro */

export interface Cartao {
  id: string
  titulo: string
  descricao: string
  lista: string
  vence: string | null
  situacao: 'aberta' | 'concluída' | 'cancelada' | 'finalizada'
  encerrada: boolean
  arquivada: boolean
  responsaveis: string[]
  etiquetas: string[]
  clientes: { id: string; nome: string }[]
  criadaEm: string
  encerradaEm: string | null
}

const listaEncerra = (t?: string) => ['finalizado', 'finalizada', 'finalizados'].includes(norm(t))

/** Quadro de Tarefas inteiro, com o estado calculado igual à tela (ProjectBoard). */
export async function carregarQuadro(ctx: Contexto, pessoas: Map<string, string>): Promise<{ listas: { id: string; titulo: string }[]; cartoes: Cartao[] }> {
  const { admin, workspaceId } = ctx
  const [{ data: listas }, { data: etiquetas }] = await Promise.all([
    admin.from('board_lists').select('id, title, position').eq('workspace_id', workspaceId).order('position'),
    admin.from('board_labels').select('id, name').eq('workspace_id', workspaceId),
  ])
  const cartoes = await fetchAllRows<{
    id: string; list_id: string; title: string; description: string | null; due_date: string | null
    completed: boolean | null; created_at: string; encerrado_em: string | null; arquivado_em: string | null
  }>((de, ate) => admin.from('board_cards')
    .select('id, list_id, title, description, due_date, completed, created_at, encerrado_em, arquivado_em')
    .eq('workspace_id', workspaceId).order('position').order('id').range(de, ate))

  // filtra pelo escritório através do cartão (join !inner), e não com
  // `.in('card_id', [centenas de ids])` — isso estouraria o tamanho da URL
  const doEscritorio = 'board_cards!inner(workspace_id)'
  const [membros, rotulos, atividade] = cartoes.length ? await Promise.all([
    fetchAllRows<{ card_id: string; profile_id: string }>((de, ate) =>
      admin.from('board_card_members').select(`card_id, profile_id, ${doEscritorio}`)
        .eq('board_cards.workspace_id', workspaceId).order('card_id').order('profile_id').range(de, ate)),
    fetchAllRows<{ card_id: string; label_id: string }>((de, ate) =>
      admin.from('board_card_labels').select(`card_id, label_id, ${doEscritorio}`)
        .eq('board_cards.workspace_id', workspaceId).order('card_id').order('label_id').range(de, ate)),
    fetchAllRows<{ card_id: string; kind: string; text: string }>((de, ate) =>
      admin.from('board_activity').select(`card_id, kind, text, ${doEscritorio}`)
        .eq('board_cards.workspace_id', workspaceId).in('kind', ['contact', 'status']).order('id').range(de, ate)),
  ]) : [[], [], []]

  const nomeLista = new Map((listas || []).map(l => [l.id as string, l.title as string]))
  const nomeEtiqueta = new Map((etiquetas || []).map(l => [l.id as string, l.name as string]))
  const porCartao = <T extends { card_id: string }>(arr: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of arr) { const a = m.get(x.card_id) || []; a.push(x); m.set(x.card_id, a) }
    return m
  }
  const mMembros = porCartao(membros), mRotulos = porCartao(rotulos), mAtiv = porCartao(atividade)

  return {
    listas: (listas || []).map(l => ({ id: l.id as string, titulo: l.title as string })),
    cartoes: cartoes.map(c => {
      const ativ = mAtiv.get(c.id) || []
      const status = ativ.find(a => a.kind === 'status')?.text
      const lista = nomeLista.get(c.list_id) || ''
      const situacao: Cartao['situacao'] = c.completed
        ? (status === 'canceled' ? 'cancelada' : 'concluída')
        : listaEncerra(lista) ? 'finalizada' : 'aberta'
      const vistos = new Set<string>()
      const clientes: Cartao['clientes'] = []
      for (const a of ativ) {
        if (a.kind !== 'contact') continue
        try {
          const p = JSON.parse(a.text) as { contactId?: string; name?: string }
          if (p.contactId && !vistos.has(p.contactId)) { vistos.add(p.contactId); clientes.push({ id: p.contactId, nome: p.name || 'Cliente' }) }
        } catch { /* registro corrompido */ }
      }
      return {
        id: c.id,
        titulo: c.title || '(sem título)',
        descricao: c.description || '',
        lista,
        vence: c.due_date,
        situacao,
        encerrada: situacao !== 'aberta',
        arquivada: !!c.arquivado_em,
        responsaveis: (mMembros.get(c.id) || []).map(m => pessoas.get(m.profile_id) || '?'),
        etiquetas: (mRotulos.get(c.id) || []).map(l => nomeEtiqueta.get(l.label_id) || '').filter(Boolean),
        clientes,
        criadaEm: c.created_at,
        encerradaEm: c.encerrado_em,
      }
    }),
  }
}

export function linhaCartao(c: Cartao): string {
  const partes = [
    `**${c.titulo}** [id ${c.id}]`,
    `lista: ${c.lista || '—'}`,
    `situação: ${c.situacao}${c.arquivada ? ' (arquivada)' : ''}`,
    c.responsaveis.length ? `responsáveis: ${c.responsaveis.join(', ')}` : 'sem responsável',
    c.vence ? `vence: ${dataBR(c.vence)}` : '',
    c.etiquetas.length ? `etiquetas: ${c.etiquetas.join(', ')}` : '',
    c.clientes.length ? `clientes: ${c.clientes.map(x => `${x.nome} [id ${x.id}]`).join('; ')}` : '',
  ].filter(Boolean)
  return `- ${partes.join(' · ')}`
}
