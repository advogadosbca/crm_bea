import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { FinanceiroClient } from './FinanceiroClient'

export default async function FinanceiroPage() {
  const { supabase, profile } = await getAuthProfile()
  const workspaceId = profile?.workspace_id
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
