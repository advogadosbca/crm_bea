'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Settings, Users, TrendingUp, FileText, Scale,
  Gavel, Building2, Target, Users2, Megaphone,
  Lightbulb, Landmark, Home, ChevronRight, LogOut, Database, BarChart3
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const modules = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/geral', label: 'Geral', icon: Settings },
  { href: '/fontes', label: 'Fonte de dados', icon: Database },
  { href: '/financeiro', label: 'Financeiro', icon: Landmark },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/alvaras', label: 'Alvarás', icon: FileText },
  { href: '/pendencias', label: 'Pendências', icon: TrendingUp },
  { href: '/processos', label: 'Processos Judiciais', icon: Scale },
  { href: '/audiencias', label: 'Audiências', icon: Gavel },
  { href: '/acoes-coletivas', label: 'Ações Coletivas', icon: Building2 },
  { href: '/administrativo', label: 'Administrativo', icon: FileText },
  { href: '/metas', label: 'Metas', icon: Target },
  { href: '/membros', label: 'Membros', icon: Users2 },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/ideias', label: 'Ideias', icon: Lightbulb },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ workspaceName }: { workspaceName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col z-30" style={{
      background: 'var(--notion-bg-2)',
      borderRight: '1px solid var(--notion-border)',
    }}>
      {/* Workspace name */}
      <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium hover:bg-[var(--notion-bg-3)] transition-colors">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--notion-accent)', color: '#fff' }}>
            {(workspaceName || 'W')[0]}
          </div>
          <span className="flex-1 text-left truncate text-sm" style={{ color: 'var(--notion-text)' }}>
            {workspaceName || 'Workspace'}
          </span>
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--notion-text-3)' }} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {modules.map((mod) => {
          const Icon = mod.icon
          const isActive = pathname === mod.href
          return (
            <Link key={mod.href} href={mod.href}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors group"
              style={{
                color: isActive ? 'var(--notion-text)' : 'var(--notion-text-2)',
                background: isActive ? 'var(--notion-bg-3)' : 'transparent',
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0 transition-colors"
                style={{ color: isActive ? 'var(--notion-accent)' : 'var(--notion-text-3)' }} />
              <span className="truncate">{mod.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 py-3 border-t" style={{ borderColor: 'var(--notion-border)' }}>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--notion-bg-3)]"
          style={{ color: 'var(--notion-text-2)' }}
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
