import { getAuthProfile } from '@/lib/auth'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { FinanceiroTabs } from './FinanceiroTabs'
import { FinanceiroResumo, type FinEntry } from './FinanceiroResumo'
import { Lock, Landmark } from 'lucide-react'

const RECEITA_KEYS = ['fin-adv-entradas', 'fin-hub-entradas']
const DESPESA_KEYS = ['fin-adv-saidas', 'fin-hub-saidas']

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
    .from('db_tables').select('id, name, module_key, position')
    .like('module_key', 'fin-%').order('position')
  const allTables = tables || []
  const tabs = allTables.map(t => ({ name: t.name as string, slug: (t.module_key as string).replace('fin-', '') }))

  // resumo: soma Entradas (receita) e Saídas (despesa) por período
  const finTables = allTables.filter(t => [...RECEITA_KEYS, ...DESPESA_KEYS].includes(t.module_key as string))
  const finIds = finTables.map(t => t.id as string)
  let entries: FinEntry[] = []
  if (finIds.length) {
    const [{ data: cols }, { data: rows }] = await Promise.all([
      supabase.from('db_columns').select('id, table_id, name').in('table_id', finIds),
      supabase.from('db_rows').select('table_id, data').in('table_id', finIds),
    ])
    const meta = new Map(finTables.map(t => {
      const c = (cols || []).filter(x => x.table_id === t.id)
      const valorId = c.find(x => (x.name as string).toLowerCase() === 'valor')?.id as string | undefined
      const dataId = c.find(x => (x.name as string).toLowerCase() === 'data')?.id as string | undefined
      const tipo: 'receita' | 'despesa' = RECEITA_KEYS.includes(t.module_key as string) ? 'receita' : 'despesa'
      return [t.id as string, { valorId, dataId, tipo }]
    }))
    entries = (rows || []).map(r => {
      const m = meta.get(r.table_id as string)!
      const d = (r.data as Record<string, unknown>) || {}
      return { tipo: m.tipo, valor: Number(m.valorId ? d[m.valorId] : 0) || 0, data: m.dataId ? (d[m.dataId] as string) || null : null }
    })
  }

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Financeiro" icon={Landmark} color="#34D399"
        gradient="linear-gradient(135deg, #064e3b 0%, #065f46 60%, #064e3b 100%)" />
      <div className="px-16 py-6">
        <FinanceiroResumo entries={entries} />
        <FinanceiroTabs tabs={tabs} />
        {children}
      </div>
    </div>
  )
}
