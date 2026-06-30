'use client'

import { useState, useMemo } from 'react'
import { FolderOpen, FileText, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea, Tag, EmptyRow, fmtDate } from '@/components/ui/primitives'

interface Doc {
  id: string; titulo: string; categoria?: string; tipo?: string; url?: string
  descricao?: string; created_at: string
  responsavel?: { full_name: string } | null
}

const CATEGORIAS = ['Contrato', 'Procuração', 'Modelo', 'Interno', 'Financeiro', 'RH', 'Outro']
const CAT_COLORS: Record<string, string> = {
  'Contrato': '#8B5CF6', 'Procuração': '#3B82F6', 'Modelo': '#10B981',
  'Interno': '#F59E0B', 'Financeiro': '#06B6D4', 'RH': '#EC4899', 'Outro': '#94A3B8',
}

export function AdministrativoClient({ headerAssets, documentos, workspaceId, userId }: {
  headerAssets: HeaderAssets;
  documentos: Doc[]; workspaceId: string; userId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search) return documentos
    const q = search.toLowerCase()
    return documentos.filter(d => d.titulo.toLowerCase().includes(q) || d.categoria?.toLowerCase().includes(q))
  }, [documentos, search])

  const [form, setForm] = useState({ titulo: '', categoria: 'Contrato', tipo: '', url: '', descricao: '' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('documentos').insert({
      workspace_id: workspaceId, titulo: form.titulo, categoria: form.categoria,
      tipo: form.tipo || null, url: form.url || null, descricao: form.descricao || null, responsavel_id: userId,
    })
    setSaving(false); setShow(false)
    setForm({ titulo: '', categoria: 'Contrato', tipo: '', url: '', descricao: '' })
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Administrativo" icon={FolderOpen} color="#FB923C"
        gradient="linear-gradient(135deg, #431407 0%, #7c2d12 60%, #431407 100%)"
        pageKey="administrativo" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar documento..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-12 text-sm" style={{ color: 'var(--notion-text-3)' }}>Nenhum documento cadastrado</div>
          ) : filtered.map((d, i) => (
            <div key={d.id} className="rounded-xl p-4 border animate-fade-in transition-all hover:border-[var(--notion-accent)]"
              style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)', animationDelay: `${i * 25}ms` }}>
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${CAT_COLORS[d.categoria || 'Outro']}18` }}>
                  <FileText className="w-4 h-4" style={{ color: CAT_COLORS[d.categoria || 'Outro'] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{d.titulo}</p>
                  {d.categoria && <Tag label={d.categoria} color={CAT_COLORS[d.categoria] || '#94A3B8'} />}
                </div>
              </div>
              {d.descricao && <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--notion-text-2)' }}>{d.descricao}</p>}
              <div className="flex items-center justify-between text-xs pt-2 border-t" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-3)' }}>
                <span>{fmtDate(d.created_at.split('T')[0])}</span>
                {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[var(--notion-accent)] transition-colors"><ExternalLink className="w-3 h-3" /> Abrir</a>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {show && (
        <Modal title="Novo documento" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Título *" full><Input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></Field>
              <Field label="Categoria"><Select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Tipo"><Input value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} placeholder="PDF, DOCX..." /></Field>
              <Field label="Link / URL" full><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." /></Field>
              <Field label="Descrição" full><Textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
