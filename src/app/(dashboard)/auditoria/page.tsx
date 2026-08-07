import { redirect } from 'next/navigation'
import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { AuditoriaClient, type AuditLog, type Membro } from './AuditoriaClient'

export const PAGE_SIZE = 100

export default async function Page() {
  const { supabase, profile } = await getAuthProfile()
  // a RLS já esconde o log de quem não é admin; isto evita a página vazia sem explicação
  if (!['admin', 'super_admin'].includes(profile?.role || '')) redirect('/')

  const assets = await getPageAssets('auditoria')

  const [{ data: logs }, { data: members }, { data: cols }] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id, user_id, action, table_name, record_id, record_label, context, old_data, new_data, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('workspace_id', profile!.workspace_id),
    // id -> nome das colunas dinâmicas, para exibir o conteúdo de um db_rows excluído
    supabase.from('db_columns').select('id, name'),
  ])

  const colNames: Record<string, string> = {}
  for (const c of (cols || []) as { id: string; name: string }[]) colNames[c.id] = c.name

  return (
    <AuditoriaClient
      headerAssets={assets}
      logs={(logs || []) as AuditLog[]}
      members={(members || []) as Membro[]}
      colNames={colNames}
      pageSize={PAGE_SIZE}
    />
  )
}
