import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Busca usuário + perfil uma única vez por request (deduplicado com React cache).
 * Layout e páginas podem chamar livremente sem multiplicar round-trips ao Supabase.
 */
export const getAuthProfile = cache(async () => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, workspace_id, avatar_url')
    .eq('id', user.id)
    .single()

  return { supabase, user, profile }
})

/**
 * Resolve banner/logo de uma página: override da própria página sobre o padrão do workspace.
 */
export async function getPageAssets(pageKey: string) {
  const { supabase, profile } = await getAuthProfile()
  const ws = profile?.workspace_id
  if (!ws) return { banner: null, logo: null, workspaceId: '', canEdit: false }

  const [{ data: w }, { data: pa }] = await Promise.all([
    supabase.from('workspaces').select('banner_url, logo_url').eq('id', ws).single(),
    supabase.from('page_assets').select('banner_url, logo_url').eq('workspace_id', ws).eq('page_key', pageKey).maybeSingle(),
  ])

  return {
    banner: pa?.banner_url ?? w?.banner_url ?? null,
    logo: pa?.logo_url ?? w?.logo_url ?? null,
    workspaceId: ws,
    canEdit: ['super_admin', 'admin'].includes(profile?.role || ''),
  }
}
