import { getAuthProfile } from '@/lib/auth'
import { ehVisualizador } from '@/lib/abas'
import { adminClient } from '@/lib/api-auth'

/**
 * POST /api/casos/lote — apagar vários casos novos de uma vez.
 *
 * { acao: 'excluir', ids: [...] } -> { ok, afetadas }
 *
 * Apaga a linha de verdade, diferente das comunicações (que viram 'excluida'
 * para o dedupe da ingestão): caso novo não tem ingestão para deduplicar, e a
 * Sofia só olha esta tabela — sem a linha, ela volta a tratar a pessoa como
 * contato novo, que é o que se quer ao apagar teste ou caso duplicado.
 *
 * Apagar um caso pendente também solta a Sofia para aquele cliente: o bloqueio
 * dela é marcado como 'caso' no Redis e, na próxima mensagem, o n8n consulta
 * /api/v1/casos/consulta, não acha nada pendente e libera.
 *
 * Nenhum aviso sai para a cliente — o webhook de decisão é só de aprovar/recusar.
 */

const MAX = 500
/** `.in('id', [...])` viaja na URI do PostgREST; ver /api/novidades/lote. */
const POR_CHAMADA = 100

export async function POST(req: Request) {
  const { profile } = await getAuthProfile()
  if (!profile) return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  if (ehVisualizador(profile.role)) return Response.json({ error: 'Seu acesso é somente de visualização.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (body.acao !== 'excluir') return Response.json({ error: `ação desconhecida: ${body.acao}` }, { status: 400 })

  // mesma régua do resto do sistema: apagar registro é de admin
  if (!['super_admin', 'admin'].includes(profile.role || '')) {
    return Response.json({ error: 'Só administradores podem excluir casos.' }, { status: 403 })
  }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, MAX) : []
  if (!ids.length) return Response.json({ ok: true, afetadas: 0 })

  const admin = adminClient()
  let afetadas = 0
  const rotulos: string[] = []
  for (let i = 0; i < ids.length; i += POR_CHAMADA) {
    const { data, error } = await admin.from('casos_novos').delete()
      .eq('workspace_id', profile.workspace_id)   // nunca confiar no id que veio do navegador
      .in('id', ids.slice(i, i + POR_CHAMADA))
      .select('nome, telefone')
    if (error) {
      return Response.json({ error: `${error.message} (${afetadas} de ${ids.length} já apagados)` }, { status: 400 })
    }
    afetadas += data?.length || 0
    for (const c of data || []) rotulos.push(c.nome || c.telefone)
  }

  if (afetadas) {
    await admin.from('audit_logs').insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      action: 'excluiu casos novos',
      table_name: 'casos_novos',
      record_id: null,
      record_label: `${afetadas} caso${afetadas === 1 ? '' : 's'}: ${rotulos.slice(0, 10).join(', ')}${rotulos.length > 10 ? '…' : ''}`.slice(0, 300),
      context: 'Notificações',
    })
  }

  return Response.json({ ok: true, afetadas })
}
