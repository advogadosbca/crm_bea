'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Clock, MessageSquare, AlignLeft, Tag as TagIcon, User as UserIcon,
  Check, Pencil, Trash2, MoreHorizontal, Calendar,
  Paperclip, Users, Search, Link2, Download, Loader2, FileText,
} from 'lucide-react'

export interface BMember { id: string; full_name: string; avatar_url?: string }
export interface BLabel { id: string; name: string; color: string }
export interface BList { id: string; title: string; position: number }
export interface BCard {
  id: string; list_id: string; title: string; description?: string | null
  due_date?: string | null; position: number; members: string[]; labels: string[]
}
interface Activity { id: string; user_id: string | null; kind: string; text: string; created_at: string }

// paleta oficial (10 cores Notion)
const LABEL_COLORS = ['#94A3B8', '#9B9A97', '#A27763', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444']

export function ProjectBoard({ lists: initLists, cards: initCards, labels: initLabels, members, workspaceId, userId }: {
  lists: BList[]; cards: BCard[]; labels: BLabel[]; members: BMember[]; workspaceId: string; userId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [lists, setLists] = useState<BList[]>(initLists)
  const [cards, setCards] = useState<BCard[]>(initCards)
  const [labels, setLabels] = useState<BLabel[]>(initLabels)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overList, setOverList] = useState<string | null>(null)
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const [newCard, setNewCard] = useState('')
  const [addingList, setAddingList] = useState(false)
  const [newList, setNewList] = useState('')
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [listMenu, setListMenu] = useState<string | null>(null)

  useEffect(() => { setLists(initLists) }, [initLists])
  useEffect(() => { setCards(initCards) }, [initCards])
  useEffect(() => { setLabels(initLabels) }, [initLabels])

  const member = (id: string) => members.find(m => m.id === id)
  const label = (id: string) => labels.find(l => l.id === id)
  const today = new Date().toISOString().split('T')[0]

  async function log(cardId: string, kind: string, text: string) {
    await supabase.from('board_activity').insert({ card_id: cardId, user_id: userId, kind, text })
  }

  async function moveTo(listId: string) {
    if (!dragId) return
    const id = dragId
    const card = cards.find(c => c.id === id)
    setCards(cs => cs.map(c => c.id === id ? { ...c, list_id: listId } : c))
    setDragId(null); setOverList(null)
    if (card && card.list_id !== listId) {
      await supabase.from('board_cards').update({ list_id: listId }).eq('id', id)
      await log(id, 'event', `moveu para "${lists.find(l => l.id === listId)?.title}"`)
    }
  }

  async function addCard(listId: string) {
    const title = newCard.trim()
    setAddingIn(null); setNewCard('')
    if (!title) return
    const position = cards.filter(c => c.list_id === listId).length
    const { data } = await supabase.from('board_cards').insert({ workspace_id: workspaceId, list_id: listId, title, position, created_by: userId }).select('*').single()
    if (data) {
      setCards(cs => [...cs, { ...data, members: [], labels: [] } as BCard])
      await log(data.id, 'event', 'criou o cartão')
    }
  }
  async function addList() {
    const title = newList.trim()
    setAddingList(false); setNewList('')
    if (!title) return
    const { data } = await supabase.from('board_lists').insert({ workspace_id: workspaceId, title, position: lists.length }).select('*').single()
    if (data) setLists(ls => [...ls, data as BList])
  }
  async function renameList(id: string, title: string) {
    setLists(ls => ls.map(l => l.id === id ? { ...l, title } : l))
    await supabase.from('board_lists').update({ title }).eq('id', id)
  }
  async function deleteList(id: string) {
    if (!confirm('Excluir esta lista e todos os cartões dela?')) return
    setListMenu(null)
    setLists(ls => ls.filter(l => l.id !== id)); setCards(cs => cs.filter(c => c.list_id !== id))
    await supabase.from('board_lists').delete().eq('id', id)
  }

  // mutações de cartão usadas pelo modal
  const patchCard = useCallback((id: string, patch: Partial<BCard>) => {
    setCards(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  const current = cards.find(c => c.id === openCard) || null

  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(15,42,77,0.25)', border: '1px solid var(--notion-border)' }}>
      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {lists.sort((a, b) => a.position - b.position).map(list => {
          const listCards = cards.filter(c => c.list_id === list.id).sort((a, b) => a.position - b.position)
          return (
            <div key={list.id}
              onDragOver={e => { e.preventDefault(); setOverList(list.id) }}
              onDragLeave={() => setOverList(o => o === list.id ? null : o)}
              onDrop={() => moveTo(list.id)}
              className="flex-shrink-0 w-64 rounded-xl p-2 transition-colors"
              style={{ background: overList === list.id ? 'var(--notion-bg-3)' : 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <div className="flex items-center gap-2 px-1.5 py-1 mb-2 relative">
                <input defaultValue={list.title} onBlur={e => renameList(list.id, e.target.value.trim() || list.title)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="flex-1 bg-transparent text-sm font-semibold outline-none" style={{ color: 'var(--notion-text)' }} />
                <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>{listCards.length}</span>
                <button onClick={() => setListMenu(listMenu === list.id ? null : list.id)} className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><MoreHorizontal className="w-3.5 h-3.5" /></button>
                {listMenu === list.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setListMenu(null)} />
                    <div className="absolute right-0 top-7 z-50 w-36 rounded-lg p-1 shadow-xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                      <button onClick={() => deleteList(list.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: '#F87171' }}><Trash2 className="w-3.5 h-3.5" /> Excluir lista</button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                {listCards.map(card => {
                  const overdue = card.due_date && card.due_date.split('T')[0] < today
                  return (
                    <div key={card.id} draggable
                      onDragStart={() => setDragId(card.id)} onDragEnd={() => { setDragId(null); setOverList(null) }}
                      onClick={() => setOpenCard(card.id)}
                      className="rounded-lg p-2.5 border cursor-pointer transition-all hover:border-[var(--notion-accent)]"
                      style={{ background: 'var(--notion-bg-3)', borderColor: 'var(--notion-border)', opacity: dragId === card.id ? 0.4 : 1 }}>
                      {card.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {card.labels.map(lid => { const l = label(lid); return l ? <span key={lid} className="h-2 w-9 rounded-full" style={{ background: l.color }} title={l.name} /> : null })}
                        </div>
                      )}
                      <p className="text-sm leading-snug mb-1.5" style={{ color: 'var(--notion-text)' }}>{card.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {card.due_date && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                            style={{ background: overdue ? 'rgba(239,68,68,0.18)' : 'var(--notion-bg-4)', color: overdue ? '#F87171' : 'var(--notion-text-2)' }}>
                            <Clock className="w-3 h-3" /> {new Date(card.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                        {card.description && <AlignLeft className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />}
                        <div className="flex -space-x-1.5 ml-auto">
                          {card.members.map(mid => { const m = member(mid); return m ? (
                            <span key={mid} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border-2" style={{ background: 'var(--notion-accent)', color: '#fff', borderColor: 'var(--notion-bg-3)' }} title={m.full_name}>{m.full_name[0]}</span>
                          ) : null })}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {addingIn === list.id ? (
                  <textarea autoFocus value={newCard} onChange={e => setNewCard(e.target.value)}
                    onBlur={() => addCard(list.id)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(list.id) } if (e.key === 'Escape') { setAddingIn(null); setNewCard('') } }}
                    placeholder="Título do cartão..." rows={2}
                    className="w-full px-2 py-1.5 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
                ) : (
                  <button onClick={() => setAddingIn(list.id)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar um cartão
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Adicionar lista */}
        <div className="flex-shrink-0 w-64">
          {addingList ? (
            <div className="rounded-xl p-2" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <input autoFocus value={newList} onChange={e => setNewList(e.target.value)} onBlur={addList}
                onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') { setAddingList(false); setNewList('') } }}
                placeholder="Nome da lista..." className="w-full px-2 py-1.5 rounded text-sm outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
            </div>
          ) : (
            <button onClick={() => setAddingList(true)} className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--notion-bg-2)]" style={{ border: '1px dashed var(--notion-border)', color: 'var(--notion-text-2)' }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar outra lista
            </button>
          )}
        </div>
      </div>

      {current && (
        <CardModal card={current} lists={lists} labels={labels} members={members} userId={userId} workspaceId={workspaceId}
          onClose={() => setOpenCard(null)} patchCard={patchCard} setLabels={setLabels}
          onDeleted={() => { setCards(cs => cs.filter(c => c.id !== current.id)); setOpenCard(null) }}
          log={log} />
      )}
    </div>
  )
}

// ====================== Modal de cartão ======================
function CardModal({ card, lists, labels, members, userId, workspaceId, onClose, patchCard, setLabels, onDeleted, log }: {
  card: BCard; lists: BList[]; labels: BLabel[]; members: BMember[]; userId: string; workspaceId: string
  onClose: () => void; patchCard: (id: string, p: Partial<BCard>) => void
  setLabels: React.Dispatch<React.SetStateAction<BLabel[]>>; onDeleted: () => void
  log: (cardId: string, kind: string, text: string) => Promise<void>
}) {
  const supabase = createClient()
  const router = useRouter()
  const [title, setTitle] = useState(card.title)
  const [desc, setDesc] = useState(card.description || '')
  const [editDesc, setEditDesc] = useState(false)
  const [activity, setActivity] = useState<Activity[]>([])
  const [comment, setComment] = useState('')
  const [pop, setPop] = useState<'none' | 'members' | 'labels' | 'due' | 'contacts' | 'attach'>('none')
  const [contacts, setContacts] = useState<{ id: string; name: string }[] | null>(null)
  const [contactQuery, setContactQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const member = (id: string) => members.find(m => m.id === id)
  const today = new Date().toISOString().split('T')[0]
  const overdue = card.due_date && card.due_date.split('T')[0] < today

  // anexos e clientes vinculados são guardados em board_activity (kinds 'attachment' e 'contact')
  const safeParse = (t: string): Record<string, string> => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : {} } catch { return {} } }
  const attachments = activity.filter(a => a.kind === 'attachment').map(a => { const p = safeParse(a.text); return { act: a, name: p.name, url: p.url, path: p.path } })
  const linkedContacts = (() => {
    const seen = new Set<string>(); const out: { actId: string; contactId: string; name: string }[] = []
    for (const a of activity) {
      if (a.kind !== 'contact') continue
      const p = safeParse(a.text)
      if (p.contactId && !seen.has(p.contactId)) { seen.add(p.contactId); out.push({ actId: a.id, contactId: p.contactId, name: p.name || 'Cliente' }) }
    }
    return out
  })()
  const history = activity.filter(a => a.kind === 'event' || a.kind === 'comment')

  useEffect(() => {
    supabase.from('board_activity').select('*').eq('card_id', card.id).order('created_at', { ascending: false })
      .then(({ data }) => setActivity((data || []) as Activity[]))
  }, [card.id, supabase])

  async function saveTitle() { if (title.trim() && title !== card.title) { patchCard(card.id, { title: title.trim() }); await supabase.from('board_cards').update({ title: title.trim() }).eq('id', card.id) } }
  async function saveDesc() { setEditDesc(false); patchCard(card.id, { description: desc }); await supabase.from('board_cards').update({ description: desc || null }).eq('id', card.id) }
  async function setDue(v: string) {
    const iso = v ? new Date(v).toISOString() : null
    patchCard(card.id, { due_date: iso }); setPop('none')
    await supabase.from('board_cards').update({ due_date: iso }).eq('id', card.id)
    await log(card.id, 'event', iso ? `definiu prazo ${new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'removeu o prazo')
    refreshActivity()
  }
  async function toggleMember(mid: string) {
    const has = card.members.includes(mid)
    const next = has ? card.members.filter(x => x !== mid) : [...card.members, mid]
    patchCard(card.id, { members: next })
    if (has) await supabase.from('board_card_members').delete().eq('card_id', card.id).eq('profile_id', mid)
    else await supabase.from('board_card_members').insert({ card_id: card.id, profile_id: mid })
  }
  async function toggleLabel(lid: string) {
    const has = card.labels.includes(lid)
    const next = has ? card.labels.filter(x => x !== lid) : [...card.labels, lid]
    patchCard(card.id, { labels: next })
    if (has) await supabase.from('board_card_labels').delete().eq('card_id', card.id).eq('label_id', lid)
    else await supabase.from('board_card_labels').insert({ card_id: card.id, label_id: lid })
  }
  async function createLabel(name: string, color: string) {
    const { data } = await supabase.from('board_labels').insert({ workspace_id: workspaceId, name, color }).select('*').single()
    if (data) { setLabels(ls => [...ls, data as BLabel]); toggleLabel(data.id) }
  }
  async function updateLabel(id: string, patch: Partial<BLabel>) {
    setLabels(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
    await supabase.from('board_labels').update(patch).eq('id', id)
  }
  function refreshActivity() {
    supabase.from('board_activity').select('*').eq('card_id', card.id).order('created_at', { ascending: false }).then(({ data }) => setActivity((data || []) as Activity[]))
  }

  // carrega os contatos só quando o popover de clientes abre
  useEffect(() => {
    if (pop !== 'contacts' || contacts !== null) return
    supabase.from('contacts').select('id, name').eq('workspace_id', workspaceId).order('name')
      .then(({ data }) => setContacts((data || []) as { id: string; name: string }[]))
  }, [pop, contacts, supabase, workspaceId])

  async function toggleContact(cid: string, name: string) {
    const existing = activity.find(a => a.kind === 'contact' && safeParse(a.text)?.contactId === cid)
    if (existing) await supabase.from('board_activity').delete().eq('id', existing.id)
    else await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'contact', text: JSON.stringify({ contactId: cid, name }) })
    refreshActivity()
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `board/${card.id}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('assets').upload(path, file, { upsert: true })
      if (error) { alert(`Falha ao enviar "${file.name}": ${error.message}`); continue }
      const { data } = supabase.storage.from('assets').getPublicUrl(path)
      await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'attachment', text: JSON.stringify({ name: file.name, url: data.publicUrl, path }) })
    }
    setUploading(false); setPop('none'); refreshActivity()
  }

  async function addLinkAttachment() {
    const url = linkUrl.trim(); if (!url) return
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'attachment', text: JSON.stringify({ name: linkText.trim() || url, url: href }) })
    setLinkUrl(''); setLinkText(''); setPop('none'); refreshActivity()
  }

  async function removeAttachment(a: Activity) {
    if (!confirm('Remover este anexo?')) return
    const p = safeParse(a.text)
    if (p?.path) { try { await supabase.storage.from('assets').remove([p.path]) } catch { /* noop */ } }
    await supabase.from('board_activity').delete().eq('id', a.id)
    refreshActivity()
  }

  const isImg = (u?: string) => !!u && /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(u)
  async function addComment() {
    if (!comment.trim()) return
    await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'comment', text: comment.trim() })
    setComment(''); refreshActivity()
  }
  async function deleteCard() {
    if (!confirm('Excluir este cartão?')) return
    await supabase.from('board_cards').delete().eq('id', card.id)
    onDeleted(); router.refresh()
  }
  async function moveToList(listId: string) { patchCard(card.id, { list_id: listId }); await supabase.from('board_cards').update({ list_id: listId }).eq('id', card.id); await log(card.id, 'event', `moveu para "${lists.find(l => l.id === listId)?.title}"`); refreshActivity() }

  const dueLocal = card.due_date ? new Date(card.due_date).toISOString().slice(0, 16) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl my-8 rounded-2xl animate-fade-in" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <select value={card.list_id} onChange={e => moveToList(e.target.value)} className="text-xs px-2 py-1 rounded-md outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={deleteCard} className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: '#F87171' }}><Trash2 className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 p-5">
          {/* coluna principal */}
          <div className="col-span-2 space-y-5">
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              className="w-full bg-transparent text-lg font-semibold outline-none" style={{ color: 'var(--notion-text)' }} />

            {/* membros + etiquetas + prazo (chips) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex -space-x-1.5">
                {card.members.map(mid => { const m = member(mid); return m ? <span key={mid} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2" style={{ background: 'var(--notion-accent)', color: '#fff', borderColor: 'var(--notion-bg-2)' }} title={m.full_name}>{m.full_name[0]}</span> : null })}
              </div>
              <button onClick={() => setPop(pop === 'members' ? 'none' : 'members')} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Plus className="w-4 h-4" /></button>
              <div className="flex flex-wrap gap-1.5">
                {card.labels.map(lid => { const l = labels.find(x => x.id === lid); return l ? <span key={lid} className="px-2 py-1 rounded text-xs font-medium" style={{ background: l.color, color: '#fff' }}>{l.name}</span> : null })}
              </div>
              <button onClick={() => setPop(pop === 'labels' ? 'none' : 'labels')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><TagIcon className="w-3.5 h-3.5" /> Etiquetas</button>
              <button onClick={() => setPop(pop === 'contacts' ? 'none' : 'contacts')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Users className="w-3.5 h-3.5" /> Cliente</button>
              <button onClick={() => setPop(pop === 'attach' ? 'none' : 'attach')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Paperclip className="w-3.5 h-3.5" /> Anexo</button>
            </div>

            {/* clientes vinculados */}
            {linkedContacts.length > 0 && (
              <div>
                <span className="text-xs font-medium flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--notion-text-3)' }}><Users className="w-3.5 h-3.5" /> Clientes</span>
                <div className="flex flex-wrap gap-1.5">
                  {linkedContacts.map(c => (
                    <span key={c.contactId} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: 'var(--notion-accent)', color: '#fff' }}>{c.name[0]?.toUpperCase()}</span>
                      {c.name}
                      <button onClick={() => toggleContact(c.contactId, c.name)} className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* prazo */}
            <div className="relative">
              <span className="text-xs font-medium block mb-1" style={{ color: 'var(--notion-text-3)' }}>Data de entrega</span>
              <button onClick={() => setPop(pop === 'due' ? 'none' : 'due')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--notion-bg-3)', color: overdue ? '#F87171' : 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
                <Calendar className="w-4 h-4" />
                {card.due_date ? new Date(card.due_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Definir prazo'}
                {overdue && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.2)' }}>Em atraso</span>}
              </button>
              {pop === 'due' && (
                <div className="absolute left-0 top-full mt-1 z-50 p-3 rounded-lg shadow-xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                  <input type="datetime-local" defaultValue={dueLocal} onChange={e => setDue(e.target.value)} className="px-2 py-1.5 rounded text-sm outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
                  {card.due_date && <button onClick={() => setDue('')} className="block mt-2 text-xs" style={{ color: '#F87171' }}>Remover prazo</button>}
                </div>
              )}
            </div>

            {/* descrição */}
            <div>
              <span className="text-xs font-medium flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--notion-text-3)' }}><AlignLeft className="w-3.5 h-3.5" /> Descrição</span>
              {editDesc ? (
                <div>
                  <textarea autoFocus value={desc} onChange={e => setDesc(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
                  <div className="flex gap-2 mt-2"><button onClick={saveDesc} className="px-3 py-1 rounded text-xs font-medium" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Salvar</button><button onClick={() => { setEditDesc(false); setDesc(card.description || '') }} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--notion-text-3)' }}>Cancelar</button></div>
                </div>
              ) : (
                <div onClick={() => setEditDesc(true)} className="px-3 py-2 rounded-lg text-sm cursor-text whitespace-pre-wrap min-h-[60px]" style={{ background: 'var(--notion-bg-3)', color: card.description ? 'var(--notion-text-2)' : 'var(--notion-text-3)' }}>
                  {card.description || 'Adicionar uma descrição...'}
                </div>
              )}
            </div>

            {/* anexos */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--notion-text-3)' }}><Paperclip className="w-3.5 h-3.5" /> Anexos</span>
                <button onClick={() => setPop('attach')} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Plus className="w-3 h-3" /> Adicionar</button>
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-3)' }}>Nenhum anexo. Envie um arquivo ou cole um link.</p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map(({ act, name, url }) => (
                    <div key={act.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                      {isImg(url) ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0"><img src={url} alt={name} className="w-10 h-10 rounded object-cover" style={{ border: '1px solid var(--notion-border)' }} /></a>
                      ) : (
                        <span className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--notion-bg-4)' }}><FileText className="w-5 h-5" style={{ color: 'var(--notion-text-2)' }} /></span>
                      )}
                      <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm truncate hover:underline" style={{ color: 'var(--notion-text)' }} title={name}>{name || url}</a>
                      <a href={url} target="_blank" rel="noopener noreferrer" download className="p-1.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }} title="Abrir/baixar"><Download className="w-3.5 h-3.5" /></a>
                      <button onClick={() => removeAttachment(act)} className="p-1.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }} title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* coluna histórico */}
          <div className="col-span-1 flex flex-col">
            <span className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{ color: 'var(--notion-text-3)' }}><MessageSquare className="w-3.5 h-3.5" /> Histórico</span>
            <div className="flex gap-2 mb-3">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} placeholder="Escrever comentário..." className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />
              <button onClick={addComment} className="px-2 rounded-lg text-xs" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Enviar</button>
            </div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {history.length === 0 && <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Sem atividades ainda.</p>}
              {history.map(a => { const m = member(a.user_id || '') ; return (
                <div key={a.id} className="flex gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{m?.full_name?.[0] || '?'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: 'var(--notion-text-2)' }}>
                      <span className="font-medium" style={{ color: 'var(--notion-text)' }}>{m?.full_name || 'Usuário'}</span>{' '}
                      {a.kind === 'event' ? a.text : ''}
                    </p>
                    {a.kind === 'comment' && <p className="text-xs mt-0.5 px-2 py-1.5 rounded-lg" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }}>{a.text}</p>}
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--notion-text-3)' }}>{new Date(a.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>

        {/* popovers membros/etiquetas */}
        {pop === 'members' && (
          <Popover onClose={() => setPop('none')} title="Membros">
            {members.map(m => (
              <button key={m.id} onClick={() => toggleMember(m.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--notion-accent)', color: '#fff' }}>{m.full_name[0]}</span>
                <span className="flex-1 text-left truncate">{m.full_name}</span>
                {card.members.includes(m.id) && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </Popover>
        )}
        {pop === 'labels' && (
          <LabelsPopover labels={labels} active={card.labels} onToggle={toggleLabel} onCreate={createLabel} onUpdate={updateLabel} onClose={() => setPop('none')} />
        )}
        {pop === 'contacts' && (
          <Popover title="Vincular cliente" onClose={() => setPop('none')}>
            <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded" style={{ background: 'var(--notion-bg-4)' }}>
              <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
              <input autoFocus value={contactQuery} onChange={e => setContactQuery(e.target.value)} placeholder="Buscar cliente..." className="bg-transparent text-xs outline-none flex-1" style={{ color: 'var(--notion-text)' }} />
            </div>
            {contacts === null ? (
              <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Carregando...</p>
            ) : (() => {
              const filtered = contacts.filter(c => (c.name || '').toLowerCase().includes(contactQuery.toLowerCase()))
              if (filtered.length === 0) return <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhum cliente encontrado.</p>
              return (
                <div className="space-y-0.5">
                  {filtered.slice(0, 60).map(c => {
                    const on = linkedContacts.some(x => x.contactId === c.id)
                    return (
                      <button key={c.id} onClick={() => toggleContact(c.id, c.name)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0" style={{ background: 'var(--notion-accent)', color: '#fff' }}>{(c.name || '?')[0]?.toUpperCase()}</span>
                        <span className="flex-1 text-left truncate">{c.name || '(sem nome)'}</span>
                        {on && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </Popover>
        )}
        {pop === 'attach' && (
          <Popover title="Anexar" onClose={() => setPop('none')}>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { uploadFiles(e.target.files); if (fileRef.current) fileRef.current.value = '' }} />
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>Anexe um arquivo do seu computador</p>
            <button disabled={uploading} onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-xs mb-3 disabled:opacity-60" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }}>
              {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</> : 'Escolher um arquivo'}
            </button>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--notion-text)' }}>Ou cole um link</p>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLinkAttachment() }} placeholder="Cole um link..." className="w-full px-2 py-1.5 mb-1.5 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
            <input value={linkText} onChange={e => setLinkText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLinkAttachment() }} placeholder="Texto para exibição (opcional)" className="w-full px-2 py-1.5 mb-2 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
            <button onClick={addLinkAttachment} disabled={!linkUrl.trim()} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50" style={{ background: 'var(--notion-accent)', color: '#fff' }}><Link2 className="w-3.5 h-3.5" /> Anexar link</button>
          </Popover>
        )}
      </div>
    </div>
  )
}

function Popover({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-64 rounded-xl p-2 shadow-2xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between px-1 pb-2"><span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>{title}</span><button onClick={onClose}><X className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} /></button></div>
        <div className="max-h-72 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}

function LabelsPopover({ labels, active, onToggle, onCreate, onUpdate, onClose }: {
  labels: BLabel[]; active: string[]; onToggle: (id: string) => void
  onCreate: (name: string, color: string) => void; onUpdate: (id: string, p: Partial<BLabel>) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const filtered = labels.filter(l => l.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Popover title="Etiquetas" onClose={onClose}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar etiquetas..." className="w-full px-2 py-1.5 mb-2 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
      <div className="space-y-1">
        {filtered.map(l => (
          <div key={l.id} className="flex items-center gap-1.5">
            <button onClick={() => onToggle(l.id)} className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: l.color, color: '#fff' }}>
              <span className="flex-1 text-left truncate">{l.name || '(sem nome)'}</span>
              {active.includes(l.id) && <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setEditing(editing === l.id ? null : l.id)}><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} /></button>
          </div>
        ))}
        {editing && (
          <div className="p-2 rounded-lg mt-1" style={{ background: 'var(--notion-bg-4)' }}>
            <input defaultValue={labels.find(l => l.id === editing)?.name} onBlur={e => onUpdate(editing, { name: e.target.value })} className="w-full px-2 py-1 mb-1.5 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }} />
            <div className="flex flex-wrap gap-1">{LABEL_COLORS.map(c => <button key={c} onClick={() => onUpdate(editing, { color: c })} className="w-5 h-5 rounded" style={{ background: c }} />)}</div>
          </div>
        )}
      </div>
      <button onClick={() => onCreate('Nova etiqueta', LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)])} className="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}><Plus className="w-3.5 h-3.5" /> Criar uma nova etiqueta</button>
    </Popover>
  )
}
