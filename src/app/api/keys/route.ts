import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { adminClient } from '@/lib/api-auth'
import { randomBytes } from 'crypto'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const { data: me } = await supabase.from('profiles').select('role, workspace_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'admin'].includes(me.role)) {
    return { error: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }
  return { user, me }
}

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return ctx.error
  const { user, me } = ctx
  const { name } = await req.json()
  const key = 'sk_crm_' + randomBytes(24).toString('hex')

  const admin = adminClient()
  const { data, error } = await admin.from('api_keys').insert({
    workspace_id: me.workspace_id, name: name?.trim() || 'Integração', key, created_by: user.id,
  }).select('id, name, key, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, apiKey: data })
}

export async function DELETE(req: Request) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return ctx.error
  const { me } = ctx
  const { id } = await req.json()
  const admin = adminClient()
  await admin.from('api_keys').update({ revoked: true }).eq('id', id).eq('workspace_id', me.workspace_id)
  return NextResponse.json({ ok: true })
}
