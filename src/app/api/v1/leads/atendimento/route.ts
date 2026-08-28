import { authApiKey, unauthorized } from '@/lib/api-auth'
import { EM_ATENDIMENTO, contextoLeads, idDaOpcao } from '@/lib/leads-crm'

/**
 * POST /api/v1/leads/atendimento — marca a etiqueta "Em Atendimento" no lead.
 *
 * Chamada pelo ramo "existe, mas está sem etiqueta" do fluxo da Sofia: é gente
 * que já esteve no funil e voltou depois de o contato ter sido encerrado. Além
 * da etiqueta, traz a Data Contato para hoje, para o lead subir na lista em vez
 * de ficar com a data antiga.
 *
 * Quem TIRA a etiqueta é a equipe, à mão, ao encerrar o atendimento. Ela não é
 * a trava da IA: quem cala a Sofia é a chave `<telefone>_block` no Redis, que
 * expira em 24h. Se a etiqueta também barrasse, o Redis liberaria e ela não —
 * e aquele número nunca mais seria atendido.
 *
 * { leadId } -> { ok, leadId, jaEstava }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const leadId = String(body.leadId || '').trim()
  if (!leadId) return Response.json({ error: 'leadId ausente.' }, { status: 400 })

  const ctx = await contextoLeads(admin, workspaceId)
  if (!ctx) return Response.json({ error: 'Fontes Leads/Clientes não provisionadas neste workspace.' }, { status: 500 })

  // confere que a linha é mesmo desta fonte: leadId vindo de fora não pode
  // virar escrita em qualquer tabela do workspace
  const { data: lead } = await admin.from('db_rows').select('id, table_id, data').eq('id', leadId).maybeSingle()
  if (!lead || lead.table_id !== ctx.leadsId) {
    return Response.json({ error: 'Lead não encontrado na fonte de Leads.' }, { status: 404 })
  }

  const colAtend = ctx.colLead('Atendimento')
  const colData = ctx.colLead('Data Contato')
  const idAtend = idDaOpcao(colAtend, EM_ATENDIMENTO)
  if (!colAtend || !idAtend) {
    return Response.json({ error: `A fonte Leads não tem a opção "${EM_ATENDIMENTO}" na coluna Atendimento.` }, { status: 500 })
  }

  const dados = { ...(lead.data as Record<string, unknown>) }
  const jaEstava = dados[colAtend.id] === idAtend
  dados[colAtend.id] = idAtend
  if (colData) dados[colData.id] = new Date().toISOString().slice(0, 10)

  const { error } = await admin.from('db_rows')
    .update({ data: dados, updated_at: new Date().toISOString() }).eq('id', leadId)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ ok: true, leadId, jaEstava })
}
