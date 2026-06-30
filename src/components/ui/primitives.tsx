'use client'

import { X, Search, Plus } from 'lucide-react'

export const inputStyle: React.CSSProperties = {
  background: 'var(--notion-bg-3)',
  border: '1px solid var(--notion-border)',
  color: 'var(--notion-text)',
}

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--notion-text-2)' }}>{label}</label>
      {children}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>{children}</select>
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-lg text-sm resize-none" style={inputStyle} />
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

export function Toolbar({ search, setSearch, onNew, placeholder = 'Buscar...', left }: {
  search: string; setSearch: (v: string) => void; onNew: () => void; placeholder?: string; left?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div>{left}</div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
          <input placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-40" style={{ color: 'var(--notion-text)' }} />
        </div>
        <button onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
          style={{ background: 'var(--notion-accent)', color: '#fff' }}>
          <Plus className="w-3.5 h-3.5" /> Novo
        </button>
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl overflow-y-auto max-h-[90vh] animate-fade-in"
        style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--notion-text)' }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function ModalActions({ onCancel, saving }: { onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel}
        className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
        Cancelar
      </button>
      <button type="submit" disabled={saving}
        className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}

export function EmptyRow({ cols, label = 'Nenhum registro encontrado' }: { cols: number; label?: string }) {
  return (
    <tr><td colSpan={cols} className="text-center py-12 text-sm" style={{ color: 'var(--notion-text-3)' }}>{label}</td></tr>
  )
}

export function fmtDate(d?: string | null) {
  return d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—'
}

export function fmtBRL(v?: number | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
