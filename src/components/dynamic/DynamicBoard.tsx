'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { DBColumn, DBRow, DataSource, SelectOption, formatNumber, OPTION_COLORS } from '@/types/dynamic'
import {
  ViewConfig, FilterCond, ColorRule, FILTER_OPS,
  matchesFilters, applySort, rowColor, loadViewConfig, saveViewConfig,
} from '@/lib/view-config'
import { DynamicTable } from './DynamicTable'
import { Cell } from './Cell'
import { RecordPanel as RelationRecordPanel } from './RecordPanel'
import { TypeIcon } from './TypePicker'
import { COLUMN_TYPES } from '@/types/dynamic'
import {
  LayoutGrid, Table2, Plus, X, MessageSquare, List as ListIcon, Image as ImageIcon, Calendar as CalIcon,
  BarChart3, LayoutDashboard, GanttChart, Rss, Map as MapIcon, MoreHorizontal, Pencil, Copy, Trash2, Repeat, Check,
  Search, SlidersHorizontal, Eye, EyeOff,
  ChevronRight, Filter, ArrowUpDown, Layers, Palette, Link2, Database,
} from 'lucide-react'

function MenuItem({ icon: Icon, label, onClick, danger, arrow }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; danger?: boolean; arrow?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: danger ? '#F87171' : 'var(--notion-text)' }}>
      <Icon className="w-3.5 h-3.5" /> <span className="flex-1 text-left">{label}</span>
      {arrow && <span style={{ color: 'var(--notion-text-3)' }}>›</span>}
    </button>
  )
}

// Linha do menu de configurações da visualização (estilo Notion): rótulo à esquerda,
// valor atual à direita, seta para submenu — ou etiqueta "em breve" quando indisponível.
function SettingsRow({ icon: Icon, label, value, onClick, arrow, soon }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string; value?: string; onClick?: () => void; arrow?: boolean; soon?: boolean
}) {
  return (
    <button onClick={soon ? undefined : onClick} disabled={soon}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:opacity-60"
      style={{ color: 'var(--notion-text)' }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
      <span className="flex-1 text-left truncate">{label}</span>
      {value && <span className="text-[11px] truncate max-w-[96px]" style={{ color: 'var(--notion-text-3)' }}>{value}</span>}
      {soon && <span className="text-[9px] px-1 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}>em breve</span>}
      {arrow && !soon && <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />}
    </button>
  )
}

interface Member { id: string; full_name: string }
interface RowComment { id: string; user_id: string | null; text: string; created_at: string }
export interface DBView { id: string; name: string; type: string; position: number }

const VIEW_TYPES: { type: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; available: boolean }[] = [
  { type: 'table', label: 'Tabela', icon: Table2, available: true },
  { type: 'board', label: 'Quadro', icon: LayoutGrid, available: true },
  { type: 'gallery', label: 'Galeria', icon: ImageIcon, available: true },
  { type: 'list', label: 'Lista', icon: ListIcon, available: true },
  { type: 'calendar', label: 'Calendário', icon: CalIcon, available: true },
  { type: 'chart', label: 'Gráfico', icon: BarChart3, available: false },
  { type: 'panel', label: 'Painel', icon: LayoutDashboard, available: false },
  { type: 'timeline', label: 'Cronograma', icon: GanttChart, available: false },
  { type: 'feed', label: 'Feed', icon: Rss, available: false },
  { type: 'map', label: 'Mapa', icon: MapIcon, available: false },
]
const viewMeta = (t: string) => VIEW_TYPES.find(v => v.type === t) || VIEW_TYPES[0]

export function DynamicBoard({ tableId, initialColumns, initialRows, sources, members, userId, views: initialViews = [], groupColId }: {
  tableId: string; initialColumns: DBColumn[]; initialRows: DBRow[]; sources: DataSource[]; members: Member[]; userId: string; views?: DBView[]; groupColId?: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [columns, setColumns] = useState(initialColumns)
  const [rows, setRows] = useState(initialRows)
  const [views, setViews] = useState<DBView[]>(initialViews.length ? initialViews : [{ id: tableId, name: 'Tabela', type: 'table', position: 0 }])
  const [activeId, setActiveId] = useState(views[0]?.id)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [viewMenu, setViewMenu] = useState<string | null>(null)
  const [addingView, setAddingView] = useState(false)
  const [renamingView, setRenamingView] = useState<string | null>(null)
  const [exibirSub, setExibirSub] = useState(false)
  const [q, setQ] = useState('')
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgTab, setCfgTab] = useState<'menu' | 'layout' | 'visibility' | 'filter' | 'sort' | 'group' | 'color'>('menu')
  const [copied, setCopied] = useState(false)
  // configuração da visualização (Filtrar/Ordenar/Agrupar/Cor) — carregada/persistida por view em localStorage.
  // recarrega ao trocar de view ajustando o estado durante o render (padrão sancionado do React, sem useEffect).
  const [vcfg, setVcfg] = useState<ViewConfig>(() => loadViewConfig(activeId || ''))
  const [vcfgFor, setVcfgFor] = useState(activeId)
  if (activeId !== vcfgFor) { setVcfgFor(activeId); setVcfg(loadViewConfig(activeId || '')) }
  const patchVcfg = (patch: Partial<ViewConfig>) => setVcfg(prev => {
    const next = { ...prev, ...patch }
    saveViewConfig(activeId || '', next)
    return next
  })

  useEffect(() => { setColumns(initialColumns) }, [initialColumns])
  useEffect(() => { setRows(initialRows) }, [initialRows])
  useEffect(() => { if (initialViews.length) { setViews(initialViews); setActiveId(a => initialViews.some(v => v.id === a) ? a : initialViews[0]?.id) } }, [initialViews])

  const activeView = views.find(v => v.id === activeId) || views[0]

  async function addView(type: string) {
    setAddingView(false)
    const meta = viewMeta(type)
    const { data } = await supabase.from('db_views').insert({ table_id: tableId, name: meta.label, type, position: views.length }).select('*').single()
    if (data) { setViews(vs => [...vs, data as DBView]); setActiveId(data.id) }
  }
  async function renameView(id: string, name: string) {
    setRenamingView(null); setViews(vs => vs.map(v => v.id === id ? { ...v, name } : v))
    await supabase.from('db_views').update({ name }).eq('id', id)
  }
  async function changeViewType(id: string, type: string) {
    setViewMenu(null); setExibirSub(false); setViews(vs => vs.map(v => v.id === id ? { ...v, type } : v))
    await supabase.from('db_views').update({ type }).eq('id', id)
  }
  async function duplicateView(v: DBView) {
    setViewMenu(null)
    const { data } = await supabase.from('db_views').insert({ table_id: tableId, name: `${v.name} (cópia)`, type: v.type, position: views.length }).select('*').single()
    if (data) { setViews(vs => [...vs, data as DBView]); setActiveId(data.id) }
  }
  async function deleteView(id: string) {
    if (views.length <= 1) { alert('Mantenha ao menos uma visualização.'); return }
    if (!confirm('Excluir esta visualização?')) return
    setViewMenu(null)
    const next = views.filter(v => v.id !== id)
    setViews(next); if (activeId === id) setActiveId(next[0]?.id)
    await supabase.from('db_views').delete().eq('id', id)
  }

  const ordered = [...columns].sort((a, b) => a.position - b.position)
  const effGroupColId = vcfg.groupColId || groupColId
  const groupCol = (effGroupColId ? ordered.find(c => c.id === effGroupColId) : null) || ordered.find(c => c.type === 'status') || ordered.find(c => c.type === 'select')
  const titleCol = ordered.find(c => c.type === 'text') || ordered[0]
  const peopleCol = ordered.find(c => c.type === 'people')
  const cardCols = ordered.filter(c => c !== groupCol && c !== titleCol && c !== peopleCol && !['files'].includes(c.type) && !c.hidden)
  const opt = (col: DBColumn, v: unknown) => (col.config.options || []).find(o => o.id === v || o.label === v)

  // pipeline das views não-tabela: filtros (Filtrar) → busca (lupa) → ordenação (Ordenar)
  const nrm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const filteredRows = vcfg.filters.length ? rows.filter(r => matchesFilters(r, columns, vcfg.filters)) : rows
  const searchedRows = q.trim() ? filteredRows.filter(r => {
    const needle = nrm(q)
    return ordered.some(c => {
      const v = r.data[c.id]
      if (v == null || v === '') return false
      if (['select', 'status', 'multi_select'].includes(c.type)) {
        const opts = c.config.options || []
        return (Array.isArray(v) ? v : [v]).some(id => { const o = opts.find(x => x.id === id || x.label === id); return o && nrm(o.label).includes(needle) })
      }
      return nrm(Array.isArray(v) ? v.join(' ') : String(v)).includes(needle)
    })
  }) : filteredRows
  const shown = applySort(searchedRows, columns, vcfg.sort)
  // cor condicional aplicada aos cards (board/galeria/lista)
  const cardColor = (r: DBRow) => vcfg.colorRules.length ? rowColor(r, columns, vcfg.colorRules) : null

  // visibilidade das propriedades no card (usa o campo hidden da coluna)
  async function toggleColHidden(colId: string) {
    const col = columns.find(c => c.id === colId); if (!col) return
    const hidden = !col.hidden
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, hidden } : c))
    await supabase.from('db_columns').update({ hidden }).eq('id', colId)
  }
  const member = (id: string) => members.find(m => m.id === id)

  async function updateCell(rowId: string, colId: string, value: unknown) {
    const row = rows.find(r => r.id === rowId)!
    const data = { ...row.data, [colId]: value }
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, data, updated_at: new Date().toISOString(), updated_by: userId } : r))
    await supabase.from('db_rows').update({ data, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', rowId)
  }
  async function updateColumnOptions(colId: string, options: SelectOption[]) {
    const col = columns.find(c => c.id === colId)!
    const config = { ...col.config, options }
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, config } : c))
    await supabase.from('db_columns').update({ config }).eq('id', colId)
  }
  async function moveTo(rowId: string, optValue: string) {
    if (!groupCol) return
    await updateCell(rowId, groupCol.id, optValue)
    setDragId(null); setOverCol(null)
  }
  async function addCard(optValue: string) {
    if (!groupCol) return
    const { data } = await supabase.from('db_rows').insert({ table_id: tableId, data: { [groupCol.id]: optValue }, position: rows.length, created_by: userId, updated_by: userId }).select('*').single()
    if (data) { setRows(rs => [...rs, data as DBRow]); setOpenRow(data.id) }
  }

  function cardField(col: DBColumn, row: DBRow) {
    const v = row.data[col.id]
    if (v == null || v === '') return null
    if (col.type === 'select' || col.type === 'status') {
      const o = opt(col, v); if (!o) return null
      return <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: `${o.color}22`, color: o.color }}>{o.label}</span>
    }
    if (col.type === 'number') return <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>{formatNumber(v, col.config.format)}</span>
    if (col.type === 'date') return <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>{new Date(String(v) + (String(v).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')}</span>
    return <span className="text-xs block truncate" style={{ color: 'var(--notion-text-2)' }}>{Array.isArray(v) ? v.join(', ') : String(v)}</span>
  }

  const current = rows.find(r => r.id === openRow) || null

  const vt = activeView?.type || 'table'

  return (
    <div>
      {/* Barra de visualizações */}
      <div className="flex items-center gap-1 mb-4 border-b pb-2 relative" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {views.map(v => {
          const Icon = viewMeta(v.type).icon
          const isActive = v.id === activeView?.id
          return (
            <div key={v.id} className="relative">
              {renamingView === v.id ? (
                <input autoFocus defaultValue={v.name} onBlur={e => renameView(v.id, e.target.value.trim() || v.name)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingView(null) }}
                  className="px-2 py-1 rounded text-xs w-28 outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
              ) : (
                <button onClick={() => { if (isActive) setViewMenu(viewMenu === v.id ? null : v.id); else setActiveId(v.id) }}
                  onContextMenu={e => { e.preventDefault(); setActiveId(v.id); setViewMenu(v.id) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{ background: isActive ? 'var(--notion-bg-3)' : 'transparent', color: isActive ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
                  <Icon className="w-3.5 h-3.5" /> {v.name}
                  {isActive && <MoreHorizontal className="w-3 h-3 ml-0.5" style={{ color: 'var(--notion-text-3)' }} />}
                </button>
              )}
              {viewMenu === v.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setViewMenu(null); setExibirSub(false) }} />
                  <div className="absolute left-0 top-9 z-50 w-52 rounded-lg p-1 shadow-2xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                    {exibirSub ? (
                      <>
                        <button onClick={() => setExibirSub(false)} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Exibir como</button>
                        {VIEW_TYPES.map(t => (
                          <button key={t.type} disabled={!t.available} onClick={() => changeViewType(v.id, t.type)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] disabled:opacity-40" style={{ color: 'var(--notion-text)' }}>
                            <t.icon className="w-3.5 h-3.5" /> <span className="flex-1 text-left">{t.label}</span>
                            {v.type === t.type && <Check className="w-3 h-3" />}{!t.available && <span className="text-[9px]" style={{ color: 'var(--notion-text-3)' }}>em breve</span>}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <MenuItem icon={Pencil} label="Renomear" onClick={() => { setRenamingView(v.id); setViewMenu(null) }} />
                        <MenuItem icon={Repeat} label="Exibir como" onClick={() => setExibirSub(true)} arrow />
                        <MenuItem icon={Copy} label="Duplicar visualização" onClick={() => duplicateView(v)} />
                        <MenuItem icon={Trash2} label="Excluir visualização" onClick={() => deleteView(v.id)} danger />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        {/* + adicionar visualização */}
        <div className="relative">
          <button onClick={() => setAddingView(a => !a)} className="p-1.5 rounded-md hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }} title="Adicionar uma nova visualização">
            <Plus className="w-4 h-4" />
          </button>
          {addingView && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAddingView(false)} />
              <div className="absolute left-0 top-9 z-50 w-72 rounded-lg p-2 shadow-2xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                <p className="text-[11px] font-medium px-1 pb-2" style={{ color: 'var(--notion-text-2)' }}>Adicionar uma nova visualização</p>
                <div className="grid grid-cols-5 gap-1">
                  {VIEW_TYPES.map(t => (
                    <button key={t.type} disabled={!t.available} onClick={() => addView(t.type)}
                      className="flex flex-col items-center gap-1 px-1 py-2 rounded-md text-[10px] hover:bg-[var(--notion-bg-4)] disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: 'var(--notion-text-2)' }}>
                      <t.icon className="w-4 h-4" style={{ color: 'var(--notion-text)' }} /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {/* busca (lupa) + visibilidade das propriedades */}
        <div className="flex-1" />
        <div className="relative flex items-center gap-1">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className="bg-transparent text-xs outline-none w-28" style={{ color: 'var(--notion-text)' }} />
            {q && <button onClick={() => setQ('')} style={{ color: 'var(--notion-text-3)' }}><X className="w-3 h-3" /></button>}
          </div>
          <button onClick={() => { setCfgOpen(o => !o); setCfgTab('menu') }} title="Configurações da visualização" className="p-1.5 rounded-md hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          {cfgOpen && (() => {
            const sourceName = sources.find(s => s.id === tableId)?.name || activeView?.name || 'Fonte'
            const visibleCount = ordered.filter(c => !c.hidden).length
            const propList = ordered.filter(c => c !== titleCol)
            const copyLink = async () => {
              try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
            }
            const cols = ordered
            const colName = (id: string) => cols.find(c => c.id === id)?.name || '—'
            const selCls = 'w-full px-2 py-1.5 rounded text-xs outline-none'
            const selSt: React.CSSProperties = { background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }
            const addFilter = () => patchVcfg({ filters: [...vcfg.filters, { id: crypto.randomUUID(), colId: cols[0]?.id || '', op: 'contains', value: '' }] })
            const setFilter = (id: string, patch: Partial<FilterCond>) => patchVcfg({ filters: vcfg.filters.map(f => f.id === id ? { ...f, ...patch } : f) })
            const delFilter = (id: string) => patchVcfg({ filters: vcfg.filters.filter(f => f.id !== id) })
            const addColor = () => patchVcfg({ colorRules: [...vcfg.colorRules, { id: crypto.randomUUID(), colId: cols[0]?.id || '', op: 'contains', value: '', color: OPTION_COLORS[5].hex }] })
            const setColorRule = (id: string, patch: Partial<ColorRule>) => patchVcfg({ colorRules: vcfg.colorRules.map(r => r.id === id ? { ...r, ...patch } : r) })
            const delColor = (id: string) => patchVcfg({ colorRules: vcfg.colorRules.filter(r => r.id !== id) })
            const backBtn = (label: string) => (
              <button onClick={() => setCfgTab('menu')} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← {label}</button>
            )
            return (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setCfgOpen(false); setCfgTab('menu') }} />
                <div className="absolute right-0 top-9 z-50 w-72 rounded-lg p-1.5 shadow-2xl max-h-[70vh] overflow-y-auto" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                  {cfgTab === 'layout' ? (
                    <>
                      {backBtn('Layout')}
                      {VIEW_TYPES.map(t => (
                        <button key={t.type} disabled={!t.available} onClick={() => changeViewType(activeView?.id || '', t.type)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] disabled:opacity-40" style={{ color: 'var(--notion-text)' }}>
                          <t.icon className="w-3.5 h-3.5" /> <span className="flex-1 text-left">{t.label}</span>
                          {vt === t.type && <Check className="w-3 h-3" />}{!t.available && <span className="text-[9px]" style={{ color: 'var(--notion-text-3)' }}>em breve</span>}
                        </button>
                      ))}
                    </>
                  ) : cfgTab === 'visibility' ? (
                    <>
                      {backBtn('Visibilidade da propriedade')}
                      <p className="text-[10px] uppercase tracking-wider px-2 pb-1.5" style={{ color: 'var(--notion-text-3)' }}>Propriedades exibidas</p>
                      {propList.map(c => (
                        <button key={c.id} onClick={() => toggleColHidden(c.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                          <TypeIcon icon={c.config.icon || COLUMN_TYPES.find(t => t.type === c.type)?.icon || 'Type'} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
                          <span className="flex-1 text-left truncate">{c.name}</span>
                          {c.hidden ? <EyeOff className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} /> : <Eye className="w-3.5 h-3.5" style={{ color: 'var(--notion-accent)' }} />}
                        </button>
                      ))}
                      {propList.length === 0 && <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhuma propriedade.</p>}
                    </>
                  ) : cfgTab === 'sort' ? (
                    <>
                      {backBtn('Ordenar')}
                      <label className="block text-[10px] uppercase tracking-wider px-2 pb-1" style={{ color: 'var(--notion-text-3)' }}>Propriedade</label>
                      <div className="px-1.5">
                        <select value={vcfg.sort?.colId || ''} onChange={e => patchVcfg({ sort: e.target.value ? { colId: e.target.value, dir: vcfg.sort?.dir || 'asc' } : null })} className={selCls} style={selSt}>
                          <option value="">— nenhuma —</option>
                          {cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {vcfg.sort && (
                          <div className="flex gap-1 mt-1.5">
                            {(['asc', 'desc'] as const).map(d => (
                              <button key={d} onClick={() => patchVcfg({ sort: { colId: vcfg.sort!.colId, dir: d } })}
                                className="flex-1 px-2 py-1.5 rounded text-xs" style={{ background: vcfg.sort!.dir === d ? 'var(--notion-accent)' : 'var(--notion-bg-4)', color: vcfg.sort!.dir === d ? '#fff' : 'var(--notion-text)' }}>
                                {d === 'asc' ? 'Crescente' : 'Decrescente'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : cfgTab === 'group' ? (
                    <>
                      {backBtn('Agrupar')}
                      <label className="block text-[10px] uppercase tracking-wider px-2 pb-1" style={{ color: 'var(--notion-text-3)' }}>Agrupar por</label>
                      <div className="px-1.5">
                        <select value={vcfg.groupColId || ''} onChange={e => patchVcfg({ groupColId: e.target.value || null })} className={selCls} style={selSt}>
                          <option value="">— nenhum —</option>
                          {cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <p className="text-[11px] px-1 pt-2 leading-relaxed" style={{ color: 'var(--notion-text-3)' }}>Na tabela, cria seções por valor. No quadro, define as colunas.</p>
                      </div>
                    </>
                  ) : cfgTab === 'filter' ? (
                    <>
                      {backBtn('Filtrar')}
                      {vcfg.filters.length === 0 && <p className="text-xs px-2 py-1.5" style={{ color: 'var(--notion-text-3)' }}>Nenhum filtro. Adicione um abaixo.</p>}
                      {vcfg.filters.map(f => (
                        <div key={f.id} className="mb-1.5 mx-1 p-1.5 rounded-md" style={{ background: 'var(--notion-bg-2)' }}>
                          <div className="flex items-center gap-1 mb-1">
                            <select value={f.colId} onChange={e => setFilter(f.id, { colId: e.target.value })} className="flex-1 px-1.5 py-1 rounded text-xs outline-none" style={selSt}>
                              {cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => delFilter(f.id)} className="p-1 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-3.5 h-3.5" /></button>
                          </div>
                          <select value={f.op} onChange={e => setFilter(f.id, { op: e.target.value as FilterCond['op'] })} className="w-full px-1.5 py-1 rounded text-xs outline-none mb-1" style={selSt}>
                            {FILTER_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                          </select>
                          {f.op !== 'empty' && f.op !== 'not_empty' && (
                            <input value={f.value} onChange={e => setFilter(f.id, { value: e.target.value })} placeholder="Valor"
                              className="w-full px-1.5 py-1 rounded text-xs outline-none" style={selSt} />
                          )}
                        </div>
                      ))}
                      <button onClick={addFilter} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-2)' }}>
                        <Plus className="w-3.5 h-3.5" /> Adicionar filtro
                      </button>
                    </>
                  ) : cfgTab === 'color' ? (
                    <>
                      {backBtn('Cor condicional')}
                      {vcfg.colorRules.length === 0 && <p className="text-xs px-2 py-1.5" style={{ color: 'var(--notion-text-3)' }}>Nenhuma regra. Linhas/cards ganham a cor da 1ª regra que casar.</p>}
                      {vcfg.colorRules.map(r => (
                        <div key={r.id} className="mb-1.5 mx-1 p-1.5 rounded-md" style={{ background: 'var(--notion-bg-2)' }}>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="w-4 h-4 rounded flex-shrink-0" style={{ background: r.color, border: '1px solid rgba(255,255,255,0.15)' }} />
                            <select value={r.colId} onChange={e => setColorRule(r.id, { colId: e.target.value })} className="flex-1 px-1.5 py-1 rounded text-xs outline-none" style={selSt}>
                              {cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => delColor(r.id)} className="p-1 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-3.5 h-3.5" /></button>
                          </div>
                          <select value={r.op} onChange={e => setColorRule(r.id, { op: e.target.value as ColorRule['op'] })} className="w-full px-1.5 py-1 rounded text-xs outline-none mb-1" style={selSt}>
                            {FILTER_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                          </select>
                          {r.op !== 'empty' && r.op !== 'not_empty' && (
                            <input value={r.value} onChange={e => setColorRule(r.id, { value: e.target.value })} placeholder="Valor"
                              className="w-full px-1.5 py-1 rounded text-xs outline-none mb-1.5" style={selSt} />
                          )}
                          <div className="flex flex-wrap gap-1">
                            {OPTION_COLORS.map(c => (
                              <button key={c.hex} onClick={() => setColorRule(r.id, { color: c.hex })} title={c.name}
                                className="w-4 h-4 rounded" style={{ background: c.hex, outline: r.color === c.hex ? '2px solid var(--notion-text)' : 'none', outlineOffset: '1px' }} />
                            ))}
                          </div>
                        </div>
                      ))}
                      <button onClick={addColor} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-2)' }}>
                        <Plus className="w-3.5 h-3.5" /> Adicionar regra
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] uppercase tracking-wider px-2 pt-1 pb-1.5" style={{ color: 'var(--notion-text-3)' }}>Ver configurações</p>
                      <SettingsRow icon={viewMeta(vt).icon} label="Layout" value={viewMeta(vt).label} arrow onClick={() => setCfgTab('layout')} />
                      <SettingsRow icon={Eye} label="Visibilidade da propriedade" value={String(visibleCount)} arrow onClick={() => setCfgTab('visibility')} />
                      <SettingsRow icon={Filter} label="Filtrar" value={vcfg.filters.length ? String(vcfg.filters.length) : undefined} arrow onClick={() => setCfgTab('filter')} />
                      <SettingsRow icon={ArrowUpDown} label="Ordenar" value={vcfg.sort ? colName(vcfg.sort.colId) : undefined} arrow onClick={() => setCfgTab('sort')} />
                      <SettingsRow icon={Layers} label="Agrupar" value={vcfg.groupColId ? colName(vcfg.groupColId) : undefined} arrow onClick={() => setCfgTab('group')} />
                      <SettingsRow icon={Palette} label="Cor condicional" value={vcfg.colorRules.length ? String(vcfg.colorRules.length) : undefined} arrow onClick={() => setCfgTab('color')} />
                      <SettingsRow icon={copied ? Check : Link2} label={copied ? 'Link copiado!' : 'Copiar link para a visualização'} onClick={copyLink} />
                      <div className="my-1 border-t" style={{ borderColor: 'var(--notion-border)' }} />
                      <p className="text-[10px] uppercase tracking-wider px-2 pt-1 pb-1.5" style={{ color: 'var(--notion-text-3)' }}>Configurações da fonte de dados</p>
                      <SettingsRow icon={Database} label="Fonte" value={sourceName} arrow onClick={() => { setCfgOpen(false); router.push(`/tabelas?t=${tableId}`) }} />
                      <SettingsRow icon={SlidersHorizontal} label="Editar propriedades" arrow onClick={() => setCfgTab('visibility')} />
                      <SettingsRow icon={Table2} label="Gerenciar fontes de dados" arrow onClick={() => { setCfgOpen(false); router.push('/tabelas') }} />
                    </>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {vt === 'table' ? (
        <DynamicTable key={tableId} tableId={tableId} initialColumns={columns} initialRows={rows} sources={sources} members={members} userId={userId}
          viewFilters={vcfg.filters} viewSort={vcfg.sort} viewGroupColId={vcfg.groupColId} viewColorRules={vcfg.colorRules} viewSearch={q} />
      ) : vt === 'gallery' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map(r => (
            <div key={r.id} onClick={() => setOpenRow(r.id)} className="rounded-xl p-4 border cursor-pointer transition-all hover:border-[var(--notion-accent)]" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)', borderLeft: cardColor(r) ? `3px solid ${cardColor(r)}` : undefined }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--notion-text)' }}>{titleCol ? (r.data[titleCol.id] as string) || '(sem título)' : ''}</p>
              <div className="space-y-1">{cardCols.slice(0, 4).map(c => { const f = cardField(c, r); return f ? <div key={c.id}>{f}</div> : null })}</div>
            </div>
          ))}
          {shown.length === 0 && <p className="text-sm col-span-full" style={{ color: 'var(--notion-text-3)' }}>Sem registros.</p>}
        </div>
      ) : vt === 'list' ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--notion-border)' }}>
          {shown.map(r => (
            <div key={r.id} onClick={() => setOpenRow(r.id)} className="flex items-center gap-3 px-4 py-2.5 border-b cursor-pointer transition-colors hover:bg-[var(--notion-bg-2)]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--notion-text)' }}>{titleCol ? (r.data[titleCol.id] as string) || '(sem título)' : ''}</span>
              {cardCols.slice(0, 3).map(c => <span key={c.id}>{cardField(c, r)}</span>)}
            </div>
          ))}
          {shown.length === 0 && <p className="text-sm px-4 py-3" style={{ color: 'var(--notion-text-3)' }}>Sem registros.</p>}
        </div>
      ) : vt === 'calendar' ? (
        <CalendarView rows={shown} columns={ordered} titleCol={titleCol} onOpen={setOpenRow} />
      ) : vt === 'board' ? (
        !groupCol ? (
          <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Adicione uma coluna do tipo Status para visualizar como quadro.</p>
        ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 items-start">
          {(groupCol.config.options || []).map(o => {
            const cardsHere = shown.filter(r => { const v = r.data[groupCol.id]; return v === o.id || v === o.label })
            return (
              <div key={o.id}
                onDragOver={e => { e.preventDefault(); setOverCol(o.id) }}
                onDragLeave={() => setOverCol(x => x === o.id ? null : x)}
                onDrop={() => dragId && moveTo(dragId, o.id)}
                className="flex-shrink-0 w-72 rounded-xl p-2 transition-colors"
                style={{ background: overCol === o.id ? 'var(--notion-bg-3)' : 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
                <div className="flex items-center gap-2 px-1.5 py-1 mb-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: `${o.color}22`, color: o.color }}>{o.label}</span>
                  <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>{cardsHere.length}</span>
                </div>
                <div className="space-y-2">
                  {cardsHere.map(r => (
                    <div key={r.id} draggable
                      onDragStart={() => setDragId(r.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onClick={() => setOpenRow(r.id)}
                      className="rounded-lg p-3 border cursor-pointer transition-all hover:border-[var(--notion-accent)]"
                      style={{ background: 'var(--notion-bg-3)', borderColor: 'var(--notion-border)', borderLeft: cardColor(r) ? `3px solid ${cardColor(r)}` : undefined, opacity: dragId === r.id ? 0.4 : 1 }}>
                      <p className="text-sm font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--notion-text)' }}>
                        <span style={{ color: 'var(--notion-text-3)' }}>🏷</span>{titleCol ? (r.data[titleCol.id] as string) || '(sem título)' : ''}
                      </p>
                      <div className="space-y-1">
                        {cardCols.map(c => { const f = cardField(c, r); return f ? <div key={c.id}>{f}</div> : null })}
                      </div>
                      {peopleCol && Array.isArray(r.data[peopleCol.id]) && (r.data[peopleCol.id] as string[]).length > 0 && (
                        <div className="flex flex-col gap-1 mt-2">
                          {(r.data[peopleCol.id] as string[]).map(id => { const m = member(id); return m ? (
                            <span key={id} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--notion-text-2)' }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{m.full_name[0]}</span>{m.full_name}
                            </span>
                          ) : null })}
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addCard(o.id)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-3.5 h-3.5" /> Nova página
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        )
      ) : (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--notion-text-3)' }}>Esta visualização estará disponível em breve.</div>
      )}

      {current && (
        <RecordPanel row={current} columns={ordered} members={members} sources={sources} userId={userId}
          onClose={() => setOpenRow(null)} updateCell={updateCell} updateColumnOptions={updateColumnOptions}
          onDeleted={() => { setRows(rs => rs.filter(r => r.id !== current.id)); setOpenRow(null) }} />
      )}
    </div>
  )
}

// ============ Painel lateral do registro ============
function RecordPanel({ row, columns, members, sources, userId, onClose, updateCell, updateColumnOptions, onDeleted }: {
  row: DBRow; columns: DBColumn[]; members: Member[]; sources: DataSource[]; userId: string
  onClose: () => void; updateCell: (rowId: string, colId: string, v: unknown) => void
  updateColumnOptions: (colId: string, o: SelectOption[]) => void; onDeleted: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [comments, setComments] = useState<RowComment[]>([])
  const [text, setText] = useState('')
  const [nested, setNested] = useState<{ source: DataSource; row: DBRow } | null>(null)
  const titleCol = [...columns].sort((a, b) => a.position - b.position).find(c => c.type === 'text') || columns[0]
  const fieldCols = columns.filter(c => c !== titleCol).sort((a, b) => a.position - b.position)
  const member = (id: string) => members.find(m => m.id === id)
  const typeMeta = (t: string) => COLUMN_TYPES.find(x => x.type === t)

  useEffect(() => {
    supabase.from('db_row_comments').select('*').eq('row_id', row.id).order('created_at', { ascending: false })
      .then(({ data }) => setComments((data || []) as RowComment[]))
  }, [row.id, supabase])

  async function addComment() {
    if (!text.trim()) return
    await supabase.from('db_row_comments').insert({ row_id: row.id, user_id: userId, text: text.trim() })
    setText('')
    const { data } = await supabase.from('db_row_comments').select('*').eq('row_id', row.id).order('created_at', { ascending: false })
    setComments((data || []) as RowComment[])
  }
  async function del() {
    if (!confirm('Excluir este registro?')) return
    await supabase.from('db_rows').delete().eq('id', row.id); onDeleted(); router.refresh()
  }
  // edição no painel de relação aninhado (ex.: clicar no Contato abre a ficha do contato)
  async function saveNestedField(sourceId: string, rowId: string, colId: string, value: unknown) {
    const r = sources.find(s => s.id === sourceId)?.rows.find(x => x.id === rowId)
    await supabase.from('db_rows').update({ data: { ...(r?.data || {}), [colId]: value } }).eq('id', rowId)
    router.refresh()
  }
  async function saveNestedOptions(sourceId: string, colId: string, options: SelectOption[]) {
    const col = sources.find(s => s.id === sourceId)?.columns.find(c => c.id === colId)
    await supabase.from('db_columns').update({ config: { ...(col?.config || {}), options } }).eq('id', colId)
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl h-full overflow-y-auto animate-slide-in" style={{ background: 'var(--notion-bg)', borderLeft: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10" style={{ background: 'var(--notion-bg)', borderBottom: '1px solid var(--notion-border)' }}>
          <span className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Registro</span>
          <div className="flex items-center gap-1">
            <button onClick={del} className="px-2 py-1 rounded text-xs" style={{ color: '#F87171' }}>Excluir</button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="text-2xl mb-1">🧾</div>
          {titleCol && (
            <input defaultValue={(row.data[titleCol.id] as string) || ''} placeholder="Sem título"
              onBlur={e => updateCell(row.id, titleCol.id, e.target.value || null)}
              className="w-full bg-transparent text-2xl font-bold outline-none mb-5" style={{ color: 'var(--notion-text)' }} />
          )}

          <div className="space-y-1">
            {fieldCols.map(col => {
              const auto = ['created_at', 'updated_at', 'created_by', 'updated_by'].includes(col.type)
              return (
                <div key={col.id} className="flex items-start gap-3 py-1">
                  <div className="flex items-center gap-2 w-44 flex-shrink-0 pt-2 text-sm" style={{ color: 'var(--notion-text-3)' }}>
                    <TypeIcon icon={col.config.icon || typeMeta(col.type)?.icon || 'Type'} className="w-3.5 h-3.5" />
                    <span className="truncate">{col.name}</span>
                  </div>
                  <div className="flex-1 min-w-0 rounded-md" style={{ background: auto ? 'transparent' : 'var(--notion-bg-2)' }}>
                    <Cell column={col} value={row.data[col.id]} members={members} sources={sources} row={row} tableColumns={columns}
                      rowMeta={{ created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by ?? undefined, updated_by: row.updated_by ?? undefined }}
                      onChange={v => updateCell(row.id, col.id, v)} onUpdateOptions={o => updateColumnOptions(col.id, o)}
                      onOpenRecord={(s, r) => setNested({ source: s, row: r })} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Comentários */}
          <div className="mt-8 pt-5 border-t" style={{ borderColor: 'var(--notion-border)' }}>
            <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3" style={{ color: 'var(--notion-text)' }}><MessageSquare className="w-4 h-4" /> Comentários</h3>
            <div className="flex gap-2 mb-4">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} placeholder="Adicionar um comentário..."
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />
              <button onClick={addComment} className="px-3 rounded-lg text-sm" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Enviar</button>
            </div>
            <div className="space-y-3">
              {comments.map(c => { const m = member(c.user_id || '') ; return (
                <div key={c.id} className="flex gap-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{m?.full_name?.[0] || '?'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs"><span className="font-medium" style={{ color: 'var(--notion-text)' }}>{m?.full_name || 'Usuário'}</span> <span style={{ color: 'var(--notion-text-3)' }}>{new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--notion-text-2)' }}>{c.text}</p>
                  </div>
                </div>
              )})}
            </div>
          </div>
          {nested && (
            <RelationRecordPanel record={nested} sources={sources} members={members}
              onClose={() => setNested(null)} onSaveField={saveNestedField} onUpdateOptions={saveNestedOptions} />
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Visualização Calendário ============
function CalendarView({ rows, columns, titleCol, onOpen }: {
  rows: DBRow[]; columns: DBColumn[]; titleCol?: DBColumn; onOpen: (id: string) => void
}) {
  const dateCol = columns.find(c => c.type === 'date')
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  if (!dateCol) return <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Adicione uma coluna de Data para ver o calendário.</p>

  const year = ref.getFullYear(), month = ref.getMonth()
  const first = new Date(year, month, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthLabel = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const rowsByDay = (day: number) => rows.filter(r => {
    const v = r.data[dateCol.id] as string; if (!v) return false
    const d = new Date(v + (v.length === 10 ? 'T12:00:00' : ''))
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setRef(new Date(year, month - 1, 1))} className="px-2 py-1 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-2)' }}>‹</button>
        <span className="text-sm font-medium capitalize" style={{ color: 'var(--notion-text)' }}>{monthLabel}</span>
        <button onClick={() => setRef(new Date(year, month + 1, 1))} className="px-2 py-1 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-2)' }}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--notion-border)' }}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} className="text-center py-1.5 text-[11px] font-medium" style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text-3)' }}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="min-h-[88px] p-1.5 align-top" style={{ background: 'var(--notion-bg)' }}>
            {day && <div className="text-[11px] mb-1" style={{ color: 'var(--notion-text-3)' }}>{day}</div>}
            <div className="space-y-1">
              {day && rowsByDay(day).map(r => (
                <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left px-1.5 py-1 rounded text-[11px] truncate transition-colors hover:opacity-80" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }}>
                  {titleCol ? (r.data[titleCol.id] as string) || '(sem título)' : ''}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
