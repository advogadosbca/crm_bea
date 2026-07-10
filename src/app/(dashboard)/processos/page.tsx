import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { getModuleTable } from '@/lib/dynamic-data'
import { Scale } from 'lucide-react'

export default async function Page() {
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('processos')

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Processos Judiciais" icon={Scale} color="#818CF8"
        gradient="linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%)" />
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
