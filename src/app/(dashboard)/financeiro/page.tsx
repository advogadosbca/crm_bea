import { getAuthProfile } from '@/lib/auth'
import { getModuleTable } from '@/lib/dynamic-data'
import { DynamicBoard } from '@/components/dynamic/DynamicBoard'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { FinanceiroResumo } from './FinanceiroResumo'
import { Lock, Landmark } from 'lucide-react'
import type { SelectOption } from '@/types/dynamic'

export default async function FinanceiroPage() {
  const { profile } = await getAuthProfile()
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  // Módulo restrito: só admins
  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
          <Lock className="w-7 h-7" style={{ color: 'var(--notion-text-3)' }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Acesso restrito</h1>
        <p className="text-sm mt-2 max-w-sm" style={{ color: 'var(--notion-text-2)' }}>
          Você não tem acesso a este módulo. O <b>Financeiro</b> é restrito a administradores.
        </p>
      </div>
    )
  }

  const { tableId, columns, rows, sources, members, userId, views } = await getModuleTable('financeiro')
  const byName = (n: string) => columns.find(c => c.name === n)
  const tipoCol = byName('Tipo')
  const entradaOptId = ((tipoCol?.config?.options as SelectOption[] | undefined) || []).find(o => o.label === 'Entrada')?.id

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Financeiro" icon={Landmark} color="#34D399"
        gradient="linear-gradient(135deg, #064e3b 0%, #065f46 60%, #064e3b 100%)" />
      <div className="px-16 py-6">
        {tableId ? (
          <>
            <FinanceiroResumo rows={rows} tipoColId={tipoCol?.id} dataColId={byName('Data')?.id}
              valorColId={byName('Valor')?.id} entradaOptId={entradaOptId} />
            <DynamicBoard key={tableId} tableId={tableId} initialColumns={columns} initialRows={rows}
              sources={sources} members={members} userId={userId} views={views} />
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>Tabela não provisionada.</p>
        )}
      </div>
    </div>
  )
}
