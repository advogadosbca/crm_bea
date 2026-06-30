import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const RULES = [
  (p: string) => /[a-z]/.test(p),
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[^A-Za-z0-9]/.test(p),
  (p: string) => /[0-9]/.test(p),
  (p: string) => p.length >= 6,
]

export async function POST(req: Request) {
  const { email, password, full_name } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  if (!RULES.every(r => r(password))) return NextResponse.json({ error: 'Senha não atende aos requisitos' }, { status: 400 })

  const sb = admin()

  // cria usuário já confirmado
  const { data: created, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: full_name || email.split('@')[0] },
  })
  if (error) {
    const msg = /already|exists|registered/i.test(error.message) ? 'Já existe uma conta com este e-mail.' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // vincula ao workspace existente (deployment de uma firma)
  const { data: ws } = await sb.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (ws?.id && created.user) {
    await sb.from('profiles').update({ workspace_id: ws.id, role: 'colaborador', full_name: full_name || email.split('@')[0] }).eq('id', created.user.id)
  }

  return NextResponse.json({ ok: true })
}
