import { getAuthProfile } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getAuthProfile()
  if (!user) redirect('/login')

  let workspaceName = 'Workspace'
  if (profile?.workspace_id) {
    const { data: ws } = await supabase.from('workspaces').select('name').eq('id', profile.workspace_id).single()
    workspaceName = ws?.name || 'Workspace'
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceName={workspaceName} />
      <main className="flex-1 ml-56 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
