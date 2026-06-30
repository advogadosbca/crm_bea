'use client'

import { useState, useMemo } from 'react'
import { Users2, Shield, ShieldCheck, User as UserIcon, Trash2, MailCheck, Clock, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Toolbar, Modal, ModalActions, Field, Input, Select, Tag } from '@/components/ui/primitives'

interface Member {
  id: string; full_name: string; email: string; role: string
  avatar_url?: string; is_active: boolean; created_at: string; pending?: boolean
}

const ROLE_META: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: 'Super Admin', color: '#EC4899', icon: ShieldCheck },
  admin: { label: 'Admin', color: '#8B5CF6', icon: Shield },
  colaborador: { label: 'Colaborador', color: '#3B82F6', icon: UserIcon },
}

export function MembrosClient({ headerAssets, members, currentRole, currentUserId }: {
  headerAssets: HeaderAssets;
  members: Member[]; workspaceId: string; currentRole: string; currentUserId: string
}) {
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const router = useRouter()
  const canManage = ['super_admin', 'admin'].includes(currentRole)

  const filtered = useMemo(() => {
    if (!search) return members
    const q = search.toLowerCase()
    return members.filter(m => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
  }, [members, search])

  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'colaborador' })

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const res = await fetch('/api/membros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Erro ao criar membro'); return }
    setShow(false)
    setNotice(data.invited ? `Convite enviado para ${form.email}. O usuário definirá a senha pelo e-mail.` : `Membro ${form.full_name} criado.`)
    setForm({ full_name: '', email: '', password: '', role: 'colaborador' })
    setTimeout(() => setNotice(''), 6000)
    router.refresh()
  }

  async function changeRole(id: string, role: string) {
    await fetch('/api/membros', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role }) })
    router.refresh()
  }

  async function deleteMember(m: Member) {
    if (!confirm(`Excluir o membro "${m.full_name}"? Esta ação remove o acesso dele ao sistema.`)) return
    const res = await fetch('/api/membros', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }) })
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Erro ao excluir'); return }
    router.refresh()
  }

  async function resendInvite(m: Member) {
    const res = await fetch('/api/membros', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, resend: true }) })
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Erro ao reenviar convite'); return }
    setNotice(`Convite reenviado para ${m.email}.`)
    setTimeout(() => setNotice(''), 6000)
  }

  return (
    <div className="min-h-screen">
      <EditableHeader title="Membros" icon={Users2} color="#C4B5FD"
        gradient="linear-gradient(135deg, #2e1065 0%, #5b21b6 60%, #2e1065 100%)"
        pageKey="membros" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        {canManage && <Toolbar search={search} setSearch={setSearch} onNew={() => setShow(true)} placeholder="Buscar membro..." />}
        {notice && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
            <MailCheck className="w-4 h-4" /> {notice}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m, i) => {
            const meta = ROLE_META[m.role] || ROLE_META.colaborador
            const Icon = meta.icon
            return (
              <div key={m.id} className="rounded-xl p-5 border animate-fade-in transition-all hover:border-[var(--notion-accent)]"
                style={{ background: 'var(--notion-bg-2)', borderColor: m.pending ? 'rgba(245,158,11,0.35)' : 'var(--notion-border)', animationDelay: `${i * 25}ms`, opacity: m.is_active === false ? 0.5 : 1 }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0"
                    style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40` }}>
                    {m.avatar_url ? <img src={m.avatar_url} alt={m.full_name} className="w-full h-full rounded-full object-cover" /> : m.full_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--notion-text)' }}>
                      {m.full_name}{m.id === currentUserId && <span className="text-xs ml-1" style={{ color: 'var(--notion-text-3)' }}>(você)</span>}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--notion-text-3)' }}>{m.email}</p>
                  </div>
                  {m.pending && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium flex-shrink-0"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }} title="Convite enviado — aguardando o usuário criar a senha">
                      <Clock className="w-3 h-3" /> Pendente
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                    style={{ background: `${meta.color}20`, color: meta.color }}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </span>
                  {canManage && m.id !== currentUserId && m.role !== 'super_admin' && (
                    <div className="flex items-center gap-1.5">
                      {m.pending && (
                        <button onClick={() => resendInvite(m)} title="Reenviar convite"
                          className="p-1.5 rounded-md transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: '#F59E0B' }}>
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-md cursor-pointer"
                        style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text-2)' }}>
                        <option value="admin">Admin</option>
                        <option value="colaborador">Colaborador</option>
                      </select>
                      <button onClick={() => deleteMember(m)} title="Excluir membro"
                        className="p-1.5 rounded-md transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: '#F87171' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--notion-text-3)' }}>{filtered.length} membro{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {show && (
        <Modal title="Novo membro" onClose={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome completo *" full><Input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></Field>
              <Field label="E-mail *" full><Input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
              <Field label="Perfil"><Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="colaborador">Colaborador</option>
                <option value="admin">Admin</option>
              </Select></Field>
              <Field label="Senha (opcional)"><Input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Deixe vazio p/ enviar convite" /></Field>
            </div>
            <p className="text-xs px-1" style={{ color: 'var(--notion-text-3)' }}>
              Sem senha, enviaremos um <b>convite por e-mail</b> e o membro cria a própria senha. Com senha, o acesso é imediato.
            </p>
            {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>{error}</p>}
            <ModalActions onCancel={() => setShow(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}
