import { authApiKey, unauthorized } from '@/lib/api-auth'
import { chaveTelefone } from '@/lib/telefone'

/**
 * POST /api/v1/casos/consulta — só consulta, não escreve nada.
 *
 * A Sofia chama antes de responder a cliente: o caso dela já foi aprovado?
 * Devolve o caso MAIS RECENTE daquele telefone. `aprovado` libera a coleta de
 * dados para o agendamento; `pendente` = o advogado ainda não leu, segurar;
 * `recusado` = o escritório não vai pegar o caso.
 *
 * `observacao` é o recado do advogado junto com a decisão (ex.: documentos a
 * pedir) — a Sofia deve usar ao conduzir a conversa.
 *
 * { telefone } -> { existe, casoId, status, nome, area, observacao, decididoEm }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const chave = chaveTelefone(String(body.telefone || ''))
  if (!chave) return Response.json({ error: 'telefone ausente ou curto demais para identificar alguém.' }, { status: 400 })

  const { data: caso, error } = await admin.from('casos_novos')
    .select('id, status, nome, area, observacao, decidido_em')
    .eq('workspace_id', workspaceId).eq('telefone_chave', chave)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })

  if (!caso) {
    return Response.json({ existe: false, casoId: null, status: null, nome: '', area: '', observacao: null, decididoEm: null })
  }
  return Response.json({
    existe: true,
    casoId: caso.id,
    status: caso.status,
    nome: caso.nome,
    area: caso.area,
    observacao: caso.observacao,
    decididoEm: caso.decidido_em,
  })
}
