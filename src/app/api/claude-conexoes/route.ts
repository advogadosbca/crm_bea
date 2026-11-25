import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'

/**
 * Conexões do Claude com o CRM (Settings → Claude). Só admin.
 *
 * GET lista as conexões ativas do escritório (quem conectou, quando, último
 * uso). DELETE revoga uma: o token de acesso e o de renovação param na hora, e
 * o Claude daquela pessoa precisa conectar de novo.
 *
 * Passa pela service role porque mcp_oauth_tokens não tem policy de leitura —
 * o hash dos tokens nunca sai daqui.
 */

async function exigirAdmin() {
  const { profile } = await getAuthProfile()
  if (!profile || !['super_admin', 'admin'].includes(profile.role || '')) return null
  return profile
}

export async function GET() {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const admin = adminClient()
  const { data, error } = await admin.from('mcp_oauth_tokens')
    .select('id, client_name, profile_id, created_at, last_used_at, refresh_expires_at, pode_editar, edicao_alterada_por, edicao_alterada_em')
    .eq('workspace_id', profile.workspace_id).is('revoked_at', null)
    .gt('refresh_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  const ids = [...new Set((data || []).flatMap(d => [d.profile_id as string, d.edicao_alterada_por as string]).filter(Boolean))]
  const { data: perfis } = ids.length
    ? await admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }
  const nome = new Map((perfis || []).map(p => [p.id as string, p.full_name as string]))

  return Response.json({
    conexoes: (data || []).map(d => ({
      id: d.id,
      cliente: d.client_name || 'Claude',
      pessoa: nome.get(d.profile_id as string) || '?',
      souEu: d.profile_id === profile.id,
      criadaEm: d.created_at,
      ultimoUso: d.last_used_at,
      podeEditar: d.pode_editar === true,
      edicaoPor: d.edicao_alterada_por ? nome.get(d.edicao_alterada_por as string) || '?' : null,
      edicaoEm: d.edicao_alterada_em,
    })),
  })
}

/**
 * Liga/desliga a gravação de uma conexão (sql/016). Qualquer sócio pode — a
 * conexão já é de um sócio e o conector relê a coluna a cada chamada, então
 * desligar corta a escrita na hora. Fica registrado quem mudou e quando.
 */
export async function PATCH(req: Request) {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const { id, podeEditar } = await req.json().catch(() => ({ id: '', podeEditar: undefined }))
  if (!id || typeof podeEditar !== 'boolean') return Response.json({ error: 'Informe id e podeEditar.' }, { status: 400 })

  const admin = adminClient()
  const { data, error } = await admin.from('mcp_oauth_tokens')
    .update({ pode_editar: podeEditar, edicao_alterada_por: profile.id, edicao_alterada_em: new Date().toISOString() })
    .eq('id', id).eq('workspace_id', profile.workspace_id).is('revoked_at', null)
    .select('id, client_name').maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: 'Conexão não encontrada.' }, { status: 404 })

  await admin.from('audit_logs').insert({
    workspace_id: profile.workspace_id, user_id: profile.id,
    action: podeEditar ? 'liberou edição do Claude' : 'bloqueou edição do Claude',
    table_name: 'mcp_oauth_tokens', record_id: id, record_label: data.client_name || 'Claude', context: 'Configurações → Claude',
  })
  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const { id } = await req.json().catch(() => ({ id: '' }))
  if (!id) return Response.json({ error: 'Informe o id da conexão.' }, { status: 400 })

  const { error } = await adminClient().from('mcp_oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('workspace_id', profile.workspace_id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
