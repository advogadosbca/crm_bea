import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

/**
 * Upload de arquivos para o bucket `assets`.
 *
 * O upload direto do navegador esbarra na RLS de storage.objects do Supabase
 * self-hosted (a policy de INSERT para `authenticated` não existe lá), então o
 * arquivo passa por aqui: valida a sessão do usuário e grava com a service role.
 */

const BUCKET = 'assets'
const MAX_BYTES = 25 * 1024 * 1024

function adminClient() {
  return createClient(
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** URL pública (sempre pelo domínio externo — o interno só existe dentro do Docker). */
function publicUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}

/** só letras/números/._- em cada segmento, no máximo 3 níveis */
function safeFolder(folder: string) {
  return folder.split('/').filter(Boolean).slice(0, 3)
    .map(s => s.replace(/[^\w.-]+/g, '-').slice(0, 60)).filter(Boolean).join('/')
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Arquivo maior que 25 MB' }, { status: 413 })

  const folder = safeFolder(String(form.get('folder') || 'arquivos'))
  const ext = (file.name.split('.').pop() || 'bin').replace(/[^\w]+/g, '').slice(0, 10) || 'bin'
  const base = file.name.replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'arquivo'
  const path = `${folder}/${Date.now()}-${base}.${ext}`

  const { error } = await adminClient().storage.from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ url: publicUrl(path), path, name: file.name })
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const path = new URL(req.url).searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path ausente' }, { status: 400 })

  const { error } = await adminClient().storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
