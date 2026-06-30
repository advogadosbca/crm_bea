import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { getModuleTable } from '@/lib/dynamic-data'
import { FileText } from 'lucide-react'

export default async function Page() {
  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('alvaras')

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Comunicação de Alvará" icon={FileText} color="#FBBF24"
        gradient="linear-gradient(135deg, #451a03 0%, #78350f 60%, #451a03 100%)" />
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
