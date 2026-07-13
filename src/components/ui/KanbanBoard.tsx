'use client'

import { useState, useEffect } from 'react'
import { Contact, STATUS_GERAL_COLORS, STATUS_PROCESSUAL_COLORS, RENDA_COLORS } from '@/types'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { User as UserIcon, MoreHorizontal, Plus, Check, Trash2, Pencil, Copy } from 'lucide-react'

type ContactRow = Contact & { responsavel?: { full_name: string; avatar_url?: string } | null }

export interface KanbanColumn { id: string; label: string; color: string; position: number }

interface Props {
  contacts: ContactRow[]
  field: 'funil_status' | 'status_geral' | 'status_processual'
  boardKey: 'funil' | 'negociacao' | 'acoes'
  initialColumns: KanbanColumn[]
  canEdit: boolean
  showTags?: ('status_geral' | 'status_processual' | 'renda' | 'analise' | 'observacao')[]
  /** abre o formulário já com a coluna preenchida */
  onNewPage?: (colLabel: string) => void
  /** abre o formulário em modo edição com o contato carregado */
  onEditCard?: (contact: ContactRow) => void
}

export const NOTION_COLORS: { name: string; hex: string }[] = [
  { name: 'Padrão', hex: '#94A3B8' },
  { name: 'Cinza', hex: '#9B9A97' },
  { name: 'Marrom', hex: '#A27763' },
  { name: 'Laranja', hex: '#F97316' },
  { name: 'Amarelo', hex: '#F59E0B' },
  { name: 'Verde', hex: '#10B981' },
  { name: 'Azul', hex: '#3B82F6' },
  { name: 'Roxo', hex: '#8B5CF6' },
  { name: 'Rosa', hex: '#EC4899' },
  { name: 'Vermelho', hex: '#EF4444' },
]

function MiniTag({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight"
      style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}>{label}</span>
  )
}

export function KanbanBoard({ contacts, field, boardKey, initialColumns, canEdit, showTags = [], onNewPage, onEditCard }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns)
  const [local, setLocal] = useState<ContactRow[]>(contacts)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [cardMenu, setCardMenu] = useState<string | null>(null)

  useEffect(() => { setColumns(initialColumns) }, [initialColumns])
  useEffect(() => { setLocal(contacts) }, [contacts])

  const fmtDate = (d?: string) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : ''

  async function moveTo(colLabel: string) {
    if (!dragId) return
    const id = dragId
    setLocal(prev => prev.map(c => c.id === id ? { ...c, [field]: colLabel } : c))
    setDragId(null); setOverCol(null)
    await supabase.from('contacts').update({ [field]: colLabel }).eq('id', id)
    router.refresh()
  }

  async function api(method: string, body: object) {
    await fetch('/api/kanban-columns', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    router.refresh()
  }

  async function addColumn() {
    if (!newLabel.trim()) { setAdding(false); return }
    await api('POST', { board_key: boardKey, label: newLabel.trim(), color: '#94A3B8' })
    setNewLabel(''); setAdding(false)
  }
  async function renameColumn(col: KanbanColumn) {
    if (!editLabel.trim() || editLabel === col.label) { setEditing(null); return }
    await api('PATCH', { id: col.id, board_key: boardKey, label: editLabel.trim(), oldLabel: col.label })
    setEditing(null)
  }
  async function setColor(col: KanbanColumn, color: string) {
    setColumns(cs => cs.map(c => c.id === col.id ? { ...c, color } : c))
    setMenuOpen(null)
    await api('PATCH', { id: col.id, board_key: boardKey, color })
  }
  async function removeColumn(col: KanbanColumn) {
    if (!confirm(`Excluir o funil "${col.label}"? Os cards nele ficarão sem funil.`)) return
    setMenuOpen(null)
    await api('DELETE', { id: col.id, board_key: boardKey, label: col.label })
  }

  async function duplicateCard(c: ContactRow) {
    setCardMenu(null)
    const { id, created_at, updated_at, responsavel, ...rest } = c as ContactRow & { responsavel?: unknown }
    void id; void created_at; void updated_at; void responsavel
    await supabase.from('contacts').insert({ ...rest, name: `${c.name} (cópia)` })
    router.refresh()
  }
  async function deleteCard(c: ContactRow) {
    if (!confirm(`Excluir o card "${c.name}"? Esta ação não pode ser desfeita.`)) return
    setCardMenu(null)
    setLocal(prev => prev.filter(x => x.id !== c.id))
    await supabase.from('contacts').delete().eq('id', c.id)
    router.refresh()
  }

  const norm = (s: string) => (s || '').normalize('NFC').trim()

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 items-start">
      {columns.map(col => {
        const items = local.filter(c => norm(c[field] as string) === norm(col.label))

        return (
          <div key={col.id}
            onDragOver={e => { e.preventDefault(); setOverCol(col.label) }}
            onDragLeave={() => setOverCol(o => o === col.label ? null : o)}
            onDrop={() => moveTo(col.label)}
            className="flex-shrink-0 w-64 rounded-xl p-2 transition-colors flex flex-col"
            style={{ background: overCol === col.label ? 'var(--notion-bg-3)' : 'var(--notion-bg-2)', border: `1px solid ${overCol === col.label ? col.color : 'var(--notion-border)'}` }}>

            {/* Header da coluna */}
            <div className="flex items-center gap-2 px-1.5 py-1.5 mb-2 relative">
              {editing === col.id ? (
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => renameColumn(col)}
                  onKeyDown={e => { if (e.key === 'Enter') renameColumn(col); if (e.key === 'Escape') setEditing(null) }}
                  className="flex-1 px-1.5 py-0.5 rounded text-xs font-medium outline-none"
                  style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: `1px solid ${col.color}` }} />
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-medium truncate" style={{ background: `${col.color}22`, color: col.color }}>
                  {col.label}
                </span>
              )}
              <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>{items.length}</span>

              {canEdit && (
                <button onClick={() => setMenuOpen(menuOpen === col.id ? null : col.id)}
                  className="ml-auto p-0.5 rounded hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: 'var(--notion-text-3)' }}>
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}

              {menuOpen === col.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                  <div className="absolute right-0 top-8 z-50 w-44 rounded-lg p-1 shadow-xl animate-fade-in"
                    style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                    <button onClick={() => { setEditing(col.id); setEditLabel(col.label); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: 'var(--notion-text)' }}>
                      <Pencil className="w-3.5 h-3.5" /> Renomear funil
                    </button>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--notion-text-3)' }}>Cor</div>
                    <div className="grid grid-cols-5 gap-1 px-2 pb-1">
                      {NOTION_COLORS.map(nc => (
                        <button key={nc.hex} onClick={() => setColor(col, nc.hex)} title={nc.name}
                          className="w-6 h-6 rounded flex items-center justify-center transition-transform hover:scale-110"
                          style={{ background: nc.hex }}>
                          {col.color === nc.hex && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeColumn(col)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors mt-1" style={{ color: '#F87171' }}>
                      <Trash2 className="w-3.5 h-3.5" /> Excluir funil
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[40px] flex-1">
              {items.map(c => (
                <div key={c.id} draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null) }}
                  onClick={() => onEditCard?.(c)}
                  className="group/card relative rounded-lg p-3 border cursor-pointer active:cursor-grabbing transition-all hover:border-[var(--notion-accent)]"
                  style={{ background: 'var(--notion-bg-3)', borderColor: 'var(--notion-border)', opacity: dragId === c.id ? 0.4 : 1 }}>
                  <div className="flex items-start justify-between gap-1.5 mb-1.5">
                    <p className="text-sm font-medium leading-tight" style={{ color: 'var(--notion-text)' }}>{c.name}</p>
                    <button
                      onClick={e => { e.stopPropagation(); setCardMenu(cardMenu === c.id ? null : c.id) }}
                      onMouseDown={e => e.stopPropagation()}
                      className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/card:opacity-100 hover:bg-[var(--notion-bg-4)] transition-all"
                      style={{ color: 'var(--notion-text-3)' }}>
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {cardMenu === c.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setCardMenu(null) }} />
                      <div className="absolute right-2 top-8 z-50 w-40 rounded-lg p-1 shadow-xl animate-fade-in"
                        style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}
                        onClick={e => e.stopPropagation()}>
                        {onEditCard && (
                          <button onClick={() => { setCardMenu(null); onEditCard(c) }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: 'var(--notion-text)' }}>
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </button>
                        )}
                        <button onClick={() => duplicateCard(c)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: 'var(--notion-text)' }}>
                          <Copy className="w-3.5 h-3.5" /> Duplicar
                        </button>
                        <button onClick={() => deleteCard(c)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: '#F87171' }}>
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    </>
                  )}

                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {showTags.includes('renda') && c.renda && <MiniTag label={c.renda} color={RENDA_COLORS[c.renda] || '#6366F1'} />}
                    {showTags.includes('status_geral') && c.status_geral && <MiniTag label={c.status_geral} color={STATUS_GERAL_COLORS[c.status_geral] || '#94A3B8'} />}
                    {showTags.includes('status_processual') && c.status_processual && <MiniTag label={c.status_processual} color={STATUS_PROCESSUAL_COLORS[c.status_processual] || '#94A3B8'} />}
                    {showTags.includes('analise') && c.analise_juridica && <MiniTag label={c.analise_juridica} color={c.analise_juridica.includes('Realizada') ? '#10B981' : '#FB923C'} />}
                    {showTags.includes('observacao') && c.observacao && <MiniTag label={c.observacao} color="#F59E0B" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
                    <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
                      {c.responsavel?.full_name && (<><UserIcon className="w-3 h-3 flex-shrink-0" />{c.responsavel.full_name}</>)}
                    </span>
                    <span className="font-mono">{fmtDate(c.data_contato) || fmtDate(c.created_at?.split('T')[0])}</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="text-center py-3 text-[11px]" style={{ color: 'var(--notion-text-3)' }}>—</div>}
            </div>

            {onNewPage && (
              <button
                onClick={() => onNewPage(col.label)}
                className="mt-2 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-4)]"
                style={{ color: 'var(--notion-text-3)' }}>
                <Plus className="w-3.5 h-3.5" /> Nova página
              </button>
            )}
          </div>
        )
      })}

      {/* Adicionar funil */}
      {canEdit && (
        <div className="flex-shrink-0 w-64">
          {adding ? (
            <div className="rounded-xl p-2" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onBlur={addColumn}
                onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') { setAdding(false); setNewLabel('') } }}
                placeholder="Nome do funil..."
                className="w-full px-2 py-1.5 rounded text-xs outline-none"
                style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--notion-bg-2)]"
              style={{ border: '1px dashed var(--notion-border)', color: 'var(--notion-text-2)' }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar funil
            </button>
          )}
        </div>
      )}
    </div>
  )
}
