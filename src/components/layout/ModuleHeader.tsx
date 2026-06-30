import Link from 'next/link'
import { ChevronLeft, LucideIcon } from 'lucide-react'
import { BackHome } from './BackHome'

interface Props {
  title: string
  icon: LucideIcon
  color: string
  gradient: string
}

export function ModuleHeader({ title, icon: Icon, color, gradient }: Props) {
  return (
    <>
      <div className="h-36 relative overflow-hidden" style={{ background: gradient }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--notion-bg))' }} />
        <div className="absolute bottom-4 left-16 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${color}40`, border: `1px solid ${color}80` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
        </div>
      </div>
      <div className="px-16 pt-6">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <Link href="/" className="hover:text-[var(--notion-text-2)] transition-colors flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Início
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--notion-text-2)' }}>{title}</span>
        </div>
        <BackHome />
      </div>
    </>
  )
}
