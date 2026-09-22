'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { inputStyle, fmtDate } from './primitives'

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISO(v?: string): Date | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Grade de dias pura — usada tanto pelo DatePicker (formulários) quanto pela célula de data do Quadro. */
export function Calendar({ value, onSelect, onClear, min, max }: {
  value?: string; onSelect: (v: string) => void; onClear?: () => void; min?: string; max?: string
}) {
  const selecionado = parseISO(value)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const [mesAtual, setMesAtual] = useState(() => selecionado || hoje)

  const primeiroDiaMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1)
  const inicioGrade = new Date(primeiroDiaMes)
  inicioGrade.setDate(inicioGrade.getDate() - primeiroDiaMes.getDay())

  const dias: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioGrade)
    d.setDate(inicioGrade.getDate() + i)
    dias.push(d)
  }

  const minD = parseISO(min)
  const maxD = parseISO(max)
  function desabilitado(d: Date) {
    return (minD !== null && d < minD) || (maxD !== null && d > maxD)
  }

  return (
    <div className="rounded-xl p-3 shadow-2xl select-none" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', width: 264 }}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setMesAtual(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="p-1 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-2)' }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium capitalize" style={{ color: 'var(--notion-text)' }}>
          {MESES[mesAtual.getMonth()]} de {mesAtual.getFullYear()}
        </span>
        <button type="button" onClick={() => setMesAtual(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="p-1 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-2)' }}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold py-1" style={{ color: 'var(--notion-text-3)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((d, i) => {
          const foraDoMes = d.getMonth() !== mesAtual.getMonth()
          const isHoje = d.getTime() === hoje.getTime()
          const isSelecionado = !!selecionado && d.getTime() === selecionado.getTime()
          const off = desabilitado(d)
          return (
            <button key={i} type="button" disabled={off} onClick={() => onSelect(toISO(d))}
              className="text-xs rounded-md py-1.5 transition-colors"
              style={{
                color: off || foraDoMes ? 'var(--notion-text-3)' : isSelecionado ? '#fff' : 'var(--notion-text)',
                opacity: off ? 0.35 : foraDoMes ? 0.5 : 1,
                background: isSelecionado ? 'var(--notion-accent)' : 'transparent',
                cursor: off ? 'not-allowed' : 'pointer',
                fontWeight: isHoje && !isSelecionado ? 700 : 400,
                boxShadow: isHoje && !isSelecionado ? 'inset 0 0 0 1px var(--notion-accent)' : 'none',
              }}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--notion-border)' }}>
        <button type="button" onClick={() => (onClear ? onClear() : onSelect(''))}
          className="text-xs hover:underline" style={{ color: 'var(--notion-text-3)' }}>Limpar</button>
        <button type="button" onClick={() => { setMesAtual(hoje); onSelect(toISO(hoje)) }}
          className="text-xs hover:underline" style={{ color: 'var(--notion-accent)' }}>Hoje</button>
      </div>
    </div>
  )
}

/** Substituto de <input type="date"> (ou datetime-local com withTime): mesmo visual dos outros campos do CRM, calendário próprio no popover. */
export function DatePicker({ value, onChange, min, max, placeholder = 'Selecionar data', compact = false, withTime = false }: {
  value?: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; compact?: boolean; withTime?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const dataParte = withTime ? (value || '').slice(0, 10) : (value || '')
  const horaParte = withTime ? (value || '').slice(11, 16) : ''

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight, w = 264
      setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), top: Math.min(r.bottom + 4, vh - (withTime ? 360 : 320)) })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle}
        className={compact
          ? 'px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 text-left'
          : 'w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 text-left'}
        style={inputStyle}>
        <span style={{ color: value ? 'var(--notion-text)' : 'var(--notion-text-3)' }}>
          {value
            ? (withTime ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : fmtDate(value))
            : placeholder}
        </span>
        <CalendarIcon className={compact ? 'w-3 h-3 flex-shrink-0' : 'w-3.5 h-3.5 flex-shrink-0'} style={{ color: 'var(--notion-text-3)' }} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 10051 }} onMouseDown={e => e.stopPropagation()}>
          <Calendar value={dataParte} min={min} max={max}
            onSelect={v => {
              if (withTime) onChange(v ? `${v}T${horaParte || '00:00'}` : '')
              else { onChange(v); if (v) setOpen(false) }
            }}
            onClear={() => { onChange(''); setOpen(false) }} />
          {withTime && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 -mt-1 rounded-b-xl"
              style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', borderTop: 'none' }}>
              <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Hora</span>
              <input type="time" value={horaParte} disabled={!dataParte}
                onChange={e => onChange(`${dataParte}T${e.target.value || '00:00'}`)}
                className="px-2 py-1 rounded text-xs" style={{ background: 'var(--notion-bg-4)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
