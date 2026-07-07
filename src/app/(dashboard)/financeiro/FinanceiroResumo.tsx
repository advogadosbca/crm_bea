'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { TrendingUp, TrendingDown, Landmark, CalendarDays } from 'lucide-react'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const inputStyle: React.CSSProperties = { background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }

export type FinEntry = { tipo: 'receita' | 'despesa'; valor: number; data: string | null }

export function FinanceiroResumo({ entries }: { entries: FinEntry[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const now = new Date()

  // filtro APLICADO (na URL) — controla resumo E todas as abas
  const aAno = sp.get('ano') || '', aMes = sp.get('mes') || '', aDe = sp.get('de') || '', aAte = sp.get('ate') || ''

  // controles pendentes
  const [ano, setAno] = useState(aAno || String(now.getFullYear()))
  const [mes, setMes] = useState(aMes || String(now.getMonth() + 1).padStart(2, '0'))
  const [de, setDe] = useState(aDe)
  const [ate, setAte] = useState(aAte)

  const anos = [...new Set(entries.map(e => (e.data || '').slice(0, 4)).filter(Boolean))].sort().reverse()

  // resumo usa o filtro APLICADO (para bater com as tabelas)
  let receitas = 0, despesas = 0
  for (const e of entries) {
    const d = (e.data || '').slice(0, 10)
    if (aDe || aAte) { if (aDe && (!d || d < aDe)) continue; if (aAte && (!d || d > aAte)) continue }
    else { if (aAno && d.slice(0, 4) !== aAno) continue; if (aMes && d.slice(5, 7) !== aMes) continue }
    if (e.tipo === 'receita') receitas += e.valor; else despesas += e.valor
  }

  function push(params: Record<string, string>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
    router.push(`${pathname}${q.toString() ? '?' + q.toString() : ''}`)
  }
  const aplicar = () => (de || ate) ? push({ de, ate }) : push({ ano, mes })
  const mesAtual = () => { const a = String(now.getFullYear()), m = String(now.getMonth() + 1).padStart(2, '0'); setAno(a); setMes(m); setDe(''); setAte(''); push({ ano: a, mes: m }) }
  const limpar = () => { setDe(''); setAte(''); setAno(''); setMes(''); push({}) }

  const intervalo = aDe || aAte
  const periodo = intervalo ? `${aDe || '...'} a ${aAte || '...'}` : (aAno || aMes ? `${aMes ? MESES[parseInt(aMes) - 1] + '/' : ''}${aAno || 'todos'}` : 'Tudo')

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <CalendarDays className="w-3.5 h-3.5" /> Filtro (todas as abas):
        </span>
        <select value={ano} onChange={e => { setAno(e.target.value); setDe(''); setAte('') }} disabled={!!(de || ate)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
          <option value="">Ano: todos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={e => { setMes(e.target.value); setDe(''); setAte('') }} disabled={!!(de || ate)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
          <option value="">Mês: todos</option>
          {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>ou</span>
        <input type="date" value={de} onChange={e => setDe(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle} title="De" />
        <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>até</span>
        <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle} title="Até" />
        <button onClick={aplicar} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Aplicar</button>
        <button onClick={mesAtual} className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Mês atual</button>
        <button onClick={limpar} className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Limpar</button>
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
