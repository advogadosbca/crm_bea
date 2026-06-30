import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

// Admin client with service role (server only)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role, workspace_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { full_name, email, password, role } = await req.json()
  if (!full_name || !email) {
    return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 })
  }

  const admin = adminClient()
  const origin = new URL(req.url).origin
  let userId: string

  if (password) {
    // senha definida pelo admin → cria já confirmado
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, role: role || 'colaborador' },
    })
    if (error) {
      const msg = /registered|exists|already/i.test(error.message) ? 'Já existe uma conta com este e-mail.' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    userId = created.user.id
  } else {
    // sem senha → envia convite por e-mail (usuário define a senha ao clicar)
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: role || 'colaborador' },
      redirectTo: `${origin}/definir-senha`,
    })
    if (error) {
      const msg = /registered|exists|already/i.test(error.message) ? 'Já existe uma conta com este e-mail.' :
        ((error as { status?: number }).status ?? 0) >= 500 ? 'Não foi possível enviar o convite por e-mail. Verifique a configuração de e-mail (Resend).' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    userId = invited.user.id
  }

  // vincula ao workspace + papel
  await admin.from('profiles').update({
    workspace_id: me.workspace_id, role: role || 'colaborador', full_name,
  }).eq('id', userId)

  return NextResponse.json({ ok: true, id: userId, invited: !password })
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['super_admin', 'admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID faltando' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: 'Você não pode excluir a si mesmo.' }, { status: 400 })

  const admin = adminClient()
  // impede excluir super_admin
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single()
  if (target?.role === 'super_admin') return NextResponse.json({ error: 'Não é possível excluir um super admin.' }, { status: 400 })

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['super_admin', 'admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id, role, is_active, resend } = await req.json()
  const admin = adminClient()

  // reenviar convite (usuário ainda pendente)
  if (resend) {
    const { data: prof } = await admin.from('profiles').select('email, full_name, role').eq('id', id).single()
    if (!prof?.email) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    const origin = new URL(req.url).origin
    const { error } = await admin.auth.admin.inviteUserByEmail(prof.email, {
      data: { full_name: prof.full_name, role: prof.role },
      redirectTo: `${origin}/definir-senha`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const patch: Record<string, unknown> = {}
  if (role !== undefined) patch.role = role
  if (is_active !== undefined) patch.is_active = is_active
  await admin.from('profiles').update(patch).eq('id', id)

  return NextResponse.json({ ok: true })
}
