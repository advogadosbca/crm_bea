import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { getModuleTable } from '@/lib/dynamic-data'
import { TrendingUp } from 'lucide-react'

export default async function Page() {
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('pendencias')

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Pendências Processuais" icon={TrendingUp} color="#F87171"
        gradient="linear-gradient(135deg, #450a0a 0%, #7f1d1d 60%, #450a0a 100%)" />
      <div className="px-16 py-6">
        {tableId ? (
          <DynamicBoard key={tableId} tableId={tableId} initialColumns={columns} initialRows={rows}
            sources={sources} members={members} userId={userId} views={views} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Tabela não provisionada.</p>
        )}
      </div>
    </div>
  )
}
