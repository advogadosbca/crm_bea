'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)',
}
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'Letra minúscula', test: p => /[a-z]/.test(p) },
  { label: 'Letra maiúscula', test: p => /[A-Z]/.test(p) },
  { label: 'Caractere especial', test: p => /[^A-Za-z0-9]/.test(p) },
  { label: 'Número', test: p => /[0-9]/.test(p) },
  { label: 'Mínimo 6 caracteres', test: p => p.length >= 6 },
]

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const rules = RULES.map(r => ({ ...r, ok: r.test(password) }))
  const valid = rules.every(r => r.ok) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!rules.every(r => r.ok)) { setError('A senha não atende aos requisitos.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)

    // Pega o token da sessão de recuperação para autorizar a gravação no servidor.
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    const mail = sess.session?.user?.email
    if (!token || !mail) {
      setLoading(false)
      setError('Sessão de recuperação ausente ou expirada. Solicite um novo link em "Esqueci a senha" e use o mais recente do e-mail.')
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
    setTimeout(() => router.push('/'), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Nova senha</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--notion-text-2)' }}>Defina sua nova senha de acesso</p>
        </div>
        <div className="rounded-xl p-6" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {done ? (
            <p className="text-sm text-center" style={{ color: '#34D399' }}>Senha alterada! Redirecionando...</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Nova senha</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Confirmar senha</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
              </div>
              {password.length > 0 && (
                <div className="space-y-1 px-1">
                  {rules.map(r => (
                    <div key={r.label} className="flex items-center gap-2 text-xs" style={{ color: r.ok ? '#34D399' : 'var(--notion-text-3)' }}>
                      {r.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />} {r.label}
                    </div>
                  ))}
                  {confirm.length > 0 && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: password === confirm ? '#34D399' : 'var(--notion-text-3)' }}>
                      {password === confirm ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />} Senhas coincidem
                    </div>
                  )}
                </div>
              )}
              {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>{error}</p>}
              <button type="submit" disabled={loading || !valid} className="w-full py-2.5 rounded-lg text-sm font-medium"
                style={{ background: (loading || !valid) ? 'var(--notion-bg-4)' : 'var(--notion-accent)', color: '#fff', opacity: (loading || !valid) ? 0.6 : 1 }}>
                {loading ? 'Salvando...' : 'Alterar senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
