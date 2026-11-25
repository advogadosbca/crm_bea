'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { inputStyle, fmtDate } from './primitives'
import { TimePicker } from './TimePicker'

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

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function isoParaTexto(v?: string) {
  const d = parseISO(v)
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : ''
}
/** Aplica a máscara dd/mm/aaaa enquanto a pessoa digita (só números). */
function mascaraData(bruto: string) {
  const n = bruto.replace(/\D/g, '').slice(0, 8)
  if (n.length <= 2) return n
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`
}
/** "15/03/1965" → Date, ou null se incompleta/inválida (ex.: 31/02). */
function textoParaData(t: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (!m) return null
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3])
  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return null
  const d = new Date(ano, mes - 1, dia)
  return d.getMonth() === mes - 1 ? d : null
}

/** Grade de dias pura — usada tanto pelo DatePicker (formulários) quanto pela célula de data do Quadro.
 *  Aceita digitar a data (dd/mm/aaaa) e pular direto para mês/ano clicando no título. */
export function Calendar({ value, onSelect, onClear, min, max }: {
  value?: string; onSelect: (v: string) => void; onClear?: () => void; min?: string; max?: string
}) {
  const selecionado = parseISO(value)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const [mesAtual, setMesAtual] = useState(() => selecionado || hoje)
  const [modo, setModo] = useState<'dia' | 'mes' | 'ano'>('dia')
  const [texto, setTexto] = useState(() => isoParaTexto(value))
  const [textoInvalido, setTextoInvalido] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // valor mudou por fora (clique num dia, "Hoje", "Limpar") → campo de texto acompanha
  useEffect(() => { setTexto(isoParaTexto(value)); setTextoInvalido(false) }, [value])
  useEffect(() => { inputRef.current?.focus() }, [])

  function confirmarTexto(t: string) {
    const d = textoParaData(t)
    if (!d || desabilitado(d)) { setTextoInvalido(t.length === 10); return false }
    setTextoInvalido(false)
    setMesAtual(d); setModo('dia')
    onSelect(toISO(d))
    return true
  }

  // bloco de 12 anos que contém o ano em exibição (ex.: 1956–1967)
  const anoBase = mesAtual.getFullYear() - (((mesAtual.getFullYear() % 12) + 12) % 12)

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
      <input ref={inputRef} value={texto} inputMode="numeric" placeholder="Digite: dd/mm/aaaa" maxLength={10}
        onChange={e => {
          const t = mascaraData(e.target.value)
          setTexto(t)
          if (t.length === 10) confirmarTexto(t)
          else {
            setTextoInvalido(false)
            // já dá para pular a grade para o mês digitado antes de terminar o ano
            const p = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
            if (p && Number(p[2]) >= 1 && Number(p[2]) <= 12) setMesAtual(new Date(Number(p[3]), Number(p[2]) - 1, 1))
          }
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarTexto(texto) } }}
        className="w-full px-2.5 py-1.5 mb-2 rounded-lg text-sm outline-none select-text"
        style={{
          background: 'var(--notion-bg-2)', color: 'var(--notion-text)',
          border: `1px solid ${textoInvalido ? '#F87171' : 'var(--notion-border)'}`,
        }} />
      {textoInvalido && <div className="text-[11px] -mt-1 mb-2" style={{ color: '#F87171' }}>Data inválida</div>}

      <div className="flex items-center justify-between mb-2">
        <button type="button"
          onClick={() => {
            if (modo === 'ano') setMesAtual(m => new Date(m.getFullYear() - 12, m.getMonth(), 1))
            else if (modo === 'mes') setMesAtual(m => new Date(m.getFullYear() - 1, m.getMonth(), 1))
            else setMesAtual(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }}
          className="p-1 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-2)' }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" title="Escolher mês e ano"
          onClick={() => setModo(m => (m === 'dia' ? 'ano' : m === 'ano' ? 'mes' : 'ano'))}
          className="text-sm font-medium px-2 py-0.5 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text)' }}>
          {modo === 'ano' ? `${anoBase} – ${anoBase + 11}`
            : modo === 'mes' ? mesAtual.getFullYear()
            : `${MESES[mesAtual.getMonth()].replace(/^./, c => c.toUpperCase())} de ${mesAtual.getFullYear()}`}
        </button>
        <button type="button"
          onClick={() => {
            if (modo === 'ano') setMesAtual(m => new Date(m.getFullYear() + 12, m.getMonth(), 1))
            else if (modo === 'mes') setMesAtual(m => new Date(m.getFullYear() + 1, m.getMonth(), 1))
            else setMesAtual(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }}
          className="p-1 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-2)' }}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {modo !== 'dia' ? (
        <div className="grid grid-cols-3 gap-1" style={{ minHeight: 216 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const ativo = modo === 'ano'
              ? anoBase + i === mesAtual.getFullYear()
              : i === mesAtual.getMonth()
            return (
              <button key={i} type="button"
                onClick={() => {
                  if (modo === 'ano') { setMesAtual(m => new Date(anoBase + i, m.getMonth(), 1)); setModo('mes') }
                  else { setMesAtual(m => new Date(m.getFullYear(), i, 1)); setModo('dia') }
                }}
                className="text-xs rounded-md py-2 capitalize transition-colors hover:bg-[var(--notion-bg-2)]"
                style={{
                  color: ativo ? '#fff' : 'var(--notion-text)',
                  background: ativo ? 'var(--notion-accent)' : 'transparent',
                }}>
                {modo === 'ano' ? anoBase + i : MESES_CURTOS[i]}
              </button>
            )
          })}
        </div>
      ) : (<>
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
      </>)}
      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--notion-border)' }}>
        <button type="button" onClick={() => { setTexto(''); setTextoInvalido(false); if (onClear) onClear(); else onSelect('') }}
          className="text-xs hover:underline" style={{ color: 'var(--notion-text-3)' }}>Limpar</button>
        <button type="button" onClick={() => { setMesAtual(hoje); setModo('dia'); onSelect(toISO(hoje)) }}
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
      setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), top: Math.max(8, Math.min(r.bottom + 4, vh - (withTime ? 420 : 380))) })
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
              <TimePicker compact value={horaParte} disabled={!dataParte}
                onChange={hora => onChange(`${dataParte}T${hora || '00:00'}`)} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
