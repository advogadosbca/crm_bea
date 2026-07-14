'use client'

import { useState, useMemo, useRef } from 'react'
import {
  Contact, STATUS_GERAL_COLORS, STATUS_GERAL_OPTIONS, ORIGEM_OPTIONS, ALERTA_OPTIONS,
  STATUS_PROCESSUAL_OPTIONS, STATUS_PROCESSUAL_COLORS, FUNIL_OPTIONS,
  RENDA_OPTIONS, ANALISE_OPTIONS,
} from '@/types'
import { Plus, Search, AlertTriangle, Clock, X, Settings, Table2, MessageSquare, Users2, Gavel, Database } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { KanbanBoard, KanbanColumn } from '@/components/ui/KanbanBoard'
import { ProjectBoard, BList, BCard, BLabel } from '@/components/board/ProjectBoard'
import { DynamicTable } from '@/components/dynamic/DynamicTable'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { DBColumn, DBRow, DataSource } from '@/types/dynamic'

type DynTable = { tableId: string; columns: DBColumn[]; rows: DBRow[] } | null

type ContactRow = Contact & { responsavel?: { full_name: string; avatar_url?: string } | null }

interface Props {
  contacts: ContactRow[]
  members: { id: string; full_name: string }[]
  workspaceId: string
  userId: string
  userRole: string
  headerAssets: HeaderAssets
  kanbanColumns: { funil: KanbanColumn[]; negociacao: KanbanColumn[]; acoes: KanbanColumn[] }
  board: { lists: BList[]; cards: BCard[]; labels: BLabel[] }
  geralTables: { alerta: DynTable; prazos: DynTable; sources: DataSource[] }
  shortcuts: { contatosId: string; leadsId: string }
  leadsBoard?: { tableId: string; columns: DBColumn[]; rows: DBRow[]; views: { id: string; name: string; type: string; position: number }[] } | null
}

type Mode = 'tabela' | 'funil' | 'negociacao' | 'acoes'

const fmtBRL = (v?: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>{label}</span>
  )
}

export function GeralClient({ contacts, members, workspaceId, userId, headerAssets, kanbanColumns, board, geralTables, shortcuts, leadsBoard }: Props) {
  const canEditBoard = headerAssets.canEdit
  const leadColId = (name: string) => leadsBoard?.columns.find(c => c.name === name)?.id

  async function novoNaFonte(tableId: string) {
    if (!tableId) return
    const { data } = await supabase.from('db_rows').insert({ table_id: tableId, data: {}, position: 0, created_by: userId, updated_by: userId }).select('id').single()
    router.push(`/tabelas?t=${tableId}`)
    void data
  }
  const [mode, setMode] = useState<Mode>('tabela')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const searched = useMemo(() => {
    if (!search) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c => c.name.toLowerCase().includes(q) ||
      c.status_geral?.toLowerCase().includes(q) || c.origem?.toLowerCase().includes(q))
  }, [contacts, search])

  const alerts = searched.filter(c => c.alerta === 'Atenção especial')
  const overdue = searched.filter(c => c.prazo_execucao && c.prazo_execucao < today)

  const emptyForm = () => ({
    name: '', origem: 'Indicação', status_geral: 'Em negociação', alerta: 'Normal',
    data_contato: '', status_processual: '', funil_status: '', renda: 'Padrão',
    analise_juridica: '', prazo_execucao: '', observacao: '', responsavel_id: '',
    total_transacoes: '', is_lead: true,
  })

  const [form, setForm] = useState(emptyForm())

  function openNewInColumn(colLabel: string, field: 'funil_status' | 'status_geral' | 'status_processual') {
    setEditId(null)
    setForm({ ...emptyForm(), [field]: colLabel })
    setShowForm(true)
  }

  function openNewPreset(preset: Partial<ReturnType<typeof emptyForm>> = {}) {
    setEditId(null)
    setForm({ ...emptyForm(), ...preset })
    setShowForm(true)
  }

  function openEditCard(c: ContactRow) {
    setEditId(c.id)
    setForm({
      name: c.name || '', origem: c.origem || 'Indicação', status_geral: c.status_geral || 'Em negociação',
      alerta: c.alerta || 'Normal', data_contato: c.data_contato || '', status_processual: c.status_processual || '',
      funil_status: c.funil_status || '', renda: c.renda || 'Padrão', analise_juridica: c.analise_juridica || '',
      prazo_execucao: c.prazo_execucao || '', observacao: c.observacao || '', responsavel_id: c.responsavel_id || '',
      total_transacoes: c.total_transacoes != null ? String(c.total_transacoes) : '', is_lead: c.is_lead ?? true,
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditId(null); setForm(emptyForm()) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const payload = {
      name: form.name, origem: form.origem, status_geral: form.status_geral, alerta: form.alerta,
      data_contato: form.data_contato || null, status_processual: form.status_processual || null,
      funil_status: form.funil_status || null, renda: form.renda || null,
      analise_juridica: form.analise_juridica || null, prazo_execucao: form.prazo_execucao || null,
      observacao: form.observacao || null, responsavel_id: form.responsavel_id || null,
      total_transacoes: Number(form.total_transacoes) || 0, is_lead: form.is_lead,
    }
    if (editId) {
      await supabase.from('contacts').update({ ...payload, updated_by: userId }).eq('id', editId)
    } else {
      const { data: inserted, error: insertError } = await supabase.from('contacts').insert({
        workspace_id: workspaceId, created_by: userId, updated_by: userId, ...payload,
      }).select('id, funil_status, status_geral').single()
      // #region agent log
      fetch('http://127.0.0.1:7920/ingest/c40992e2-4100-442c-aa31-e3c6a18f7d13',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'429952'},body:JSON.stringify({sessionId:'429952',location:'GeralClient.tsx:handleSave',message:'contact insert result',data:{insertOk:!insertError,insertError:insertError?.message??null,insertedId:inserted?.id??null,funil_status:form.funil_status||null},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
    setSaving(false); setShowForm(false); setEditId(null)
    setForm(emptyForm())
    router.refresh()
  }

  const inp: React.CSSProperties = { background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }

  const modes: { key: Mode; label: string; icon: typeof Table2 }[] = [
    { key: 'tabela', label: 'Tabelas', icon: Table2 },
    { key: 'funil', label: 'Funil Pré-Atendimento', icon: MessageSquare },
    { key: 'negociacao', label: 'Leads em Negociação', icon: Users2 },
    { key: 'acoes', label: 'Ações', icon: Gavel },
  ]

  return (
    <div className="min-h-screen">
      <EditableHeader title="Geral" icon={Settings} color="#818CF8"
        gradient="linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%)"
        pageKey="geral" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6">
        {/* Mode switcher + actions */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            {modes.map(m => {
              const Icon = m.icon
              return (
                <button key={m.key} onClick={() => setMode(m.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{ background: mode === m.key ? 'var(--notion-bg-3)' : 'transparent', color: mode === m.key ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
                  <Icon className="w-3.5 h-3.5" /> {m.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            {searchOpen ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm animate-fade-in"
                style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
                <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
                <input
                  ref={searchRef}
                  autoFocus
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearch('') } }}
                  className="bg-transparent text-sm outline-none w-40"
                  style={{ color: 'var(--notion-text)' }}
                />
                <button
                  onClick={() => { setSearchOpen(false); setSearch('') }}
                  className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]"
                  style={{ color: 'var(--notion-text-3)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 0) }}
                className="flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-[var(--notion-bg-2)]"
                style={{ border: '1px solid var(--notion-border)', color: 'var(--notion-text-3)' }}
                title="Buscar">
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* TABELAS (dinâmicas) */}
        {mode === 'tabela' && (
          <div className="space-y-8">
            {/* Atalhos conectados à Fonte de dados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl p-5 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(91,106,240,0.15)' }}>
                    <Users2 className="w-4 h-4" style={{ color: '#818CF8' }} />
                  </div>
                  <h3 className="text-sm font-semibold italic" style={{ color: 'var(--notion-text)' }}>Cadastrar Contato</h3>
                </div>
                <button onClick={() => novoNaFonte(shortcuts.contatosId)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-[var(--notion-bg-4)]"
                  style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                  <Plus className="w-4 h-4" /> Nova página
                </button>
                <p className="text-xs mt-2" style={{ color: 'var(--notion-text-3)' }}>Vai para a fonte de dados <b>Contatos</b>.</p>
              </div>

              <div className="rounded-xl p-5 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Table2 className="w-4 h-4" style={{ color: '#22D3EE' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>Leads</h3>
                </div>
                <div className="space-y-1.5">
                  <Link href={`/tabelas?t=${shortcuts.contatosId}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text)' }}>
                    <Users2 className="w-3.5 h-3.5" style={{ color: '#818CF8' }} /> Lista de Contatos
                  </Link>
                  <Link href={`/tabelas?t=${shortcuts.leadsId}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text)' }}>
                    <Database className="w-3.5 h-3.5" style={{ color: '#22D3EE' }} /> Lista Leads
                  </Link>
                  <button onClick={() => novoNaFonte(shortcuts.leadsId)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-3.5 h-3.5" /> Novo lead
                  </button>
                </div>
              </div>
            </div>

            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
                <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B' }} /> Alerta — Alta Prioridade
              </h2>
              {geralTables.alerta ? (
                <DynamicTable key={geralTables.alerta.tableId} tableId={geralTables.alerta.tableId}
                  initialColumns={geralTables.alerta.columns} initialRows={geralTables.alerta.rows}
                  sources={geralTables.sources} members={members} userId={userId} />
              ) : <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Tabela não provisionada.</p>}
            </section>
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
                <Clock className="w-4 h-4" style={{ color: '#EF4444' }} /> Prazos Vencidos
              </h2>
              {geralTables.prazos ? (
                <DynamicTable key={geralTables.prazos.tableId} tableId={geralTables.prazos.tableId}
                  initialColumns={geralTables.prazos.columns} initialRows={geralTables.prazos.rows}
                  sources={geralTables.sources} members={members} userId={userId} />
              ) : <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Tabela não provisionada.</p>}
            </section>

            {/* Quadro estilo Trello */}
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
                <Gavel className="w-4 h-4" style={{ color: '#22D3EE' }} /> Quadro de Tarefas
              </h2>
              <ProjectBoard lists={board.lists} cards={board.cards} labels={board.labels}
                members={members} workspaceId={workspaceId} userId={userId} />
            </section>
          </div>
        )}

        {/* KANBANS */}
        {mode === 'funil' && (
          leadsBoard ? (
            <DynamicBoard key={leadsBoard.tableId} tableId={leadsBoard.tableId}
              initialColumns={leadsBoard.columns} initialRows={leadsBoard.rows}
              sources={geralTables.sources} members={members} userId={userId} views={leadsBoard.views} />
          ) : (
            <KanbanBoard contacts={searched} field="funil_status" boardKey="funil"
              initialColumns={kanbanColumns.funil} canEdit={canEditBoard} showTags={['status_geral']}
              onNewPage={label => openNewInColumn(label, 'funil_status')} onEditCard={openEditCard} />
          )
        )}
        {mode === 'negociacao' && (
          leadsBoard ? (
            <DynamicBoard key={leadsBoard.tableId + '-neg'} tableId={leadsBoard.tableId}
              initialColumns={leadsBoard.columns} initialRows={leadsBoard.rows}
              sources={geralTables.sources} members={members} userId={userId}
              groupColId={leadColId('Status Geral')} views={[{ id: 'neg', name: 'Leads em Negociação', type: 'board', position: 0 }]} />
          ) : (
            <KanbanBoard contacts={searched} field="status_geral" boardKey="negociacao"
              initialColumns={kanbanColumns.negociacao} canEdit={canEditBoard} showTags={['renda', 'analise']}
              onNewPage={label => openNewInColumn(label, 'status_geral')} onEditCard={openEditCard} />
          )
        )}
        {mode === 'acoes' && (
          leadsBoard ? (
            <DynamicBoard key={leadsBoard.tableId + '-acoes'} tableId={leadsBoard.tableId}
              initialColumns={leadsBoard.columns} initialRows={leadsBoard.rows}
              sources={geralTables.sources} members={members} userId={userId}
              groupColId={leadColId('Status Processual')} views={[{ id: 'acoes', name: 'Ações', type: 'board', position: 0 }]} />
          ) : (
            <KanbanBoard contacts={searched} field="status_processual" boardKey="acoes"
              initialColumns={kanbanColumns.acoes} canEdit={canEditBoard} showTags={['status_geral', 'observacao']}
              onNewPage={label => openNewInColumn(label, 'status_processual')} onEditCard={openEditCard} />
          )
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="fixed right-0 top-0 h-full w-full max-w-md overflow-y-auto animate-fade-in shadow-2xl"
            style={{ background: 'var(--notion-bg-2)', borderLeft: '1px solid var(--notion-border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--notion-text)' }}>{editId ? 'Editar contato' : 'Novo contato'}</h2>
              <button onClick={closeForm} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <L label="Nome *" full><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></L>
                <L label="Origem"><select value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}>{ORIGEM_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Status Geral"><select value={form.status_geral} onChange={e => setForm(f => ({ ...f, status_geral: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}>{STATUS_GERAL_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Status Processual"><select value={form.status_processual} onChange={e => setForm(f => ({ ...f, status_processual: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}><option value="">—</option>{STATUS_PROCESSUAL_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Funil (WhatsApp)"><select value={form.funil_status} onChange={e => setForm(f => ({ ...f, funil_status: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}><option value="">—</option>{FUNIL_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Renda"><select value={form.renda} onChange={e => setForm(f => ({ ...f, renda: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}>{RENDA_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Análise Jurídica"><select value={form.analise_juridica} onChange={e => setForm(f => ({ ...f, analise_juridica: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}><option value="">—</option>{ANALISE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Alerta"><select value={form.alerta} onChange={e => setForm(f => ({ ...f, alerta: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}>{ALERTA_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></L>
                <L label="Data de Contato"><input type="date" value={form.data_contato} onChange={e => setForm(f => ({ ...f, data_contato: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></L>
                <L label="Prazo p/ Execução"><input type="date" value={form.prazo_execucao} onChange={e => setForm(f => ({ ...f, prazo_execucao: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></L>
                <L label="Total Transações (R$)"><input type="number" step="0.01" value={form.total_transacoes} onChange={e => setForm(f => ({ ...f, total_transacoes: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp} /></L>
                <L label="Responsável"><select value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm" style={inp}><option value="">— Sem responsável —</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></L>
                <L label="Observação" full><textarea rows={3} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inp} /></L>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>{label}</label>
      {children}
    </div>
  )
}

function TableBlock({ title, icon: Icon, accent, rows, today, empty, onNew }: {
  title: string; icon: typeof AlertTriangle; accent: string
  rows: ContactRow[]; today: string; empty: string; onNew?: () => void
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--notion-text)' }}>
        <Icon className="w-4 h-4" style={{ color: accent }} /> {title}
        <span className="text-xs font-normal" style={{ color: 'var(--notion-text-3)' }}>· {rows.length}</span>
      </h2>
      <div className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Nome', 'Origem', 'Status Geral', 'Status Processual', 'Data Contato', 'Prazo p/ Exec.', 'Observação', 'Total Transações', 'Responsável'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--notion-text-3)' }}>{empty}</td></tr>
            ) : rows.map((c, i) => {
              const od = c.prazo_execucao && c.prazo_execucao < today
              return (
                <tr key={c.id} className="border-b transition-colors hover:bg-[var(--notion-bg-2)] animate-fade-in"
                  style={{ borderColor: 'var(--notion-border)', animationDelay: `${i * 15}ms`, background: od ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--notion-text)' }}>{c.name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{c.origem || '—'}</td>
                  <td className="px-4 py-3">{c.status_geral && <Tag label={c.status_geral} color={STATUS_GERAL_COLORS[c.status_geral] || '#94A3B8'} />}</td>
                  <td className="px-4 py-3">{c.status_processual ? <Tag label={c.status_processual} color={STATUS_PROCESSUAL_COLORS[c.status_processual] || '#94A3B8'} /> : <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(c.data_contato)}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: od ? '#F87171' : 'var(--notion-text-2)' }}>{fmtDate(c.prazo_execucao)}</td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate" style={{ color: 'var(--notion-text-2)' }} title={c.observacao || ''}>{c.observacao || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: '#34D399' }}>{fmtBRL(Number(c.total_transacoes))}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>{c.responsavel?.full_name || '—'}</td>
                </tr>
              )
            })}
          </tbody>
          {onNew && (
            <tfoot>
              <tr>
                <td colSpan={9} className="px-2 py-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                  <button onClick={onNew}
                    className="w-full flex items-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-2)]"
                    style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-3.5 h-3.5" /> Nova página
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs mt-2 uppercase tracking-wider" style={{ color: 'var(--notion-text-3)' }}>Contagem {rows.length}</p>
    </section>
  )
}
