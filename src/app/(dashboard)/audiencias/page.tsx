import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { getModuleTable } from '@/lib/dynamic-data'
import { Gavel } from 'lucide-react'

export default async function Page() {
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('audiencias')

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Audiências" icon={Gavel} color="#22D3EE"
        gradient="linear-gradient(135deg, #083344 0%, #155e75 60%, #083344 100%)" />
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
