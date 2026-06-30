'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, Scale, UserRound, AlarmClock } from 'lucide-react'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { fmtDate } from '@/components/ui/primitives'

interface Item {
  id: string; tipo: 'Contato' | 'Processo'; titulo: string; detalhe: string; data: string
}

export function PendenciasClient({ headerAssets, items }: {
  headerAssets: HeaderAssets; items: Item[] }) {
  const [filter, setFilter] = useState<'todos' | 'vencidos' | 'proximos'>('todos')
  const today = new Date().toISOString().split('T')[0]
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0]

  const filtered = useMemo(() => {
    if (filter === 'vencidos') return items.filter(i => i.data < today)
    if (filter === 'proximos') return items.filter(i => i.data >= today && i.data <= in7)
    return items
  }, [items, filter, today, in7])

  // Group by month
  const groups = useMemo(() => {
    const map: Record<string, Item[]> = {}
    filtered.forEach(i => {
      const key = i.data ? new Date(i.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data'
      ;(map[key] ||= []).push(i)
    })
    return map
  }, [filtered])

  const vencidos = items.filter(i => i.data < today).length
  const proximos = items.filter(i => i.data >= today && i.data <= in7).length

  return (
    <div className="min-h-screen">
      <EditableHeader title="Pendências" icon={TrendingUp} color="#F87171"
        gradient="linear-gradient(135deg, #450a0a 0%, #7f1d1d 60%, #450a0a 100%)"
        pageKey="pendencias" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />
      <div className="px-16 py-6">
        <div className="flex items-center gap-1 p-1 rounded-lg mb-6 w-fit" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {([
            { key: 'todos', label: `Todas (${items.length})` },
            { key: 'vencidos', label: `Vencidas (${vencidos})`, warn: vencidos > 0 },
            { key: 'proximos', label: `Próximos 7 dias (${proximos})` },
          ] as { key: typeof filter; label: string; warn?: boolean }[]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: filter === f.key ? 'var(--notion-bg-3)' : 'transparent',
                color: filter === f.key ? 'var(--notion-text)' : f.warn ? '#F87171' : 'var(--notion-text-2)',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {Object.keys(groups).length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--notion-text-3)' }}>Nenhuma pendência neste filtro</div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groups).map(([month, list]) => (
              <div key={month}>
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-3 capitalize" style={{ color: 'var(--notion-text-3)' }}>{month}</h3>
                <div className="relative pl-6">
                  {/* timeline line */}
                  <div className="absolute left-1.5 top-1 bottom-1 w-px" style={{ background: 'var(--notion-border)' }} />
                  <div className="space-y-3">
                    {list.map((i, idx) => {
                      const overdue = i.data < today
                      const Icon = i.tipo === 'Processo' ? Scale : UserRound
                      return (
                        <div key={`${i.tipo}-${i.id}`} className="relative animate-fade-in" style={{ animationDelay: `${idx * 20}ms` }}>
                          <div className="absolute -left-[18px] top-3 w-3 h-3 rounded-full border-2"
                            style={{ background: 'var(--notion-bg)', borderColor: overdue ? '#EF4444' : 'var(--notion-accent)' }} />
                          <div className="rounded-xl p-4 border flex items-center gap-4" style={{
                            background: overdue ? 'rgba(239,68,68,0.05)' : 'var(--notion-bg-2)',
                            borderColor: overdue ? 'rgba(239,68,68,0.2)' : 'var(--notion-border)',
                          }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: i.tipo === 'Processo' ? 'rgba(139,92,246,0.15)' : 'rgba(91,106,240,0.15)' }}>
                              <Icon className="w-4 h-4" style={{ color: i.tipo === 'Processo' ? '#A78BFA' : '#818CF8' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{i.titulo}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--notion-text-2)' }}>{i.detalhe}</p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs font-mono whitespace-nowrap"
                              style={{ color: overdue ? '#F87171' : 'var(--notion-text-2)' }}>
                              <AlarmClock className="w-3 h-3" /> {fmtDate(i.data)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
