import { getModuleTable } from '@/lib/dynamic-data'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'

export default async function FinanceiroTabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('fin-' + slug)

  if (!tableId) {
    return <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Aba não encontrada.</p>
  }

  return (
    <DynamicBoard key={tableId} tableId={tableId} initialColumns={columns} initialRows={rows}
      sources={sources} members={members} userId={userId} views={views} />
  )
}
