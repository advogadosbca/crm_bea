import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { FontesClient } from './FontesClient'

export default async function Page() {
  const { supabase, profile } = await getAuthProfile()
  const ws = profile?.workspace_id
  const assets = await getPageAssets('fontes')

  // fonte de dados = db_tables. Trazemos contagem de colunas/linhas.
  const { data: tables } = await supabase
    .from('db_tables')
    .select('id, name, position, created_at, db_columns(count), db_rows(count)')
    .eq('workspace_id', ws || '')
    .order('position')

  const sources = (tables || []).map((t: { id: string; name: string; created_at: string; db_columns?: { count: number }[]; db_rows?: { count: number }[] }) => ({
    id: t.id, name: t.name, created_at: t.created_at,
    columns: t.db_columns?.[0]?.count ?? 0,
    rows: t.db_rows?.[0]?.count ?? 0,
  }))

  return <FontesClient sources={sources} workspaceId={ws || ''} headerAssets={assets} />
}
