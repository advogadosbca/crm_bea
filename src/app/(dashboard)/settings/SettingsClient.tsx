'use client'

import { useState, useRef } from 'react'
import { SlidersHorizontal, Check, User, KeyRound, Building2, Camera, Copy, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { Field, Input } from '@/components/ui/primitives'

interface Workspace { id: string; name: string; slug: string; banner_url?: string; logo_url?: string }
interface Profile { id: string; full_name: string; email: string; avatar_url: string; role: string }
interface ApiKey { id: string; name: string; key: string; created_at: string; last_used_at: string | null }

type Tab = 'perfil' | 'workspace' | 'apikeys'

export function SettingsClient({ headerAssets, workspace, canEdit, profile, apiKeys, baseUrl }: {
  headerAssets: HeaderAssets; workspace: Workspace | null; canEdit: boolean
  profile: Profile; apiKeys: ApiKey[]; baseUrl: string
}) {
  const [tab, setTab] = useState<Tab>('perfil')
  const tabs: { id: Tab; label: string; icon: typeof User; show: boolean }[] = [
    { id: 'perfil', label: 'Perfil', icon: User, show: true },
    { id: 'workspace', label: 'Workspace', icon: Building2, show: canEdit },
    { id: 'apikeys', label: 'API Keys', icon: KeyRound, show: canEdit },
  ]

  return (
    <div className="min-h-screen">
      <EditableHeader title="Settings" icon={SlidersHorizontal} color="#CBD5E1"
        gradient="linear-gradient(135deg, #1e293b 0%, #334155 60%, #1e293b 100%)"
        pageKey="settings" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6 max-w-3xl">
        {/* Sub-abas */}
        <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          {tabs.filter(t => t.show).map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm transition-colors -mb-px border-b-2"
                style={{ color: active ? 'var(--notion-text)' : 'var(--notion-text-3)', borderColor: active ? 'var(--notion-accent)' : 'transparent' }}>
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'perfil' && <PerfilTab profile={profile} />}
        {tab === 'workspace' && canEdit && <WorkspaceTab workspace={workspace} />}
        {tab === 'apikeys' && canEdit && <ApiKeysTab apiKeys={apiKeys} baseUrl={baseUrl} />}
      </div>
    </div>
  )
}

/* ---------------- Perfil ---------------- */
function PerfilTab({ profile }: { profile: Profile }) {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile.full_name)
  const [avatar, setAvatar] = useState(profile.avatar_url)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('assets').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('assets').getPublicUrl(path)
      setAvatar(data.publicUrl)
    }
    setUploading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaved(false)
    await supabase.from('profiles').update({ full_name: name, avatar_url: avatar || null }).eq('id', profile.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>Meu perfil</h2>

      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-accent)' }}>
          {avatar ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold">{(name || 'U')[0]}</span>}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} {avatar ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {avatar && <button type="button" onClick={() => setAvatar('')} className="block mt-1.5 text-xs" style={{ color: '#F87171' }}>Remover foto</button>}
        </div>
      </div>

      <Field label="Nome completo"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="E-mail"><Input value={profile.email} disabled /></Field>
      <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Perfil: <b style={{ color: 'var(--notion-text-2)' }}>{profile.role}</b> • o e-mail não pode ser alterado aqui.</p>

      <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: saved ? '#10B981' : 'var(--notion-accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
        {saved ? <><Check className="w-4 h-4" /> Salvo</> : saving ? 'Salvando...' : 'Salvar perfil'}
      </button>
    </form>
  )
}

/* ---------------- Workspace ---------------- */
function WorkspaceTab({ workspace }: { workspace: Workspace | null }) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState({ name: workspace?.name || '', banner_url: workspace?.banner_url || '', logo_url: workspace?.logo_url || '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaved(false)
    await supabase.from('workspaces').update({ name: form.name, banner_url: form.banner_url || null, logo_url: form.logo_url || null }).eq('id', workspace!.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>Configurações do Workspace</h2>
      <Field label="Nome do workspace"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
      <Field label="URL do Banner"><Input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://..." /></Field>
      <Field label="URL da Logo"><Input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." /></Field>
      <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: saved ? '#10B981' : 'var(--notion-accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
        {saved ? <><Check className="w-4 h-4" /> Salvo</> : saving ? 'Salvando...' : 'Salvar alterações'}
      </button>
      <div className="mt-6 pt-4 border-t text-xs space-y-1" style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text-2)' }}>
        <p>Slug: <span className="font-mono">{workspace?.slug}</span></p>
        <p>ID: <span className="font-mono">{workspace?.id}</span></p>
      </div>
    </form>
  )
}

/* ---------------- API Keys ---------------- */
function ApiKeysTab({ apiKeys, baseUrl }: { apiKeys: ApiKey[]; baseUrl: string }) {
  const router = useRouter()
  const [keys, setKeys] = useState(apiKeys)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500) }

  async function create() {
    setCreating(true)
    const res = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })
    const data = await res.json(); setCreating(false)
    if (res.ok) { setKeys(k => [data.apiKey, ...k]); setJustCreated(data.apiKey.id); setNewName('') }
    else alert(data.error || 'Erro ao gerar key')
  }
  async function revoke(id: string) {
    if (!confirm('Revogar esta API key? Integrações que a usam vão parar de funcionar.')) return
    await fetch('/api/keys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setKeys(k => k.filter(x => x.id !== id)); router.refresh()
  }
  const mask = (k: string) => k.slice(0, 14) + '••••••••••••'

  const Code = ({ children }: { children: string }) => (
    <div className="relative group">
      <pre className="text-[11px] leading-relaxed p-3 rounded-lg overflow-x-auto font-mono whitespace-pre" style={{ background: 'var(--notion-bg)', border: '1px solid var(--notion-border)', color: 'var(--notion-text-2)' }}>{children}</pre>
      <button onClick={() => copy(children, children.slice(0, 8))} className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-3)' }}><Copy className="w-3 h-3" /></button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>API Keys</h2>
        <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Use estas chaves para integrar o CRM com o n8n e outros sistemas.</p>
      </div>

      {/* criar */}
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da key (ex.: n8n produção)"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
        <button onClick={create} disabled={creating} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-accent)', color: '#fff' }}>
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Gerar key
        </button>
      </div>

      {/* lista */}
      <div className="space-y-2">
        {keys.length === 0 && <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Nenhuma key criada ainda.</p>}
        {keys.map(k => (
          <div key={k.id} className="rounded-lg p-3 border" style={{ background: 'var(--notion-bg-2)', borderColor: justCreated === k.id ? 'rgba(16,185,129,0.4)' : 'var(--notion-border)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{k.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
                  Criada em {new Date(k.created_at).toLocaleDateString('pt-BR')}{k.last_used_at ? ` • último uso ${new Date(k.last_used_at).toLocaleDateString('pt-BR')}` : ' • nunca usada'}
                </p>
              </div>
              <button onClick={() => revoke(k.id)} title="Revogar" className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: '#F87171' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-[11px] font-mono px-2 py-1.5 rounded truncate" style={{ background: 'var(--notion-bg)', color: 'var(--notion-text-2)' }}>
                {justCreated === k.id ? k.key : mask(k.key)}
              </code>
              <button onClick={() => copy(k.key, k.id)} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                {copied === k.id ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
              </button>
            </div>
            {justCreated === k.id && <p className="text-[11px] mt-1.5" style={{ color: '#34D399' }}>Key criada! Copie e guarde — por segurança, depois ela aparece mascarada.</p>}
          </div>
        ))}
      </div>

      {/* documentação */}
      <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--notion-border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>📘 Documentação rápida (integração n8n)</h3>
        <p className="text-xs" style={{ color: 'var(--notion-text-2)' }}>
          Autenticação por header em todas as chamadas:
        </p>
        <Code>{`Authorization: Bearer SUA_API_KEY`}</Code>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>1. Listar fontes de dados (e colunas)</p>
          <Code>{`GET ${baseUrl}/api/v1/sources
Authorization: Bearer SUA_API_KEY`}</Code>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>2. Listar registros de uma fonte</p>
          <Code>{`GET ${baseUrl}/api/v1/sources/{TABLE_ID}/rows
Authorization: Bearer SUA_API_KEY`}</Code>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>3. Criar um registro (ex.: novo Lead)</p>
          <Code>{`POST ${baseUrl}/api/v1/sources/{TABLE_ID}/rows
Authorization: Bearer SUA_API_KEY
Content-Type: application/json

{
  "data": {
    "Nome": "João da Silva",
    "Telefone": "37 99999-9999",
    "Origem": "Indicação"
  }
}`}</Code>
          <p className="text-[11px] mt-1" style={{ color: 'var(--notion-text-3)' }}>
            As chaves de <code>data</code> podem ser o <b>nome</b> da coluna (como acima) ou o ID dela. Pegue o <code>TABLE_ID</code> e os nomes na chamada nº 1.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>No n8n</p>
          <p className="text-[11px]" style={{ color: 'var(--notion-text-2)' }}>
            Use o nó <b>HTTP Request</b> → método e URL acima → em <b>Authentication</b> escolha <i>Header Auth</i> com nome <code>Authorization</code> e valor <code>Bearer SUA_API_KEY</code> (ou Generic → Header).
          </p>
        </div>
      </div>
    </div>
  )
}
