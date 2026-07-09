'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Check, Pencil } from 'lucide-react'

export type FinRow = {
  tipo: 'receita' | 'despesa'
  valor: number
  data: string | null
  canal: string | null
  area: string | null
}

const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const GOLD = '#E0B341'
const PIE_COLORS = ['#2E5A88', '#E0B341', '#6B8FB5', '#C99A3B', '#A8B5C4', '#4A7BA6', '#8B6D2F', '#D4AF6A', '#5C7A99', '#3E6187', '#B8912F', '#7E8FA3', '#26466b', '#f0c96a']

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtAxis = (v: number) => v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${Math.round(v)}`

// ---- estilos do tema navy/dourado ----
const panel: React.CSSProperties = { background: '#0e1a2c', border: '1px solid #1e355a', borderRadius: 12 }
const inputStyle: React.CSSProperties = { background: '#0b1524', border: '1px solid #1e355a', color: '#d9e2ec' }
const titleC = '#c7d3e0', subC = '#6f849c'

// ============ gráficos ============
function BarChart({ data, height = 180, labelEvery = 1 }: { data: { label: string; value: number }[]; height?: number; labelEvery?: number }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const ticks = 4
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-right shrink-0" style={{ height, width: 52, color: subC, fontSize: 9 }}>
        {Array.from({ length: ticks + 1 }).map((_, i) => <span key={i}>{fmtAxis(max * (ticks - i) / ticks)}</span>)}
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex items-end gap-[2px] border-b" style={{ height, borderColor: '#1e355a', minWidth: data.length * 5 }}>
          {data.map((d, i) => (
            <div key={i} className="flex-1 rounded-t hover:brightness-110" style={{ minWidth: 3, height: `${Math.max(0.5, d.value / max * 100)}%`, background: GOLD }}
              title={`${d.label}: ${fmtBRL(d.value)}`} />
          ))}
        </div>
        <div className="flex gap-[2px]" style={{ minWidth: data.length * 5 }}>
          {data.map((d, i) => (
            <span key={i} className="flex-1 text-center truncate" style={{ minWidth: 3, fontSize: 8, color: subC }}>
              {i % labelEvery === 0 ? d.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pie({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1
  const sorted = [...data].sort((a, b) => b.value - a.value)
  let acc = 0
  const stops = sorted.map((d, i) => {
    const start = acc / total * 100
    acc += d.value
    const end = acc / total * 100
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${end}%`
  })
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="rounded-full shrink-0" style={{ width: 150, height: 150, background: `conic-gradient(${stops.join(', ')})` }} />
      <div className="flex-1 min-w-[120px] space-y-1">
        {sorted.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="flex-1 truncate" style={{ color: titleC }}>{d.label || '—'}</span>
            <span style={{ color: subC }}>{(d.value / total * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4" style={panel}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: titleC }}>{title}</h3>
      {children}
    </div>
  )
}

// ============ dashboard ============
export function DashboardClient({ rows, initialMeta, workspaceId, metaTableId, metaRowId, logoUrl }: {
  rows: FinRow[]; initialMeta: number; workspaceId: string; metaTableId: string | null; metaRowId: string | null; logoUrl: string | null
}) {
  const supabase = createClient()
  const now = new Date()
  const [ano, setAno] = useState('')
  const [mes, setMes] = useState('')
  const [meta, setMeta] = useState(initialMeta)
  const [editMeta, setEditMeta] = useState(false)
  const [saving, setSaving] = useState(false)
  const tableIdRef = useRef(metaTableId)
  const rowIdRef = useRef(metaRowId)

  const anos = useMemo(() => [...new Set(rows.map(r => (r.data || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [rows])

  const inFilter = (d: string) => {
    if (ano && d.slice(0, 4) !== ano) return false
    if (mes && d.slice(5, 7) !== mes) return false
    return true
  }

  const agg = useMemo(() => {
    const receitas = rows.filter(r => r.tipo === 'receita')
    const fil = rows.filter(r => inFilter((r.data || '').slice(0, 10)))
    const filRec = fil.filter(r => r.tipo === 'receita')

    // por mês (YYYY-MM)
    const mMonth = new Map<string, { rec: number; desp: number }>()
    for (const r of fil) {
      const k = (r.data || '').slice(0, 7); if (!k) continue
      const cur = mMonth.get(k) || { rec: 0, desp: 0 }
      if (r.tipo === 'receita') cur.rec += r.valor; else cur.desp += r.valor
      mMonth.set(k, cur)
    }
    const months = [...mMonth.keys()].sort()
    const mesLabel = (k: string) => `${k.slice(0, 4)}-${MES_ABBR[parseInt(k.slice(5, 7)) - 1] || '?'}`
    const fatMes = months.map(k => ({ label: mesLabel(k), value: mMonth.get(k)!.rec }))
    const lucroMes = months.map(k => ({ label: mesLabel(k), value: mMonth.get(k)!.rec - mMonth.get(k)!.desp }))

    // por canal / área (receita)
    const byKey = (keyFn: (r: FinRow) => string | null) => {
      const m = new Map<string, number>()
      for (const r of filRec) { const k = (keyFn(r) || '—').trim() || '—'; m.set(k, (m.get(k) || 0) + r.valor) }
      return [...m.entries()].map(([label, value]) => ({ label, value })).filter(d => d.value > 0)
    }
    const canal = byKey(r => r.canal)
    const area = byKey(r => r.area)

    // por dia
    const mDay = new Map<string, number>()
    for (const r of filRec) { const k = (r.data || '').slice(0, 10); if (!k) continue; mDay.set(k, (mDay.get(k) || 0) + r.valor) }
    const dias = [...mDay.keys()].sort().map(k => ({ label: k.slice(8, 10) + '/' + k.slice(5, 7), value: mDay.get(k)! }))

    // resumo
    const periodo = filRec.reduce((a, b) => a + b.valor, 0)
    const total = receitas.reduce((a, b) => a + b.valor, 0)
    const mesAtualKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const faturado = receitas.filter(r => (r.data || '').slice(0, 7) === mesAtualKey).reduce((a, b) => a + b.valor, 0)

    return { fatMes, lucroMes, canal, area, dias, periodo, total, faturado }
  }, [rows, ano, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  const faltante = Math.max(0, meta - agg.faturado)
  const pct = meta > 0 ? Math.min(100, agg.faturado / meta * 100) : 0

  async function saveMeta(v: number) {
    setMeta(v); setEditMeta(false); setSaving(true)
    try {
      let tId = tableIdRef.current
      if (!tId) {
        const { data } = await supabase.from('db_tables').insert({ workspace_id: workspaceId, name: 'cfg-dashboard', module_key: 'cfg-dashboard', position: 999 }).select('id').single()
        tId = (data?.id as string) ?? null; tableIdRef.current = tId
      }
      if (tId) {
        if (rowIdRef.current) {
          await supabase.from('db_rows').update({ data: { meta_mensal: v } }).eq('id', rowIdRef.current)
        } else {
          const { data } = await supabase.from('db_rows').insert({ table_id: tId, data: { meta_mensal: v }, position: 0 }).select('id').single()
          rowIdRef.current = (data?.id as string) ?? null
        }
      }
    } finally { setSaving(false) }
  }

  const periodoLabel = mes || ano ? `${mes ? MESES[parseInt(mes) - 1] + '/' : ''}${ano || 'todos'}` : 'Tudo'

  return (
    <div className="min-h-screen p-6" style={{ background: '#0a1220' }}>
      {/* topo: filtros + logo */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
            <option value="">Mês: Todos</option>
            {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={inputStyle}>
            <option value="">Ano: Todos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {logoUrl
          ? <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
          : <span className="text-lg font-semibold tracking-widest" style={{ color: GOLD }}>BERNARDES &amp; AZEVEDO</span>}
        <div style={{ width: 120 }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Faturamento/mês"><BarChart data={agg.fatMes} /></Section>
        <Section title="Faturamento/canal"><Pie data={agg.canal} /></Section>
        <Section title="Faturamento/área"><Pie data={agg.area} /></Section>

        <Section title="Lucro/mês"><BarChart data={agg.lucroMes} /></Section>

        {/* RESUMO */}
        <div className="p-4 flex flex-col" style={panel}>
          <h3 className="text-sm font-semibold text-center mb-3" style={{ color: GOLD }}>RESUMO</h3>
          <p className="text-center text-xs" style={{ color: subC }}>Faturamento no período ({periodoLabel}):</p>
          <p className="text-center text-lg font-bold mb-2" style={{ color: GOLD }}>{fmtBRL(agg.periodo)}</p>
          <p className="text-center text-xs" style={{ color: subC }}>Faturamento Total:</p>
          <p className="text-center text-lg font-bold mb-4" style={{ color: GOLD }}>{fmtBRL(agg.total)}</p>

          <div className="space-y-1.5 text-xs mb-3">
            <div className="flex justify-between items-center">
              <span style={{ color: subC }}>META DO MÊS:</span>
              {editMeta ? (
                <input type="number" autoFocus defaultValue={meta} onBlur={e => saveMeta(Number(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-28 px-2 py-1 rounded text-right" style={inputStyle} />
              ) : (
                <button onClick={() => setEditMeta(true)} className="inline-flex items-center gap-1 font-mono" style={{ color: titleC }} title="Editar meta">
                  {fmtBRL(meta)} <Pencil className="w-3 h-3" style={{ color: subC }} />
                </button>
              )}
            </div>
            <div className="flex justify-between"><span style={{ color: subC }}>FATURADO:</span><span className="font-mono" style={{ color: titleC }}>{fmtBRL(agg.faturado)}</span></div>
            <div className="flex justify-between"><span style={{ color: subC }}>FALTANTE:</span><span className="font-mono" style={{ color: titleC }}>{fmtBRL(faltante)}</span></div>
          </div>

          <div className="mt-auto">
            <div className="h-4 rounded-full overflow-hidden" style={{ background: '#0b1524', border: '1px solid #1e355a' }}>
              <div className="h-full" style={{ width: `${pct}%`, background: GOLD, transition: 'width .3s' }} />
            </div>
            <p className="text-center text-xs mt-1" style={{ color: subC }}>{pct.toFixed(2)}%{saving ? ' · salvando…' : ''}</p>
          </div>
        </div>

        <Section title="Faturamento/dia"><BarChart data={agg.dias} labelEvery={Math.max(1, Math.ceil(agg.dias.length / 20))} /></Section>
      </div>
    </div>
  )
}
