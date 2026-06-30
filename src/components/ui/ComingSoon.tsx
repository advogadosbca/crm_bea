import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  description?: string
  icon: LucideIcon
  color: string
}

export function ComingSoon({ title, description, icon: Icon, color }: Props) {
  return (
    <div className="min-h-screen">
      <div className="h-36 relative overflow-hidden" style={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`,
      }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--notion-bg))' }} />
        <div className="absolute bottom-4 left-16 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${color}30`, border: `1px solid ${color}50` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
        </div>
      </div>

      <div className="px-16 py-6">
        <div className="flex items-center gap-2 mb-10 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <Link href="/" className="hover:text-[var(--notion-text-2)] transition-colors flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Início
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--notion-text-2)' }}>{title}</span>
        </div>

        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
            <Icon className="w-8 h-8" style={{ color }} />
          </div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>{title}</h2>
          <p className="text-sm text-center max-w-sm" style={{ color: 'var(--notion-text-2)' }}>
            {description || 'Este módulo está em desenvolvimento e estará disponível em breve.'}
          </p>
        </div>
      </div>
    </div>
  )
}
