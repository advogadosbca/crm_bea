import { getAuthProfile } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { RoleProvider } from '@/components/layout/RoleProvider'
import { AvisoSomenteLeitura } from '@/components/layout/AvisoSomenteLeitura'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getAuthProfile()
  if (!user) redirect('/login')

  let workspaceName = 'Workspace'
  let novidades = 0
  if (profile?.workspace_id) {
    const [{ data: ws }, { count }, { count: casos }] = await Promise.all([
      supabase.from('workspaces').select('name').eq('id', profile.workspace_id).single(),
      // contador do menu: comunicações ainda não tratadas + casos novos
      // esperando aprovação. A RLS já restringe ao workspace, então
      // `head: true` traz só o número.
      supabase.from('comunicacoes').select('id', { count: 'exact', head: true }).eq('status', 'nova'),
      supabase.from('casos_novos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])
    workspaceName = ws?.name || 'Workspace'
    novidades = (count ?? 0) + (casos ?? 0)
  }

  return (
    <RoleProvider role={profile?.role || 'colaborador'} abas={profile?.abas || {}}>
      <div className="flex min-h-screen">
        <Sidebar workspaceName={workspaceName} novidades={novidades} />
        <AvisoSomenteLeitura />
        {/* min-w-0 no lugar de overflow-auto: o overflow criava um scrollport que
            anulava o position:sticky dos filhos (barra do ScrollX). O min-w-0 mantém
            o mesmo efeito prático — deixar o flex item encolher para que as tabelas
            largas rolem dentro do container, e não a página inteira. */}
        <main className="flex-1 ml-56 min-h-screen min-w-0">
          {children}
        </main>
      </div>
    </RoleProvider>
  )
}
