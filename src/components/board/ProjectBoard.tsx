'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { uploadFile, deleteFile } from '@/lib/upload'
import { DBColumn, DBRow, primaryValue } from '@/types/dynamic'
import { initials, personColor } from '@/lib/people'
import { ScrollX } from '@/components/ui/ScrollX'
import { useIsAdmin } from '@/components/layout/RoleProvider'
import { ALTURA_MAX_COLUNA } from '@/components/ui/kanban-layout'
import {
  Plus, X, Clock, MessageSquare, AlignLeft, Tag as TagIcon,
  Check, Pencil, Trash2, MoreHorizontal, Calendar,
  Paperclip, Users, Search, Link2, Download, Loader2, FileText,
  CheckSquare, CheckCircle2, Ban, UserX, AlertTriangle, Archive, ArchiveRestore,
} from 'lucide-react'

export interface BMember { id: string; full_name: string; avatar_url?: string }
export interface BLabel { id: string; name: string; color: string }
export interface BList { id: string; title: string; position: number }
export interface BCard {
  id: string; list_id: string; title: string; description?: string | null
  due_date?: string | null; completed?: boolean; position: number; members: string[]; labels: string[]
  /** desde quando está encerrada (concluída ou em "Finalizado"); nula se está viva */
  encerrado_em?: string | null
  /** quando foi arquivada à mão — sai do quadro na hora, sem esperar os 45 dias */
  arquivado_em?: string | null
}
interface Activity { id: string; user_id: string | null; kind: string; text: string; created_at: string }

/** estado de uma tarefa: aberta, concluída ou cancelada (ambas somem da ficha do cliente) */
export type CardState = 'open' | 'done' | 'canceled'
export interface ChecklistItem { id: string; text: string; done: boolean }
export interface Checklist { title: string; items: ChecklistItem[] }
/** checklist de outro cartão oferecida como modelo na hora de criar uma nova */
interface ChecklistModelo { id: string; cartao: string; titulo: string; itens: string[] }

/**
 * Quanto tempo uma tarefa encerrada ainda ocupa espaço no quadro.
 *
 * "Encerrada" é concluída OU parada em "Finalizado" — quem carimba a data é o
 * trigger `board_cards_encerramento` no banco, e ele zera o carimbo quando a
 * tarefa é reaberta ou volta para uma coluna de trabalho. Então os 45 dias
 * contam do ÚLTIMO encerramento, não do primeiro.
 *
 * Sair do quadro não é ser apagada: o cartão continua no banco, continua na
 * ficha do cliente e volta à vista pelo botão "mostrar encerradas".
 */
const DIAS_ATE_SUMIR = 45

/**
 * Coluna que encerra a tarefa só por ela estar ali.
 *
 * Mesma lista de nomes da função `board_lista_encerra` no banco — a regra é
 * duplicada de propósito: aqui ela decide o que a tela oferece (o botão de
 * arquivar), lá ela decide o que o banco carimba. Mudou uma, mude a outra.
 */
const listaEncerra = (titulo?: string) =>
  ['finalizado', 'finalizada', 'finalizados'].includes((titulo || '').trim().toLowerCase())

// paleta oficial (10 cores Notion)
const LABEL_COLORS = ['#94A3B8', '#9B9A97', '#A27763', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444']

/** avatar do responsável: duas iniciais + cor fixa (Vitor Canedo "VC" x Vinicius Ferreira "VF") */
function MemberAvatar({ member, size = 24, ring }: { member: BMember; size?: number; ring?: string }) {
  const cor = personColor(member.id)
  return (
    <span className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      title={member.full_name}
      style={{
        width: size, height: size, fontSize: size <= 24 ? 10 : 12,
        background: cor, color: '#fff',
        border: ring ? `2px solid ${ring}` : `1px solid ${cor}`,
      }}>
      {initials(member.full_name)}
    </span>
  )
}

/** contador de uma faixa de gravidade dentro da barra de atrasos */
function Gravidade({ n, cor, texto }: { n: number; cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: `${cor}25`, color: cor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor }} />
      <b>{n}</b> {texto}
    </span>
  )
}

export function ProjectBoard({ lists: initLists, cards: initCards, labels: initLabels, members, workspaceId, userId, openCardId }: {
  lists: BList[]; cards: BCard[]; labels: BLabel[]; members: BMember[]; workspaceId: string; userId: string
  /** cartão a abrir automaticamente (link ?card= vindo do painel do cliente) */
  openCardId?: string
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
  const isAdmin = useIsAdmin()
  const boardRef = useRef<HTMLDivElement>(null)
  // filtro por responsável: vazio = todos; '__none__' = cartões sem ninguém
  const [filtro, setFiltro] = useState<string[]>([])
  const [soAtrasadas, setSoAtrasadas] = useState(false)
  const [verEncerradas, setVerEncerradas] = useState(false)

  useEffect(() => { setLists(initLists) }, [initLists])
  useEffect(() => { setCards(initCards) }, [initCards])
  useEffect(() => { setLabels(initLabels) }, [initLabels])

  // veio de um link de tarefa (?card=): rola até o quadro e abre o cartão.
  // Limpa o parâmetro da URL para o F5 não reabrir e o "voltar" funcionar.
  useEffect(() => {
    if (!openCardId || !initCards.some(c => c.id === openCardId)) return
    setOpenCard(openCardId)
    // sem 'smooth': o modal cobre a tela durante a animação, e a rolagem suave
    // é ignorada em parte dos ambientes — aqui o que importa é já estar no lugar
    // quando o usuário fechar o cartão.
    boardRef.current?.scrollIntoView({ block: 'start' })
    window.history.replaceState(null, '', window.location.pathname)
  }, [openCardId, initCards])

  const member = (id: string) => members.find(m => m.id === id)
  const label = (id: string) => labels.find(l => l.id === id)
  const today = new Date().toISOString().split('T')[0]
  /** encerrada = concluída/cancelada ou parada numa coluna de encerramento */
  const cardEncerrado = (c: BCard, listId = c.list_id) =>
    !!c.completed || listaEncerra(lists.find(l => l.id === listId)?.title)

  async function log(cardId: string, kind: string, text: string) {
    await supabase.from('board_activity').insert({ card_id: cardId, user_id: userId, kind, text })
  }

  async function moveTo(listId: string) {
    if (!dragId) return
    const id = dragId
    const card = cards.find(c => c.id === id)
    // Arrastar uma arquivada de volta para coluna de trabalho tira ela do
    // arquivo — é o trigger board_cards_encerramento que manda no banco; aqui
    // a tela só acompanha, senão o cartão continuaria "arquivado" até o F5.
    const volta = !!card && !card.completed && !listaEncerra(lists.find(l => l.id === listId)?.title)
    setCards(cs => cs.map(c => c.id === id ? { ...c, list_id: listId, ...(volta ? { arquivado_em: null } : {}) } : c))
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

  /**
   * Esvazia de uma vez a lista de tarefas já encerradas.
   *
   * Existe porque o caso real é "Finalizado" com 57 cartões parados: arquivar um
   * a um é o tipo de tarefa que ninguém faz, e a coluna continua ocupando a tela.
   * Só mexe no que já está encerrado — trabalho vivo na mesma lista fica onde
   * está.
   */
  async function arquivarEncerradas(listId: string) {
    const alvo = cards.filter(c => c.list_id === listId && cardEncerrado(c, listId) && !c.arquivado_em)
    if (!alvo.length) return
    if (!confirm(`Arquivar ${alvo.length} ${alvo.length === 1 ? 'tarefa encerrada' : 'tarefas encerradas'} desta lista?\n\nElas saem do quadro mas continuam no sistema, na ficha do cliente e no botão "mostrar".`)) return
    setListMenu(null)
    const ids = alvo.map(c => c.id)
    const agora = new Date().toISOString()
    setCards(cs => cs.map(c => ids.includes(c.id) ? { ...c, arquivado_em: agora } : c))
    const { error } = await supabase.from('board_cards').update({ arquivado_em: agora }).in('id', ids)
    if (error) {
      setCards(cs => cs.map(c => ids.includes(c.id) ? { ...c, arquivado_em: null } : c))
      alert(`Não consegui arquivar: ${error.message}`)
    }
  }

  // mutações de cartão usadas pelo modal
  const patchCard = useCallback((id: string, patch: Partial<BCard>) => {
    setCards(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  // busca na lista inteira, e não no que está à vista: o link ?card= da ficha
  // do cliente precisa abrir o cartão mesmo que ele já tenha saído do quadro
  const current = cards.find(c => c.id === openCard) || null

  // Sai do quadro por duas vias: arquivada à mão (na hora) ou encerrada há tempo
  // demais (sozinha). Dela não sai mais trabalho, e ocupando coluna ela empurra
  // para baixo o que ainda precisa de alguém.
  const saiuDoQuadro = (c: BCard) =>
    !!c.arquivado_em ||
    (!!c.encerrado_em && Date.now() - Date.parse(c.encerrado_em) > DIAS_ATE_SUMIR * 864e5)
  const encerradas = cards.filter(saiuDoQuadro)
  const noQuadro = verEncerradas ? cards : cards.filter(c => !saiuDoQuadro(c))

  // pessoas que realmente aparecem em algum cartão (não polui a barra com o time inteiro)
  const comCartao = members.filter(m => noQuadro.some(c => c.members.includes(m.id)))
  const temSemResponsavel = noQuadro.some(c => c.members.length === 0)
  const toggleFiltro = (id: string) => setFiltro(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id])

  // Atraso: prazo 9, hoje 10 => 1 dia atrasada. Sem carência — comparação por dia.
  // A gradação abaixo serve só para ordenar a gravidade entre as atrasadas;
  // toda atrasada é vermelha, nenhuma aparece como "ainda ok".
  const diasDeAtraso = (c: BCard): number | null => {
    if (!c.due_date || c.completed) return null
    const prazo = c.due_date.split('T')[0]
    if (prazo >= today) return null
    return Math.round((Date.parse(today) - Date.parse(prazo)) / 864e5)
  }
  const corDoAtraso = (dias: number) => dias > 30 ? '#DC2626' : dias > 7 ? '#EF4444' : '#F87171'

  /**
   * Ordem dentro da coluna: o que vence primeiro fica em cima.
   *
   * Quem não tem prazo vai para o fim (não compete com quem tem data marcada),
   * e quem já foi concluída/cancelada vai para o fim de tudo — mesmo com prazo
   * vencido, dela não sai mais trabalho. Empate cai no `position`, que é a
   * ordem em que os cartões foram criados.
   */
  const porPrazo = (a: BCard, b: BCard) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1
    const pa = a.due_date?.split('T')[0] ?? ''
    const pb = b.due_date?.split('T')[0] ?? ''
    if (pa !== pb) {
      if (!pa) return 1
      if (!pb) return -1
      return pa < pb ? -1 : 1
    }
    return a.position - b.position
  }

  const atrasos = noQuadro.map(diasDeAtraso).filter((d): d is number => d !== null)
  const criticas = atrasos.filter(d => d > 30).length
  const medias = atrasos.filter(d => d > 7 && d <= 30).length
  const recentes = atrasos.filter(d => d <= 7).length

  const porResponsavel = filtro.length
    ? noQuadro.filter(c => filtro.some(f => f === '__none__' ? c.members.length === 0 : c.members.includes(f)))
    : noQuadro
  const visiveis = soAtrasadas ? porResponsavel.filter(c => diasDeAtraso(c) !== null) : porResponsavel

  return (
    <div ref={boardRef} className="rounded-xl p-3" style={{ background: 'rgba(15,42,77,0.25)', border: '1px solid var(--notion-border)' }}>
      {/* resumo de atrasos — clica e o quadro mostra só o que está vencido */}
      {atrasos.length > 0 && (
        <button onClick={() => setSoAtrasadas(v => !v)}
          title={soAtrasadas ? 'Mostrar todas as tarefas' : 'Mostrar só as atrasadas'}
          className="w-full flex items-center gap-3 flex-wrap px-3 py-2.5 mb-3 rounded-lg text-left transition-colors"
          style={{
            background: soAtrasadas ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.08)',
            border: `1px solid ${soAtrasadas ? '#DC2626' : 'rgba(220,38,38,0.35)'}`,
          }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#F87171' }} />
          <span className="text-sm font-semibold" style={{ color: '#F87171' }}>
            {atrasos.length} {atrasos.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
          </span>
          <span className="flex items-center gap-2 flex-wrap text-[11px]">
            {criticas > 0 && <Gravidade n={criticas} cor="#DC2626" texto="há mais de 30 dias" />}
            {medias > 0 && <Gravidade n={medias} cor="#EF4444" texto="há 8 a 30 dias" />}
            {recentes > 0 && <Gravidade n={recentes} cor="#F87171" texto="há até 7 dias" />}
          </span>
          <span className="ml-auto text-[11px] whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
            {soAtrasadas ? 'mostrando só atrasadas · clique para ver tudo' : 'clique para ver só estas'}
          </span>
        </button>
      )}

      {/* Arquivadas à mão + encerradas há mais de 45 dias saem do quadro. O aviso
          fica porque sumiço silencioso em quadro de escritório vira "cadê a
          tarefa?" — e porque o cartão não foi apagado, só está fora de vista. */}
      {encerradas.length > 0 && (
        <button onClick={() => setVerEncerradas(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 mb-3 rounded-lg text-xs transition-colors hover:bg-[var(--notion-bg-3)]"
          style={{
            color: 'var(--notion-text-3)',
            border: `1px solid ${verEncerradas ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
          }}>
          <Archive className="w-3.5 h-3.5 flex-shrink-0" />
          {encerradas.length} {encerradas.length === 1 ? 'tarefa fora do quadro' : 'tarefas fora do quadro'}
          <span style={{ color: 'var(--notion-text-3)' }}>
            (arquivadas ou encerradas há mais de {DIAS_ATE_SUMIR} dias)
          </span>
          <span style={{ color: 'var(--notion-accent)' }}>· {verEncerradas ? 'esconder' : 'mostrar'}</span>
        </button>
      )}

      {/* filtro por responsável — ver tudo ou só os prazos de uma pessoa */}
      {(comCartao.length > 0 || temSemResponsavel) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
          <button onClick={() => setFiltro([])}
            className="px-2 py-1 rounded-md text-xs transition-colors"
            style={{
              background: filtro.length === 0 ? 'var(--notion-bg-4)' : 'transparent',
              color: filtro.length === 0 ? 'var(--notion-text)' : 'var(--notion-text-2)',
              border: `1px solid ${filtro.length === 0 ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
            }}>
            Todos <span style={{ color: 'var(--notion-text-3)' }}>{noQuadro.length}</span>
          </button>
          {comCartao.map(m => {
            const on = filtro.includes(m.id)
            const n = noQuadro.filter(c => c.members.includes(m.id)).length
            return (
              <button key={m.id} onClick={() => toggleFiltro(m.id)} title={`Só os prazos de ${m.full_name}`}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-md text-xs transition-colors"
                style={{
                  background: on ? `${personColor(m.id)}22` : 'transparent',
                  color: on ? 'var(--notion-text)' : 'var(--notion-text-2)',
                  border: `1px solid ${on ? personColor(m.id) : 'var(--notion-border)'}`,
                }}>
                <MemberAvatar member={m} size={18} />
                {m.full_name}
                <span style={{ color: 'var(--notion-text-3)' }}>{n}</span>
              </button>
            )
          })}
          {temSemResponsavel && (
            <button onClick={() => toggleFiltro('__none__')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors"
              style={{
                background: filtro.includes('__none__') ? 'var(--notion-bg-4)' : 'transparent',
                color: filtro.includes('__none__') ? 'var(--notion-text)' : 'var(--notion-text-2)',
                border: `1px solid ${filtro.includes('__none__') ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
              }}>
              <UserX className="w-3 h-3" /> Sem responsável
              <span style={{ color: 'var(--notion-text-3)' }}>{cards.filter(c => c.members.length === 0).length}</span>
            </button>
          )}
          {filtro.length > 0 && (
            <button onClick={() => setFiltro([])} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={{ color: 'var(--notion-text-3)' }}>
              <X className="w-3 h-3" /> limpar ({visiveis.length} de {noQuadro.length})
            </button>
          )}
        </div>
      )}

      <ScrollX className="flex gap-3 overflow-x-auto pb-2 items-start">
        {lists.sort((a, b) => a.position - b.position).map(list => {
          const listCards = visiveis.filter(c => c.list_id === list.id).sort(porPrazo)
          // encerradas que ainda ocupam a coluna — o menu da lista oferece varrer todas de uma vez
          const encerradasAqui = cards.filter(c => c.list_id === list.id && cardEncerrado(c, list.id) && !c.arquivado_em).length
          return (
            <div key={list.id}
              onDragOver={e => { e.preventDefault(); setOverList(list.id) }}
              onDragLeave={() => setOverList(o => o === list.id ? null : o)}
              onDrop={() => moveTo(list.id)}
              className="flex-shrink-0 w-64 rounded-xl p-2 transition-colors flex flex-col"
              style={{ background: overList === list.id ? 'var(--notion-bg-3)' : 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
              <div className="flex items-center gap-2 px-1.5 py-1 mb-2 relative flex-shrink-0">
                <input defaultValue={list.title} onBlur={e => renameList(list.id, e.target.value.trim() || list.title)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="flex-1 bg-transparent text-sm font-semibold outline-none" style={{ color: 'var(--notion-text)' }} />
                <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>{listCards.length}</span>
                <button onClick={() => setListMenu(listMenu === list.id ? null : list.id)} className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><MoreHorizontal className="w-3.5 h-3.5" /></button>
                {listMenu === list.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setListMenu(null)} />
                    <div className="absolute right-0 top-7 z-50 w-52 rounded-lg p-1 shadow-xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                      {encerradasAqui > 0 && (
                        <button onClick={() => arquivarEncerradas(list.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                          <Archive className="w-3.5 h-3.5 flex-shrink-0" /> Arquivar {encerradasAqui} encerrada{encerradasAqui > 1 ? 's' : ''}
                        </button>
                      )}
                      {isAdmin && <button onClick={() => deleteList(list.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: '#F87171' }}><Trash2 className="w-3.5 h-3.5" /> Excluir lista</button>}
                      {!isAdmin && encerradasAqui === 0 &&
                        <p className="px-2 py-1.5 text-xs" style={{ color: 'var(--notion-text-3)' }}>Sem ações disponíveis</p>}
                    </div>
                  </>
                )}
              </div>

              {/* só a pilha de cards rola; o cabeçalho da lista fica parado */}
              <div className="space-y-2 overflow-y-auto overscroll-contain pr-0.5"
                style={{ maxHeight: ALTURA_MAX_COLUNA }}>
                {listCards.map(card => {
                  const atraso = diasDeAtraso(card)
                  const corAtraso = atraso !== null ? corDoAtraso(atraso) : null
                  return (
                    <div key={card.id} draggable
                      onDragStart={() => setDragId(card.id)} onDragEnd={() => { setDragId(null); setOverList(null) }}
                      onClick={() => setOpenCard(card.id)}
                      className="rounded-lg p-2.5 border cursor-pointer transition-all hover:border-[var(--notion-accent)]"
                      style={{
                        background: 'var(--notion-bg-3)', borderColor: 'var(--notion-border)',
                        // faixa vermelha à esquerda: quanto mais escura, mais antigo o atraso
                        borderLeft: corAtraso ? `4px solid ${corAtraso}` : undefined,
                        opacity: dragId === card.id ? 0.4 : 1,
                      }}>
                      {card.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {card.labels.map(lid => { const l = label(lid); return l ? <span key={lid} className="h-2 w-9 rounded-full" style={{ background: l.color }} title={l.name} /> : null })}
                        </div>
                      )}
                      <p className="text-sm leading-snug mb-1.5"
                        style={{ color: card.completed ? 'var(--notion-text-3)' : 'var(--notion-text)', textDecoration: card.completed ? 'line-through' : 'none' }}>
                        {card.title}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {card.arquivado_em && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}
                            title={`Arquivada em ${new Date(card.arquivado_em).toLocaleDateString('pt-BR')}`}>
                            <Archive className="w-3 h-3" /> Arquivada
                          </span>
                        )}
                        {card.completed && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>
                            <CheckCircle2 className="w-3 h-3" /> Fechada
                          </span>
                        )}
                        {card.due_date && (
                          // atrasada mostra o tamanho do atraso, que é o que orienta a ação;
                          // no prazo continua mostrando a data
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                            title={new Date(card.due_date).toLocaleDateString('pt-BR')}
                            style={{
                              background: corAtraso ? `${corAtraso}2e` : 'var(--notion-bg-4)',
                              color: corAtraso || 'var(--notion-text-2)',
                            }}>
                            <Clock className="w-3 h-3" />
                            {atraso !== null
                              ? `atrasada há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`
                              : new Date(card.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                        {card.description && <AlignLeft className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />}
                        <div className="flex -space-x-1.5 ml-auto">
                          {card.members.map(mid => { const m = member(mid); return m ? (
                            <MemberAvatar key={mid} member={m} size={24} ring="var(--notion-bg-3)" />
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
      </ScrollX>

      {current && (
        <CardModal card={current} lists={lists} labels={labels} members={members} userId={userId} workspaceId={workspaceId}
          encerrada={cardEncerrado(current)}
          onClose={() => setOpenCard(null)} patchCard={patchCard} setLabels={setLabels}
          onDeleted={() => { setCards(cs => cs.filter(c => c.id !== current.id)); setOpenCard(null) }}
          log={log} />
      )}
    </div>
  )
}

// ====================== Modal de cartão ======================
function CardModal({ card, lists, labels, members, userId, workspaceId, encerrada, onClose, patchCard, setLabels, onDeleted, log }: {
  card: BCard; lists: BList[]; labels: BLabel[]; members: BMember[]; userId: string; workspaceId: string
  /** concluída/cancelada ou parada em coluna de encerramento — só então dá para arquivar */
  encerrada: boolean
  onClose: () => void; patchCard: (id: string, p: Partial<BCard>) => void
  setLabels: React.Dispatch<React.SetStateAction<BLabel[]>>; onDeleted: () => void
  log: (cardId: string, kind: string, text: string) => Promise<void>
}) {
  const supabase = createClient()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [title, setTitle] = useState(card.title)
  const [desc, setDesc] = useState(card.description || '')
  const [editDesc, setEditDesc] = useState(false)
  const [activity, setActivity] = useState<Activity[]>([])
  const [comment, setComment] = useState('')
  const [pop, setPop] = useState<'none' | 'members' | 'labels' | 'due' | 'contacts' | 'attach' | 'checklist'>('none')
  // checklists já existentes no quadro, para copiar os itens (igual ao Trello)
  const [modelos, setModelos] = useState<ChecklistModelo[] | null>(null)
  const [clTitulo, setClTitulo] = useState('Checklist')
  const [clCopiarDe, setClCopiarDe] = useState('')
  const [contacts, setContacts] = useState<{ id: string; name: string; phone?: string; source?: string }[] | null>(null)
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
  // checklists ficam em board_activity (kind 'checklist'), um registro por checklist
  const checklists = activity.filter(a => a.kind === 'checklist').map(a => {
    let parsed: Checklist = { title: 'Checklist', items: [] }
    try {
      const v = JSON.parse(a.text)
      if (v && typeof v === 'object') parsed = { title: String(v.title || 'Checklist'), items: Array.isArray(v.items) ? v.items : [] }
    } catch { /* registro corrompido — mostra vazio */ }
    return { act: a, ...parsed }
  }).reverse() // mais antigos primeiro
  const state: CardState = card.completed
    ? ((activity.find(a => a.kind === 'status')?.text as CardState) || 'done')
    : 'open'
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

  // carrega os clientes das fontes de dados dinâmicas (Leads + Contatos), só quando o popover abre
  useEffect(() => {
    if (pop !== 'contacts' || contacts !== null) return
    ;(async () => {
      const { data: tbls } = await supabase.from('db_tables').select('id, name, module_key')
        .eq('workspace_id', workspaceId)
        .or('module_key.in.(fonte-leads,fonte-contatos),name.in.(Leads,Contatos)')
      const ids = (tbls || []).map(t => t.id)
      if (!ids.length) { setContacts([]); return }
      const [{ data: cols }, { data: rws }] = await Promise.all([
        supabase.from('db_columns').select('*').in('table_id', ids).order('position'),
        supabase.from('db_rows').select('*').in('table_id', ids).order('position'),
      ])
      const colsByTable = new Map<string, DBColumn[]>()
      for (const c of (cols || []) as DBColumn[]) { const arr = colsByTable.get(c.table_id) || []; arr.push(c); colsByTable.set(c.table_id, arr) }
      const list = ((rws || []) as DBRow[]).map(r => {
        const tcols = colsByTable.get(r.table_id) || []
        const phoneCol = tcols.find(c => c.type === 'phone')
        return {
          id: r.id,
          name: primaryValue(r, tcols),
          phone: phoneCol ? String(r.data[phoneCol.id] ?? '') : '',
          source: (tbls || []).find(t => t.id === r.table_id)?.name,
        }
      }).filter(x => x.name && x.name !== '(sem título)')
      list.sort((a, b) => a.name.localeCompare(b.name))
      setContacts(list)
    })()
  }, [pop, contacts, supabase, workspaceId])

  // checklists dos outros cartões (modelos para copiar), carregadas só quando o menu abre
  useEffect(() => {
    if (pop !== 'checklist' || modelos !== null) return
    ;(async () => {
      const { data: acts } = await supabase.from('board_activity').select('id, card_id, text').eq('kind', 'checklist')
      const ids = [...new Set((acts || []).map(a => a.card_id as string))]
      const { data: cds } = ids.length
        ? await supabase.from('board_cards').select('id, title').in('id', ids)
        : { data: [] as { id: string; title: string }[] }
      const tituloDoCartao = new Map((cds || []).map(c => [c.id as string, (c.title as string) || '(sem título)']))
      const list: ChecklistModelo[] = []
      for (const a of acts || []) {
        // cartões de outro workspace não voltam do board_cards (RLS) — ficam de fora
        const cartao = tituloDoCartao.get(a.card_id as string)
        if (!cartao) continue
        try {
          const v = JSON.parse(a.text as string)
          const itens = (Array.isArray(v?.items) ? v.items : [])
            .map((i: { text?: string }) => String(i?.text || '').trim()).filter(Boolean)
          if (itens.length) list.push({ id: a.id as string, cartao, titulo: String(v?.title || 'Checklist'), itens })
        } catch { /* registro corrompido — ignora */ }
      }
      list.sort((a, b) => a.cartao.localeCompare(b.cartao) || a.titulo.localeCompare(b.titulo))
      setModelos(list)
    })()
  }, [pop, modelos, supabase])

  async function toggleContact(cid: string, name: string) {
    const existing = activity.find(a => a.kind === 'contact' && safeParse(a.text)?.contactId === cid)
    if (existing) await supabase.from('board_activity').delete().eq('id', existing.id)
    else await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'contact', text: JSON.stringify({ contactId: cid, name }) })
    refreshActivity()
  }

  /**
   * Manda a tarefa encerrada para o arquivo (ou tira de lá).
   *
   * Sai do quadro na hora, sem esperar os 45 dias — o cartão continua no banco,
   * na ficha do cliente e no botão "mostrar" do topo do quadro.
   */
  async function arquivar(sim: boolean) {
    const arquivado_em = sim ? new Date().toISOString() : null
    patchCard(card.id, { arquivado_em })
    const { error } = await supabase.from('board_cards').update({ arquivado_em }).eq('id', card.id)
    if (error) { patchCard(card.id, { arquivado_em: card.arquivado_em ?? null }); alert(`Não consegui arquivar: ${error.message}`); return }
    await log(card.id, 'event', sim ? 'arquivou a tarefa' : 'tirou a tarefa do arquivo')
    refreshActivity()
    if (sim) onClose()
  }

  /** conclui/cancela/reabre a tarefa — fechada, ela some da ficha do cliente */
  async function setCardState(next: CardState) {
    const completed = next !== 'open'
    // Reabrir tira do arquivo: trabalho vivo não fica na gaveta. Vai explícito
    // no UPDATE porque o trigger sozinho não resolveria o caso de reabrir um
    // cartão que continua parado na coluna "Finalizado" — para ele a tarefa
    // seguiria encerrada, e o cartão voltaria arquivado no próximo F5.
    const patch = completed ? { completed } : { completed, arquivado_em: null }
    patchCard(card.id, patch)
    await supabase.from('board_cards').update(patch).eq('id', card.id)
    await supabase.from('board_activity').delete().eq('card_id', card.id).eq('kind', 'status')
    if (completed) await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'status', text: next })
    await log(card.id, 'event', next === 'done' ? 'concluiu a tarefa' : next === 'canceled' ? 'cancelou a tarefa' : 'reabriu a tarefa')
    refreshActivity()
  }

  // ---------- checklists ----------
  async function saveChecklist(actId: string, cl: Checklist) {
    setActivity(as => as.map(a => a.id === actId ? { ...a, text: JSON.stringify(cl) } : a))
    await supabase.from('board_activity').update({ text: JSON.stringify(cl) }).eq('id', actId)
  }
  /** cria a checklist, opcionalmente copiando os itens de outra já existente */
  async function addChecklist() {
    const modelo = modelos?.find(m => m.id === clCopiarDe)
    const cl: Checklist = {
      title: clTitulo.trim() || 'Checklist',
      // itens copiados entram desmarcados — a checklist velha vira modelo, não histórico
      items: (modelo?.itens || []).map(text => ({ id: crypto.randomUUID(), text, done: false })),
    }
    setPop('none'); setClTitulo('Checklist'); setClCopiarDe('')
    setModelos(null) // a nova checklist também vira modelo na próxima abertura
    await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'checklist', text: JSON.stringify(cl) })
    refreshActivity()
  }
  async function removeChecklist(actId: string) {
    if (!confirm('Excluir esta checklist?')) return
    setActivity(as => as.filter(a => a.id !== actId))
    await supabase.from('board_activity').delete().eq('id', actId)
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        const up = await uploadFile(file, `board/${card.id}`)
        await supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'attachment', text: JSON.stringify({ name: file.name, url: up.url, path: up.path }) })
      } catch (e) {
        alert(`Falha ao enviar "${file.name}": ${(e as Error).message}`)
      }
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
    if (p?.path) { try { await deleteFile(p.path) } catch { /* noop */ } }
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
  async function moveToList(listId: string) {
    // mesma regra do arrastar no quadro: voltar para coluna de trabalho tira do
    // arquivo (quem zera no banco é o trigger board_cards_encerramento)
    const volta = !card.completed && !listaEncerra(lists.find(l => l.id === listId)?.title)
    patchCard(card.id, { list_id: listId, ...(volta ? { arquivado_em: null } : {}) })
    await supabase.from('board_cards').update({ list_id: listId }).eq('id', card.id)
    await log(card.id, 'event', `moveu para "${lists.find(l => l.id === listId)?.title}"`)
    refreshActivity()
  }

  const dueLocal = card.due_date ? new Date(card.due_date).toISOString().slice(0, 16) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-6xl my-8 rounded-2xl animate-fade-in" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <select value={card.list_id} onChange={e => moveToList(e.target.value)} className="text-xs px-2 py-1 rounded-md outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {state === 'open' ? (
              <>
                <button onClick={() => setCardState('done')} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                </button>
                <button onClick={() => setCardState('canceled')} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                  <Ban className="w-3.5 h-3.5" /> Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
                  style={{ background: state === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: state === 'done' ? '#34D399' : '#F87171' }}>
                  {state === 'done' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Concluída</> : <><Ban className="w-3.5 h-3.5" /> Cancelada</>}
                </span>
                <button onClick={() => setCardState('open')} className="px-2 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Reabrir</button>
              </>
            )}
            {/* arquivar é só para tarefa encerrada: no banco, trabalho vivo não
                fica na gaveta (o trigger zera o carimbo) */}
            {card.arquivado_em ? (
              <button onClick={() => arquivar(false)} title={`Arquivada em ${new Date(card.arquivado_em).toLocaleDateString('pt-BR')}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                <ArchiveRestore className="w-3.5 h-3.5" /> Desarquivar
              </button>
            ) : (encerrada || state !== 'open') && (
              <button onClick={() => arquivar(true)} title="Sai do quadro agora; continua no sistema e na ficha do cliente"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                <Archive className="w-3.5 h-3.5" /> Arquivar
              </button>
            )}
            {isAdmin && <button onClick={deleteCard} className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: '#F87171' }}><Trash2 className="w-4 h-4" /></button>}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* 3/5 + 2/5: o histórico ganha mais largura que o antigo 1/3, para o
            comentário não quebrar em muitas linhas. Abaixo de lg, empilha. */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 p-5">
          {/* coluna principal */}
          <div className="lg:col-span-3 space-y-5">
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              className="w-full bg-transparent text-lg font-semibold outline-none" style={{ color: 'var(--notion-text)' }} />

            {/* membros + etiquetas + prazo (chips) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex -space-x-1.5">
                {card.members.map(mid => { const m = member(mid); return m ? <MemberAvatar key={mid} member={m} size={32} ring="var(--notion-bg-2)" /> : null })}
              </div>
              <button onClick={() => setPop(pop === 'members' ? 'none' : 'members')} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Plus className="w-4 h-4" /></button>
              <div className="flex flex-wrap gap-1.5">
                {card.labels.map(lid => { const l = labels.find(x => x.id === lid); return l ? <span key={lid} className="px-2 py-1 rounded text-xs font-medium" style={{ background: l.color, color: '#fff' }}>{l.name}</span> : null })}
              </div>
              <button onClick={() => setPop(pop === 'labels' ? 'none' : 'labels')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><TagIcon className="w-3.5 h-3.5" /> Etiquetas</button>
              <button onClick={() => setPop(pop === 'contacts' ? 'none' : 'contacts')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Users className="w-3.5 h-3.5" /> Cliente</button>
              <button onClick={() => setPop(pop === 'attach' ? 'none' : 'attach')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><Paperclip className="w-3.5 h-3.5" /> Anexo</button>
              <button onClick={() => setPop(pop === 'checklist' ? 'none' : 'checklist')} className="px-2 py-1 rounded-md text-xs flex items-center gap-1" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}><CheckSquare className="w-3.5 h-3.5" /> Checklist</button>

              {/* Clientes vinculados na MESMA linha dos botões, e depois deles.
                  Era um bloco próprio abaixo, com título "Clientes"; o escritório
                  pediu aqui em cima, junto do resto da identificação da tarefa.
                  Ficam no fim da fila para os botões não dançarem de lugar cada
                  vez que um cliente entra ou sai. */}
              {linkedContacts.map(c => (
                <span key={c.contactId} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md text-xs" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: 'var(--notion-accent)', color: '#fff' }}>{c.name[0]?.toUpperCase()}</span>
                  {c.name}
                  <button onClick={() => toggleContact(c.contactId, c.name)} title="Desvincular cliente" className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>

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
                  {/* alto por padrão e ainda arrastável na vertical (resize-y) */}
                  <textarea autoFocus value={desc} onChange={e => setDesc(e.target.value)} rows={12}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y min-h-[160px] leading-relaxed"
                    style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
                  <div className="flex gap-2 mt-2"><button onClick={saveDesc} className="px-3 py-1 rounded text-xs font-medium" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Salvar</button><button onClick={() => { setEditDesc(false); setDesc(card.description || '') }} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--notion-text-3)' }}>Cancelar</button></div>
                </div>
              ) : (
                // leitura: cresce com o texto; a altura mínima evita o salto ao entrar em edição
                <div onClick={() => setEditDesc(true)} className="px-3 py-2 rounded-lg text-sm cursor-text whitespace-pre-wrap break-words min-h-[160px] leading-relaxed" style={{ background: 'var(--notion-bg-3)', color: card.description ? 'var(--notion-text-2)' : 'var(--notion-text-3)' }}>
                  {card.description || 'Adicionar uma descrição...'}
                </div>
              )}
            </div>

            {/* checklists */}
            {checklists.map(cl => (
              <ChecklistBlock key={cl.act.id} title={cl.title} items={cl.items}
                onSave={next => saveChecklist(cl.act.id, next)} onDelete={() => removeChecklist(cl.act.id)} />
            ))}

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
          <div className="lg:col-span-2 flex flex-col min-w-0">
            <span className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{ color: 'var(--notion-text-3)' }}><MessageSquare className="w-3.5 h-3.5" /> Histórico</span>
            <div className="flex gap-2 mb-3">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} placeholder="Escrever comentário..." className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />
              <button onClick={addComment} className="px-2 rounded-lg text-xs" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Enviar</button>
            </div>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {history.length === 0 && <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Sem atividades ainda.</p>}
              {history.map(a => { const m = member(a.user_id || '') ; const cor = personColor(a.user_id || ''); return (
                <div key={a.id} className="flex gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0" style={{ background: `${cor}33`, color: cor, border: `1px solid ${cor}66` }}>{initials(m?.full_name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: 'var(--notion-text-2)' }}>
                      <span className="font-medium" style={{ color: 'var(--notion-text)' }}>{m?.full_name || 'Usuário'}</span>{' '}
                      {a.kind === 'event' ? a.text : ''}
                    </p>
                    {/* preserva as quebras digitadas e corta palavra/URL longa em vez de estourar a coluna */}
                    {a.kind === 'comment' && <p className="text-xs mt-0.5 px-2 py-1.5 rounded-lg whitespace-pre-wrap break-words" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }}>{a.text}</p>}
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
                <MemberAvatar member={m} size={24} />
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
              const nq = contactQuery.toLowerCase().trim()
              const filtered = contacts.filter(c => !nq || (c.name || '').toLowerCase().includes(nq) || (c.phone || '').toLowerCase().includes(nq))
              if (contacts.length === 0) return <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhum registro nas fontes Leads/Contatos.</p>
              if (filtered.length === 0) return <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhum cliente encontrado.</p>
              return (
                <div className="space-y-0.5">
                  {filtered.slice(0, 100).map(c => {
                    const on = linkedContacts.some(x => x.contactId === c.id)
                    return (
                      <button key={c.id} onClick={() => toggleContact(c.id, c.name)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0" style={{ background: 'var(--notion-accent)', color: '#fff' }}>{(c.name || '?')[0]?.toUpperCase()}</span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block truncate">{c.name || '(sem nome)'}</span>
                          {(c.phone || c.source) && <span className="block truncate text-[10px]" style={{ color: 'var(--notion-text-3)' }}>{[c.phone, c.source].filter(Boolean).join(' · ')}</span>}
                        </span>
                        {on && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </Popover>
        )}
        {pop === 'checklist' && (
          <Popover title="Adicionar Checklist" onClose={() => setPop('none')}>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Título</label>
            <input autoFocus value={clTitulo} onChange={e => setClTitulo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addChecklist() }}
              className="w-full px-2 py-1.5 mb-3 rounded text-xs outline-none"
              style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />

            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>Copiar itens de...</label>
            {modelos === null ? (
              <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Carregando checklists...</p>
            ) : (
              <>
                <select value={clCopiarDe} onChange={e => setClCopiarDe(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
                  <option value="">(nenhum)</option>
                  {modelos.map(m => (
                    <option key={m.id} value={m.id}>{m.cartao} — {m.titulo} ({m.itens.length})</option>
                  ))}
                </select>
                {modelos.length === 0 && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--notion-text-3)' }}>
                    Nenhuma checklist com itens ainda — a primeira que você criar já fica disponível aqui.
                  </p>
                )}
                {clCopiarDe && (
                  <div className="mt-2 px-2 py-1.5 rounded max-h-28 overflow-y-auto" style={{ background: 'var(--notion-bg-4)' }}>
                    {modelos.find(m => m.id === clCopiarDe)?.itens.map((t, i) => (
                      <p key={i} className="text-[11px] truncate" style={{ color: 'var(--notion-text-2)' }}>• {t}</p>
                    ))}
                    <p className="text-[10px] mt-1" style={{ color: 'var(--notion-text-3)' }}>Os itens vêm desmarcados.</p>
                  </div>
                )}
              </>
            )}

            <button onClick={addChecklist}
              className="w-full mt-3 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium"
              style={{ background: 'var(--notion-accent)', color: '#fff' }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
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

/**
 * Checklist dentro do cartão: o usuário escreve um item e ele vira caixa de seleção.
 * O bloco todo é salvo como um JSON em board_activity (kind 'checklist').
 */
function ChecklistBlock({ title, items, onSave, onDelete }: {
  title: string; items: ChecklistItem[]; onSave: (cl: Checklist) => void; onDelete: () => void
}) {
  const [novo, setNovo] = useState('')
  const [adding, setAdding] = useState(false)
  const done = items.filter(i => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  const addItem = () => {
    const text = novo.trim(); if (!text) { setAdding(false); return }
    onSave({ title, items: [...items, { id: crypto.randomUUID(), text, done: false }] })
    setNovo('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
        <input defaultValue={title} onBlur={e => { const t = e.target.value.trim() || 'Checklist'; if (t !== title) onSave({ title: t, items }) }}
          className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: 'var(--notion-text)' }} />
        <button onClick={onDelete} className="px-2 py-1 rounded text-xs hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>Excluir</button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-mono w-8 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }}>{pct}%</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--notion-bg-4)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#34D399' : 'var(--notion-accent)' }} />
        </div>
      </div>

      <div className="space-y-0.5">
        {items.map(item => (
          <div key={item.id} className="group/item flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--notion-bg-3)]">
            <button onClick={() => onSave({ title, items: items.map(i => i.id === item.id ? { ...i, done: !i.done } : i) })}
              className="w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: item.done ? 'var(--notion-accent)' : 'transparent', border: item.done ? 'none' : '1.5px solid var(--notion-border)' }}>
              {item.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </button>
            <input defaultValue={item.text}
              onBlur={e => { const t = e.target.value.trim(); if (t && t !== item.text) onSave({ title, items: items.map(i => i.id === item.id ? { ...i, text: t } : i) }) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: item.done ? 'var(--notion-text-3)' : 'var(--notion-text)', textDecoration: item.done ? 'line-through' : 'none' }} />
            <button onClick={() => onSave({ title, items: items.filter(i => i.id !== item.id) })}
              className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded flex-shrink-0" style={{ color: 'var(--notion-text-3)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <input autoFocus value={novo} onChange={e => setNovo(e.target.value)}
          onBlur={addItem}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } if (e.key === 'Escape') { setNovo(''); setAdding(false) } }}
          placeholder="Adicionar um item..."
          className="w-full mt-1 px-2 py-1.5 rounded-md text-sm outline-none"
          style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
      ) : (
        <button onClick={() => setAdding(true)} className="mt-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>
          <Plus className="w-3.5 h-3.5" /> Adicionar um item
        </button>
      )}
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
