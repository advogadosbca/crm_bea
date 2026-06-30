import { authApiKey, unauthorized } from '@/lib/api-auth'

// GET /api/v1/sources  → lista as bases (fontes de dados) do workspace com suas colunas
export async function GET(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const { data: tables } = await admin.from('db_tables').select('id, name').eq('workspace_id', workspaceId).order('position')
  const ids = (tables || []).map(t => t.id)
  const { data: cols } = ids.length
    ? await admin.from('db_columns').select('id, table_id, name, type, position').in('table_id', ids).order('position')
    : { data: [] }

  const sources = (tables || []).map(t => ({
    id: t.id,
    name: t.name,
    columns: (cols || []).filter(c => c.table_id === t.id).map(c => ({ id: c.id, name: c.name, type: c.type })),
  }))
  return Response.json({ sources })
}
