'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck, Send } from 'lucide-react'
import { AuthShell, Aviso, BotaoOuro, Rotulo, estiloCampo } from '@/components/auth/AuthShell'

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
    if (error) {
      setError(/rate|too many|seconds/i.test(error.message)
        ? 'Um link acabou de ser enviado. Aguarde um minuto antes de pedir outro.'
        : error.message)
      return
    }
    setSent(true)
  }

  const voltar = (
    <Link href="/login" className="inline-flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--notion-text-2)' }}>
      <ArrowLeft className="w-3 h-3" /> Voltar ao login
    </Link>
  )

  if (sent) {
    return (
      <AuthShell rodape={voltar}>
        <div className="text-center py-2">
          <MailCheck className="w-10 h-10 mx-auto mb-3" style={{ color: '#ebd480' }} />
          <p className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>Confira seu e-mail</p>
          <p className="text-sm mt-2" style={{ color: 'var(--notion-text-2)' }}>
            Se houver uma conta com <b style={{ color: 'var(--notion-text)' }}>{email}</b>, enviamos um link para criar uma nova senha.
          </p>
          <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>
            Não chegou? Veja a caixa de spam ou{' '}
            <button type="button" onClick={() => setSent(false)} className="underline hover:opacity-80" style={{ color: 'var(--notion-text-2)' }}>
              tente outra vez
            </button>.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Esqueceu a senha?" subtitulo="Informe seu e-mail de acesso e enviaremos um link para criar uma nova." rodape={voltar}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Rotulo>E-mail</Rotulo>
          <input type="email" required autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com" className="w-full px-3 py-2.5 rounded-lg text-sm" style={estiloCampo} />
        </div>
        {error && <Aviso tipo="erro">{error}</Aviso>}
        <BotaoOuro disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Send className="w-4 h-4" /> Enviar link</>}
        </BotaoOuro>
      </form>
    </AuthShell>
  )
}
