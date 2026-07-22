export type ColumnType =
  | 'text' | 'number' | 'select' | 'multi_select' | 'status' | 'date'
  | 'person' | 'people' | 'files' | 'checkbox' | 'url' | 'phone' | 'email'
  | 'relation' | 'rollup' | 'formula' | 'id' | 'local'
  | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'

export interface SelectOption { id: string; label: string; color: string; group?: string }

export type RollupFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'concat'

export interface ColumnConfig {
  options?: SelectOption[]
  /** ícone personalizado (nome do ícone lucide); se ausente, usa o ícone do tipo */
  icon?: string
  format?: 'integer' | 'decimal' | 'currency' | 'percent'
  withTime?: boolean
  /** relation: id da fonte de dados (db_table) referenciada */
  sourceTableId?: string
  /** relation: colunas da tabela relacionada escolhidas para exibir no chip */
  displayColIds?: string[]
  /** rollup: id da coluna de relação nesta tabela */
  relationColId?: string
  /** rollup: id da coluna alvo na tabela relacionada */
  targetColId?: string
  /** rollup: função de agregação */
  rollupFn?: RollupFn
  /** ids das visualizações (db_views) em que esta coluna fica oculta */
  hiddenInViews?: string[]
}

export interface DBColumn {
  id: string
  table_id: string
  name: string
  type: ColumnType
  config: ColumnConfig
  position: number
  hidden: boolean
}

export interface DBRow {
  id: string
  table_id: string
  data: Record<string, unknown>
  position: number
  created_at: string
  created_by?: string | null
  updated_at: string
  updated_by?: string | null
}

export interface DBTable {
  id: string
  workspace_id: string
  name: string
  icon?: string
  position: number
  module_key?: string | null
}

export interface DataSource { id: string; name: string; columns: DBColumn[]; rows: DBRow[] }

/**
 * Coluna oculta? `hidden` esconde em todas as visualizações; `config.hiddenInViews`
 * esconde só nas visualizações listadas (cada view escolhe o que mostrar).
 */
export function isColumnHidden(col: DBColumn, viewId?: string): boolean {
  if (col.hidden) return true
  return !!viewId && !!col.config.hiddenInViews?.includes(viewId)
}

/** valor exibível "primário" de uma linha (primeira coluna de texto/título). */
export function primaryValue(row: DBRow, columns: DBColumn[]): string {
  const ordered = [...columns].sort((a, b) => a.position - b.position)
  const first = ordered.find(c => ['text', 'select', 'status', 'email', 'phone', 'url'].includes(c.type)) || ordered[0]
  if (!first) return '(sem título)'
  const v = row.data[first.id]
  if (v == null || v === '') return '(sem título)'
  if (first.type === 'select' || first.type === 'status') {
    const opt = (first.config.options || []).find(o => o.id === v || o.label === v)
    return opt?.label || String(v)
  }
  return Array.isArray(v) ? v.join(', ') : String(v)
}

/** Metadados de cada tipo para o seletor (igual ao Notion). */
export const COLUMN_TYPES: {
  type: ColumnType; label: string; icon: string; group: 'basico' | 'avancado' | 'auto'; available: boolean
}[] = [
  { type: 'text', label: 'Texto', icon: 'Type', group: 'basico', available: true },
  { type: 'number', label: 'Número', icon: 'Hash', group: 'basico', available: true },
  { type: 'select', label: 'Selecionar', icon: 'ChevronDownCircle', group: 'basico', available: true },
  { type: 'multi_select', label: 'Seleção múltipla', icon: 'List', group: 'basico', available: true },
  { type: 'status', label: 'Status', icon: 'LoaderCircle', group: 'basico', available: true },
  { type: 'date', label: 'Data', icon: 'Calendar', group: 'basico', available: true },
  { type: 'person', label: 'Pessoa', icon: 'Users', group: 'basico', available: true },
  { type: 'people', label: 'Pessoas (várias)', icon: 'Users', group: 'basico', available: true },
  { type: 'checkbox', label: 'Caixa de seleção', icon: 'CheckSquare', group: 'basico', available: true },
  { type: 'url', label: 'URL', icon: 'Link', group: 'basico', available: true },
  { type: 'phone', label: 'Telefone', icon: 'Phone', group: 'basico', available: true },
  { type: 'email', label: 'E-mail', icon: 'AtSign', group: 'basico', available: true },
  { type: 'files', label: 'Arquivos e mídia', icon: 'Paperclip', group: 'basico', available: true },
  { type: 'relation', label: 'Relação', icon: 'ArrowUpRight', group: 'avancado', available: true },
  { type: 'rollup', label: 'Rollup', icon: 'Search', group: 'avancado', available: true },
  { type: 'formula', label: 'Fórmula', icon: 'Sigma', group: 'avancado', available: false },
  { type: 'id', label: 'ID', icon: 'Hash', group: 'avancado', available: false },
  { type: 'local', label: 'Local', icon: 'MapPin', group: 'avancado', available: false },
  { type: 'created_at', label: 'Criado em', icon: 'Clock', group: 'auto', available: true },
  { type: 'updated_at', label: 'Última edição', icon: 'Clock', group: 'auto', available: true },
  { type: 'created_by', label: 'Criado por', icon: 'UserCircle', group: 'auto', available: true },
  { type: 'updated_by', label: 'Última edição por', icon: 'UserCircle', group: 'auto', available: true },
]

export const AUTO_TYPES: ColumnType[] = ['created_at', 'updated_at', 'created_by', 'updated_by', 'id']

export const OPTION_COLORS = [
  { name: 'Padrão', hex: '#94A3B8' }, { name: 'Cinza', hex: '#9B9A97' }, { name: 'Marrom', hex: '#A27763' },
  { name: 'Laranja', hex: '#F97316' }, { name: 'Amarelo', hex: '#F59E0B' }, { name: 'Verde', hex: '#10B981' },
  { name: 'Azul', hex: '#3B82F6' }, { name: 'Roxo', hex: '#8B5CF6' }, { name: 'Rosa', hex: '#EC4899' },
  { name: 'Vermelho', hex: '#EF4444' },
]

/** valor exibível de uma célula para uma coluna qualquer (usado nos chips de relação). */
export function displayValue(value: unknown, col: DBColumn): string {
  if (value === null || value === undefined || value === '') return ''
  const opts = col.config.options || []
  switch (col.type) {
    case 'select': case 'status':
      return opts.find(o => o.id === value || o.label === value)?.label || String(value)
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : [value]
      return ids.map(v => opts.find(o => o.id === v || o.label === v)?.label || String(v)).join(', ')
    }
    case 'number':
      return formatNumber(value, col.config.format)
    case 'checkbox':
      return value ? '✓' : ''
    case 'date': {
      const v = String(value)
      try {
        return col.config.withTime
          ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : new Date(v + (v.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')
      } catch { return v }
    }
    default:
      return Array.isArray(value) ? value.join(', ') : String(value)
  }
}

/** fonte + linhas apontadas por uma célula de relação (na ordem do valor). */
export function relationRows(col: DBColumn, value: unknown, sources: DataSource[]): { source: DataSource; rows: DBRow[] } | null {
  const source = sources.find(s => s.id === col.config.sourceTableId)
  if (!source) return null
  const ids: string[] = Array.isArray(value) ? value as string[] : (value ? [String(value)] : [])
  return { source, rows: ids.map(id => source.rows.find(r => r.id === id)).filter(Boolean) as DBRow[] }
}

/** rótulo de um registro relacionado: os campos escolhidos (displayColIds) ou o título. */
export function relationLabel(row: DBRow, source: DataSource, col: DBColumn): string {
  const ids = col.config.displayColIds || []
  if (!ids.length) return primaryValue(row, source.columns)
  const parts = ids.map(id => {
    const c = source.columns.find(x => x.id === id)
    return c ? displayValue(row.data[id], c) : ''
  }).filter(Boolean)
  return parts.join(' · ') || primaryValue(row, source.columns)
}

/** valor calculado de um rollup (vazio se a configuração estiver incompleta). */
export function rollupText(col: DBColumn, row: DBRow, tableColumns: DBColumn[], sources: DataSource[]): string {
  const relCol = tableColumns.find(c => c.id === col.config.relationColId)
  const source = sources.find(s => s.id === relCol?.config.sourceTableId)
  const targetCol = source?.columns.find(c => c.id === col.config.targetColId)
  if (!relCol || !source || !targetCol) return ''
  const ids: string[] = Array.isArray(row.data[relCol.id]) ? row.data[relCol.id] as string[] : []
  const rows = ids.map(id => source.rows.find(r => r.id === id)).filter(Boolean) as DBRow[]
  const fn = col.config.rollupFn || 'concat' // sem cálculo => só puxa/concatena o valor do campo
  if (fn === 'count') return String(rows.length)
  if (fn === 'concat') return rows.map(r => displayValue(r.data[targetCol.id], targetCol)).filter(Boolean).join(', ')
  const nums = rows.map(r => Number(r.data[targetCol.id])).filter(n => !isNaN(n))
  const fmt = targetCol.config.format
  if (fn === 'sum') return formatNumber(nums.reduce((a, b) => a + b, 0), fmt)
  if (fn === 'avg') return formatNumber(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0, fmt)
  if (fn === 'min') return nums.length ? formatNumber(Math.min(...nums), fmt) : ''
  if (fn === 'max') return nums.length ? formatNumber(Math.max(...nums), fmt) : ''
  return ''
}

export function formatNumber(v: unknown, format?: ColumnConfig['format']): string {
  const n = Number(v)
  if (v === null || v === undefined || v === '' || isNaN(n)) return ''
  switch (format) {
    case 'currency': return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
    case 'percent': return `${n}%`
    case 'integer': return String(Math.round(n))
    default: return String(n)
  }
}

/** Tenta converter um valor ao mudar o tipo da coluna. Retorna {value, lossy}. */
export function convertValue(value: unknown, from: ColumnType, to: ColumnType): { value: unknown; lossy: boolean } {
  if (value === null || value === undefined || value === '') return { value: null, lossy: false }
  const str = Array.isArray(value) ? value.join(', ') : String(value)
  switch (to) {
    case 'text': case 'url': case 'phone': case 'email':
      return { value: str, lossy: false }
    case 'number': {
      const n = Number(String(str).replace(/[^\d.,-]/g, '').replace(',', '.'))
      return isNaN(n) ? { value: null, lossy: true } : { value: n, lossy: false }
    }
    case 'checkbox':
      return { value: ['true', '1', 'sim', 'yes'].includes(str.toLowerCase()), lossy: false }
    case 'select': case 'status':
      return { value: str, lossy: false }
    case 'multi_select':
      return { value: Array.isArray(value) ? value : [str], lossy: false }
    default:
      return { value: null, lossy: true }
  }
}
