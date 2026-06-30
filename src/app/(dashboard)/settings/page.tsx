import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { SettingsClient } from './SettingsClient'
import { headers } from 'next/headers'

export default async function Page() {
  const { supabase, user, profile } = await getAuthProfile()
  const assets = await getPageAssets('settings')
  const ws = profile?.workspace_id
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  const [{ data: workspace }, { data: keys }] = await Promise.all([
    supabase.from('workspaces').select('*').eq('id', ws || '').single(),
    isAdmin
      ? supabase.from('api_keys').select('id, name, key, created_at, last_used_at').eq('revoked', false).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const h = await headers()
  const proto = h.get('x-forwarded-proto') || 'http'
  const host = h.get('host') || 'localhost:3010'
  const baseUrl = `${proto}://${host}`

  return (
    <SettingsClient
      headerAssets={assets}
      workspace={workspace}
      canEdit={isAdmin}
      profile={{
        id: user!.id,
        full_name: profile?.full_name || '',
        email: profile?.email || user!.email || '',
        avatar_url: profile?.avatar_url || '',
        role: profile?.role || 'colaborador',
      }}
      apiKeys={(keys as { id: string; name: string; key: string; created_at: string; last_used_at: string | null }[]) || []}
      baseUrl={baseUrl}
    />
  )
}
