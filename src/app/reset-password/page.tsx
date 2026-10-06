'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from 'lucide-react'
import { AuthShell, Aviso, BotaoOuro, CampoSenha, REGRAS_SENHA, RegrasSenha } from '@/components/auth/AuthShell'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  // null = ainda conferindo o link
  const [email, setEmail] = useState<string | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // o link do e-mail abre a sessão de recuperação; sem ela não há o que salvar,
  // e é melhor dizer isso agora do que depois de a pessoa digitar duas senhas
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setSemSessao(true); return }
      setEmail(data.session.user?.email || '')
    })
  }, [supabase])

  const valid = REGRAS_SENHA.every(r => r.test(password)) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!REGRAS_SENHA.every(r => r.test(password))) { setError('A senha não atende aos requisitos.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)

    // Pega o token da sessão de recuperação para autorizar a gravação no servidor.
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    const mail = sess.session?.user?.email
    if (!token || !mail) {
      setLoading(false); setSemSessao(true)
      return
    }

    // 1) Grava a senha via service role (persistência garantida).
    let out: { ok?: boolean; error?: string } = {}
    try {
      const res = await fetch('/api/definir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, password }),
      })
      out = await res.json().catch(() => ({}))
      if (!res.ok) { setLoading(false); setError(out.error || 'Não foi possível alterar a senha.'); return }
    } catch {
      setLoading(false)
      setError('Falha de conexão ao alterar a senha. Tente novamente.')
      return
    }

    // 2) Login limpo com a nova senha (prova que funciona + sessão consistente).
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password })
    setLoading(false)
    if (signErr) {
      setError('A senha foi alterada, mas o login automático falhou. Vá para o login e entre com a nova senha.')
      setTimeout(() => router.push('/login'), 2500)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 1500)
  }

  const voltar = (
    <Link href="/login" className="inline-flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--notion-text-2)' }}>
      <ArrowLeft className="w-3 h-3" /> Voltar ao login
    </Link>
  )

  if (semSessao) {
    return (
      <AuthShell titulo="Link expirado" subtitulo="Este link de redefinição já foi usado ou não vale mais." rodape={voltar}>
        <p className="text-sm mb-5" style={{ color: 'var(--notion-text-2)' }}>
          Por segurança, cada link funciona uma única vez. Peça um novo e use o e-mail mais recente.
        </p>
        <BotaoOuro type="button" onClick={() => router.push('/forgot-password')}>
          <Mail className="w-4 h-4" /> Enviar um novo link
        </BotaoOuro>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#34D399' }} />
          <p className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>Senha alterada</p>
          <p className="text-sm mt-1 flex items-center justify-center gap-1.5" style={{ color: 'var(--notion-text-2)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Entrando no CRM…
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Criar nova senha" rodape={voltar}
      subtitulo={email === null
        ? 'Conferindo o link…'
        : <>Para a conta <b style={{ color: 'var(--notion-text)' }}>{email}</b></>}>
      <form onSubmit={submit} className="space-y-4">
        <CampoSenha rotulo="Nova senha" value={password} onChange={setPassword} autoFocus />
        <CampoSenha rotulo="Confirmar nova senha" value={confirm} onChange={setConfirm} />
        <RegrasSenha senha={password} confirmacao={confirm} />
        {error && <Aviso tipo="erro">{error}</Aviso>}
        <BotaoOuro disabled={loading || !valid || email === null}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><KeyRound className="w-4 h-4" /> Salvar nova senha</>}
        </BotaoOuro>
      </form>
    </AuthShell>
  )
}
