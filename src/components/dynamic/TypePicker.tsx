'use client'

import { useState } from 'react'
import { COLUMN_TYPES, ColumnType } from '@/types/dynamic'
import {
  Type, Hash, ChevronDownCircle, List, LoaderCircle, Calendar, Users, CheckSquare,
  Link, Phone, AtSign, Paperclip, ArrowUpRight, Search, Sigma, MapPin, Clock, UserCircle,
  User, Mail, Star, Flag, Tag, Target, Briefcase, Building2, Landmark, Scale, Gavel,
  FileText, Folder, DollarSign, CreditCard, TrendingUp, AlertTriangle, Bell, Megaphone,
  MessageCircle, Heart, Bookmark, Zap, CheckCircle, Circle, Clipboard, Contact, Wifi,
  LogOut, Layers, Monitor, Home, Award, Banknote, ImageOff,
} from 'lucide-react'

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Type, Hash, ChevronDownCircle, List, LoaderCircle, Calendar, Users, CheckSquare,
  Link, Phone, AtSign, Paperclip, ArrowUpRight, Search, Sigma, MapPin, Clock, UserCircle,
  User, Mail, Star, Flag, Tag, Target, Briefcase, Building2, Landmark, Scale, Gavel,
  FileText, Folder, DollarSign, CreditCard, TrendingUp, AlertTriangle, Bell, Megaphone,
  MessageCircle, Heart, Bookmark, Zap, CheckCircle, Circle, Clipboard, Contact, Wifi,
  LogOut, Layers, Monitor, Home, Award, Banknote,
}

/** Ícones disponíveis para escolher manualmente no título de uma coluna */
export const ICON_CHOICES: string[] = [
  'Contact', 'User', 'Users', 'UserCircle', 'Scale', 'Gavel', 'Landmark', 'Building2',
  'Briefcase', 'Target', 'Flag', 'Tag', 'Star', 'Bookmark', 'Heart', 'Award',
  'AlertTriangle', 'Bell', 'Megaphone', 'MessageCircle', 'Zap', 'CheckCircle', 'Circle', 'Clipboard',
  'FileText', 'Folder', 'Paperclip', 'Calendar', 'Clock', 'MapPin', 'Home', 'Layers',
  'DollarSign', 'Banknote', 'CreditCard', 'TrendingUp', 'Phone', 'Mail', 'AtSign', 'Link',
  'Wifi', 'Monitor', 'LogOut', 'Hash', 'List', 'ChevronDownCircle', 'LoaderCircle', 'ArrowUpRight',
]

export function TypeIcon({ icon, className, style }: { icon: string; className?: string; style?: React.CSSProperties }) {
  const C = ICONS[icon] || Type
  return <C className={className} style={style} />
}

/** Grade para escolher um ícone personalizado de coluna. onPick(null) restaura o ícone do tipo. */
export function IconPicker({ current, onPick, onBack }: {
  current?: string; onPick: (icon: string | null) => void; onBack: () => void
}) {
  return (
    <div onClick={e => e.stopPropagation()}>
      <button onClick={onBack} className="w-full text-left px-2 py-1 text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>← Ícone</button>
      <button onClick={() => onPick(null)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-2)' }}>
        <ImageOff className="w-3.5 h-3.5" /> Usar ícone do tipo
      </button>
      <div className="my-1 border-t" style={{ borderColor: 'var(--notion-border)' }} />
      <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto p-0.5">
        {ICON_CHOICES.map(name => {
          const C = ICONS[name] || Type
          const active = current === name
          return (
            <button key={name} onClick={() => onPick(name)} title={name}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--notion-bg-4)]"
              style={{ background: active ? 'var(--notion-bg-4)' : 'transparent', outline: active ? '1px solid var(--notion-accent)' : 'none' }}>
              <C className="w-4 h-4" style={{ color: active ? 'var(--notion-accent)' : 'var(--notion-text-2)' }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TypePicker({ current, onPick, onClose }: {
  current?: ColumnType; onPick: (t: ColumnType) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = COLUMN_TYPES.filter(t => t.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="w-full animate-fade-in" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-2 py-1.5 m-1 rounded-md" style={{ background: 'var(--notion-bg-4)' }}>
        <Search className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
        <input autoFocus placeholder="Selecionar tipo" value={q} onChange={e => setQ(e.target.value)}
          className="bg-transparent text-xs outline-none flex-1" style={{ color: 'var(--notion-text)' }} />
      </div>
      <div className="max-h-72 overflow-y-auto grid grid-cols-2 gap-0.5 p-1">
        {filtered.map(t => (
          <button key={t.type} disabled={!t.available}
            onClick={() => { if (t.available) { onPick(t.type); onClose() } }}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--notion-bg-4)]"
            style={{ color: 'var(--notion-text)', background: current === t.type ? 'var(--notion-bg-4)' : 'transparent' }}>
            <TypeIcon icon={t.icon} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-2)' }} />
            <span className="truncate">{t.label}</span>
            {!t.available && <span className="text-[9px] ml-auto" style={{ color: 'var(--notion-text-3)' }}>em breve</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
