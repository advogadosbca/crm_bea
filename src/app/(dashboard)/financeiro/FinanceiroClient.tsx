'use client'

import { useState, useMemo } from 'react'
import { Transacao, COBRANCA_STATUS_OPTIONS, BANCO_OPTIONS, AREA_OPTIONS, CANAL_OPTIONS } from '@/types'
import { Plus, Search, ChevronLeft, X, Phone, Landmark, TrendingUp, TrendingDown, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'

interface Props {
  transacoes: Transacao[]
  contacts: { id: string; name: string; telefone?: string }[]
  workspaceId: string
  headerAssets: HeaderAssets
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function CobrancaBadge({ status }: { status?: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'Pendente': { bg: 'rgba(239,68,68,0.15)', color: '#F87171' },
    'Cobrança Gerada': { bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
    'Pago': { bg: 'rgba(16,185,129,0.2)', color: '#6EE7B7' },
    'Atrasado': { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  }
  const s = map[status || 'Pendente'] || map['Pendente']
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      {status || 'Pendente'}
    </span>
  )
}

function CheckCell({ value }: { value?: boolean }) {
  return (
    <div className="w-4 h-4 rounded flex items-center justify-center"
      style={{
        background: value ? 'var(--notion-accent)' : 'transparent',
        border: value ? 'none' : '1.5px solid var(--notion-border)',
      }}>
      {value && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </div>
  )
}

type View = 'entradas' | 'cobranca' | 'receitas' | 'despesas'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function FinanceiroClient({ transacoes, contacts, workspaceId, headerAssets }: Props) {
  const [view, setView] = useState<View>('entradas')
  const [search, setSearch] = useState('')
  const [fAno, setFAno] = useState('')
  const [fMes, setFMes] = useState('')
  const [fArea, setFArea] = useState('')

  // helper: data de referência de uma entrada (pagamento > vencimento > criação)
  const refDate = (t: Transacao) => t.data_pagamento || t.data_vencimento || t.created_at
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    let list = transacoes
    if (view === 'entradas') {
      list = list.filter(t => t.tipo === 'receita')
      if (fAno) list = list.filter(t => refDate(t)?.slice(0, 4) === fAno)
      if (fMes) list = list.filter(t => refDate(t)?.slice(5, 7) === fMes)
      if (fArea) list = list.filter(t => t.area === fArea)
    }
    if (view === 'cobranca') list = list.filter(t => t.tipo === 'receita' && (t.cobranca_status === 'Pendente' || !t.cobranca_status))
    if (view === 'receitas') list = list.filter(t => t.tipo === 'receita' && t.cobranca_status === 'Cobrança Gerada')
    if (view === 'despesas') list = list.filter(t => t.tipo === 'despesa')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t => t.contact?.name?.toLowerCase().includes(q) ||
        t.descricao?.toLowerCase().includes(q) || t.banco?.toLowerCase().includes(q))
    }
    return list
  }, [transacoes, view, search, fAno, fMes, fArea])

  // anos disponíveis (para o filtro)
  const anosDisponiveis = useMemo(() =>
    [...new Set(transacoes.filter(t => t.tipo === 'receita').map(t => refDate(t)?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[]
  , [transacoes])

  const total = filtered.reduce((sum, t) => sum + Number(t.valor || 0), 0)

  const receitaTotal = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor || 0), 0)
  const despesaTotal = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor || 0), 0)

  const [form, setForm] = useState({
    contact_id: '', descricao: '', valor: '', tipo: 'receita' as 'receita' | 'despesa',
    contratos: '', banco: 'Banco Nubank', parcelado: false,
    cobranca_status: 'Pendente', data_vencimento: '', pendencias: false, follow: false,
    area: '', canal: '', data_pagamento: '',
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const isEntrada = view === 'entradas'
    await supabase.from('transacoes').insert({
      workspace_id: workspaceId,
      contact_id: form.contact_id || null,
      descricao: form.descricao || (contacts.find(c => c.id === form.contact_id)?.name ?? 'Cobrança'),
      valor: Number(form.valor) || 0,
      tipo: form.tipo,
      contratos: form.contratos || null,
      banco: form.banco,
      parcelado: form.parcelado,
      cobranca_status: isEntrada ? 'Pago' : form.cobranca_status,
      data_vencimento: form.data_vencimento || null,
      data_pagamento: form.data_pagamento || null,
      pendencias: form.pendencias,
      follow: form.follow,
      area: form.area || null,
      canal: form.canal || null,
    })
    setSaving(false)
    setShowForm(false)
    setForm({ contact_id: '', descricao: '', valor: '', tipo: 'receita', contratos: '', banco: 'Banco Nubank', parcelado: false, cobranca_status: 'Pendente', data_vencimento: '', pendencias: false, follow: false, area: '', canal: '', data_pagamento: '' })
    router.refresh()
  }

  async function toggleCobranca(t: Transacao) {
    const next = t.cobranca_status === 'Cobrança Gerada' ? 'Pendente' : 'Cobrança Gerada'
    await supabase.from('transacoes').update({ cobranca_status: next }).eq('id', t.id)
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Financeiro" icon={Landmark} color="#34D399"
        gradient="linear-gradient(135deg, #064e3b 0%, #065f46 60%, #064e3b 100%)"
        pageKey="financeiro" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6">

        {/* Resumo cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4" style={{ color: '#34D399' }} />
              <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Receitas</span>
            </div>
            <p className="text-xl font-semibold font-mono" style={{ color: '#34D399' }}>{fmtBRL(receitaTotal)}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4" style={{ color: '#F87171' }} />
              <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Despesas</span>
            </div>
            <p className="text-xl font-semibold font-mono" style={{ color: '#F87171' }}>{fmtBRL(despesaTotal)}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4" style={{ color: 'var(--notion-accent)' }} />
              <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Saldo</span>
            </div>
            <p className="text-xl font-semibold font-mono" style={{ color: 'var(--notion-text)' }}>{fmtBRL(receitaTotal - despesaTotal)}</p>
          </div>
        </div>

        {/* Tabs + actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            {([
              { key: 'entradas', label: 'Entradas' },
              { key: 'cobranca', label: 'Gerar Cobrança' },
              { key: 'receitas', label: 'Receitas em aberto' },
              { key: 'despesas', label: 'Despesas' },
            ] as { key: View; label: string }[]).map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: view === v.key ? 'var(--notion-bg-3)' : 'transparent',
                  color: view === v.key ? 'var(--notion-text)' : 'var(--notion-text-2)',
                }}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {view === 'entradas' && (
              <>
                <select value={fAno} onChange={e => setFAno(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                  <option value="">Ano: todos</option>
                  {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={fMes} onChange={e => setFMes(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                  <option value="">Mês: todos</option>
                  {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                </select>
                <select value={fArea} onChange={e => setFArea(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                  <option value="">Área: todas</option>
                  {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
              <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-sm outline-none w-40" style={{ color: 'var(--notion-text)' }} />
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'var(--notion-accent)', color: '#fff' }}>
              <Plus className="w-3.5 h-3.5" /> Nova
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
                {(view === 'entradas'
                  ? ['Cliente', 'Data', 'Área', 'Canal', 'Valor']
                  : view === 'cobranca'
                  ? ['Cobrança', 'Nome', 'Telefone', 'Contratos', 'Valor', 'Parcelado', 'Banco', 'Vencimento']
                  : view === 'receitas'
                  ? ['Cobrança', 'Nome', 'Telefone', 'Contratos', 'Valor', 'Pendências', 'Parcelado', 'Follow']
                  : ['Descrição', 'Valor', 'Banco', 'Vencimento', 'Status']
                ).map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: 'var(--notion-text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-sm" style={{ color: 'var(--notion-text-3)' }}>
                  Nenhuma transação encontrada
                </td></tr>
              ) : filtered.map((t, i) => (
                <tr key={t.id} className="border-b transition-colors hover:bg-[var(--notion-bg-2)] animate-fade-in"
                  style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms` }}>
                  {view === 'entradas' ? (
                    <>
                      <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--notion-text)' }}>{t.contact?.name || t.descricao || '—'}</td>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                        {(() => { const d = refDate(t); return d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—' })()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>
                        {t.area ? <span className="inline-flex px-2 py-0.5 rounded" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>{t.area}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>
                        {t.canal ? <span className="inline-flex px-2 py-0.5 rounded" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>{t.canal}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium whitespace-nowrap" style={{ color: '#34D399' }}>{fmtBRL(Number(t.valor))}</td>
                    </>
                  ) : view === 'despesas' ? (
                    <>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{t.descricao}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: '#F87171' }}>{fmtBRL(Number(t.valor))}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{t.banco || '—'}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>
                        {t.data_vencimento ? new Date(t.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3"><CobrancaBadge status={t.cobranca_status} /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleCobranca(t)} className="transition-all hover:opacity-80">
                          <CobrancaBadge status={t.cobranca_status} />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--notion-text)' }}>
                        {t.contact?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                        {t.contact?.telefone ? (
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{t.contact.telefone}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{t.contratos || '—'}</td>
                      <td className="px-4 py-3 font-mono font-medium whitespace-nowrap" style={{ color: '#34D399' }}>
                        {fmtBRL(Number(t.valor))}
                      </td>
                      {view === 'cobranca' ? (
                        <>
                          <td className="px-4 py-3"><CheckCell value={t.parcelado} /></td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>{t.banco || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                            {t.data_vencimento ? new Date(t.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3"><CheckCell value={t.pendencias} /></td>
                          <td className="px-4 py-3"><CheckCell value={t.parcelado} /></td>
                          <td className="px-4 py-3"><CheckCell value={t.follow} /></td>
                        </>
                      )}
                    </>
                  )}
                </tr>
              ))}
              <tr>
                <td colSpan={8} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                  <button onClick={() => setShowForm(true)} className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-3.5 h-3.5" /> Nova página
                  </button>
                </td>
              </tr>
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--notion-bg-2)', borderTop: '1px solid var(--notion-border)' }}>
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--notion-text-3)' }}>
                    Soma
                  </td>
                  {view === 'entradas' ? (
                    <>
                      <td colSpan={3}></td>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: '#34D399' }}>{fmtBRL(total)}</td>
                    </>
                  ) : (
                    <>
                      <td colSpan={view === 'despesas' ? 1 : 3}></td>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--notion-text)' }}>{fmtBRL(total)}</td>
                      <td colSpan={4}></td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>
          {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-y-auto max-h-[90vh] animate-fade-in"
            style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--notion-text)' }}>Nova transação</h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'receita' | 'despesa' }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Cliente</label>
                  <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="">— Selecionar —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Cliente (nome livre)</label>
                  <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="Ex: João da Silva" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Data</label>
                  <input type="date" value={form.data_pagamento} onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Área</label>
                  <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="">— Selecionar —</option>
                    {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Canal</label>
                  <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="">— Selecionar —</option>
                    {CANAL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Valor (R$)</label>
                  <input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="0,00" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Contratos</label>
                  <input value={form.contratos} onChange={e => setForm(f => ({ ...f, contratos: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="Ex: 2 Contratos" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Banco</label>
                  <select value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    {BANCO_OPTIONS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Status Cobrança</label>
                  <select value={form.cobranca_status} onChange={e => setForm(f => ({ ...f, cobranca_status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    {COBRANCA_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Vencimento</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--notion-text-2)' }}>
                    <input type="checkbox" checked={form.parcelado} onChange={e => setForm(f => ({ ...f, parcelado: e.target.checked }))} />
                    Parcelado
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--notion-text-2)' }}>
                    <input type="checkbox" checked={form.follow} onChange={e => setForm(f => ({ ...f, follow: e.target.checked }))} />
                    Follow
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--notion-bg-3)',
  border: '1px solid var(--notion-border)',
  color: 'var(--notion-text)',
}
