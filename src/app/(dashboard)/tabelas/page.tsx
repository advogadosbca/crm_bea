import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { TabelasClient } from './TabelasClient'
import { DBColumn, DBRow, DBTable } from '@/types/dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { supabase, user, profile } = await getAuthProfile()
  const ws = profile?.workspace_id
  const assets = await getPageAssets('tabelas')
  const { t } = await searchParams

  const [{ data: tables }, { data: members }] = await Promise.all([
    supabase.from('db_tables').select('*').eq('workspace_id', ws || '').order('position'),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', ws || ''),
  ])

  const tableList = (tables || []) as DBTable[]
  const activeId = (t && tableList.some(x => x.id === t)) ? t : tableList[0]?.id

  // carrega colunas e linhas de TODAS as fontes (para Relação/Rollup)
  const ids = tableList.map(t => t.id)
  let allCols: DBColumn[] = []
  let allRows: DBRow[] = []
  if (ids.length) {
    const [{ data: cols }, { data: rws }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', ids).order('position'),
      supabase.from('db_rows').select('*').in('table_id', ids).order('position'),
    ])
    allCols = (cols || []) as DBColumn[]
    allRows = (rws || []) as DBRow[]
  }

  const columns = allCols.filter(c => c.table_id === activeId)
  const rows = allRows.filter(r => r.table_id === activeId)
  const sources = tableList.map(t => ({
    id: t.id, name: t.name,
    columns: allCols.filter(c => c.table_id === t.id),
    rows: allRows.filter(r => r.table_id === t.id),
  }))

  // visualizações (Tabela/Quadro/…) da tabela ativa, para o toolbar com busca + configurações
  const { data: viewRows } = activeId
    ? await supabase.from('db_views').select('id, name, type, position').eq('table_id', activeId).order('position')
    : { data: [] }
  const views = (viewRows || []) as { id: string; name: string; type: string; position: number }[]

  return (
    <TabelasClient
      tables={tableList}
      activeId={activeId || ''}
      columns={columns}
      rows={rows}
      sources={sources}
      views={views}
      members={members || []}
      workspaceId={ws || ''}
      userId={user!.id}
      headerAssets={assets}
    />
  )
}
