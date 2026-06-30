'use client'

import { useState, useMemo } from 'react'
import { FileText, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea, Tag, EmptyRow, fmtDate } from '@/components/ui/primitives'

interface Alvara {
  id: string; numero?: string; descricao: string; status: string
  data_emissao?: string; data_vencimento?: string; orgao?: string
  contact?: { name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  'Pendente': '#F59E0B', 'Emitido': '#10B981', 'Vencido': '#EF4444', 'Em análise': '#3B82F6', 'Cancelado': '#94A3B8',
}
const STATUS = ['Pendente', 'Em análise', 'Emitido', 'Vencido', 'Cancelado']

export function AlvarasClient({ headerAssets, alvaras, contacts, workspaceId }: {
  headerAssets: HeaderAssets;
  alvaras: Alvara[]; contacts: { id: string; name: string }[]; workspaceId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search) return alvaras
    const q = search.toLowerCase()
    return alvaras.filter(a => a.descricao.toLowerCase().includes(q) || a.numero?.toLowerCase().includes(q) || a.orgao?.toLowerCase().includes(q))
  }, [alvaras, search])

  const [form, setForm] = useState({ numero: '', descricao: '', status: 'Pendente', data_emissao: '', data_vencimento: '', orgao: '', contact_id: '' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('alvaras').insert({
      workspace_id: workspaceId, numero: form.numero || null, descricao: form.descricao,
      status: form.status, data_emissao: form.data_emissao || null, data_vencimento: form.data_vencimento || null,
      orgao: form.orgao || null, contact_id: form.contact_id || null,
    })
    setSaving(false); setShow(false)
    setForm({ numero: '', descricao: '', status: 'Pendente', data_emissao: '', data_vencimento: '', orgao: '', contact_id: '' })
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Alvarás" icon={FileText} color="#FBBF24"
        gradient="linear-gradient(135deg, #451a03 0%, #78350f 60%, #451a03 100%)"
        pageKey="alvaras" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar alvará..." />
        <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Número', 'Descrição', 'Cliente', 'Órgão', 'Emissão', 'Vencimento', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <EmptyRow cols={7} label="Nenhum alvará cadastrado" /> :
                filtered.map((a, i) => (
                  <tr key={a.id} className="border-b hover:bg-[var(--notion-bg-2)] transition-colors animate-fade-in" style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms` }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{a.numero || '—'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{a.descricao}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{a.contact?.name || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{a.orgao || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(a.data_emissao)}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(a.data_vencimento)}</td>
                    <td className="px-4 py-3"><Tag label={a.status} color={STATUS_COLORS[a.status] || '#94A3B8'} /></td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={7} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                <button onClick={() => setShow(true)} className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova página
                </button>
              </td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} alvará{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {show && (
        <Modal title="Novo alvará" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Descrição *" full><Input required value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></Field>
              <Field label="Número"><Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} /></Field>
              <Field label="Órgão"><Input value={form.orgao} onChange={e => setForm(f => ({ ...f, orgao: e.target.value }))} /></Field>
              <Field label="Data Emissão"><Input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} /></Field>
              <Field label="Data Vencimento"><Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} /></Field>
              <Field label="Status"><Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{STATUS.map(s => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Cliente"><Select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
                <option value="">— Nenhum —</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
