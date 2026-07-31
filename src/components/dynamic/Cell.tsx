'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { uploadFile } from '@/lib/upload'
import { initials, personColor } from '@/lib/people'
import {
  DBColumn, DBRow, DataSource, SelectOption, RollupItem, formatNumber, primaryValue, OPTION_COLORS,
  relationLabel, rollupText, rollupItems, rollupShown, rollupPick, makeRollupPick,
} from '@/types/dynamic'
import { Check, Plus, ExternalLink, X, ArrowUpRight, Upload, Link2, Loader2, MoreHorizontal, Trash2, Search, ListChecks } from 'lucide-react'

interface Member { id: string; full_name: string }

/** Dropdown ancorado, renderizado via portal no body (escapa de qualquer overflow/stacking). */
function Dropdown({ pos, width, onClose, children }: {
  pos: { left: number; top: number } | null; width: number; onClose: () => void; children: React.ReactNode
}) {
  if (typeof document === 'undefined' || !pos) return null
  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 10050 }} onClick={onClose} />
      <div className="rounded-lg p-1.5 shadow-2xl"
        style={{ position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 10051, maxHeight: '320px', overflowY: 'auto', background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </>,
    document.body,
  )
}

interface Props {
  column: DBColumn
  value: unknown
  members: Member[]
  rowMeta?: { created_at?: string; updated_at?: string; created_by?: string; updated_by?: string }
  onChange: (value: unknown) => void
  onUpdateOptions?: (options: SelectOption[]) => void
  sources?: DataSource[]
  row?: DBRow
  tableColumns?: DBColumn[]
  /** modo somente leitura (ex.: painel de detalhe do registro) — não abre editores/seletores */
  readOnly?: boolean
  /** abrir o painel de detalhe de um registro relacionado (chip de relação clicável) */
  onOpenRecord?: (source: DataSource, row: DBRow) => void
}

/** avatar de pessoa: duas iniciais + cor fixa por id (evita confundir homônimos) */
function Avatar({ id, name, size = 20 }: { id: string; name: string; size?: number }) {
  const c = personColor(id)
  return (
    <span className="rounded-full flex items-center justify-center font-semibold flex-shrink-0"
      title={name}
      style={{ width: size, height: size, fontSize: size <= 20 ? 9 : 10, background: `${c}33`, color: c, border: `1px solid ${c}66` }}>
      {initials(name)}
    </span>
  )
}

function Chip({ opt, onRemove }: { opt: SelectOption; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
      style={{ background: `${opt.color}22`, color: opt.color, border: `1px solid ${opt.color}33` }}>
      {opt.label}
      {onRemove && <button onClick={e => { e.stopPropagation(); onRemove() }}><X className="w-2.5 h-2.5" /></button>}
    </span>
  )
}

export function Cell({ column, value, members, rowMeta, onChange, onUpdateOptions, sources = [], row, tableColumns = [], readOnly = false, onOpenRecord }: Props) {
  const { type, config } = column
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const openAt = (e: React.MouseEvent, w = 240) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const left = Math.max(8, Math.min(r.left, vw - w - 8))
    const top = Math.min(r.bottom + 4, vh - 330) // não passa do rodapé
    setPos({ left, top: Math.max(8, top) })
    setOpen(o => !o)
  }
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const cellBase = 'w-full h-full min-h-[38px] px-2.5 py-2 text-sm cursor-pointer flex items-center'
  const txt = { color: 'var(--notion-text)' } as React.CSSProperties

  // ---- texto (multi-linha: quebra de linha + rolagem) ----
  if (type === 'text') {
    if (editing && !readOnly) {
      return <textarea autoFocus defaultValue={(value as string) || ''}
        onBlur={e => { onChange(e.target.value || null); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        rows={4} className="w-full px-2 py-1.5 text-sm outline-none resize-y"
        style={{ background: 'var(--notion-bg-4)', minHeight: 64, maxHeight: 280, ...txt }} />
    }
    const v = value as string
    return (
      <div className={'w-full min-h-[38px] px-2.5 py-2 text-sm flex items-start' + (readOnly ? '' : ' cursor-pointer')}
        style={txt} onClick={() => { if (!readOnly) setEditing(true) }}>
        {v
          ? <span className="whitespace-pre-wrap break-words w-full" style={{ display: 'block', maxHeight: 160, overflowY: 'auto' }}>{v}</span>
          : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
      </div>
    )
  }

  // ---- url / phone / email ----
  if (['url', 'phone', 'email'].includes(type)) {
    if (editing) {
      return <input ref={inputRef} defaultValue={(value as string) || ''}
        onBlur={e => { onChange(e.target.value || null); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
        type={type === 'email' ? 'email' : type === 'url' ? 'url' : type === 'phone' ? 'tel' : 'text'}
        className="w-full px-2 py-1.5 text-sm outline-none" style={{ background: 'var(--notion-bg-4)', ...txt }} />
    }
    const v = value as string
    return (
      <div className={cellBase} style={txt} onClick={() => { if (!readOnly) setEditing(true) }}>
        {v ? (
          type === 'url' ? <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate hover:underline" style={{ color: '#60A5FA' }} onClick={e => e.stopPropagation()}>{v}<ExternalLink className="w-3 h-3" /></a> :
          type === 'email' ? <a href={`mailto:${v}`} className="truncate hover:underline" style={{ color: '#60A5FA' }} onClick={e => e.stopPropagation()}>{v}</a> :
          <span className="truncate">{v}</span>
        ) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
      </div>
    )
  }

  // ---- número ----
  if (type === 'number') {
    if (editing) {
      return <input ref={inputRef} type="number" step="any" defaultValue={(value as number) ?? ''}
        onBlur={e => { onChange(e.target.value === '' ? null : Number(e.target.value)); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
        className="w-full px-2 py-1.5 text-sm outline-none text-right font-mono" style={{ background: 'var(--notion-bg-4)', ...txt }} />
    }
    return <div className={cellBase + ' justify-end font-mono'} style={txt} onClick={() => { if (!readOnly) setEditing(true) }}>{formatNumber(value, config.format)}</div>
  }

  // ---- checkbox ----
  if (type === 'checkbox') {
    const checked = !!value
    return (
      <div className="w-full min-h-[34px] flex items-center px-2">
        <button onClick={() => { if (!readOnly) onChange(!checked) }} className="w-4 h-4 rounded flex items-center justify-center"
          style={{ background: checked ? 'var(--notion-accent)' : 'transparent', border: checked ? 'none' : '1.5px solid var(--notion-border)' }}>
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>
      </div>
    )
  }

  // ---- date ----
  if (type === 'date') {
    if (editing) {
      return <input ref={inputRef} type={config.withTime ? 'datetime-local' : 'date'} defaultValue={(value as string) || ''}
        onBlur={e => { onChange(e.target.value || null); setEditing(false) }}
        className="w-full px-2 py-1.5 text-sm outline-none" style={{ background: 'var(--notion-bg-4)', ...txt }} />
    }
    const v = value as string
    return <div className={cellBase + ' font-mono text-xs'} style={txt} onClick={() => { if (!readOnly) setEditing(true) }}>
      {v ? (config.withTime
        ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : new Date(v + (v.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')) : ''}
    </div>
  }

  // ---- person ----
  if (type === 'person') {
    const m = members.find(x => x.id === value)
    return (
      <div className="relative w-full">
        <div className={cellBase} style={txt} onClick={e => { if (!readOnly) openAt(e, 192) }}>
          {m ? <span className="inline-flex items-center gap-1.5 text-xs"><Avatar id={m.id} name={m.full_name} />{m.full_name}</span> : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={192} onClose={() => setOpen(false)}>
            <button onClick={() => { onChange(null); setOpen(false) }} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}>— Ninguém —</button>
            {members.map(mm => (
              <button key={mm.id} onClick={() => { onChange(mm.id); setOpen(false) }} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] flex items-center gap-1.5" style={{ color: 'var(--notion-text)' }}>
                <Avatar id={mm.id} name={mm.full_name} />{mm.full_name}
              </button>
            ))}
          </Dropdown>
        )}
      </div>
    )
  }

  // ---- people (vários) ----
  if (type === 'people') {
    const ids: string[] = Array.isArray(value) ? value as string[] : []
    const sel = ids.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[]
    function toggle(id: string) { onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]) }
    return (
      <div className="relative w-full">
        <div className={cellBase + ' gap-1 flex-wrap'} onClick={e => { if (!readOnly) openAt(e, 200) }}>
          {sel.length ? sel.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 text-xs">
              <Avatar id={m.id} name={m.full_name} />
              {m.full_name}
            </span>
          )) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={200} onClose={() => setOpen(false)}>
            {members.map(mm => (
              <button key={mm.id} onClick={() => toggle(mm.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                <Avatar id={mm.id} name={mm.full_name} />
                <span className="flex-1 text-left truncate">{mm.full_name}</span>
                {ids.includes(mm.id) && <Check className="w-3 h-3" />}
              </button>
            ))}
          </Dropdown>
        )}
      </div>
    )
  }

  // ---- select / status / multi_select ----
  if (['select', 'status', 'multi_select'].includes(type)) {
    const options = config.options || []
    const isMulti = type === 'multi_select'
    const selected: string[] = isMulti ? (Array.isArray(value) ? value as string[] : []) : (value ? [value as string] : [])
    const selOpts = selected.map(id => options.find(o => o.id === id || o.label === id)).filter(Boolean) as SelectOption[]

    const isSel = (opt: SelectOption) => selected.includes(opt.id) || selected.includes(opt.label)
    function pick(opt: SelectOption) {
      if (isMulti) {
        const next = isSel(opt) ? selected.filter(s => s !== opt.id && s !== opt.label) : [...selected, opt.id]
        onChange(next)
      } else {
        // clicar na opção já marcada limpa o valor
        if (isSel(opt)) { onChange(null) } else { onChange(opt.id) }
        setOpen(false)
      }
    }
    function removeOpt(opt: SelectOption) {
      if (isMulti) onChange(selected.filter(s => s !== opt.id && s !== opt.label))
      else onChange(null)
    }
    function addOption(label: string) {
      const opt: SelectOption = { id: crypto.randomUUID(), label, color: OPTION_COLORS[Math.floor(Math.random() * OPTION_COLORS.length)].hex }
      onUpdateOptions?.([...(options), opt])
      pick(opt)
    }

    return (
      <div className="relative w-full">
        <div className={cellBase + ' gap-1 flex-wrap'} onClick={e => { if (!readOnly) openAt(e, 224) }}>
          {selOpts.length ? selOpts.map(o => <Chip key={o.id} opt={o} onRemove={() => removeOpt(o)} />) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={224} onClose={() => setOpen(false)}>
            <OptionSearch options={options} selected={selected} onPick={pick} onAdd={addOption} onUpdate={onUpdateOptions} />
          </Dropdown>
        )}
      </div>
    )
  }

  // ---- files (upload ou link) ----
  if (type === 'files') {
    return <FilesCell value={value} cellBase={cellBase} onChange={onChange} readOnly={readOnly} />
  }

  // ---- relação ----
  if (type === 'relation') {
    const source = sources.find(s => s.id === config.sourceTableId)
    const selected: string[] = Array.isArray(value) ? value as string[] : []
    if (!source) return <div className={cellBase} style={{ color: 'var(--notion-text-3)' }} title="Configure a fonte de dados no menu da coluna">Sem fonte</div>
    const selRows = selected.map(id => source.rows.find(r => r.id === id)).filter(Boolean) as DBRow[]
    function toggle(id: string) {
      const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
      onChange(next)
    }
    // rótulo do chip: campos escolhidos (displayColIds) ou o título da linha
    const relLabel = (r: DBRow) => relationLabel(r, source, column)
    return (
      <div className="relative w-full">
        <div className={cellBase + ' gap-1 flex-wrap'} onClick={e => { if (!readOnly) openAt(e, 240) }}>
          {selRows.length ? selRows.map(r => (
            <button key={r.id} type="button"
              onClick={e => { if (onOpenRecord) { e.stopPropagation(); onOpenRecord(source, r) } }}
              title={onOpenRecord ? `Abrir ${primaryValue(r, source.columns)}` : undefined}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] max-w-full transition hover:brightness-125"
              style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)', cursor: onOpenRecord ? 'pointer' : 'inherit' }}>
              <ArrowUpRight className="w-2.5 h-2.5 flex-shrink-0" /><span className="truncate">{relLabel(r)}</span>
            </button>
          )) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={280} onClose={() => setOpen(false)}>
            <RelationPicker source={source} selected={selected} onToggle={toggle} />
          </Dropdown>
        )}
      </div>
    )
  }

  // ---- rollup (calculado a partir da tabela relacionada) ----
  if (type === 'rollup') {
    const relCol = tableColumns.find(c => c.id === config.relationColId)
    const source = sources.find(s => s.id === relCol?.config.sourceTableId)
    const targetCol = source?.columns.find(c => c.id === config.targetColId)
    if (!relCol || !source || !targetCol || !row) return <div className={cellBase} style={{ color: 'var(--notion-text-3)' }} title="Configure o rollup no menu da coluna">—</div>
    return (
      <RollupCell column={column} row={row} tableColumns={tableColumns} sources={sources}
        cellBase={cellBase} readOnly={readOnly} onChange={onChange} />
    )
  }

  // ---- auto (read-only) ----
  if (type === 'created_at' || type === 'updated_at') {
    const v = type === 'created_at' ? rowMeta?.created_at : rowMeta?.updated_at
    return <div className={cellBase + ' font-mono text-xs'} style={{ color: 'var(--notion-text-3)' }}>{v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
  }
  if (type === 'created_by' || type === 'updated_by') {
    const id = type === 'created_by' ? rowMeta?.created_by : rowMeta?.updated_by
    const m = members.find(x => x.id === id)
    return <div className={cellBase + ' text-xs'} style={{ color: 'var(--notion-text-3)' }}>{m?.full_name || ''}</div>
  }

  return <div className={cellBase} style={{ color: 'var(--notion-text-3)' }}>—</div>
}

/**
 * Célula de rollup. Quando o registro relacionado traz MAIS DE UM valor
 * (ex.: um cliente com vários processos), a célula abre um menu para escolher
 * quais valores ficam à mostra — a escolha é gravada na própria linha.
 * Rollups com cálculo (soma, contagem…) continuam só de leitura.
 */
function RollupCell({ column, row, tableColumns, sources, cellBase, readOnly, onChange }: {
  column: DBColumn; row: DBRow; tableColumns: DBColumn[]; sources: DataSource[]
  cellBase: string; readOnly: boolean; onChange: (v: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const fn = column.config.rollupFn || 'concat'
  const all = useMemo(
    () => (fn === 'concat' ? rollupItems(column, row, tableColumns, sources) : []),
    [column, row, tableColumns, sources, fn],
  )
  const shown = useMemo(
    () => (fn === 'concat' ? rollupShown(column, row, tableColumns, sources) : []),
    [column, row, tableColumns, sources, fn],
  )

  if (fn !== 'concat') {
    return <div className={cellBase + ' font-mono text-xs'} style={{ color: 'var(--notion-text-2)' }}>{rollupText(column, row, tableColumns, sources)}</div>
  }

  const picked = rollupPick(row.data[column.id])
  const escolhivel = !readOnly && all.length > 1
  const marcado = (k: string) => (picked ? picked.includes(k) : true)

  function toggle(key: string) {
    const base = picked ?? all.map(i => i.key)
    const next = base.includes(key) ? base.filter(k => k !== key) : [...base, key]
    // desmarcar tudo volta ao padrão (mostrar todos)
    onChange(next.length === all.length || next.length === 0 ? null : makeRollupPick(next))
  }

  function openAt(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const w = 300, vw = window.innerWidth, vh = window.innerHeight
    setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), top: Math.max(8, Math.min(r.bottom + 4, vh - 330)) })
    setOpen(o => !o)
  }

  return (
    <div className="relative w-full">
      <div className={cellBase + ' gap-1 flex-wrap' + (escolhivel ? '' : ' cursor-default')}
        title={escolhivel ? 'Clique para escolher quais valores exibir' : undefined}
        onClick={e => { if (escolhivel) openAt(e) }}>
        {shown.length === 0 && <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        {shown.map(i => (
          <span key={i.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] max-w-full"
            style={i.color
              ? { background: `${i.color}22`, color: i.color, border: `1px solid ${i.color}33` }
              : { background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>
            <span className="truncate">{i.label}</span>
          </span>
        ))}
        {escolhivel && picked && (
          <span className="text-[10px] px-1 rounded flex-shrink-0" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}>
            {shown.length}/{all.length}
          </span>
        )}
      </div>
      {open && (
        <Dropdown pos={pos} width={300} onClose={() => setOpen(false)}>
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-1.5 pb-1.5" style={{ color: 'var(--notion-text-3)' }}>
            <ListChecks className="w-3 h-3" /> Escolha o que exibir
          </p>
          <div className="space-y-0.5">
            {all.map(i => (
              <button key={i.key} onClick={() => toggle(i.key)}
                className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                <span className="w-3.5 h-3.5 mt-0.5 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: marcado(i.key) ? 'var(--notion-accent)' : 'transparent', border: marcado(i.key) ? 'none' : '1.5px solid var(--notion-border)' }}>
                  {marcado(i.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block break-words" style={{ color: i.color || 'var(--notion-text)' }}>{i.label}</span>
                  {i.sub && <span className="block text-[10px] break-words" style={{ color: 'var(--notion-text-3)' }}>{i.sub}</span>}
                </span>
              </button>
            ))}
          </div>
          {picked && (
            <button onClick={() => { onChange(null); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 mt-1 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}>
              Mostrar todos
            </button>
          )}
        </Dropdown>
      )}
    </div>
  )
}

/**
 * Seletor de registro relacionado com busca (lupa). A fonte pode ter centenas de
 * linhas — sem filtrar não dá para achar o cliente. Mostra os já escolhidos no topo.
 */
function RelationPicker({ source, selected, onToggle }: {
  source: DataSource; selected: string[]; onToggle: (id: string) => void
}) {
  const [q, setQ] = useState('')

  // Índice de busca montado UMA vez por fonte (era refeito a cada tecla, e com
  // centenas de registros x dezenas de colunas a digitação travava).
  const index = useMemo(() => {
    const nrm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const textCols = source.columns.filter(c => ['text', 'phone', 'email', 'url', 'number', 'select', 'status', 'multi_select'].includes(c.type))
    const subCol = source.columns.find(x => ['phone', 'email'].includes(x.type))
    return source.rows.map(r => ({
      row: r,
      title: primaryValue(r, source.columns),
      sub: subCol ? String(r.data[subCol.id] ?? '') : '',
      hay: nrm([
        primaryValue(r, source.columns),
        ...textCols.map(c => {
          const v = r.data[c.id]
          if (v == null) return ''
          if (Array.isArray(v)) return v.map(x => (c.config.options || []).find(o => o.id === x)?.label || String(x)).join(' ')
          return (c.config.options || []).find(o => o.id === v)?.label || String(v)
        }),
      ].join(' ')),
    }))
  }, [source])

  const needle = q.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const matched = needle ? index.filter(e => e.hay.includes(needle)) : index
  const ordered = [
    ...matched.filter(e => selected.includes(e.row.id)),
    ...matched.filter(e => !selected.includes(e.row.id)),
  ]
  const list = ordered.slice(0, 80)

  return (
    <>
      <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1.5 rounded-md" style={{ background: 'var(--notion-bg-4)' }}>
        <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar em ${source.name}...`}
          className="bg-transparent text-xs outline-none flex-1 min-w-0" style={{ color: 'var(--notion-text)' }} />
        {q && <button onClick={() => setQ('')} style={{ color: 'var(--notion-text-3)' }}><X className="w-3 h-3" /></button>}
      </div>
      <div className="space-y-0.5">
        {source.rows.length === 0 && <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Fonte sem registros.</p>}
        {source.rows.length > 0 && list.length === 0 && <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Nada encontrado para “{q}”.</p>}
        {list.map(e => (
          <button key={e.row.id} onClick={() => onToggle(e.row.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
            <span className="flex-1 min-w-0 text-left">
              <span className="block truncate">{e.title}</span>
              {e.sub && <span className="block truncate text-[10px]" style={{ color: 'var(--notion-text-3)' }}>{e.sub}</span>}
            </span>
            {selected.includes(e.row.id) && <Check className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--notion-text-2)' }} />}
          </button>
        ))}
        {matched.length > list.length && (
          <p className="text-[10px] px-1 py-1.5" style={{ color: 'var(--notion-text-3)' }}>
            +{matched.length - list.length} registros — refine a busca.
          </p>
        )}
      </div>
    </>
  )
}

function FilesCell({ value, cellBase, onChange, readOnly = false }: { value: unknown; cellBase: string; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const files: string[] = Array.isArray(value) ? value as string[] : []
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function openAt(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    setPos({ left: Math.max(8, Math.min(r.left, vw - 280)), top: Math.max(8, Math.min(r.bottom + 4, vh - 240)) })
    setOpen(o => !o)
  }
  async function upload(file: File) {
    setUploading(true)
    try {
      const up = await uploadFile(file, 'arquivos')
      onChange([...files, up.url])
    } catch (e) {
      alert('Erro no upload: ' + (e as Error).message)
    }
    setUploading(false)
  }
  const nameOf = (url: string) => { try { return decodeURIComponent(url.split('/').pop() || 'arquivo').replace(/^[0-9a-f-]+\./, 'arquivo.') } catch { return 'arquivo' } }

  return (
    <div className="relative w-full">
      <div className={cellBase + ' gap-1 flex-wrap'} onClick={e => { if (!readOnly) openAt(e) }}>
        {files.length ? files.map((f, i) => (
          <a key={i} href={f} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>
            {nameOf(f)}<ExternalLink className="w-2.5 h-2.5" />
          </a>
        )) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
      </div>
      {open && (
        <Dropdown pos={pos} width={272} onClose={() => setOpen(false)}>
          {files.length > 0 && (
            <div className="mb-1.5 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>
                  <a href={f} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline" style={{ color: '#60A5FA' }}>{nameOf(f)}</a>
                  <button onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs transition-colors hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carregar arquivo
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="px-1.5 pt-1.5 mt-1 border-t" style={{ borderColor: 'var(--notion-border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--notion-text-3)' }}><Link2 className="w-3 h-3" /> Colar link</p>
            <div className="flex gap-1">
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."
                onKeyDown={e => { if (e.key === 'Enter' && link.trim()) { onChange([...files, link.trim()]); setLink('') } }}
                className="flex-1 px-2 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
              <button onClick={() => { if (link.trim()) { onChange([...files, link.trim()]); setLink('') } }} className="px-2 rounded text-xs" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Add</button>
            </div>
          </div>
        </Dropdown>
      )}
    </div>
  )
}

function OptionSearch({ options, selected, onPick, onAdd, onUpdate }: {
  options: SelectOption[]; selected: string[]; onPick: (o: SelectOption) => void; onAdd: (label: string) => void
  onUpdate?: (options: SelectOption[]) => void
}) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
  const exact = options.find(o => o.label.toLowerCase() === q.toLowerCase())

  // painel de edição da etiqueta (renomear / cor / excluir)
  if (editing && onUpdate) {
    const o = options.find(x => x.id === editing)
    if (!o) { setEditing(null); return null }
    return (
      <div onClick={e => e.stopPropagation()}>
        <button onClick={() => setEditing(null)} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Editar etiqueta</button>
        <input autoFocus value={o.label} onChange={e => onUpdate(options.map(x => x.id === o.id ? { ...x, label: e.target.value } : x))}
          className="w-full px-2 py-1.5 rounded text-xs outline-none mb-1" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }} />
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--notion-text-3)' }}>Cores</p>
        <div className="max-h-44 overflow-y-auto">
          {OPTION_COLORS.map(c => (
            <button key={c.hex} onClick={() => onUpdate(options.map(x => x.id === o.id ? { ...x, color: c.hex } : x))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]">
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
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar ou criar..."
        className="w-full px-2 py-1.5 mb-1 rounded text-xs outline-none" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text)' }}
        onKeyDown={e => { if (e.key === 'Enter' && q.trim() && !exact) { onAdd(q.trim()); setQ('') } }} />
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.map(o => (
          <div key={o.id} className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--notion-bg-4)] group">
            <button onClick={() => onPick(o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <Chip opt={o} />
              {selected.includes(o.id) && <Check className="w-3 h-3 ml-auto" style={{ color: 'var(--notion-text-2)' }} />}
            </button>
            {onUpdate && (
              <button onClick={() => setEditing(o.id)} title="Editar etiqueta" className="p-0.5 rounded hover:bg-[var(--notion-bg-3)] flex-shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
              </button>
            )}
          </div>
        ))}
        {q.trim() && !exact && (
          <button onClick={() => { onAdd(q.trim()); setQ('') }} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-2)' }}>
            <Plus className="w-3 h-3" /> Criar &quot;{q.trim()}&quot;
          </button>
        )}
      </div>
    </div>
  )
}
