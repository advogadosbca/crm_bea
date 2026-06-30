import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Valida a API key do header (Authorization: Bearer <key> ou x-api-key).
 * Retorna { workspaceId, admin } ou null se inválida/revogada.
 */
export async function authApiKey(req: Request): Promise<{ workspaceId: string; admin: SupabaseClient } | null> {
  const header = req.headers.get('authorization') || ''
  const key = header.replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-api-key') || ''
  if (!key) return null

  const admin = adminClient()
  const { data } = await admin.from('api_keys').select('id, workspace_id, revoked').eq('key', key).maybeSingle()
  if (!data || data.revoked) return null

  // marca uso (sem bloquear)
  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {})
  return { workspaceId: data.workspace_id, admin }
}

export function unauthorized() {
  return Response.json({ error: 'API key ausente ou inválida. Envie no header Authorization: Bearer <sua_key>.' }, { status: 401 })
}
