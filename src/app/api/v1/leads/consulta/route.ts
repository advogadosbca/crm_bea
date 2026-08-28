import { authApiKey, unauthorized } from '@/lib/api-auth'
import { chaveTelefone } from '@/lib/telefone'
import {
  EM_ATENDIMENTO, acharPorTelefone, contextoLeads, rotuloDaOpcao, temOpcao,
} from '@/lib/leads-crm'

/**
 * POST /api/v1/leads/consulta — só consulta, não escreve nada.
 *
 * Primeiro passo do fluxo da Sofia: esse telefone já existe no CRM? O n8n usa a
 * resposta para decidir o caminho (criar o lead, marcar a etiqueta, ou seguir).
 *
 * Procura em Clientes ANTES de Leads. Sem essa ordem, cliente do escritório que
 * mandasse mensagem seria tratado como desconhecido e viraria lead novo em
 * Primeiro Contato — hoje 4 pessoas estão nas duas bases.
 *
 * { telefone } ->
 * { existe, tipo: 'cliente'|'lead'|null, leadId, clienteId, nome, statusFunil, emAtendimento }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const telefone = String(body.telefone || '').trim()
  if (!chaveTelefone(telefone)) {
    return Response.json({ error: 'telefone ausente ou curto demais para identificar alguém.' }, { status: 400 })
  }

  const ctx = await contextoLeads(admin, workspaceId)
  if (!ctx) return Response.json({ error: 'Fontes Leads/Clientes não provisionadas neste workspace.' }, { status: 500 })

  // ---------- já é cliente? ----------
  const cliente = await acharPorTelefone(admin, ctx.clientesId, ctx.colCli('Telefone'), telefone)
  if (cliente) {
    const nomeCli = ctx.colCli('Nome')
    return Response.json({
      existe: true,
      tipo: 'cliente',
      clienteId: cliente.id,
      leadId: null,
      nome: nomeCli ? String(cliente.data[nomeCli.id] ?? '') : '',
      statusFunil: null,
      // Clientes não tem a coluna Atendimento: devolve true para o fluxo não
      // tentar marcar etiqueta que não existe. Cliente antigo não é captação.
      emAtendimento: true,
    })
  }

  // ---------- já está no funil? ----------
  const colTelLead = ctx.colLead('Telefone')
  const lead = await acharPorTelefone(admin, ctx.leadsId, colTelLead, telefone)
  if (!lead) {
    return Response.json({
      existe: false, tipo: null, leadId: null, clienteId: null,
      nome: '', statusFunil: null, emAtendimento: false,
    })
  }

  const colAtend = ctx.colLead('Atendimento')
  const colNome = ctx.colLead('Nome')
  const colStatus = ctx.colLead('Status pré-atendimento')

  return Response.json({
    existe: true,
    tipo: 'lead',
    leadId: lead.id,
    clienteId: null,
    nome: colNome ? String(lead.data[colNome.id] ?? '') : '',
    statusFunil: rotuloDaOpcao(colStatus, colStatus ? lead.data[colStatus.id] : null),
    emAtendimento: temOpcao(colAtend, colAtend ? lead.data[colAtend.id] : null, EM_ATENDIMENTO),
  })
}
