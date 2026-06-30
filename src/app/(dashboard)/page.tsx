import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { HomeHeader } from '@/components/layout/HomeHeader'
import Link from 'next/link'
import {
  Settings, Landmark, FileText, TrendingUp,
  Scale, Gavel, Building2, FolderOpen,
  Target, Users2, Megaphone, Lightbulb, SlidersHorizontal, Database
} from 'lucide-react'

const modules = [
  { href: '/geral', label: 'Geral', icon: Settings, color: '#5B6AF0' },
  { href: '/fontes', label: 'Fonte de dados', icon: Database, color: '#22D3EE' },
  { href: '/financeiro', label: 'Financeiro', icon: Landmark, color: '#10B981' },
  { href: '/alvaras', label: 'Alvarás', icon: FileText, color: '#F59E0B' },
  { href: '/pendencias', label: 'Pendências', icon: TrendingUp, color: '#EF4444' },
  { href: '/processos', label: 'Processos Judiciais', icon: Scale, color: '#8B5CF6' },
  { href: '/audiencias', label: 'Audiências', icon: Gavel, color: '#06B6D4' },
  { href: '/acoes-coletivas', label: 'Ações Coletivas', icon: Building2, color: '#EC4899' },
  { href: '/administrativo', label: 'Administrativo', icon: FolderOpen, color: '#F97316' },
  { href: '/metas', label: 'Metas', icon: Target, color: '#6EE7B7' },
  { href: '/membros', label: 'Membros', icon: Users2, color: '#A78BFA' },
  { href: '/marketing', label: 'Marketing', icon: Megaphone, color: '#FB7185' },
  { href: '/ideias', label: 'Ideias', icon: Lightbulb, color: '#FCD34D' },
  { href: '/settings', label: 'Settings', icon: SlidersHorizontal, color: '#94A3B8' },
]

export default async function HomePage() {
  const { supabase, profile } = await getAuthProfile()
  const wsId = profile?.workspace_id || ''

  const [{ data: workspace }, { data: members }, assets] = await Promise.all([
    supabase.from('workspaces').select('name, banner_url, logo_url').eq('id', wsId).single(),
    supabase.from('profiles').select('id, full_name, avatar_url, role')
      .eq('workspace_id', wsId).eq('is_active', true).limit(10),
    getPageAssets('home'),
  ])

  return (
    <div className="min-h-screen">
      <HomeHeader
        title={workspace?.name || 'Bernardes & Azevedo'}
        subtitle="Sociedade de Advogados"
        assets={assets} />

      {/* Page content */}
      <div className="px-16 pb-16 pt-8 relative">
        {/* Painel Pessoal */}
        {members && members.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: 'var(--notion-text-3)' }}>
              Painel Pessoal
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {members.map((member) => (
                <div key={member.id}
                  className="rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02] hover:border-[var(--notion-accent)]"
                  style={{
                    background: 'var(--notion-bg-2)',
                    borderColor: 'var(--notion-border)',
                  }}>
                  <div className="h-20 flex items-center justify-center"
                    style={{ background: 'var(--notion-bg-3)' }}>
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.full_name}
                        className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold"
                        style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>
                        {member.full_name[0]}
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-2">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--notion-text)' }}>
                      {member.full_name}
                    </p>
                    <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--notion-text-3)' }}>
                      {member.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Menu de Módulos */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'var(--notion-text-3)' }}>
            Menu
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {modules.map((mod, i) => {
              const Icon = mod.icon
              return (
                <Link key={mod.href} href={mod.href}
                  className="group flex flex-col items-start gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02] animate-fade-in"
                  style={{
                    background: 'var(--notion-bg-2)',
                    borderColor: 'var(--notion-border)',
                    animationDelay: `${i * 30}ms`,
                  }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
                    style={{ background: `${mod.color}18`, border: `1px solid ${mod.color}30` }}>
                    <Icon className="w-4 h-4" style={{ color: mod.color }} />
                  </div>
                  <span className="text-sm font-medium leading-tight" style={{ color: 'var(--notion-text)' }}>
                    {mod.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
