import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { IdeiasClient } from './IdeiasClient'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('ideias')
  const ws = profile?.workspace_id

  const { data: ideias } = await supabase
    .from('ideias')
    .select('*, autor:profiles(full_name)')
    .eq('workspace_id', ws || '')
    .order('created_at', { ascending: false })

  return <IdeiasClient headerAssets={assets} ideias={ideias || []} workspaceId={ws || ''} userId={user!.id} />
}
