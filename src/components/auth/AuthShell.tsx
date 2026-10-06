'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'

/**
 * Moldura das telas de fora do CRM (login, esqueci a senha, nova senha,
 * convite). É a primeira coisa que a equipe vê vindo do e-mail, então leva a
 * marca do escritório — o mesmo monograma e dourado dos e-mails em
 * public/email/ — em vez do visual neutro do resto do sistema.
 */

/** Dourado do monograma (src/app/icon.svg). */
export const OURO = 'linear-gradient(135deg, #a78048 0%, #ebd480 60%, #f2e99e 100%)'
const SERIFA = 'Georgia, "Times New Roman", serif'

export function AuthShell({ titulo, subtitulo, children, rodape }: {
  titulo?: React.ReactNode; subtitulo?: React.ReactNode; children: React.ReactNode; rodape?: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--notion-bg)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(ellipse 70% 45% at 50% -5%, rgba(235,212,128,0.10) 0%, transparent 70%),
          radial-gradient(circle at 90% 110%, rgba(38,52,72,0.45) 0%, transparent 55%)`,
      }} />

      <div className="w-full max-w-sm animate-fade-in relative">
        <div className="text-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/email/logo-ba.png" alt="" width={68} height={55} className="mx-auto mb-3 select-none" draggable={false} />
          <p className="text-[13px] uppercase" style={{ fontFamily: SERIFA, letterSpacing: '0.24em', color: '#ebd480' }}>
            Bernardes &amp; Azevedo
          </p>
          <p className="text-[10px] uppercase mt-1" style={{ letterSpacing: '0.4em', color: 'var(--notion-text-3)' }}>Advogados</p>
        </div>

        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)', boxShadow: '0 24px 60px -24px rgba(0,0,0,0.7)' }}>
          <div style={{ height: 2, background: OURO }} />
          <div className="p-6">
            {titulo && <h1 className="text-lg font-semibold" style={{ color: 'var(--notion-text)', fontFamily: SERIFA }}>{titulo}</h1>}
            {subtitulo && <p className="text-sm mt-1 mb-5" style={{ color: 'var(--notion-text-2)' }}>{subtitulo}</p>}
            {children}
          </div>
        </div>

        {rodape && <div className="mt-5 text-center text-xs" style={{ color: 'var(--notion-text-3)' }}>{rodape}</div>}
      </div>
    </div>
  )
}

export const estiloCampo: React.CSSProperties = {
  background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)',
}

export function Rotulo({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>{children}</label>
}

/** Campo de senha com o olho para mostrar o que foi digitado. */
export function CampoSenha({ rotulo, value, onChange, autoComplete = 'new-password', autoFocus }: {
  rotulo: string; value: string; onChange: (v: string) => void; autoComplete?: string; autoFocus?: boolean
}) {
  const [visivel, setVisivel] = useState(false)
  const Icone = visivel ? EyeOff : Eye
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <div className="relative">
        <input type={visivel ? 'text' : 'password'} required value={value} onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete} autoFocus={autoFocus} placeholder="••••••••"
          className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm" style={estiloCampo} />
        <button type="button" onClick={() => setVisivel(v => !v)} tabIndex={-1}
          aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
          className="absolute right-0 top-0 h-full px-3 flex items-center hover:opacity-80"
          style={{ color: 'var(--notion-text-3)' }}>
          <Icone className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/** Mesmas regras que /api/definir-senha confere no servidor. */
export const REGRAS_SENHA: { label: string; test: (p: string) => boolean }[] = [
  { label: 'Mínimo 6 caracteres', test: p => p.length >= 6 },
  { label: 'Letra maiúscula', test: p => /[A-Z]/.test(p) },
  { label: 'Letra minúscula', test: p => /[a-z]/.test(p) },
  { label: 'Número', test: p => /[0-9]/.test(p) },
  { label: 'Caractere especial', test: p => /[^A-Za-z0-9]/.test(p) },
]

/** Lista de requisitos, sempre visível: dá para ver o que falta antes de digitar. */
export function RegrasSenha({ senha, confirmacao }: { senha: string; confirmacao: string }) {
  const itens = [
    ...REGRAS_SENHA.map(r => ({ label: r.label, ok: r.test(senha) })),
    { label: 'As duas senhas iguais', ok: senha.length > 0 && senha === confirmacao },
  ]
  const feitos = itens.filter(i => i.ok).length
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--notion-bg)', border: '1px solid var(--notion-border)' }}>
      <div className="h-1 rounded-full mb-2.5 overflow-hidden" style={{ background: 'var(--notion-bg-4)' }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(feitos / itens.length) * 100}%`, background: feitos === itens.length ? '#34D399' : OURO }} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {itens.map(i => (
          <span key={i.label} className="flex items-center gap-1.5 text-[11px] transition-colors"
            style={{ color: i.ok ? '#34D399' : 'var(--notion-text-3)' }}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: i.ok ? 'rgba(52,211,153,0.15)' : 'var(--notion-bg-4)' }}>
              {i.ok && <Check className="w-2.5 h-2.5" />}
            </span>
            {i.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Botão principal das telas de acesso, no dourado da marca. */
export function BotaoOuro({ children, disabled, type = 'submit', onClick }: {
  children: React.ReactNode; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 hover:brightness-105"
      style={{
        background: disabled ? 'var(--notion-bg-4)' : OURO,
        color: disabled ? 'var(--notion-text-3)' : '#1c2738',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>
      {children}
    </button>
  )
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'ok'; children: React.ReactNode }) {
  const erro = tipo === 'erro'
  return (
    <p className="text-xs px-3 py-2 rounded-lg" style={{
      background: erro ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
      color: erro ? '#F87171' : '#34D399',
      border: `1px solid ${erro ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
    }}>{children}</p>
  )
}
