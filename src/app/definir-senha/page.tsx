'use client'

import { useState, useEffect } from 'react'
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
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setSemSessao(true); return }
      const u = data.session.user
      setNome((u?.user_metadata?.full_name as string) || u?.email || '')
    })
  }, [supabase])

  const rules = RULES.map(r => ({ ...r, ok: r.test(password) }))
  const valid = rules.every(r => r.ok) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!rules.every(r => r.ok)) { setError('A senha não atende aos requisitos.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message || 'Convite inválido ou expirado. Peça um novo ao administrador.'); return }
    setDone(true)
    setTimeout(() => router.push('/'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 20% 50%, rgba(91,106,240,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(91,106,240,0.03) 0%, transparent 50%)`,
      }} />
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Bem-vindo{nome ? `, ${nome.split(' ')[0]}` : ''}!</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--notion-text-2)' }}>Crie sua senha para acessar o workspace</p>
        </div>
        <div className="rounded-xl p-6" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {semSessao ? (
            <div className="text-center space-y-3">
              <p className="text-sm" style={{ color: '#F87171' }}>Este link de convite é inválido ou expirou.</p>
              <p className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Peça ao administrador para enviar um novo convite e use o link mais recente do e-mail.</p>
              <a href="/login" className="inline-block text-xs" style={{ color: 'var(--notion-accent)' }}>Ir para o login</a>
            </div>
          ) : done ? (
            <p className="text-sm text-center" style={{ color: '#34D399' }}>Senha criada! Entrando...</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Senha</label>
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
                {loading ? 'Salvando...' : 'Criar senha e entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
