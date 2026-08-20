'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)',
}

const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'Letra minúscula', test: p => /[a-z]/.test(p) },
  { label: 'Letra maiúscula', test: p => /[A-Z]/.test(p) },
  { label: 'Caractere especial', test: p => /[^A-Za-z0-9]/.test(p) },
  { label: 'Número', test: p => /[0-9]/.test(p) },
  { label: 'Mínimo 6 caracteres', test: p => p.length >= 6 },
]

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const rulesState = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(password) }))
  const passwordValid = rulesState.every(r => r.ok)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('E-mail ou senha incorretos.'); setLoading(false); return }
    router.push('/')
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSuccess('')
    if (!passwordValid) { setError('A senha não atende a todos os requisitos.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/login` },
    })
    setLoading(false)
    if (error) {
      const raw = error.message || ''
      let msg = raw || 'Não foi possível criar a conta.'
      if (/registered|already/i.test(raw)) msg = 'Já existe uma conta com este e-mail.'
      else if ((error.status ?? 0) >= 500 || /sending|confirmation|email/i.test(raw))
        msg = 'Não foi possível enviar o e-mail de confirmação. No momento, o envio só está liberado para o e-mail da conta Resend — é preciso verificar um domínio no Resend para enviar a outros endereços.'
      setError(msg)
      return
    }
    // se já houver sessão (confirmação desativada) entra; senão pede confirmação por e-mail
    if (data.session) { router.push('/'); return }
    setSuccess('Conta criada! Enviamos um e-mail de confirmação. Verifique sua caixa de entrada para validar a conta.')
    setMode('login'); setPassword('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 20% 50%, rgba(91,106,240,0.04) 0%, transparent 60%),
          radial-gradient(circle at 80% 20%, rgba(91,106,240,0.03) 0%, transparent 50%)`,
      }} />

      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Bernardes & Azevedo</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--notion-text-2)' }}>
            {mode === 'login' ? 'Acesse seu workspace' : 'Crie sua conta'}
          </p>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {/* Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg mb-5" style={{ background: 'var(--notion-bg-3)' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(''); setSuccess('') }}
                className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: mode === m ? 'var(--notion-bg-4)' : 'transparent', color: mode === m ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Nome completo</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome"
                  className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </div>

            {/* Requisitos de senha (signup) */}
            {mode === 'signup' && password.length > 0 && (
              <div className="space-y-1 px-1">
                {rulesState.map(r => (
                  <div key={r.label} className="flex items-center gap-2 text-xs" style={{ color: r.ok ? '#34D399' : 'var(--notion-text-3)' }}>
                    {r.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    {r.label}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>
            )}
            {success && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>{success}</p>
            )}

            <button type="submit" disabled={loading || (mode === 'signup' && !passwordValid)}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: (loading || (mode === 'signup' && !passwordValid)) ? 'var(--notion-bg-4)' : 'var(--notion-accent)',
                color: '#fff', opacity: (loading || (mode === 'signup' && !passwordValid)) ? 0.6 : 1,
              }}>
              {loading ? (mode === 'login' ? 'Entrando...' : 'Criando...') : (mode === 'login' ? 'Entrar' : 'Criar conta')}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-4 text-center">
              <a href="/forgot-password" className="text-xs transition-colors hover:opacity-80" style={{ color: 'var(--notion-text-2)' }}>Esqueceu a senha?</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
