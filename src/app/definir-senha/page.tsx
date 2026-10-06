'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { AuthShell, Aviso, BotaoOuro, CampoSenha, REGRAS_SENHA, RegrasSenha } from '@/components/auth/AuthShell'

export default function DefinirSenhaPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [nome, setNome] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const [semSessao, setSemSessao] = useState(false)
  const [email, setEmail] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setSemSessao(true); return }
      const u = data.session.user
      setEmail(u?.email || '')
      setNome((u?.user_metadata?.full_name as string) || u?.email || '')
    })
  }, [supabase])

  const valid = REGRAS_SENHA.every(r => r.test(password)) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!REGRAS_SENHA.every(r => r.test(password))) { setError('A senha não atende aos requisitos.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)

    // Pega o token da sessão de convite para autorizar a gravação no servidor.
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    const mail = sess.session?.user?.email || email
    if (!token) {
      setLoading(false)
      setError('Sua sessão de convite expirou. Abra o link mais recente do e-mail ou peça um novo convite.')
      return
    }

    // 1) Grava a senha via service role (garante persistência + confirma o e-mail).
    let out: { ok?: boolean; error?: string } = {}
    try {
      const res = await fetch('/api/definir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, password }),
      })
      out = await res.json().catch(() => ({}))
      if (!res.ok) { setLoading(false); setError(out.error || 'Não foi possível salvar a senha.'); return }
    } catch {
      setLoading(false)
      setError('Falha de conexão ao salvar a senha. Tente novamente.')
      return
    }

    // 2) Faz um login limpo com a nova senha: prova que o re-login funciona e
    //    cria uma sessão consistente (cookie sb-crm-auth).
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password })
    setLoading(false)
    if (signErr) {
      setError('A senha foi salva, mas o login automático falhou: ' + (signErr.message || 'tente entrar manualmente.'))
      setTimeout(() => router.push('/login'), 2500)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 1200)
  }

  if (semSessao) {
    return (
      <AuthShell titulo="Convite expirado" subtitulo="Este link de convite já foi usado ou não vale mais."
        rodape={<a href="/login" className="hover:opacity-80" style={{ color: 'var(--notion-text-2)' }}>Ir para o login</a>}>
        <p className="text-sm" style={{ color: 'var(--notion-text-2)' }}>
          Peça ao administrador do escritório para enviar um novo convite e use o link do e-mail mais recente.
        </p>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#34D399' }} />
          <p className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>Senha criada</p>
          <p className="text-sm mt-1 flex items-center justify-center gap-1.5" style={{ color: 'var(--notion-text-2)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Entrando no CRM…
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo={nome ? `Bem-vindo, ${nome.split(' ')[0]}!` : 'Bem-vindo!'}
      subtitulo={email
        ? <>Crie a senha da conta <b style={{ color: 'var(--notion-text)' }}>{email}</b> para acessar o CRM.</>
        : 'Crie sua senha para acessar o CRM.'}>
      <form onSubmit={submit} className="space-y-4">
        <CampoSenha rotulo="Senha" value={password} onChange={setPassword} autoFocus />
        <CampoSenha rotulo="Confirmar senha" value={confirm} onChange={setConfirm} />
        <RegrasSenha senha={password} confirmacao={confirm} />
        {error && <Aviso tipo="erro">{error}</Aviso>}
        <BotaoOuro disabled={loading || !valid}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><KeyRound className="w-4 h-4" /> Criar senha e entrar</>}
        </BotaoOuro>
      </form>
    </AuthShell>
  )
}
