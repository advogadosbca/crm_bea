import { getModuleTable } from '@/lib/dynamic-data'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import type { DBRow } from '@/types/dynamic'

export default async function FinanceiroTabPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('fin-' + slug)

  if (!tableId) {
    return <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Aba não encontrada.</p>
  }

  // filtro global de data (vindo da URL) aplicado às linhas desta aba
  const { ano, mes, de, ate } = sp
  const dataCol = columns.find(c => c.name.toLowerCase() === 'data') || columns.find(c => c.type === 'date')
  let shown: DBRow[] = rows
  if (dataCol && (ano || mes || de || ate)) {
    shown = rows.filter(r => {
      const d = String((r.data as Record<string, unknown>)[dataCol.id] || '').slice(0, 10)
      if (!d) return false
      if (de || ate) { if (de && d < de) return false; if (ate && d > ate) return false; return true }
      if (ano && d.slice(0, 4) !== ano) return false
      if (mes && d.slice(5, 7) !== mes) return false
      return true
    })
  }

  const filterKey = `${ano || ''}|${mes || ''}|${de || ''}|${ate || ''}`

  return (
    <DynamicBoard key={`${tableId}:${filterKey}`} tableId={tableId} initialColumns={columns} initialRows={shown}
      sources={sources} members={members} userId={userId} views={views} />
  )
}
