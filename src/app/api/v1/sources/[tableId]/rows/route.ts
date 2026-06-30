import { authApiKey, unauthorized } from '@/lib/api-auth'
import type { SupabaseClient } from '@supabase/supabase-js'

// confirma que a tabela pertence ao workspace da key
async function ownsTable(admin: SupabaseClient, workspaceId: string, tableId: string) {
  const { data } = await admin.from('db_tables').select('id').eq('id', tableId).eq('workspace_id', workspaceId).maybeSingle()
  return !!data
}

// GET /api/v1/sources/:tableId/rows  → lista os registros
export async function GET(req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth
  const { tableId } = await params
  if (!(await ownsTable(admin, workspaceId, tableId))) return Response.json({ error: 'Fonte não encontrada.' }, { status: 404 })

  const { data: rows } = await admin.from('db_rows').select('id, data, created_at').eq('table_id', tableId).order('position')
  return Response.json({ rows: rows || [] })
}

// POST /api/v1/sources/:tableId/rows  → cria um registro. Body: { data: { <colId|colName>: valor } }
export async function POST(req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth
  const { tableId } = await params
  if (!(await ownsTable(admin, workspaceId, tableId))) return Response.json({ error: 'Fonte não encontrada.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const incoming = (body.data && typeof body.data === 'object') ? body.data : {}

  // permite usar o NOME da coluna como chave (mapeia para o id)
  const { data: cols } = await admin.from('db_columns').select('id, name').eq('table_id', tableId)
  const byName = new Map((cols || []).map(c => [c.name.toLowerCase(), c.id]))
  const ids = new Set((cols || []).map(c => c.id))
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (ids.has(k)) data[k] = v
    else if (byName.has(k.toLowerCase())) data[byName.get(k.toLowerCase())!] = v
  }

  const { data: posRow } = await admin.from('db_rows').select('position').eq('table_id', tableId).order('position', { ascending: false }).limit(1).maybeSingle()
  const position = (posRow?.position ?? -1) + 1

  const { data: created, error } = await admin.from('db_rows').insert({ table_id: tableId, data, position }).select('id, data, created_at').single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ row: created }, { status: 201 })
}
