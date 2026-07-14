import { DBColumn, DBRow, displayValue } from '@/types/dynamic'

// Configuração de uma visualização (filtros, ordenação, agrupamento, cor condicional).
// Persistida em localStorage por id de view — o schema db_views não tem coluna de config.

export type FilterOp =
  | 'contains' | 'not_contains' | 'is' | 'is_not' | 'gt' | 'lt' | 'empty' | 'not_empty'

export interface FilterCond { id: string; colId: string; op: FilterOp; value: string }
export interface SortCond { colId: string; dir: 'asc' | 'desc' }
export interface ColorRule { id: string; colId: string; op: FilterOp; value: string; color: string }
export interface ViewConfig {
  filters: FilterCond[]
  sort: SortCond | null
  groupColId: string | null
  colorRules: ColorRule[]
}

export const EMPTY_VIEW_CONFIG: ViewConfig = { filters: [], sort: null, groupColId: null, colorRules: [] }

export const FILTER_OPS: { op: FilterOp; label: string }[] = [
  { op: 'contains', label: 'contém' },
  { op: 'not_contains', label: 'não contém' },
  { op: 'is', label: 'é' },
  { op: 'is_not', label: 'não é' },
  { op: 'gt', label: 'maior que' },
  { op: 'lt', label: 'menor que' },
  { op: 'empty', label: 'está vazio' },
  { op: 'not_empty', label: 'não está vazio' },
]
export const opLabel = (op: FilterOp) => FILTER_OPS.find(o => o.op === op)?.label || op

const nrm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

function rawValue(row: DBRow, col: DBColumn): unknown {
  if (col.type === 'created_at') return row.created_at
  if (col.type === 'updated_at') return row.updated_at
  return row.data[col.id]
}

function asText(row: DBRow, col: DBColumn): string {
  const v = rawValue(row, col)
  const disp = displayValue(v, col)
  if (disp) return disp
  return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
}

function isEmpty(row: DBRow, col: DBColumn): boolean {
  const v = rawValue(row, col)
  return v == null || v === '' || (Array.isArray(v) && v.length === 0)
}

export function matchCond(row: DBRow, col: DBColumn | undefined, op: FilterOp, value: string): boolean {
  if (!col) return true
  if (op === 'empty') return isEmpty(row, col)
  if (op === 'not_empty') return !isEmpty(row, col)
  const hay = nrm(asText(row, col))
  const needle = nrm(value)
  switch (op) {
    case 'contains': return hay.includes(needle)
    case 'not_contains': return !hay.includes(needle)
    case 'is': return hay === needle
    case 'is_not': return hay !== needle
    case 'gt':
    case 'lt': {
      const a = Number(String(rawValue(row, col) ?? '').replace(',', '.'))
      const b = Number(value.replace(',', '.'))
      if (!isNaN(a) && !isNaN(b)) return op === 'gt' ? a > b : a < b
      const cmp = hay.localeCompare(needle)
      return op === 'gt' ? cmp > 0 : cmp < 0
    }
    default: return true
  }
}

export function matchesFilters(row: DBRow, columns: DBColumn[], filters: FilterCond[]): boolean {
  if (!filters.length) return true
  return filters.every(f => matchCond(row, columns.find(c => c.id === f.colId), f.op, f.value))
}

export function applySort(rows: DBRow[], columns: DBColumn[], sort: SortCond | null): DBRow[] {
  if (!sort) return [...rows].sort((a, b) => a.position - b.position)
  const col = columns.find(c => c.id === sort.colId)
  const get = (r: DBRow) =>
    col?.type === 'created_at' ? r.created_at
      : col?.type === 'updated_at' ? r.updated_at
        : r.data[sort.colId]
  return [...rows].sort((a, b) => {
    const av = get(a) ?? '', bv = get(b) ?? ''
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

/** primeira regra de cor que casa com a linha; retorna o hex ou null. */
export function rowColor(row: DBRow, columns: DBColumn[], rules: ColorRule[]): string | null {
  for (const r of rules) {
    if (r.value === '' && r.op !== 'empty' && r.op !== 'not_empty') continue
    if (matchCond(row, columns.find(c => c.id === r.colId), r.op, r.value)) return r.color
  }
  return null
}

// ---------- persistência (localStorage por view) ----------
const key = (viewId: string) => `dyn-view-cfg:${viewId}`

export function loadViewConfig(viewId: string): ViewConfig {
  if (typeof window === 'undefined' || !viewId) return { ...EMPTY_VIEW_CONFIG }
  try {
    const raw = window.localStorage.getItem(key(viewId))
    if (raw) return { ...EMPTY_VIEW_CONFIG, ...JSON.parse(raw) }
  } catch { /* noop */ }
  return { ...EMPTY_VIEW_CONFIG }
}

export function saveViewConfig(viewId: string, cfg: ViewConfig) {
  if (typeof window === 'undefined' || !viewId) return
  try { window.localStorage.setItem(key(viewId), JSON.stringify(cfg)) } catch { /* noop */ }
}
