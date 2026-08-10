'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

export type Msg = { texto: string; tipo: 'ok' | 'erro' } | null

/** Aviso flutuante simples — o projeto não tem biblioteca de toast. */
export function useAviso() {
  const [msg, setMsg] = useState<Msg>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])
  return { msg, mostrar: setMsg }
}

export function Aviso({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  if (!montado || !msg) return null

  const cor = msg.tipo === 'ok' ? '#34D399' : '#F87171'
  const Icone = msg.tipo === 'ok' ? CheckCircle2 : AlertCircle

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[10100] flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-2xl animate-fade-in max-w-sm"
      style={{ background: 'var(--notion-bg-3)', border: `1px solid ${cor}55` }}>
      <Icone className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cor }} />
      <span className="text-[13px] leading-snug" style={{ color: 'var(--notion-text)' }}>{msg.texto}</span>
      <button onClick={onClose} className="p-0.5 rounded flex-shrink-0" style={{ color: 'var(--notion-text-3)' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body,
  )
}
