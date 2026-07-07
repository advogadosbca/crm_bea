'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Landmark, CalendarDays } from 'lucide-react'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const inputStyle: React.CSSProperties = { background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }

export type FinEntry = { tipo: 'receita' | 'despesa'; valor: number; data: string | null }

export function FinanceiroResumo({ entries }: { entries: FinEntry[] }) {
  const now = new Date()
  const [ano, setAno] = useState(String(now.getFullYear()))
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const anos = useMemo(() =>
    [...new Set(entries.map(e => (e.data || '').slice(0, 4)).filter(Boolean))].sort().reverse()
  , [entries])

  const { receitas, despesas } = useMemo(() => {
    let rec = 0, desp = 0
    for (const e of entries) {
      const d = (e.data || '').slice(0, 10)
      if (de && (!d || d < de)) continue
      if (ate && (!d || d > ate)) continue
      if (!de && !ate) {
        if (ano && d.slice(0, 4) !== ano) continue
        if (mes && d.slice(5, 7) !== mes) continue
      }
      if (e.tipo === 'receita') rec += e.valor; else desp += e.valor
    }
    return { receitas: rec, despesas: desp }
  }, [entries, ano, mes, de, ate])

  const intervalo = de || ate
  const periodo = intervalo ? 'Intervalo' : `${mes ? MESES[parseInt(mes) - 1] + '/' : ''}${ano || 'todos'}`

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <CalendarDays className="w-3.5 h-3.5" /> Período:
        </span>
        <select value={ano} onChange={e => { setAno(e.target.value); setDe(''); setAte('') }} disabled={!!intervalo} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
          <option value="">Ano: todos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={e => { setMes(e.target.value); setDe(''); setAte('') }} disabled={!!intervalo} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
          <option value="">Mês: todos</option>
          {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>ou</span>
        <input type="date" value={de} onChange={e => setDe(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle} title="De" />
        <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>até</span>
        <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle} title="Até" />
        <button onClick={() => { setAno(String(now.getFullYear())); setMes(String(now.getMonth() + 1).padStart(2, '0')); setDe(''); setAte('') }}
          className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Mês atual</button>
        <button onClick={() => { setAno(''); setMes(''); setDe(''); setAte('') }}
          className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Tudo</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card icon={TrendingUp} color="#34D399" label={`Receitas (${periodo})`} value={receitas} />
        <Card icon={TrendingDown} color="#F87171" label={`Despesas (${periodo})`} value={despesas} />
        <Card icon={Landmark} color="var(--notion-accent)" label={`Saldo (${periodo})`} value={receitas - despesas} neutral />
      </div>
    </div>
  )
}

function Card({ icon: Icon, color, label, value, neutral }: { icon: typeof TrendingUp; color: string; label: string; value: number; neutral?: boolean }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs truncate" style={{ color: 'var(--notion-text-2)' }}>{label}</span>
      </div>
      <p className="text-xl font-semibold font-mono" style={{ color: neutral ? 'var(--notion-text)' : color }}>{fmtBRL(value)}</p>
    </div>
  )
}
