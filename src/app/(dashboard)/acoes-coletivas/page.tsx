import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { AcoesClient } from './AcoesClient'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('acoes-coletivas')
  const ws = profile?.workspace_id

  const [{ data: acoes }, { data: processos }] = await Promise.all([
    supabase.from('acoes_coletivas').select('*, processo:processos(numero)').eq('workspace_id', ws || '').order('created_at', { ascending: false }),
    supabase.from('processos').select('id, numero').eq('workspace_id', ws || ''),
  ])

  return <AcoesClient headerAssets={assets} acoes={acoes || []} processos={processos || []} workspaceId={ws || ''} />
}
