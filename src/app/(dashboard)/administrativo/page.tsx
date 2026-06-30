import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { AdministrativoClient } from './AdministrativoClient'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('administrativo')
  const ws = profile?.workspace_id

  const { data: documentos } = await supabase
    .from('documentos')
    .select('*, responsavel:profiles(full_name)')
    .eq('workspace_id', ws || '')
    .order('created_at', { ascending: false })

  return <AdministrativoClient headerAssets={assets} documentos={documentos || []} workspaceId={ws || ''} userId={user!.id} />
}
