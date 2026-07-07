'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Plus } from 'lucide-react'

export function FinanceiroTabs({ tabs, workspaceId }: { tabs: { name: string; slug: string }[]; workspaceId: string }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString()
  const [creating, setCreating] = useState(false)

  async function addTab() {
    const name = window.prompt('Nome da nova aba:')?.trim()
    if (!name) return
    setCreating(true)
    const supabase = createClient()
    const slug = crypto.randomUUID().slice(0, 8)
    const tableId = crypto.randomUUID()
    const { error } = await supabase.from('db_tables').insert({ id: tableId, workspace_id: workspaceId, name, module_key: `fin-${slug}`, position: 999 })
    if (!error) {
      await supabase.from('db_columns').insert([
        { table_id: tableId, name: 'Nome', type: 'text', position: 0, config: {} },
        { table_id: tableId, name: 'Data', type: 'date', position: 1, config: {} },
      ])
      await supabase.from('db_views').insert({ table_id: tableId, name: 'Tabela', type: 'table', position: 0 })
      router.push(`/financeiro/${slug}`)
      router.refresh()
    } else {
      alert('Erro ao criar aba: ' + error.message)
    }
    setCreating(false)
  }

  return (
    <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
      {tabs.map(t => {
        const href = `/financeiro/${t.slug}${qs ? '?' + qs : ''}`
        const active = path === `/financeiro/${t.slug}`
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
      <button onClick={addTab} disabled={creating} title="Nova aba"
        className="px-2 py-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-[var(--notion-bg-3)]"
        style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
