'use client'

import { Target, Scale } from 'lucide-react'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { DynamicBoard, DBView } from '@/components/dynamic/DynamicBoard'
import { DBColumn, DBRow, DataSource } from '@/types/dynamic'

export function MetasClient({ headerAssets, tableId, columns, rows, sources, members, userId, views }: {
  headerAssets: HeaderAssets
  tableId?: string
  columns: DBColumn[]
  rows: DBRow[]
  sources: DataSource[]
  members: { id: string; full_name: string }[]
  userId: string
  views: DBView[]
}) {
  return (
    <div className="min-h-screen">
      <EditableHeader title="Dashboard de Metas" icon={Target} color="#F9A8D4"
        gradient="linear-gradient(135deg, #4a044e 0%, #9d174d 60%, #4a044e 100%)"
        pageKey="metas" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4" style={{ color: '#60A5FA' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--notion-text)' }}>Acompanhamento de Contratos Mês</h2>
          </div>
          {tableId ? (
            <DynamicBoard key={tableId} tableId={tableId} initialColumns={columns} initialRows={rows}
              sources={sources} members={members} userId={userId} views={views} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Base de dados “Leads” não encontrada.</p>
          )}
        </section>
      </div>
    </div>
  )
}
