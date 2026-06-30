'use client'

import { useState, useMemo } from 'react'
import { Megaphone, TrendingUp, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea, Tag, EmptyRow, fmtDate, fmtBRL } from '@/components/ui/primitives'

interface Campanha {
  id: string; nome: string; canal?: string; status: string
  orcamento: number; leads_gerados: number; data_inicio?: string; data_fim?: string
  responsavel?: { full_name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  'Planejada': '#94A3B8', 'Ativa': '#10B981', 'Pausada': '#F59E0B', 'Encerrada': '#6366F1',
}
const STATUS = ['Planejada', 'Ativa', 'Pausada', 'Encerrada']
const CANAIS = ['Instagram', 'Facebook', 'Google Ads', 'WhatsApp', 'Indicação', 'E-mail', 'Eventos', 'Outro']

export function MarketingClient({ headerAssets, campanhas, members, workspaceId }: {
  headerAssets: HeaderAssets;
  campanhas: Campanha[]; members: { id: string; full_name: string }[]; workspaceId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search) return campanhas
    const q = search.toLowerCase()
    return campanhas.filter(c => c.nome.toLowerCase().includes(q) || c.canal?.toLowerCase().includes(q))
  }, [campanhas, search])

  const totalLeads = campanhas.reduce((s, c) => s + (c.leads_gerados || 0), 0)
  const totalOrcamento = campanhas.reduce((s, c) => s + Number(c.orcamento || 0), 0)

  const [form, setForm] = useState({ nome: '', canal: 'Instagram', status: 'Planejada', orcamento: '', leads_gerados: '', data_inicio: '', data_fim: '', responsavel_id: '', observacoes: '' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('campanhas').insert({
      workspace_id: workspaceId, nome: form.nome, canal: form.canal, status: form.status,
      orcamento: Number(form.orcamento) || 0, leads_gerados: Number(form.leads_gerados) || 0,
      data_inicio: form.data_inicio || null, data_fim: form.data_fim || null,
      responsavel_id: form.responsavel_id || null, observacoes: form.observacoes || null,
    })
    setSaving(false); setShow(false)
    setForm({ nome: '', canal: 'Instagram', status: 'Planejada', orcamento: '', leads_gerados: '', data_inicio: '', data_fim: '', responsavel_id: '', observacoes: '' })
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Marketing" icon={Megaphone} color="#FB7185"
        gradient="linear-gradient(135deg, #4c0519 0%, #9f1239 60%, #4c0519 100%)"
        pageKey="marketing" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Campanhas</span>
            <p className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>{campanhas.length}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--notion-text-2)' }}><TrendingUp className="w-3 h-3" /> Leads gerados</span>
            <p className="text-xl font-semibold" style={{ color: '#FB7185' }}>{totalLeads}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
            <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Orçamento total</span>
            <p className="text-xl font-semibold font-mono" style={{ color: 'var(--notion-text)' }}>{fmtBRL(totalOrcamento)}</p>
          </div>
        </div>
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar campanha..." />
        <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Campanha', 'Canal', 'Status', 'Leads', 'Orçamento', 'Início', 'Fim', 'Responsável'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <EmptyRow cols={8} label="Nenhuma campanha cadastrada" /> :
                filtered.map((c, i) => (
                  <tr key={c.id} className="border-b hover:bg-[var(--notion-bg-2)] transition-colors animate-fade-in" style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms` }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{c.nome}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{c.canal || '—'}</td>
                    <td className="px-4 py-3"><Tag label={c.status} color={STATUS_COLORS[c.status] || '#94A3B8'} /></td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#FB7185' }}>{c.leads_gerados || 0}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--notion-text-2)' }}>{fmtBRL(Number(c.orcamento))}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(c.data_inicio)}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(c.data_fim)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{c.responsavel?.full_name || '—'}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={8} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                <button onClick={() => setShow(true)} className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova página
                </button>
              </td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} campanha{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {show && (
        <Modal title="Nova campanha" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome *" full><Input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></Field>
              <Field label="Canal"><Select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>{CANAIS.map(c => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Status"><Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{STATUS.map(s => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Orçamento (R$)"><Input type="number" step="0.01" value={form.orcamento} onChange={e => setForm(f => ({ ...f, orcamento: e.target.value }))} /></Field>
              <Field label="Leads gerados"><Input type="number" value={form.leads_gerados} onChange={e => setForm(f => ({ ...f, leads_gerados: e.target.value }))} /></Field>
              <Field label="Início"><Input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} /></Field>
              <Field label="Fim"><Input type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} /></Field>
              <Field label="Responsável" full><Select value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                <option value="">— Nenhum —</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </Select></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
