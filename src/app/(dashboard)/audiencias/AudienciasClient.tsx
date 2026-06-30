'use client'

import { useState, useMemo } from 'react'
import { Gavel, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea, Tag, EmptyRow, fmtDate } from '@/components/ui/primitives'

interface Audiencia {
  id: string; titulo: string; data_hora: string; tipo?: string; status: string
  local?: string; observacoes?: string; processo_id?: string
  processo?: { numero: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  'Agendada': '#06B6D4', 'Realizada': '#10B981', 'Cancelada': '#EF4444', 'Adiada': '#F59E0B',
}
const STATUS = ['Agendada', 'Realizada', 'Cancelada', 'Adiada']
const TIPOS = ['Instrução', 'Conciliação', 'Una', 'Julgamento', 'Justificação', 'Outra']

export function AudienciasClient({ headerAssets, audiencias, processos, members, workspaceId }: {
  headerAssets: HeaderAssets;
  audiencias: Audiencia[]; processos: { id: string; numero: string }[]
  members: { id: string; full_name: string }[]; workspaceId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search) return audiencias
    const q = search.toLowerCase()
    return audiencias.filter(a => a.titulo.toLowerCase().includes(q) || a.local?.toLowerCase().includes(q) || a.processo?.numero?.includes(q))
  }, [audiencias, search])

  const [form, setForm] = useState({ titulo: '', data_hora: '', tipo: 'Instrução', status: 'Agendada', local: '', processo_id: '', responsavel_id: '', observacoes: '' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('audiencias').insert({
      workspace_id: workspaceId, titulo: form.titulo, data_hora: form.data_hora || new Date().toISOString(),
      tipo: form.tipo, status: form.status, local: form.local || null,
      processo_id: form.processo_id || null, responsavel_id: form.responsavel_id || null, observacoes: form.observacoes || null,
    })
    setSaving(false); setShow(false)
    setForm({ titulo: '', data_hora: '', tipo: 'Instrução', status: 'Agendada', local: '', processo_id: '', responsavel_id: '', observacoes: '' })
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Audiências" icon={Gavel} color="#22D3EE"
        gradient="linear-gradient(135deg, #083344 0%, #155e75 60%, #083344 100%)"
        pageKey="audiencias" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar audiência..." />
        <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Título', 'Data/Hora', 'Tipo', 'Processo', 'Local', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <EmptyRow cols={6} label="Nenhuma audiência agendada" /> :
                filtered.map((a, i) => (
                  <tr key={a.id} className="border-b hover:bg-[var(--notion-bg-2)] transition-colors animate-fade-in" style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms` }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{a.titulo}</td>
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                      {new Date(a.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{a.tipo || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{a.processo?.numero || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{a.local || '—'}</td>
                    <td className="px-4 py-3"><Tag label={a.status} color={STATUS_COLORS[a.status] || '#94A3B8'} /></td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                <button onClick={() => setShow(true)} className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova página
                </button>
              </td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} audiência{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {show && (
        <Modal title="Nova audiência" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Título *" full><Input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></Field>
              <Field label="Data e Hora *"><Input type="datetime-local" required value={form.data_hora} onChange={e => setForm(f => ({ ...f, data_hora: e.target.value }))} /></Field>
              <Field label="Tipo"><Select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Status"><Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{STATUS.map(s => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Local"><Input value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} placeholder="Fórum / Vara" /></Field>
              <Field label="Processo"><Select value={form.processo_id} onChange={e => setForm(f => ({ ...f, processo_id: e.target.value }))}>
                <option value="">— Nenhum —</option>{processos.map(p => <option key={p.id} value={p.id}>{p.numero}</option>)}
              </Select></Field>
              <Field label="Responsável"><Select value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                <option value="">— Nenhum —</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </Select></Field>
              <Field label="Observações" full><Textarea rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
