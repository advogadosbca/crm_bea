import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { FinanceiroClient } from './FinanceiroClient'
import { Lock } from 'lucide-react'

export default async function FinanceiroPage() {
  const { supabase, profile } = await getAuthProfile()
  const workspaceId = profile?.workspace_id
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  // Módulo restrito: só admins acessam
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

  const assets = await getPageAssets('financeiro')

  const [{ data: transacoes }, { data: contacts }] = await Promise.all([
    supabase
      .from('transacoes')
      .select('*, contact:contacts(name, telefone)')
      .eq('workspace_id', workspaceId || '')
      .order('created_at', { ascending: false }),
    supabase
      .from('contacts')
      .select('id, name, telefone')
      .eq('workspace_id', workspaceId || ''),
  ])

  return (
    <FinanceiroClient
      transacoes={transacoes || []}
      contacts={contacts || []}
      workspaceId={workspaceId || ''}
      headerAssets={assets}
    />
  )
}
