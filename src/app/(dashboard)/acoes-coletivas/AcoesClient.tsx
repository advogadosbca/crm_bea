'use client'

import { useState, useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Textarea, Tag, EmptyRow, fmtDate } from '@/components/ui/primitives'

interface Acao {
  id: string; titulo: string; descricao?: string; status: string; created_at: string
  processo?: { numero: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  'Ativa': '#10B981', 'Em formação': '#F59E0B', 'Encerrada': '#94A3B8', 'Suspensa': '#8B5CF6',
}
const STATUS = ['Em formação', 'Ativa', 'Suspensa', 'Encerrada']

export function AcoesClient({ headerAssets, acoes, processos, workspaceId }: {
  headerAssets: HeaderAssets;
  acoes: Acao[]; processos: { id: string; numero: string }[]; workspaceId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search) return acoes
    const q = search.toLowerCase()
    return acoes.filter(a => a.titulo.toLowerCase().includes(q) || a.descricao?.toLowerCase().includes(q))
  }, [acoes, search])

  const [form, setForm] = useState({ titulo: '', descricao: '', status: 'Em formação', processo_id: '' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await supabase.from('acoes_coletivas').insert({
      workspace_id: workspaceId, titulo: form.titulo, descricao: form.descricao || null,
      status: form.status, processo_id: form.processo_id || null,
    })
    setSaving(false); setShow(false)
    setForm({ titulo: '', descricao: '', status: 'Em formação', processo_id: '' })
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Ações Coletivas" icon={Building2} color="#F472B6"
        gradient="linear-gradient(135deg, #500724 0%, #831843 60%, #500724 100%)"
        pageKey="acoes-coletivas" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar ação..." />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-12 text-sm" style={{ color: 'var(--notion-text-3)' }}>Nenhuma ação coletiva cadastrada</div>
          ) : filtered.map((a, i) => (
            <div key={a.id} className="rounded-xl p-5 border animate-fade-in transition-all hover:border-[var(--notion-accent)]"
              style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)', animationDelay: `${i * 25}ms` }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--notion-text)' }}>{a.titulo}</h3>
                <Tag label={a.status} color={STATUS_COLORS[a.status] || '#94A3B8'} />
              </div>
              {a.descricao && <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--notion-text-2)' }}>{a.descricao}</p>}
              <div className="flex items-center justify-between text-xs pt-2 border-t" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-3)' }}>
                <span className="font-mono">{a.processo?.numero || 'Sem processo'}</span>
                <span>{fmtDate(a.created_at.split('T')[0])}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} ação(ões)</p>
      </div>

      {show && (
        <Modal title="Nova ação coletiva" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Título *" full><Input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></Field>
              <Field label="Status"><Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{STATUS.map(s => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Processo"><Select value={form.processo_id} onChange={e => setForm(f => ({ ...f, processo_id: e.target.value }))}>
                <option value="">— Nenhum —</option>{processos.map(p => <option key={p.id} value={p.id}>{p.numero}</option>)}
              </Select></Field>
              <Field label="Descrição" full><Textarea rows={4} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></Field>
            </div>
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
