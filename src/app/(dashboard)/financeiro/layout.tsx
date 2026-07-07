import { getAuthProfile } from '@/lib/auth'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { FinanceiroTabs } from './FinanceiroTabs'
import { Lock, Landmark } from 'lucide-react'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await getAuthProfile()
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

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

  const { data: tables } = await supabase
    .from('db_tables').select('name, module_key, position')
    .like('module_key', 'fin-%').order('position')
  const tabs = (tables || []).map(t => ({ name: t.name as string, slug: (t.module_key as string).replace('fin-', '') }))

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Financeiro" icon={Landmark} color="#34D399"
        gradient="linear-gradient(135deg, #064e3b 0%, #065f46 60%, #064e3b 100%)" />
      <div className="px-16 py-6">
        <FinanceiroTabs tabs={tabs} />
        {children}
      </div>
    </div>
  )
}
