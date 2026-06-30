'use client'

import { useState, useMemo } from 'react'
import {
  Processo, GRAU_JURISDICAO_OPTIONS, PROCESSO_STATUS_OPTIONS, PRIORIDADE_OPTIONS,
  PROCESSO_STATUS_COLORS, GRAU_COLORS, PRIORIDADE_COLORS,
} from '@/types'
import { Plus, Search, ChevronLeft, X, Scale, AlarmClock } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'

interface Member { id: string; full_name: string; avatar_url?: string }

interface Props {
  processos: Processo[]
  members: Member[]
  contacts: { id: string; name: string }[]
  workspaceId: string
  headerAssets: HeaderAssets
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

function Avatars({ membros }: { membros: Processo['membros'] }) {
  if (!membros || membros.length === 0) return <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>—</span>
  return (
    <div className="flex flex-col gap-1">
      {membros.slice(0, 3).map((m, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
            style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>
            {m.profiles?.full_name?.[0] || '?'}
          </div>
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
            {m.profiles?.full_name}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ProcessosClient({ processos, members, contacts, workspaceId, headerAssets }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const filtered = useMemo(() => {
    let list = processos
    if (statusFilter !== 'todos') list = list.filter(p => p.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.numero?.toLowerCase().includes(q) ||
        p.ato_processual?.toLowerCase().includes(q) || p.grau_jurisdicao?.toLowerCase().includes(q))
    }
    return list
  }, [processos, search, statusFilter])

  const [form, setForm] = useState({
    numero: '', diario_judicial: '', grau_jurisdicao: '1ª Instância',
    prazo_limite: '', prioridade: '', ato_processual: '',
    status: 'Pendente', contact_id: '', membros: [] as string[],
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: created } = await supabase.from('processos').insert({
      workspace_id: workspaceId,
      numero: form.numero,
      diario_judicial: form.diario_judicial || null,
      grau_jurisdicao: form.grau_jurisdicao,
      prazo_limite: form.prazo_limite || null,
      prioridade: form.prioridade || null,
      ato_processual: form.ato_processual || null,
      status: form.status,
      contact_id: form.contact_id || null,
    }).select('id').single()

    if (created && form.membros.length > 0) {
      await supabase.from('processo_membros').insert(
        form.membros.map(pid => ({ processo_id: created.id, profile_id: pid }))
      )
    }
    setSaving(false)
    setShowForm(false)
    setForm({ numero: '', diario_judicial: '', grau_jurisdicao: '1ª Instância', prazo_limite: '', prioridade: '', ato_processual: '', status: 'Pendente', contact_id: '', membros: [] })
    router.refresh()
  }

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    processos.forEach(p => { c[p.status] = (c[p.status] || 0) + 1 })
    return c
  }, [processos])

  return (
    <div className="min-h-screen">
      <EditableHeader title="Processos Judiciais" icon={Scale} color="#A78BFA"
        gradient="linear-gradient(135deg, #2e1065 0%, #4c1d95 60%, #2e1065 100%)"
        pageKey="processos" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6">

        {/* Section title */}
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--notion-text)' }}>
          <Scale className="w-4 h-4" style={{ color: '#A78BFA' }} />
          Acompanhamento: processos judiciais
        </h2>

        {/* Filters + actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 p-1 rounded-lg flex-wrap" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            <button onClick={() => setStatusFilter('todos')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: statusFilter === 'todos' ? 'var(--notion-bg-3)' : 'transparent', color: statusFilter === 'todos' ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
              Todos ({processos.length})
            </button>
            {PROCESSO_STATUS_OPTIONS.filter(s => statusCounts[s]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{ background: statusFilter === s ? 'var(--notion-bg-3)' : 'transparent', color: statusFilter === s ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
                {s} ({statusCounts[s]})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
              <input placeholder="Buscar processo..." value={search} onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-sm outline-none w-44" style={{ color: 'var(--notion-text)' }} />
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'var(--notion-accent)', color: '#fff' }}>
              <Plus className="w-3.5 h-3.5" /> Novo
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
                {['Número do Processo', 'Diário Judicial', 'Grau de Jurisdição', 'Prazo Limite', 'Prioridade', 'Ato Processual', 'Status', 'Membros'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: 'var(--notion-text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-sm" style={{ color: 'var(--notion-text-3)' }}>
                  Nenhum processo encontrado
                </td></tr>
              ) : filtered.map((p, i) => {
                const overdue = p.prazo_limite && p.prazo_limite < today
                return (
                  <tr key={p.id} className="border-b transition-colors hover:bg-[var(--notion-bg-2)] animate-fade-in align-top"
                    style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms` }}>
                    <td className="px-4 py-3 font-mono text-xs font-medium whitespace-nowrap" style={{ color: 'var(--notion-text)' }}>
                      {p.numero}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                      {p.diario_judicial ? new Date(p.diario_judicial + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.grau_jurisdicao ? <Tag label={p.grau_jurisdicao} color={GRAU_COLORS[p.grau_jurisdicao] || '#94A3B8'} /> : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.prazo_limite ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono"
                          style={{ color: overdue ? '#F87171' : 'var(--notion-text-2)' }}>
                          <AlarmClock className="w-3 h-3" />
                          {new Date(p.prazo_limite + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.prioridade ? <Tag label={p.prioridade} color={PRIORIDADE_COLORS[p.prioridade] || '#94A3B8'} /> :
                        <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.ato_processual ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs max-w-[180px] truncate"
                          style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }} title={p.ato_processual}>
                          {p.ato_processual}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Tag label={p.status} color={PROCESSO_STATUS_COLORS[p.status] || '#94A3B8'} />
                    </td>
                    <td className="px-4 py-3"><Avatars membros={p.membros} /></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={8} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                <button onClick={() => setShowForm(true)} className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova página
                </button>
              </td></tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>
          {filtered.length} processo{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-y-auto max-h-[90vh] animate-fade-in"
            style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--notion-text)' }}>Novo processo</h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Número do Processo *</label>
                  <input required value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={inputStyle} placeholder="0000000-00.0000.0.00.0000" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Diário Judicial</label>
                  <input type="date" value={form.diario_judicial} onChange={e => setForm(f => ({ ...f, diario_judicial: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Grau de Jurisdição</label>
                  <select value={form.grau_jurisdicao} onChange={e => setForm(f => ({ ...f, grau_jurisdicao: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    {GRAU_JURISDICAO_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Prazo Limite</label>
                  <input type="date" value={form.prazo_limite} onChange={e => setForm(f => ({ ...f, prazo_limite: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Prioridade</label>
                  <select value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="">— Nenhuma —</option>
                    {PRIORIDADE_OPTIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Ato Processual</label>
                  <input value={form.ato_processual} onChange={e => setForm(f => ({ ...f, ato_processual: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="Ex: Iniciar Cumprimento de Sentença" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    {PROCESSO_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Cliente</label>
                  <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
                    <option value="">— Nenhum —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>Membros responsáveis</label>
                  <div className="flex flex-wrap gap-2">
                    {members.map(m => {
                      const active = form.membros.includes(m.id)
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            membros: active ? f.membros.filter(x => x !== m.id) : [...f.membros, m.id],
                          }))}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: active ? 'var(--notion-accent)' : 'var(--notion-bg-3)',
                            color: active ? '#fff' : 'var(--notion-text-2)',
                            border: '1px solid var(--notion-border)',
                          }}>
                          {m.full_name}
                        </button>
                      )
                    })}
                  </div>
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
