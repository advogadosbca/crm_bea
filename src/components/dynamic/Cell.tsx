'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase'
import { DBColumn, DBRow, DataSource, SelectOption, formatNumber, primaryValue, displayValue, OPTION_COLORS } from '@/types/dynamic'
import { Check, Plus, ExternalLink, X, ArrowUpRight, Upload, Link2, Loader2, MoreHorizontal, Trash2 } from 'lucide-react'

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

  // ---- texto / url / phone / email ----
  if (['text', 'url', 'phone', 'email'].includes(type)) {
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
          {m ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{m.full_name[0]}</span>{m.full_name}</span> : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={192} onClose={() => setOpen(false)}>
            <button onClick={() => { onChange(null); setOpen(false) }} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}>— Ninguém —</button>
            {members.map(mm => (
              <button key={mm.id} onClick={() => { onChange(mm.id); setOpen(false) }} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)] flex items-center gap-1.5" style={{ color: 'var(--notion-text)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{mm.full_name[0]}</span>{mm.full_name}
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
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{m.full_name[0]}</span>
              {m.full_name}
            </span>
          )) : <span style={{ color: 'var(--notion-text-3)' }}> </span>}
        </div>
        {open && (
          <Dropdown pos={pos} width={200} onClose={() => setOpen(false)}>
            {members.map(mm => (
              <button key={mm.id} onClick={() => toggle(mm.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{mm.full_name[0]}</span>
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
    const displayIds = config.displayColIds || []
    const relLabel = (r: DBRow) => {
      if (!displayIds.length) return primaryValue(r, source.columns)
      const parts = displayIds.map(id => {
        const c = source.columns.find(x => x.id === id)
        return c ? displayValue(r.data[id], c) : ''
      }).filter(Boolean)
      return parts.join(' · ') || primaryValue(r, source.columns)
    }
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
          <Dropdown pos={pos} width={240} onClose={() => setOpen(false)}>
            <p className="text-[10px] uppercase tracking-wider px-1 pb-1" style={{ color: 'var(--notion-text-3)' }}>{source.name}</p>
            <div className="space-y-0.5">
              {source.rows.length === 0 && <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Fonte sem registros.</p>}
              {source.rows.map(r => (
                <button key={r.id} onClick={() => toggle(r.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}>
                  <span className="truncate flex-1 text-left">{primaryValue(r, source.columns)}</span>
                  {selected.includes(r.id) && <Check className="w-3 h-3" style={{ color: 'var(--notion-text-2)' }} />}
                </button>
              ))}
            </div>
          </Dropdown>
        )}
      </div>
    )
  }

  // ---- rollup (read-only, calculado) ----
  if (type === 'rollup') {
    const relCol = tableColumns.find(c => c.id === config.relationColId)
    const source = sources.find(s => s.id === relCol?.config.sourceTableId)
    const targetCol = source?.columns.find(c => c.id === config.targetColId)
    if (!relCol || !source || !targetCol || !config.rollupFn) return <div className={cellBase} style={{ color: 'var(--notion-text-3)' }} title="Configure o rollup no menu da coluna">—</div>
    const relIds: string[] = Array.isArray(row?.data[relCol.id]) ? row!.data[relCol.id] as string[] : []
    const relRows = relIds.map(id => source.rows.find(r => r.id === id)).filter(Boolean) as DBRow[]
    const vals = relRows.map(r => r.data[targetCol.id])
    let out = ''
    const fn = config.rollupFn
    if (fn === 'count') out = String(relRows.length)
    else if (fn === 'concat') out = vals.map(v => Array.isArray(v) ? v.join(', ') : String(v ?? '')).filter(Boolean).join(', ')
    else {
      const nums = vals.map(Number).filter(n => !isNaN(n))
      if (fn === 'sum') out = formatNumber(nums.reduce((a, b) => a + b, 0), targetCol.config.format)
      else if (fn === 'avg') out = formatNumber(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0, targetCol.config.format)
      else if (fn === 'min') out = nums.length ? formatNumber(Math.min(...nums), targetCol.config.format) : ''
      else if (fn === 'max') out = nums.length ? formatNumber(Math.max(...nums), targetCol.config.format) : ''
    }
    return <div className={cellBase + ' font-mono text-xs'} style={{ color: 'var(--notion-text-2)' }}>{out}</div>
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

function FilesCell({ value, cellBase, onChange, readOnly = false }: { value: unknown; cellBase: string; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const supabase = createClient()
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
    const ext = file.name.split('.').pop() || 'bin'
    const path = `arquivos/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('assets').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('assets').getPublicUrl(path)
      onChange([...files, data.publicUrl])
    } else alert('Erro no upload: ' + error.message)
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
