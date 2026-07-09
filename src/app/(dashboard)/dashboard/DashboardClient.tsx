'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Pencil } from 'lucide-react'

export type FinRow = {
  tipo: 'receita' | 'despesa'
  valor: number
  data: string | null
  canal: string | null
  area: string | null
  materia: string | null     // "Matéria" (área jurídica) — usada no Contratos
  categoria: string | null   // "Despesa" (categoria do custo) — só saídas
  custoTipo: string | null   // "Tipo" (Custo Fixo/Variável) — só saídas
}

type Tab = 'entradas' | 'saidas' | 'contratos'

const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const GOLD = '#E0B341'
const PIE_COLORS = ['#2E5A88', '#E0B341', '#6B8FB5', '#C99A3B', '#A8B5C4', '#4A7BA6', '#8B6D2F', '#D4AF6A', '#5C7A99', '#3E6187', '#B8912F', '#7E8FA3', '#26466b', '#f0c96a', '#94a3b8', '#d9b45a']

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtAxis = (v: number, money = true) => money ? (Math.abs(v) >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${Math.round(v)}`) : String(Math.round(v))

const panel: React.CSSProperties = { background: '#0e1a2c', border: '1px solid #1e355a', borderRadius: 12 }
const inputStyle: React.CSSProperties = { background: '#0b1524', border: '1px solid #1e355a', color: '#d9e2ec' }
const titleC = '#c7d3e0', subC = '#6f849c'

// ============ helpers de agregação ============
const monthKey = (r: FinRow) => (r.data || '').slice(0, 7)
const mesLabel = (k: string) => `${k.slice(0, 4)}-${MES_ABBR[parseInt(k.slice(5, 7)) - 1] || '?'}`

function groupSum(list: FinRow[], key: (r: FinRow) => string | null) {
  const m = new Map<string, number>()
  for (const r of list) { const k = (key(r) || '—').trim() || '—'; m.set(k, (m.get(k) || 0) + r.valor) }
  return [...m.entries()].map(([label, value]) => ({ label, value })).filter(d => d.value !== 0)
}
function groupCount(list: FinRow[], key: (r: FinRow) => string | null) {
  const m = new Map<string, number>()
  for (const r of list) { const k = (key(r) || '—').trim() || '—'; m.set(k, (m.get(k) || 0) + 1) }
  return [...m.entries()].map(([label, value]) => ({ label, value }))
}
function groupAvg(list: FinRow[], key: (r: FinRow) => string | null) {
  const s = new Map<string, number>(), c = new Map<string, number>()
  for (const r of list) { const k = (key(r) || '—').trim() || '—'; s.set(k, (s.get(k) || 0) + r.valor); c.set(k, (c.get(k) || 0) + 1) }
  return [...s.entries()].map(([label, sum]) => ({ label, value: sum / (c.get(label) || 1) }))
}
function monthly(list: FinRow[], mode: 'sum' | 'count') {
  const m = new Map<string, number>()
  for (const r of list) { const k = monthKey(r); if (!k) continue; m.set(k, (m.get(k) || 0) + (mode === 'count' ? 1 : r.valor)) }
  return [...m.keys()].sort().map(k => ({ label: mesLabel(k), value: m.get(k)! }))
}
const desc = (a: { value: number }, b: { value: number }) => b.value - a.value

// ============ gráficos ============
function BarChart({ data, height = 180, money = true }: { data: { label: string; value: number }[]; height?: number; money?: boolean }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const ticks = 4
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-right shrink-0" style={{ height, width: 52, color: subC, fontSize: 9 }}>
        {Array.from({ length: ticks + 1 }).map((_, i) => <span key={i}>{fmtAxis(max * (ticks - i) / ticks, money)}</span>)}
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex items-end gap-[2px] border-b" style={{ height, borderColor: '#1e355a', minWidth: data.length * 5 }}>
          {data.map((d, i) => (
            <div key={i} className="flex-1 rounded-t hover:brightness-110" style={{ minWidth: 3, height: `${Math.max(0.5, d.value / max * 100)}%`, background: GOLD }}
              title={`${d.label}: ${money ? fmtBRL(d.value) : Math.round(d.value)}`} />
          ))}
        </div>
        <div className="flex gap-[2px]" style={{ minWidth: data.length * 5 }}>
          {data.map((d, i) => <span key={i} className="flex-1 text-center truncate" style={{ minWidth: 3, fontSize: 8, color: subC }}>{d.label}</span>)}
        </div>
      </div>
    </div>
  )
}

function Pie({ data, money = true }: { data: { label: string; value: number }[]; money?: boolean }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1
  const sorted = [...data].sort(desc)
  let acc = 0
  const stops = sorted.map((d, i) => {
    const start = acc / total * 100; acc += d.value; const end = acc / total * 100
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${end}%`
  })
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="rounded-full shrink-0" style={{ width: 140, height: 140, background: `conic-gradient(${stops.join(', ')})` }} />
      <div className="flex-1 min-w-[120px] space-y-1 max-h-[200px] overflow-y-auto">
        {sorted.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="flex-1 truncate" style={{ color: titleC }} title={d.label}>{d.label || '—'}</span>
            <span style={{ color: subC }}>{money ? '' : ''}{(d.value / total * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="p-4" style={panel}><h3 className="text-sm font-semibold mb-3" style={{ color: titleC }}>{title}</h3>{children}</div>
}

// ============ dashboard ============
export function DashboardClient({ rows, initialMeta, workspaceId, metaTableId, metaRowId, logoUrl }: {
  rows: FinRow[]; initialMeta: number; workspaceId: string; metaTableId: string | null; metaRowId: string | null; logoUrl: string | null
}) {
  const supabase = createClient()
  const now = new Date()
  const [tab, setTab] = useState<Tab>('entradas')
  const [ano, setAno] = useState('')
  const [mes, setMes] = useState('')
  const [meta, setMeta] = useState(initialMeta)
  const [editMeta, setEditMeta] = useState(false)
  const [saving, setSaving] = useState(false)
  const tableIdRef = useRef(metaTableId)
  const rowIdRef = useRef(metaRowId)

  const anos = useMemo(() => [...new Set(rows.map(r => (r.data || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [rows])

  const v = useMemo(() => {
    const inFilter = (d: string) => (!ano || d.slice(0, 4) === ano) && (!mes || d.slice(5, 7) === mes)
    const fil = rows.filter(r => inFilter((r.data || '').slice(0, 10)))
    const rec = fil.filter(r => r.tipo === 'receita')
    const desp = fil.filter(r => r.tipo === 'despesa')
    // Contratos agrupa por Matéria; se a coluna não existir, cai pra Área
    const useMateria = rec.some(r => r.materia)
    const contratoKey = (r: FinRow) => useMateria ? r.materia : r.area

    // lucro/mês (receita - despesa)
    const mm = new Map<string, { rec: number; desp: number }>()
    for (const r of fil) { const k = monthKey(r); if (!k) continue; const c = mm.get(k) || { rec: 0, desp: 0 }; if (r.tipo === 'receita') c.rec += r.valor; else c.desp += r.valor; mm.set(k, c) }
    const months = [...mm.keys()].sort()

    const diaSum = (list: FinRow[]) => {
      const m = new Map<string, number>()
      for (const r of list) { const k = (r.data || '').slice(0, 10); if (!k) continue; m.set(k, (m.get(k) || 0) + r.valor) }
      return [...m.keys()].sort().map(k => ({ label: k.slice(8, 10) + '/' + k.slice(5, 7), value: m.get(k)! }))
    }

    return {
      // entradas
      fatMes: months.map(k => ({ label: mesLabel(k), value: mm.get(k)!.rec })),
      lucroMes: months.map(k => ({ label: mesLabel(k), value: mm.get(k)!.rec - mm.get(k)!.desp })),
      canal: groupSum(rec, r => r.canal).sort(desc),
      area: groupSum(rec, r => r.area).sort(desc),
      dias: diaSum(rec),
      periodo: rec.reduce((a, b) => a + b.valor, 0),
      // saídas
      custoCategoria: groupSum(desp, r => r.categoria).sort(desc),
      custoTipo: groupSum(desp, r => r.custoTipo).sort(desc),
      custoMes: monthly(desp, 'sum'),
      custoFixos: groupSum(desp.filter(r => /fix/i.test(r.custoTipo || '')), r => r.categoria).sort(desc),
      custoVariaveis: groupSum(desp.filter(r => /vari/i.test(r.custoTipo || '')), r => r.categoria).sort(desc),
      // contratos (cada receita = um contrato), agrupado por Matéria
      contratosMes: monthly(rec, 'count'),
      contratosArea: groupCount(rec, contratoKey).sort(desc),
      ticketArea: groupAvg(rec, contratoKey).sort(desc),
    }
  }, [rows, ano, mes])

  // resumo (independe do filtro)
  const total = useMemo(() => rows.filter(r => r.tipo === 'receita').reduce((a, b) => a + b.valor, 0), [rows])
  const faturado = useMemo(() => {
    const k = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return rows.filter(r => r.tipo === 'receita' && (r.data || '').slice(0, 7) === k).reduce((a, b) => a + b.valor, 0)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const faltante = Math.max(0, meta - faturado)
  const pct = meta > 0 ? Math.min(100, faturado / meta * 100) : 0

  async function saveMeta(val: number) {
    setMeta(val); setEditMeta(false); setSaving(true)
    try {
      let tId = tableIdRef.current
      if (!tId) {
        const { data } = await supabase.from('db_tables').insert({ workspace_id: workspaceId, name: 'cfg-dashboard', module_key: 'cfg-dashboard', position: 999 }).select('id').single()
        tId = (data?.id as string) ?? null; tableIdRef.current = tId
      }
      if (tId) {
        if (rowIdRef.current) await supabase.from('db_rows').update({ data: { meta_mensal: val } }).eq('id', rowIdRef.current)
        else { const { data } = await supabase.from('db_rows').insert({ table_id: tId, data: { meta_mensal: val }, position: 0 }).select('id').single(); rowIdRef.current = (data?.id as string) ?? null }
      }
    } finally { setSaving(false) }
  }

  const periodoLabel = mes || ano ? `${mes ? MESES[parseInt(mes) - 1] + '/' : ''}${ano || 'todos'}` : 'Tudo'
  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button onClick={() => setTab(id)} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
      style={{ background: tab === id ? GOLD : '#0e1a2c', color: tab === id ? '#0a1220' : titleC, border: '1px solid #1e355a' }}>{label}</button>
  )

  return (
    <div className="min-h-screen p-6" style={{ background: '#0a1220' }}>
      {/* topo: filtros + logo */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
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

      {/* abas */}
      <div className="flex gap-1.5 mb-5">
        <TabBtn id="entradas" label="Entradas" />
        <TabBtn id="saidas" label="Saídas" />
        <TabBtn id="contratos" label="Contratos" />
      </div>

      {tab === 'entradas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Faturamento/mês"><BarChart data={v.fatMes} /></Section>
          <Section title="Faturamento/canal"><Pie data={v.canal} /></Section>
          <Section title="Faturamento/área"><Pie data={v.area} /></Section>
          <Section title="Lucro/mês"><BarChart data={v.lucroMes} /></Section>
          {/* RESUMO */}
          <div className="p-4 flex flex-col" style={panel}>
            <h3 className="text-sm font-semibold text-center mb-3" style={{ color: GOLD }}>RESUMO</h3>
            <p className="text-center text-xs" style={{ color: subC }}>Faturamento no período ({periodoLabel}):</p>
            <p className="text-center text-lg font-bold mb-2" style={{ color: GOLD }}>{fmtBRL(v.periodo)}</p>
            <p className="text-center text-xs" style={{ color: subC }}>Faturamento Total:</p>
            <p className="text-center text-lg font-bold mb-4" style={{ color: GOLD }}>{fmtBRL(total)}</p>
            <div className="space-y-1.5 text-xs mb-3">
              <div className="flex justify-between items-center">
                <span style={{ color: subC }}>META DO MÊS:</span>
                {editMeta ? (
                  <input type="number" autoFocus defaultValue={meta} onBlur={e => saveMeta(Number(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="w-28 px-2 py-1 rounded text-right" style={inputStyle} />
                ) : (
                  <button onClick={() => setEditMeta(true)} className="inline-flex items-center gap-1 font-mono" style={{ color: titleC }} title="Editar meta">
                    {fmtBRL(meta)} <Pencil className="w-3 h-3" style={{ color: subC }} />
                  </button>
                )}
              </div>
              <div className="flex justify-between"><span style={{ color: subC }}>FATURADO:</span><span className="font-mono" style={{ color: titleC }}>{fmtBRL(faturado)}</span></div>
              <div className="flex justify-between"><span style={{ color: subC }}>FALTANTE:</span><span className="font-mono" style={{ color: titleC }}>{fmtBRL(faltante)}</span></div>
            </div>
            <div className="mt-auto">
              <div className="h-4 rounded-full overflow-hidden" style={{ background: '#0b1524', border: '1px solid #1e355a' }}>
                <div className="h-full" style={{ width: `${pct}%`, background: GOLD, transition: 'width .3s' }} />
              </div>
              <p className="text-center text-xs mt-1" style={{ color: subC }}>{pct.toFixed(2)}%{saving ? ' · salvando…' : ''}</p>
            </div>
          </div>
          <Section title="Faturamento/dia"><BarChart data={v.dias} /></Section>
        </div>
      )}

      {tab === 'saidas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Custos/categoria"><BarChart data={v.custoCategoria} /></Section>
          <Section title="Custo/tipo (Fixo × Variável)"><Pie data={v.custoTipo} /></Section>
          <Section title="Custos totais"><Pie data={v.custoCategoria} /></Section>
          <Section title="Custo/mês"><BarChart data={v.custoMes} /></Section>
          <Section title="Custos fixos"><Pie data={v.custoFixos} /></Section>
          <Section title="Custos variáveis"><Pie data={v.custoVariaveis} /></Section>
        </div>
      )}

      {tab === 'contratos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Contratos/mês"><BarChart data={v.contratosMes} money={false} /></Section>
          <Section title="Contratos/área"><Pie data={v.contratosArea} money={false} /></Section>
          <Section title="Ticket médio/área"><BarChart data={v.ticketArea} /></Section>
        </div>
      )}
    </div>
  )
}
