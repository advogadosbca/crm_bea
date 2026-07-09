import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { Lock } from 'lucide-react'
import { DBColumn, displayValue } from '@/types/dynamic'
import { DashboardClient, type FinRow } from './DashboardClient'

const RECEITA_KEYS = ['fin-adv-entradas', 'fin-hub-entradas']
const DESPESA_KEYS = ['fin-adv-saidas', 'fin-hub-saidas']
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default async function DashboardPage() {
  const { supabase, profile } = await getAuthProfile()
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')
  const ws = profile?.workspace_id || ''

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
          <Lock className="w-7 h-7" style={{ color: 'var(--notion-text-3)' }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Acesso restrito</h1>
        <p className="text-sm mt-2 max-w-sm" style={{ color: 'var(--notion-text-2)' }}>O <b>Dashboard</b> financeiro é restrito a administradores.</p>
      </div>
    )
  }

  // tabelas financeiras do workspace
  const { data: tables } = await supabase.from('db_tables').select('id, module_key').eq('workspace_id', ws).like('module_key', 'fin-%')
  const finTables = (tables || []).filter(t => [...RECEITA_KEYS, ...DESPESA_KEYS].includes(t.module_key as string))
  const finIds = finTables.map(t => t.id as string)

  let rows: FinRow[] = []
  if (finIds.length) {
    const [{ data: cols }, { data: drows }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', finIds),
      supabase.from('db_rows').select('table_id, data').in('table_id', finIds).limit(100000),
    ])
    const allCols = (cols || []) as DBColumn[]
    const meta = new Map(finTables.map(t => {
      const c = allCols.filter(x => x.table_id === t.id)
      const findCol = (names: string[]) => c.find(x => names.includes(norm(x.name)))
      return [t.id as string, {
        valorId: findCol(['valor'])?.id,
        dataId: findCol(['data'])?.id,
        canalCol: findCol(['canal']),
        areaCol: findCol(['area']),
        materiaCol: findCol(['materia']),
        despesaCol: findCol(['despesa', 'categoria', 'conta']),
        tipoCol: findCol(['tipo', 'custo/tipo']),
        tipo: (RECEITA_KEYS.includes(t.module_key as string) ? 'receita' : 'despesa') as 'receita' | 'despesa',
      }]
    }))
    rows = (drows || []).map(r => {
      const m = meta.get(r.table_id as string)!
      const d = (r.data as Record<string, unknown>) || {}
      return {
        tipo: m.tipo,
        valor: Number(m.valorId ? d[m.valorId] : 0) || 0,
        data: m.dataId ? ((d[m.dataId] as string) || null) : null,
        canal: m.canalCol ? (displayValue(d[m.canalCol.id], m.canalCol) || null) : null,
        area: m.areaCol ? (displayValue(d[m.areaCol.id], m.areaCol) || null) : null,
        materia: m.materiaCol ? (displayValue(d[m.materiaCol.id], m.materiaCol) || null) : null,
        categoria: m.despesaCol ? (displayValue(d[m.despesaCol.id], m.despesaCol) || null) : null,
        custoTipo: m.tipoCol ? (displayValue(d[m.tipoCol.id], m.tipoCol) || null) : null,
      }
    })
  }

  // meta mensal configurável — guardada em db_rows de uma tabela cfg-dashboard (sem alterar schema)
  let metaTableId: string | null = null, metaRowId: string | null = null, initialMeta = 85000
  const { data: cfgTable } = await supabase.from('db_tables').select('id').eq('workspace_id', ws).eq('module_key', 'cfg-dashboard').maybeSingle()
  if (cfgTable?.id) {
    metaTableId = cfgTable.id as string
    const { data: cfgRow } = await supabase.from('db_rows').select('id, data').eq('table_id', metaTableId).order('position').limit(1).maybeSingle()
    if (cfgRow) {
      metaRowId = cfgRow.id as string
      const v = Number((cfgRow.data as Record<string, unknown>)?.meta_mensal)
      if (v > 0) initialMeta = v
    }
  }

  const assets = await getPageAssets('dashboard')

  return (
    <DashboardClient rows={rows} initialMeta={initialMeta} workspaceId={ws}
      metaTableId={metaTableId} metaRowId={metaRowId} logoUrl={assets.logo} />
  )
}
