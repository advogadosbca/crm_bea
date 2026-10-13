'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import { inputStyle } from './primitives'

const pad = (n: number) => String(n).padStart(2, '0')
const HORAS = Array.from({ length: 24 }, (_, i) => pad(i))

/**
 * Substituto de <input type="time">: o seletor nativo abre uma lista branca do
 * navegador, fora do tema do CRM. Aqui é o mesmo campo dos outros formulários e
 * um popover com duas colunas (hora | minuto) no padrão do DatePicker.
 *
 * `value`/`onChange` em "HH:MM". `compact` é a versão menor, para rodapés de
 * popover (calendário com hora, célula de data, prazo da tarefa).
 */
export function TimePicker({ value, onChange, disabled = false, compact = false, passo = 5, placeholder = '--:--' }: {
  value?: string; onChange: (v: string) => void; disabled?: boolean; compact?: boolean
  /** intervalo da coluna de minutos; um minuto fora do passo já gravado continua aparecendo */
  passo?: number; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const [h, m] = /^\d{2}:\d{2}/.test(value || '') ? [value!.slice(0, 2), value!.slice(3, 5)] : ['', '']
  const minutos = Array.from({ length: Math.ceil(60 / passo) }, (_, i) => pad(i * passo))
  if (m && !minutos.includes(m)) { minutos.push(m); minutos.sort() }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (disabled) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight, w = 132, alt = 248
      setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), top: r.bottom + 4 + alt > vh ? Math.max(8, r.top - alt - 4) : r.bottom + 4 })
    }
    setOpen(o => !o)
  }

  // fecha ao clicar fora. Em captura: dentro de outro popover (calendário com
  // hora) o clique não chega ao document porque o popover pai para a propagação
  useEffect(() => {
    if (!open) return
    function fora(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', fora, true)
    return () => document.removeEventListener('mousedown', fora, true)
  }, [open])

  // abre já mostrando a hora/minuto escolhidos — rola só a coluna (scrollIntoView
  // rolaria também a página por trás de um modal)
  useEffect(() => {
    if (!open) return
    popRef.current?.querySelectorAll<HTMLElement>('[data-sel="1"]').forEach(el => {
      const col = el.parentElement
      if (col) col.scrollTop = el.offsetTop - col.offsetTop - col.clientHeight / 2 + el.offsetHeight / 2
    })
  }, [open])

  const item = (txt: string, sel: boolean, onClick: () => void) => (
    <button key={txt} type="button" data-sel={sel ? '1' : undefined} onClick={onClick}
      className="w-full text-xs rounded-md py-1.5 transition-colors hover:bg-[var(--notion-bg-4)]"
      style={sel ? { background: 'var(--notion-accent)', color: '#fff', fontWeight: 600 } : { color: 'var(--notion-text)' }}>
      {txt}
    </button>
  )

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} disabled={disabled}
        className={compact
          ? 'px-2 py-1 rounded text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed'
          : 'w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed'}
        style={compact ? { background: 'var(--notion-bg-4)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' } : inputStyle}>
        <span style={{ color: value ? 'var(--notion-text)' : 'var(--notion-text-3)' }}>{h ? `${h}:${m}` : placeholder}</span>
        <Clock className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} style={{ color: 'var(--notion-text-3)' }} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
          className="rounded-xl p-1.5 shadow-2xl select-none flex gap-1"
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 10060, width: 132, background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
          <div className="flex-1 max-h-60 overflow-y-auto overscroll-contain space-y-0.5 pr-0.5">
            {HORAS.map(x => item(x, x === h, () => onChange(`${x}:${m || '00'}`)))}
          </div>
          <div className="w-px" style={{ background: 'var(--notion-border)' }} />
          <div className="flex-1 max-h-60 overflow-y-auto overscroll-contain space-y-0.5 pl-0.5">
            {minutos.map(x => item(x, x === m, () => { onChange(`${h || '09'}:${x}`); setOpen(false) }))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
