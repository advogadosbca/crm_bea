import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { EditableHeader } from '@/components/layout/EditableHeader'
import { Bell } from 'lucide-react'
import { NovidadesClient, type Comunicacao } from './NovidadesClient'

/**
 * Central de Novidades: uma linha por comunicação processual, com estado de
 * leitura e aprovação. A leitura passa pela RLS (o membro só vê o próprio
 * workspace); toda escrita vai por /api/novidades/acao.
 */
export default async function Page() {
  const { supabase, profile } = await getAuthProfile()
  const assets = await getPageAssets('novidades')
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  const [{ data: comunicacoes }, { data: membros }, { data: tratadas }] = await Promise.all([
    supabase.from('comunicacoes')
      .select('*').eq('status', 'nova').order('detectado_em', { ascending: false }).limit(300),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', profile?.workspace_id || ''),
    supabase.from('comunicacoes')
      .select('*').neq('status', 'nova').order('aprovada_em', { ascending: false }).limit(60),
  ])

  return (
    <div className="min-h-screen">
      <EditableHeader title="Novidades" icon={Bell} color="#FBBF24"
        gradient="linear-gradient(135deg, #422006 0%, #713f12 60%, #422006 100%)"
        pageKey="novidades" workspaceId={assets.workspaceId}
        initialBanner={assets.banner} initialLogo={assets.logo} canEdit={assets.canEdit} />

      <div className="px-16 py-6">
        <NovidadesClient
          novas={(comunicacoes || []) as Comunicacao[]}
          tratadas={(tratadas || []) as Comunicacao[]}
          membros={membros || []}
          userId={profile?.id || ''}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  )
}
