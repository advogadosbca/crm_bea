import { authApiKey, unauthorized } from '@/lib/api-auth'
import { chaveTelefone, formatarTelefoneBr } from '@/lib/telefone'
import {
  EM_ATENDIMENTO, STATUS_INICIAL, acharPorTelefone, contextoLeads, idDaOpcao, nomeParaCadastro,
} from '@/lib/leads-crm'

/**
 * POST /api/v1/leads/criar — cadastra o lead no Funil Pré-Atendimento.
 *
 * Chamada pelo ramo "não existe" do fluxo da Sofia. Entra em Primeiro Contato,
 * com a data de hoje, telefone no formato da tela ("37 9 9110-1892") e a
 * etiqueta "Em Atendimento" — que só sai quando a equipe tirar, à mão.
 *
 * Confere de novo se o telefone já está lá antes de inserir. A consulta e a
 * criação são duas chamadas separadas, e entre uma e outra pode ter chegado
 * outra mensagem da mesma pessoa (o cliente manda três linhas seguidas); sem
 * essa segunda olhada, o mesmo lead entraria duas vezes no funil.
 *
 * { telefone, nome } -> { criado, leadId, nome, statusFunil }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const telefone = String(body.telefone || '').trim()
  const nome = String(body.nome || '').trim()
  if (!chaveTelefone(telefone)) {
    return Response.json({ error: 'telefone ausente ou curto demais para identificar alguém.' }, { status: 400 })
  }

  const ctx = await contextoLeads(admin, workspaceId)
  if (!ctx) return Response.json({ error: 'Fontes Leads/Clientes não provisionadas neste workspace.' }, { status: 500 })

  const colTel = ctx.colLead('Telefone')
  const colNome = ctx.colLead('Nome')
  const colData = ctx.colLead('Data Contato')
  const colStatus = ctx.colLead('Status pré-atendimento')
  const colAtend = ctx.colLead('Atendimento')

  const jaExiste = await acharPorTelefone(admin, ctx.leadsId, colTel, telefone)
  if (jaExiste) {
    return Response.json({ criado: false, leadId: jaExiste.id, motivo: 'lead já existia', nome, statusFunil: null })
  }

  const dados: Record<string, unknown> = {}
  if (colNome) dados[colNome.id] = nomeParaCadastro(nome, telefone)
  if (colTel) dados[colTel.id] = formatarTelefoneBr(telefone)
  if (colData) dados[colData.id] = new Date().toISOString().slice(0, 10)
  const idStatus = idDaOpcao(colStatus, STATUS_INICIAL)
  if (colStatus && idStatus) dados[colStatus.id] = idStatus
  const idAtend = idDaOpcao(colAtend, EM_ATENDIMENTO)
  if (colAtend && idAtend) dados[colAtend.id] = idAtend

  // entra no topo da coluna, como o botão "Novo" da tela: o quadro ordena por
  // position, e lead que acabou de escrever é o que a equipe precisa ver
  const { data: menor } = await admin.from('db_rows').select('position')
    .eq('table_id', ctx.leadsId).order('position', { ascending: true }).limit(1).maybeSingle()

  const { data: criado, error } = await admin.from('db_rows').insert({
    table_id: ctx.leadsId, data: dados, position: (menor?.position ?? 0) - 1,
  }).select('id').single()
  if (error || !criado) {
    return Response.json({ error: error?.message || 'Falha ao criar o lead.' }, { status: 400 })
  }

  return Response.json({
    criado: true,
    leadId: criado.id,
    nome: nomeParaCadastro(nome, telefone),
    statusFunil: STATUS_INICIAL,
  })
}
