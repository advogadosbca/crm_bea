'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function FinanceiroTabs({ tabs }: { tabs: { name: string; slug: string }[] }) {
  const path = usePathname()
  return (
    <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
      {tabs.map(t => {
        const href = `/financeiro/${t.slug}`
        const active = path === href
        return (
          <Link key={t.slug} href={href}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              background: active ? 'var(--notion-bg-3)' : 'var(--notion-bg-2)',
              color: active ? 'var(--notion-text)' : 'var(--notion-text-2)',
              border: `1px solid ${active ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
            }}>
            {t.name}
          </Link>
        )
      })}
    </div>
  )
}
