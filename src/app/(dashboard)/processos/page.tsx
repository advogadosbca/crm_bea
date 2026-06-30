import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { ProcessosClient } from './ProcessosClient'

export default async function ProcessosPage() {
  const { supabase, profile } = await getAuthProfile()
  const workspaceId = profile?.workspace_id
  const assets = await getPageAssets('processos')

  const [{ data: processos }, { data: members }, { data: contacts }] = await Promise.all([
    supabase
      .from('processos')
      .select('*, membros:processo_membros(profile_id, profiles(full_name, avatar_url))')
      .eq('workspace_id', workspaceId || '')
      .order('prazo_limite', { ascending: true, nullsFirst: false }),
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('workspace_id', workspaceId || ''),
    supabase
      .from('contacts')
      .select('id, name')
      .eq('workspace_id', workspaceId || ''),
  ])

  return (
    <ProcessosClient
      processos={processos || []}
      members={members || []}
      contacts={contacts || []}
      workspaceId={workspaceId || ''}
      headerAssets={assets}
    />
  )
}
