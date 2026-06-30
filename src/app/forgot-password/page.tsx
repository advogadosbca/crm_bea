'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)',
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--notion-bg)' }}>
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Recuperar senha</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--notion-text-2)' }}>Enviaremos um link para redefinir sua senha</p>
        </div>
        <div className="rounded-xl p-6" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {sent ? (
            <div className="text-center">
              <p className="text-sm mb-4" style={{ color: '#34D399' }}>
                Se houver uma conta com <b>{email}</b>, enviamos um e-mail com o link para redefinir a senha. Verifique sua caixa de entrada.
              </p>
              <Link href="/login" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--notion-text-2)' }}><ArrowLeft className="w-3 h-3" /> Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>E-mail</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
              </div>
              {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg text-sm font-medium"
                style={{ background: loading ? 'var(--notion-bg-4)' : 'var(--notion-accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
              <div className="text-center">
                <Link href="/login" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--notion-text-2)' }}><ArrowLeft className="w-3 h-3" /> Voltar ao login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
