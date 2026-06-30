'use client'

import { useState } from 'react'
import { Lightbulb, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea } from '@/components/ui/primitives'

interface Ideia {
  id: string; titulo: string; descricao?: string; categoria?: string
  status: string; votos: number; created_at: string
  autor?: { full_name: string } | null
}

const COLUMNS = [
  { key: 'Nova', label: 'Novas', color: '#FCD34D' },
  { key: 'Em análise', label: 'Em análise', color: '#3B82F6' },
  { key: 'Aprovada', label: 'Aprovadas', color: '#10B981' },
  { key: 'Arquivada', label: 'Arquivadas', color: '#94A3B8' },
]

export function IdeiasClient({ headerAssets, ideias, workspaceId, userId }: {
  headerAssets: HeaderAssets;
  ideias: Ideia[]; workspaceId: string; userId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const matches = (i: Ideia) => !search || i.titulo.toLowerCase().includes(search.toLowerCase())

  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: '', status: 'Nova' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('ideias').insert({
      workspace_id: workspaceId, titulo: form.titulo, descricao: form.descricao || null,
      categoria: form.categoria || null, status: form.status, autor_id: userId,
    })
    setSaving(false); setShow(false)
    setForm({ titulo: '', descricao: '', categoria: '', status: 'Nova' })
    router.refresh()
  }

  async function vote(i: Ideia) {
    await supabase.from('ideias').update({ votos: (i.votos || 0) + 1 }).eq('id', i.id)
    router.refresh()
  }

  async function move(i: Ideia, status: string) {
    await supabase.from('ideias').update({ status }).eq('id', i.id)
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Ideias" icon={Lightbulb} color="#FDE047"
        gradient="linear-gradient(135deg, #422006 0%, #713f12 60%, #422006 100%)"
        pageKey="ideias" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar ideia..." />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const items = ideias.filter(i => i.status === col.key && matches(i))
            return (
              <div key={col.key} className="rounded-xl p-3" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--notion-text-2)' }}>{col.label}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--notion-text-3)' }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((i, idx) => (
                    <div key={i.id} className="rounded-lg p-3 border animate-fade-in"
                      style={{ background: 'var(--notion-bg-3)', borderColor: 'var(--notion-border)', animationDelay: `${idx * 20}ms` }}>
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--notion-text)' }}>{i.titulo}</p>
                      {i.descricao && <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--notion-text-2)' }}>{i.descricao}</p>}
                      {i.categoria && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{i.categoria}</span>}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                        <button onClick={() => vote(i)} className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--notion-accent)]" style={{ color: 'var(--notion-text-2)' }}>
                          <ChevronUp className="w-3.5 h-3.5" /> {i.votos || 0}
                        </button>
                        <select value={i.status} onChange={e => move(i, e.target.value)}
                          className="text-xs px-1.5 py-0.5 rounded cursor-pointer" style={{ background: 'var(--notion-bg-4)', border: '1px solid var(--notion-border)', color: 'var(--notion-text-3)' }}>
                          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--notion-text-3)' }}>—</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {show && (
        <Modal title="Nova ideia" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Título *" full><Input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></Field>
              <Field label="Categoria"><Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Processo, Marketing..." /></Field>
              <Field label="Status"><Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{COLUMNS.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}</Select></Field>
              <Field label="Descrição" full><Textarea rows={4} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
