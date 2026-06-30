import { getAuthProfile } from '@/lib/auth'
import { DBColumn, DBRow, DataSource } from '@/types/dynamic'

/**
 * Carrega a tabela dinâmica de um módulo (db_tables.module_key) + colunas/linhas + fontes do workspace.
 */
export async function getModuleTable(moduleKey: string) {
  const { supabase, user, profile } = await getAuthProfile()
  const ws = profile?.workspace_id || ''

  const { data: table } = await supabase
    .from('db_tables').select('id, name').eq('workspace_id', ws).eq('module_key', moduleKey).maybeSingle()

  const tableId = table?.id as string | undefined

  // todas as fontes (para relação/rollup) + colunas/linhas
  const { data: allTables } = await supabase.from('db_tables').select('id, name').eq('workspace_id', ws).order('position')
  const ids = (allTables || []).map(t => t.id)
  let allCols: DBColumn[] = []
  let allRows: DBRow[] = []
  if (ids.length) {
    const [{ data: cols }, { data: rows }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', ids).order('position'),
      supabase.from('db_rows').select('*').in('table_id', ids).order('position'),
    ])
    allCols = (cols || []) as DBColumn[]
    allRows = (rows || []) as DBRow[]
  }

  const columns = tableId ? allCols.filter(c => c.table_id === tableId) : []
  const rows = tableId ? allRows.filter(r => r.table_id === tableId) : []
  const sources: DataSource[] = (allTables || []).map(t => ({
    id: t.id, name: t.name,
    columns: allCols.filter(c => c.table_id === t.id),
    rows: allRows.filter(r => r.table_id === t.id),
  }))

  const { data: members } = await supabase.from('profiles').select('id, full_name').eq('workspace_id', ws)

  let views: { id: string; name: string; type: string; position: number }[] = []
  if (tableId) {
    const { data: v } = await supabase.from('db_views').select('id, name, type, position').eq('table_id', tableId).order('position')
    views = v || []
  }

  return { tableId, columns, rows, sources, members: members || [], userId: user!.id, views }
}

/**
 * Carrega uma tabela dinâmica por ID (ex.: a base "Leads" usada como fonte em várias páginas).
 */
export async function getTableById(tableId: string) {
  const { supabase, user, profile } = await getAuthProfile()
  const ws = profile?.workspace_id || ''

  const { data: allTables } = await supabase.from('db_tables').select('id, name').eq('workspace_id', ws).order('position')
  const ids = (allTables || []).map(t => t.id)
  let allCols: DBColumn[] = []
  let allRows: DBRow[] = []
  if (ids.length) {
    const [{ data: cols }, { data: rows }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', ids).order('position'),
      supabase.from('db_rows').select('*').in('table_id', ids).order('position'),
    ])
    allCols = (cols || []) as DBColumn[]
    allRows = (rows || []) as DBRow[]
  }

  const exists = ids.includes(tableId)
  const columns = exists ? allCols.filter(c => c.table_id === tableId) : []
  const rows = exists ? allRows.filter(r => r.table_id === tableId) : []
  const sources: DataSource[] = (allTables || []).map(t => ({
    id: t.id, name: t.name,
    columns: allCols.filter(c => c.table_id === t.id),
    rows: allRows.filter(r => r.table_id === t.id),
  }))

  const { data: members } = await supabase.from('profiles').select('id, full_name').eq('workspace_id', ws)

  let views: { id: string; name: string; type: string; position: number }[] = []
  if (exists) {
    const { data: v } = await supabase.from('db_views').select('id, name, type, position').eq('table_id', tableId).order('position')
    views = v || []
  }

  return { tableId: exists ? tableId : undefined, columns, rows, sources, members: members || [], userId: user!.id, views }
}
