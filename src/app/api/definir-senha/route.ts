import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Client admin (service role) — só no servidor.
function admin() {
  return createClient(
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const RULES: RegExp[] = [/[a-z]/, /[A-Z]/, /[^A-Za-z0-9]/, /[0-9]/]

// Grava a senha do usuário convidado usando o service role.
// Isso garante que a senha seja de fato persistida (encrypted_password) e o
// e-mail confirmado — independente do fluxo de convite (implícito ou PKCE) e do
// estado da sessão no navegador. Assim o re-login com e-mail+senha funciona.
export async function POST(req: Request) {
  let body: { access_token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }

  const { access_token, password } = body
  if (!access_token || !password) {
    return NextResponse.json({ error: 'Sessão de convite ausente. Abra o link mais recente do e-mail.' }, { status: 400 })
  }
  if (password.length < 6 || !RULES.every(r => r.test(password))) {
    return NextResponse.json({ error: 'A senha não atende aos requisitos.' }, { status: 400 })
  }

  const sb = admin()

  // Valida o token do convite e descobre de qual usuário se trata.
  const { data: userData, error: uErr } = await sb.auth.getUser(access_token)
  if (uErr || !userData?.user) {
    return NextResponse.json({ error: 'Convite inválido ou expirado. Peça um novo ao administrador.' }, { status: 401 })
  }

  // Grava a senha + confirma o e-mail com o service role (persistência garantida).
  const { error: upErr } = await sb.auth.admin.updateUserById(userData.user.id, {
    password,
    email_confirm: true,
  })
  if (upErr) {
    return NextResponse.json({ error: upErr.message || 'Não foi possível salvar a senha.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, email: userData.user.email })
}
