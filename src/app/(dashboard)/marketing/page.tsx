import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { MarketingClient } from './MarketingClient'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('marketing')
  const ws = profile?.workspace_id

  const [{ data: campanhas }, { data: members }] = await Promise.all([
    supabase.from('campanhas').select('*, responsavel:profiles(full_name)').eq('workspace_id', ws || '').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', ws || ''),
  ])

  return <MarketingClient headerAssets={assets} campanhas={campanhas || []} members={members || []} workspaceId={ws || ''} />
}
