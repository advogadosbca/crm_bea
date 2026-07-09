'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  DBColumn, DBRow, ColumnType, SelectOption, DataSource, RollupFn, COLUMN_TYPES, AUTO_TYPES, OPTION_COLORS,
  convertValue, formatNumber,
} from '@/types/dynamic'
import { TypePicker, TypeIcon, IconPicker } from './TypePicker'
import { Cell } from './Cell'
import { RecordPanel } from './RecordPanel'
import {
  Plus, MoreHorizontal, ArrowUpDown, EyeOff, Trash2, Copy, ArrowLeftToLine, ArrowRightToLine,
  Pencil, Repeat, Check, ChevronRight, Sigma, Table2, Search, X, Smile, PanelRight,
} from 'lucide-react'

interface Member { id: string; full_name: string }
type Calc = 'none' | 'count' | 'filled' | 'sum' | 'avg' | 'checked'

export function DynamicTable({ tableId, initialColumns, initialRows, sources: initialSources = [], members, userId }: {
  tableId: string; initialColumns: DBColumn[]; initialRows: DBRow[]; sources?: DataSource[]; members: Member[]; userId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [columns, setColumns] = useState<DBColumn[]>(initialColumns)
  const [rows, setRows] = useState<DBRow[]>(initialRows)
  const [menuCol, setMenuCol] = useState<string | null>(null)
  const [submenu, setSubmenu] = useState<'none' | 'type' | 'edit' | 'icon'>('none')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [calc, setCalc] = useState<Record<string, Calc>>({})
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // registro aberto no painel lateral (clique num chip de relação)
  const [record, setRecord] = useState<{ source: DataSource; row: DBRow } | null>(null)
  // fontes em estado local para que edições no painel reflitam na grade (chips/rollups)
  const [sources, setSources] = useState<DataSource[]>(initialSources)
  useEffect(() => { setSources(initialSources) }, [initialSources])
  // a tabela ativa se enxerga como fonte com dados "ao vivo" (colunas/linhas do estado local);
  // as demais fontes vêm do estado `sources` (editáveis pelo painel)
  const liveSources = useMemo(
    () => sources.map(s => (s.id === tableId ? { ...s, columns, rows } : s)),
    [sources, columns, rows, tableId],
  )
  const selfSource = liveSources.find(s => s.id === tableId)

  // reordena colunas (arrastar-e-soltar) e persiste as posições
  async function moveColumn(fromId: string, toId: string) {
    if (fromId === toId) return
    const ordered = [...columns].sort((a, b) => a.position - b.position)
    const from = ordered.findIndex(c => c.id === fromId)
    const to = ordered.findIndex(c => c.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    const updated = ordered.map((c, i) => ({ ...c, position: i }))
    const prev = columns
    setColumns(updated)
    await Promise.all(
      updated.filter(c => c.position !== prev.find(o => o.id === c.id)?.position)
        .map(c => supabase.from('db_columns').update({ position: c.position }).eq('id', c.id))
    )
  }

  const visible = columns.filter(c => !c.hidden).sort((a, b) => a.position - b.position)
  // coluna "título" (onde aparece o botão Open), mesmo critério do primaryValue
  const primaryColId = (visible.find(c => ['text', 'select', 'status', 'email', 'phone', 'url'].includes(c.type)) || visible[0])?.id
  const typeMeta = (t: ColumnType) => COLUMN_TYPES.find(x => x.type === t)

  const sortedRows = useMemo(() => {
    if (!sort) return [...rows].sort((a, b) => a.position - b.position)
    const col = columns.find(c => c.id === sort.col)
    const get = (r: DBRow) => {
      if (col?.type === 'created_at') return r.created_at
      if (col?.type === 'updated_at') return r.updated_at
      return r.data[sort.col]
    }
    return [...rows].sort((a, b) => {
      const av = get(a) ?? '', bv = get(b) ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  // ---------- mutations ----------
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
  // ----- edições feitas dentro do painel de detalhe (linhas de OUTRAS fontes) -----
  async function saveSourceField(sourceId: string, rowId: string, colId: string, value: unknown) {
    const target = sourceId === tableId
      ? rows.find(r => r.id === rowId)
      : sources.find(s => s.id === sourceId)?.rows.find(r => r.id === rowId)
    const data = { ...(target?.data || {}), [colId]: value }
    const now = new Date().toISOString()
    setSources(ss => ss.map(s => s.id !== sourceId ? s : {
      ...s, rows: s.rows.map(r => r.id === rowId ? { ...r, data, updated_at: now, updated_by: userId } : r),
    }))
    // se a fonte for a própria tabela ativa, reflete também na grade
    if (sourceId === tableId) setRows(rs => rs.map(r => r.id === rowId ? { ...r, data, updated_at: now, updated_by: userId } : r))
    await supabase.from('db_rows').update({ data, updated_by: userId, updated_at: now }).eq('id', rowId)
  }
  async function saveSourceOptions(sourceId: string, colId: string, options: SelectOption[]) {
    const col = sourceId === tableId
      ? columns.find(c => c.id === colId)
      : sources.find(s => s.id === sourceId)?.columns.find(c => c.id === colId)
    const config = { ...(col?.config || {}), options }
    setSources(ss => ss.map(s => s.id !== sourceId ? s : {
      ...s, columns: s.columns.map(c => c.id === colId ? { ...c, config } : c),
    }))
    if (sourceId === tableId) setColumns(cs => cs.map(c => c.id === colId ? { ...c, config } : c))
    await supabase.from('db_columns').update({ config }).eq('id', colId)
  }
  async function setColumnConfig(colId: string, patch: Record<string, unknown>) {
    const col = columns.find(c => c.id === colId)!
    const config = { ...col.config, ...patch }
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, config } : c))
    await supabase.from('db_columns').update({ config }).eq('id', colId)
  }
  async function addRow() {
    const position = rows.length
    const { data } = await supabase.from('db_rows').insert({ table_id: tableId, data: {}, position, created_by: userId, updated_by: userId }).select('*').single()
    if (data) setRows(rs => [...rs, data as DBRow])
  }
  async function deleteRow(id: string) {
    setRows(rs => rs.filter(r => r.id !== id))
    await supabase.from('db_rows').delete().eq('id', id)
  }
  async function addColumn(type: ColumnType, atPosition: number) {
    // empurra posições
    const shifted = columns.map(c => c.position >= atPosition ? { ...c, position: c.position + 1 } : c)
    const meta = typeMeta(type)
    const { data } = await supabase.from('db_columns').insert({
      table_id: tableId, name: meta?.label || 'Coluna', type, position: atPosition, config: {},
    }).select('*').single()
    if (data) {
      await Promise.all(shifted.filter(c => c.position !== columns.find(o => o.id === c.id)?.position).map(c =>
        supabase.from('db_columns').update({ position: c.position }).eq('id', c.id)))
      setColumns([...shifted, data as DBColumn])
    }
  }
  async function renameColumn(colId: string, name: string) {
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, name } : c))
    setRenaming(null)
    await supabase.from('db_columns').update({ name }).eq('id', colId)
  }
  async function hideColumn(colId: string) {
    setColumns(cs => cs.map(c => c.id === colId ? { ...c, hidden: true } : c)); setMenuCol(null)
    await supabase.from('db_columns').update({ hidden: true }).eq('id', colId)
  }
  async function unhideAll() {
    setColumns(cs => cs.map(c => ({ ...c, hidden: false })))
    await Promise.all(columns.filter(c => c.hidden).map(c => supabase.from('db_columns').update({ hidden: false }).eq('id', c.id)))
  }
  async function duplicateColumn(col: DBColumn) {
    setMenuCol(null)
    const { data: newCol } = await supabase.from('db_columns').insert({
      table_id: tableId, name: `${col.name} (cópia)`, type: col.type, config: col.config, position: col.position + 1,
    }).select('*').single()
    if (newCol) {
      // copia valores
      const updates = rows.map(r => ({ ...r, data: { ...r.data, [newCol.id]: r.data[col.id] } }))
      setRows(updates)
      setColumns(cs => [...cs, newCol as DBColumn])
      await Promise.all(updates.map(r => supabase.from('db_rows').update({ data: r.data }).eq('id', r.id)))
    }
  }
  async function deleteColumn(colId: string) {
    if (!confirm('Excluir esta coluna e todos os seus valores?')) return
    setMenuCol(null)
    setColumns(cs => cs.filter(c => c.id !== colId))
    await supabase.from('db_columns').delete().eq('id', colId)
  }
  async function changeType(col: DBColumn, to: ColumnType) {
    // converte valores
    let anyLossy = false
    const converted = rows.map(r => {
      const { value, lossy } = convertValue(r.data[col.id], col.type, to)
      if (lossy && r.data[col.id] != null && r.data[col.id] !== '') anyLossy = true
      return { id: r.id, data: { ...r.data, [col.id]: value } }
    })
    if (anyLossy && !confirm('Alguns valores não podem ser convertidos para o novo tipo e serão limpos. Continuar?')) return
    // ao virar relação/rollup, mantém o menu aberto no painel de configuração
    if (to === 'relation' || to === 'rollup') setSubmenu('edit')
    else { setMenuCol(null); setSubmenu('none') }
    const config = ['select', 'status', 'multi_select'].includes(to) ? { options: col.config.options || [] } : {}
    setColumns(cs => cs.map(c => c.id === col.id ? { ...c, type: to, config } : c))
    setRows(rs => rs.map(r => { const c = converted.find(x => x.id === r.id); return c ? { ...r, data: c.data } : r }))
    await supabase.from('db_columns').update({ type: to, config }).eq('id', col.id)
    await Promise.all(converted.map(c => supabase.from('db_rows').update({ data: c.data }).eq('id', c.id)))
  }

  function calcResult(col: DBColumn): string {
    const c = calc[col.id] || 'none'
    if (c === 'none') return ''
    const vals = rows.map(r => r.data[col.id])
    if (c === 'count') return `${rows.length}`
    if (c === 'filled') return `${vals.filter(v => v != null && v !== '').length}`
    if (c === 'checked') return `${vals.filter(Boolean).length}`
    const nums = vals.map(Number).filter(n => !isNaN(n))
    if (c === 'sum') return formatNumber(nums.reduce((a, b) => a + b, 0), col.config.format)
    if (c === 'avg') return formatNumber(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0, col.config.format)
    return ''
  }

  const hiddenCount = columns.filter(c => c.hidden).length

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {visible.map(col => (
                <th key={col.id} className="relative text-left border-b min-w-[160px]"
                  draggable={renaming !== col.id}
                  onDragStart={e => { setDragCol(col.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null) }}
                  onDragOver={e => { if (dragCol && dragCol !== col.id) { e.preventDefault(); setDragOverCol(col.id) } }}
                  onDragLeave={() => setDragOverCol(c => (c === col.id ? null : c))}
                  onDrop={e => { e.preventDefault(); if (dragCol) moveColumn(dragCol, col.id); setDragCol(null); setDragOverCol(null) }}
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    opacity: dragCol === col.id ? 0.35 : 1,
                    borderLeft: dragOverCol === col.id ? '2px solid var(--notion-accent)' : undefined,
                    cursor: dragCol ? 'grabbing' : undefined,
                  }}>
                  {renaming === col.id ? (
                    <div className="w-full flex items-center gap-1.5 px-2.5 py-2" style={{ background: 'var(--notion-bg-4)' }}>
                      <TypeIcon icon={col.config.icon || typeMeta(col.type)?.icon || 'Type'} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-2)' }} />
                      <input autoFocus defaultValue={col.name}
                        onBlur={e => renameColumn(col.id, e.target.value.trim() || col.name)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                        className="flex-1 text-[13px] font-normal outline-none bg-transparent" style={{ color: 'var(--notion-text)' }} />
                    </div>
                  ) : (
                    <button onClick={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenuPos({ left: r.left, top: r.bottom + 4 })
                        setMenuCol(menuCol === col.id ? null : col.id); setSubmenu('none')
                      }}
                      className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-md hover:bg-[var(--notion-bg-2)] transition-colors">
                      <TypeIcon icon={col.config.icon || typeMeta(col.type)?.icon || 'Type'} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-2)' }} />
                      <span className="text-[13px] font-normal truncate" style={{ color: 'var(--notion-text-2)' }}>{col.name}</span>
                    </button>
                  )}
                  {menuCol === col.id && (
                    <ColumnMenu col={col} typeLabel={typeMeta(col.type)?.label || ''} pos={menuPos}
                      onClose={() => { setMenuCol(null); setSubmenu('none') }}
                      submenu={submenu} setSubmenu={setSubmenu}
                      onRename={() => { setRenaming(col.id); setMenuCol(null) }}
                      onChangeType={to => changeType(col, to)}
                      onSort={dir => { setSort({ col: col.id, dir }); setMenuCol(null) }}
                      onHide={() => hideColumn(col.id)}
                      onInsertLeft={() => { addColumn('text', col.position); setMenuCol(null) }}
                      onInsertRight={() => { addColumn('text', col.position + 1); setMenuCol(null) }}
                      onDuplicate={() => duplicateColumn(col)}
                      onDelete={() => deleteColumn(col.id)}
                      onUpdateOptions={opts => updateColumnOptions(col.id, opts)}
                      onSetConfig={patch => setColumnConfig(col.id, patch)}
                      sources={liveSources} tableColumns={columns}
                      isAuto={AUTO_TYPES.includes(col.type)} />
                  )}
                </th>
              ))}
              <th className="border-b w-10 px-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="relative">
                  <button onClick={() => addColumn('text', columns.length)} title="Adicionar coluna"
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.id} className="group/row border-b transition-colors hover:bg-[rgba(255,255,255,0.02)]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {visible.map(col => (
                  <td key={col.id} className="align-top relative" style={{ borderColor: 'transparent' }}>
                    <Cell column={col} value={row.data[col.id]} members={members}
                      rowMeta={{ created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by ?? undefined, updated_by: row.updated_by ?? undefined }}
                      onChange={v => updateCell(row.id, col.id, v)}
                      onUpdateOptions={opts => updateColumnOptions(col.id, opts)}
                      sources={liveSources} row={row} tableColumns={columns}
                      onOpenRecord={(source, r) => setRecord({ source, row: r })} />
                    {col.id === primaryColId && selfSource && (
                      <button onClick={() => setRecord({ source: selfSource, row })} title="Abrir registro"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide opacity-0 pointer-events-none transition-opacity group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
                        style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
                        <PanelRight className="w-3 h-3" /> Open
                      </button>
                    )}
                  </td>
                ))}
                <td className="w-10 align-middle text-center">
                  <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-[var(--notion-bg-4)] transition-all" style={{ color: 'var(--notion-text-3)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={visible.length + 1} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <button onClick={addRow} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-xs hover:bg-[rgba(255,255,255,0.02)] transition-colors" style={{ color: 'var(--notion-text-3)' }}>
                  <Plus className="w-3.5 h-3.5" /> Nova página
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              {visible.map(col => (
                <td key={col.id} className="px-2 py-1.5 text-right relative" style={{ borderColor: 'transparent' }}>
                  <CalcCell col={col} value={calcResult(col)} current={calc[col.id] || 'none'} onSet={c => setCalc(s => ({ ...s, [col.id]: c }))} />
                </td>
              ))}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--notion-text-3)' }}>
        <span>Contagem {rows.length}</span>
        {sort && <button onClick={() => setSort(null)} className="hover:text-[var(--notion-text-2)]">Limpar ordenação</button>}
        {hiddenCount > 0 && <button onClick={unhideAll} className="hover:text-[var(--notion-text-2)]">Mostrar {hiddenCount} coluna(s) oculta(s)</button>}
      </div>

      {record && (
        <RecordPanel record={record} sources={liveSources} members={members}
          onClose={() => setRecord(null)}
          onSaveField={saveSourceField}
          onUpdateOptions={saveSourceOptions} />
      )}
    </div>
  )
}

// ---------- Menu de coluna ----------
function ColumnMenu({ col, typeLabel, pos, onClose, submenu, setSubmenu, onRename, onChangeType, onSort, onHide, onInsertLeft, onInsertRight, onDuplicate, onDelete, onUpdateOptions, onSetConfig, sources, tableColumns, isAuto }: {
  col: DBColumn; typeLabel: string; pos: { left: number; top: number } | null; onClose: () => void; submenu: 'none' | 'type' | 'edit' | 'icon'
  setSubmenu: (s: 'none' | 'type' | 'edit' | 'icon') => void
  onRename: () => void; onChangeType: (t: ColumnType) => void; onSort: (d: 'asc' | 'desc') => void
  onHide: () => void; onInsertLeft: () => void; onInsertRight: () => void; onDuplicate: () => void; onDelete: () => void
  onUpdateOptions: (o: SelectOption[]) => void; onSetConfig: (patch: Record<string, unknown>) => void
  sources: DataSource[]; tableColumns: DBColumn[]; isAuto: boolean
}) {
  const Item = ({ icon: Icon, label, onClick, danger, arrow }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; danger?: boolean; arrow?: boolean }) => (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors" style={{ color: danger ? '#F87171' : 'var(--notion-text)' }}>
      <Icon className="w-3.5 h-3.5" /> <span className="flex-1 text-left">{label}</span>
      {arrow && <ChevronRight className="w-3 h-3" style={{ color: 'var(--notion-text-3)' }} />}
    </button>
  )
  const hasOptions = ['select', 'status', 'multi_select'].includes(col.type)
  const isRelation = col.type === 'relation'
  const isRollup = col.type === 'rollup'
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 rounded-lg p-1 shadow-2xl text-left max-h-[70vh] overflow-y-auto"
        style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', width: submenu === 'type' ? '18rem' : '14rem', left: Math.min(pos?.left ?? 0, (typeof window !== 'undefined' ? window.innerWidth - (submenu === 'type' ? 300 : 240) : 0)), top: pos?.top ?? 0 }}
        onClick={e => e.stopPropagation()}>
        {submenu === 'type' ? (
          <TypePicker current={col.type} onPick={onChangeType} onClose={() => setSubmenu('none')} />
        ) : submenu === 'icon' ? (
          <IconPicker current={col.config.icon} onBack={() => setSubmenu('none')}
            onPick={icon => { onSetConfig({ icon: icon || undefined }); setSubmenu('none') }} />
        ) : submenu === 'edit' && hasOptions ? (
          <OptionsEditor col={col} onUpdate={onUpdateOptions} onBack={() => setSubmenu('none')} />
        ) : submenu === 'edit' && isRelation ? (
          <RelationConfig col={col} sources={sources} tableColumns={tableColumns} onSet={onSetConfig} onBack={() => setSubmenu('none')} />
        ) : submenu === 'edit' && isRollup ? (
          <RollupConfig col={col} sources={sources} tableColumns={tableColumns} onSet={onSetConfig} onBack={() => setSubmenu('none')} />
        ) : (
          <>
            <Item icon={Pencil} label="Renomear" onClick={onRename} />
            <Item icon={Smile} label="Ícone" onClick={() => setSubmenu('icon')} arrow />
            {!isAuto && <Item icon={Repeat} label={`Alterar tipo (${typeLabel})`} onClick={() => setSubmenu('type')} arrow />}
            {hasOptions && <Item icon={Pencil} label="Editar opções" onClick={() => setSubmenu('edit')} arrow />}
            {isRelation && <Item icon={ArrowUpDown} label="Configurar relação" onClick={() => setSubmenu('edit')} arrow />}
            {isRollup && <Item icon={Sigma} label="Configurar rollup" onClick={() => setSubmenu('edit')} arrow />}
            <div className="my-1 border-t" style={{ borderColor: 'var(--notion-border)' }} />
            <Item icon={ArrowUpDown} label="Ordenar crescente" onClick={() => onSort('asc')} />
            <Item icon={ArrowUpDown} label="Ordenar decrescente" onClick={() => onSort('desc')} />
            <Item icon={EyeOff} label="Ocultar coluna" onClick={onHide} />
            <div className="my-1 border-t" style={{ borderColor: 'var(--notion-border)' }} />
            <Item icon={ArrowLeftToLine} label="Inserir à esquerda" onClick={onInsertLeft} />
            <Item icon={ArrowRightToLine} label="Inserir à direita" onClick={onInsertRight} />
            <Item icon={Copy} label="Duplicar coluna" onClick={onDuplicate} />
            <Item icon={Trash2} label="Excluir coluna" onClick={onDelete} danger />
          </>
        )}
      </div>
    </>
  )
}

function OptionsEditor({ col, onUpdate, onBack }: { col: DBColumn; onUpdate: (o: SelectOption[]) => void; onBack: () => void }) {
  const options = col.config.options || []
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  // painel de edição de uma etiqueta: renomear, escolher cor (10 nomeadas) e excluir
  if (editing) {
    const o = options.find(x => x.id === editing)
    if (!o) { setEditing(null); return null }
    return (
      <div onClick={e => e.stopPropagation()}>
        <button onClick={() => setEditing(null)} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Editar etiqueta</button>
        <input autoFocus value={o.label} onChange={e => onUpdate(options.map(x => x.id === o.id ? { ...x, label: e.target.value } : x))}
          className="w-full px-2 py-1.5 rounded text-xs outline-none mb-1" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--notion-text-3)' }}>Cores</p>
        <div className="max-h-56 overflow-y-auto">
          {OPTION_COLORS.map(c => (
            <button key={c.hex} onClick={() => onUpdate(options.map(x => x.id === o.id ? { ...x, color: c.hex } : x))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] transition-colors">
              <span className="w-4 h-4 rounded" style={{ background: c.hex, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span className="flex-1 text-left" style={{ color: 'var(--notion-text)' }}>{c.name}</span>
              {o.color === c.hex && <Check className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-2)' }} />}
            </button>
          ))}
        </div>
        <div className="my-1 border-t" style={{ borderColor: 'var(--notion-border)' }} />
        <button onClick={() => { onUpdate(options.filter(x => x.id !== o.id)); setEditing(null) }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: '#F87171' }}>
          <Trash2 className="w-3.5 h-3.5" /> Excluir opção
        </button>
      </div>
    )
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <button onClick={onBack} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Opções</button>
      <div className="max-h-56 overflow-y-auto space-y-0.5">
        {options.map(o => (
          <div key={o.id} className="flex items-center gap-1 px-1">
            <span className="inline-flex items-center px-2 py-1 rounded text-xs flex-1 truncate min-w-0"
              style={{ background: `${o.color}22`, color: o.color }}>{o.label || '(sem nome)'}</span>
            <button onClick={() => setEditing(o.id)} title="Editar" className="p-1 rounded hover:bg-[var(--notion-bg-4)] flex-shrink-0">
              <MoreHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1.5 px-1">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nova opção"
          onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) { onUpdate([...options, { id: crypto.randomUUID(), label: newLabel.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length].hex }]); setNewLabel('') } }}
          className="flex-1 px-1.5 py-1 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
      </div>
    </div>
  )
}

function RelationConfig({ col, sources, tableColumns, onSet, onBack }: {
  col: DBColumn; sources: DataSource[]; tableColumns: DBColumn[]; onSet: (p: Record<string, unknown>) => void; onBack: () => void
}) {
  // se outra coluna de relação já aponta para uma tabela, "puxa" ela automático
  const siblingSource = tableColumns.find(c => c.type === 'relation' && c.id !== col.id && c.config.sourceTableId)?.config.sourceTableId
  const [srcId, setSrcId] = useState<string | undefined>(col.config.sourceTableId || siblingSource)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const [sidePos, setSidePos] = useState<{ left: number; top: number } | null>(null)
  const SIDE_W = 232

  const source = sources.find(s => s.id === srcId)
  const selected: string[] = col.config.displayColIds || []
  // colunas já ocupadas por OUTRAS colunas de relação para a mesma tabela
  const usedByOthers = new Set(
    tableColumns.filter(c => c.type === 'relation' && c.id !== col.id && c.config.sourceTableId === srcId)
      .flatMap(c => c.config.displayColIds || [])
  )
  const available = source ? source.columns.filter(c => !usedByOthers.has(c.id)) : []
  const filtered = sources.filter(s => s.name.toLowerCase().includes(q.toLowerCase()))

  // posiciona o painel de campos AO LADO do menu (direita; vira à esquerda se faltar espaço)
  useEffect(() => {
    if (!srcId || !rootRef.current) { setSidePos(null); return }
    const r = rootRef.current.getBoundingClientRect()
    const gap = 6, vw = typeof window !== 'undefined' ? window.innerWidth : 1200
    let left = r.right + gap
    if (left + SIDE_W > vw - 8) left = r.left - SIDE_W - gap
    setSidePos({ left: Math.max(8, left), top: r.top })
  }, [srcId])

  function pickTable(id: string) {
    setSrcId(id)
    onSet({ sourceTableId: id, displayColIds: [] }) // troca de tabela zera os campos
  }
  function toggleField(fid: string) {
    const next = selected.includes(fid) ? selected.filter(x => x !== fid) : [...selected, fid]
    onSet({ sourceTableId: srcId, displayColIds: next })
  }

  return (
    <div ref={rootRef} onClick={e => e.stopPropagation()}>
      {/* painel 1 — tabelas */}
      <div className="flex items-center justify-between px-1.5 pt-1 pb-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--notion-text)' }}>Relacionado a</span>
        <button onClick={onBack} style={{ color: 'var(--notion-text-3)' }}><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 mx-1 mb-1.5 rounded-md" style={{ background: 'var(--notion-bg-4)', border: '1px solid var(--notion-accent)' }}>
        <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Vincular a uma fonte de dados..."
          className="bg-transparent text-xs outline-none flex-1" style={{ color: 'var(--notion-text)' }} />
      </div>
      <p className="text-[10px] uppercase tracking-wider px-2 pb-1" style={{ color: 'var(--notion-text-3)' }}>Fontes de dados existentes</p>
      <div className="max-h-56 overflow-y-auto space-y-0.5 px-0.5">
        {sources.length === 0 && <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Crie uma fonte de dados primeiro (menu Fonte de dados).</p>}
        {filtered.map(s => (
          <button key={s.id} onClick={() => pickTable(s.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]"
            style={{ color: 'var(--notion-text)', background: srcId === s.id ? 'var(--notion-bg-4)' : undefined }}>
            <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)' }}>
              <Table2 className="w-3 h-3" style={{ color: '#22D3EE' }} />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block truncate" style={{ color: 'var(--notion-text)' }}>{s.name}</span>
              <span className="block truncate text-[10px]" style={{ color: 'var(--notion-text-3)' }}>{s.columns.length} colunas · {s.rows.length} registros</span>
            </span>
            {srcId === s.id && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-accent)' }} />}
          </button>
        ))}
        {filtered.length === 0 && sources.length > 0 && <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhuma fonte encontrada.</p>}
      </div>

      {/* painel 2 — campos, flutuando AO LADO */}
      {srcId && source && sidePos && typeof document !== 'undefined' && createPortal(
        <div className="fixed rounded-lg p-1 shadow-2xl"
          style={{ left: sidePos.left, top: sidePos.top, width: SIDE_W, zIndex: 60, background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', maxHeight: '70vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 px-1.5 pt-1 pb-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)' }}>
              <Table2 className="w-3 h-3" style={{ color: '#22D3EE' }} />
            </span>
            <span className="text-xs font-medium truncate" style={{ color: 'var(--notion-text)' }}>{source.name}</span>
          </div>
          <p className="text-[10px] uppercase tracking-wider px-2 pb-1" style={{ color: 'var(--notion-text-3)' }}>Campos a exibir</p>
          <div className="max-h-72 overflow-y-auto space-y-0.5 px-0.5 pb-1">
            {available.length === 0 && <p className="text-xs px-2 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhum campo disponível — os demais já foram usados por outras relações.</p>}
            {available.map(c => {
              const on = selected.includes(c.id)
              return (
                <button key={c.id} onClick={() => toggleField(c.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: on ? 'var(--notion-accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--notion-border)' }}>
                    {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <TypeIcon icon={c.config.icon || COLUMN_TYPES.find(t => t.type === c.type)?.icon || 'Type'} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
                  <span className="flex-1 text-left truncate">{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function RollupConfig({ col, sources, tableColumns, onSet, onBack }: {
  col: DBColumn; sources: DataSource[]; tableColumns: DBColumn[]; onSet: (p: Record<string, unknown>) => void; onBack: () => void
}) {
  const relCols = tableColumns.filter(c => c.type === 'relation' && c.config.sourceTableId)
  const relCol = relCols.find(c => c.id === col.config.relationColId)
  const source = sources.find(s => s.id === relCol?.config.sourceTableId)
  const sel = 'w-full px-2 py-1.5 rounded text-xs outline-none mb-1.5'
  const st: React.CSSProperties = { background: 'var(--notion-bg-4)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }
  const fns: { v: RollupFn; l: string }[] = [
    { v: 'count', l: 'Contagem' }, { v: 'sum', l: 'Soma' }, { v: 'avg', l: 'Média' },
    { v: 'min', l: 'Mínimo' }, { v: 'max', l: 'Máximo' }, { v: 'concat', l: 'Concatenar' },
  ]
  return (
    <div onClick={e => e.stopPropagation()} className="px-1">
      <button onClick={onBack} className="w-full text-left py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Configurar rollup</button>
      <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--notion-text-3)' }}>Relação</label>
      <select value={col.config.relationColId || ''} onChange={e => onSet({ relationColId: e.target.value, targetColId: undefined })} className={sel} style={st}>
        <option value="">— escolher —</option>
        {relCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--notion-text-3)' }}>Propriedade alvo</label>
      <select value={col.config.targetColId || ''} onChange={e => onSet({ targetColId: e.target.value })} className={sel} style={st} disabled={!source}>
        <option value="">— escolher —</option>
        {source?.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--notion-text-3)' }}>Cálculo</label>
      <select value={col.config.rollupFn || ''} onChange={e => onSet({ rollupFn: e.target.value as RollupFn })} className={sel} style={st}>
        <option value="">— escolher —</option>
        {fns.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
      </select>
    </div>
  )
}

function CalcCell({ col, value, current, onSet }: { col: DBColumn; value: string; current: Calc; onSet: (c: Calc) => void }) {
  const [open, setOpen] = useState(false)
  const opts: { key: Calc; label: string }[] = [
    { key: 'none', label: 'Nenhum' }, { key: 'count', label: 'Contar tudo' }, { key: 'filled', label: 'Preenchidos' },
    ...(col.type === 'number' ? [{ key: 'sum' as Calc, label: 'Soma' }, { key: 'avg' as Calc, label: 'Média' }] : []),
    ...(col.type === 'checkbox' ? [{ key: 'checked' as Calc, label: 'Marcados' }] : []),
  ]
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-[11px] font-mono w-full text-right hover:text-[var(--notion-text-2)]" style={{ color: value ? 'var(--notion-text-2)' : 'var(--notion-text-3)' }}>
        {value || <span className="inline-flex items-center gap-1 justify-end"><Sigma className="w-3 h-3" /> Calcular</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-7 z-50 w-36 rounded-lg p-1 shadow-xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
            {opts.map(o => (
              <button key={o.key} onClick={() => { onSet(o.key); setOpen(false) }} className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                {current === o.key && <Check className="w-3 h-3" />}<span className={current === o.key ? '' : 'ml-5'}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
