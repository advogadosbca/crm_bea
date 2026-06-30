import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { MembrosClient } from './MembrosClient'
import { createClient } from '@supabase/supabase-js'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('membros')
  const ws = profile?.workspace_id

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, avatar_url, is_active, created_at')
    .eq('workspace_id', ws || '')
    .order('created_at', { ascending: true })

  // status de confirmação (convite aceito?) via service role
  const confirmed = new Map<string, boolean>()
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    data?.users.forEach(u => confirmed.set(u.id, !!u.email_confirmed_at))
  } catch { /* ignora; trata todos como confirmados se não conseguir ler */ }

  const enriched = (members || []).map(m => ({
    ...m,
    pending: confirmed.has(m.id) ? !confirmed.get(m.id) : false,
  }))

  return <MembrosClient headerAssets={assets} members={enriched} workspaceId={ws || ''} currentRole={profile?.role || 'colaborador'} currentUserId={user!.id} />
}
