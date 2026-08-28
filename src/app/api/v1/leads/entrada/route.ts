import { authApiKey, unauthorized } from '@/lib/api-auth'
import { chaveTelefone, formatarTelefoneBr } from '@/lib/telefone'

/**
 * POST /api/v1/leads/entrada — quem falou no WhatsApp já existe no CRM?
 *
 * Chamada pela Sofia (n8n) a cada mensagem recebida com a IA ativa. Responde o
 * que a automação precisa saber e, quando é gente nova, cadastra o lead no
 * Funil Pré-Atendimento da aba Geral.
 *
 * POR QUE UMA ROTA, E NÃO UNS NÓS DE BANCO NO n8n
 * As fontes de dados são genéricas: a linha guarda `data` com UUID de coluna
 * como chave, seleção grava o id da opção (não o rótulo) e o telefone fica
 * formatado à mão pela equipe. Reproduzir isso em expressão de n8n significaria
 * UUID colado no fluxo, quebrando calado no dia em que alguém recriar uma
 * coluna pela tela. Aqui os nomes são resolvidos em tempo de execução.
 *
 * A ORDEM DA BUSCA IMPORTA: Clientes antes de Leads. Sem isso, todo cliente do
 * escritório que mandasse mensagem viraria "lead novo" em Primeiro Contato, e o
 * funil de captação viraria depósito de atendimento de cliente antigo.
 *
 * NÃO É A TRAVA DA IA. Quem cala a Sofia é a chave `<telefone>_block` no Redis,
 * que expira em 24h. A etiqueta "Em Atendimento" daqui não expira e é retirada
 * à mão pela equipe ao encerrar o contato — se ela também barrasse o fluxo, o
 * Redis liberaria em 24h, a etiqueta ficaria, e aquele número nunca mais seria
 * atendido sem ninguém desconfiar do porquê.
 */

const EM_ATENDIMENTO = 'Em Atendimento'
const STATUS_INICIAL = 'Primeiro Contato'

type Coluna = { id: string; name: string; type: string; config: { options?: { id: string; label: string }[] } }
type Linha = { id: string; data: Record<string, unknown> }

/** rótulo -> id da opção; seleção guarda o id, o rótulo apareceria como texto solto */
const idDaOpcao = (c: Coluna | undefined, label: string): string | null =>
  (c?.config?.options || []).find(o => o.label.trim().toLowerCase() === label.toLowerCase())?.id ?? null

/** true quando a célula de seleção aponta para a opção informada (aceita id ou rótulo) */
function temOpcao(col: Coluna | undefined, valor: unknown, label: string): boolean {
  if (!col || valor === null || valor === undefined || valor === '') return false
  const alvos = Array.isArray(valor) ? valor.map(String) : [String(valor)]
  const opt = (col.config?.options || []).find(o => o.label.trim().toLowerCase() === label.toLowerCase())
  return alvos.some(v => v === opt?.id || v.trim().toLowerCase() === label.toLowerCase())
}

export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const telefone = String(body.telefone || '').trim()
  const nome = String(body.nome || '').trim()

  const chave = chaveTelefone(telefone)
  if (!chave) {
    return Response.json({ error: 'telefone ausente ou curto demais para identificar alguém.' }, { status: 400 })
  }

  const { data: tabelas } = await admin.from('db_tables').select('id, module_key')
    .eq('workspace_id', workspaceId).in('module_key', ['fonte-leads', 'fonte-contatos'])
  const tLeads = (tabelas || []).find(t => t.module_key === 'fonte-leads')
  const tClientes = (tabelas || []).find(t => t.module_key === 'fonte-contatos')
  if (!tLeads || !tClientes) {
    return Response.json({ error: 'Fontes Leads/Clientes não provisionadas neste workspace.' }, { status: 500 })
  }

  const { data: colunas } = await admin.from('db_columns').select('id, table_id, name, type, config')
    .in('table_id', [tLeads.id, tClientes.id])
  const todas = (colunas || []) as (Coluna & { table_id: string })[]
  const colLead = (nome: string) => todas.find(c => c.table_id === tLeads.id && c.name.trim().toLowerCase() === nome.toLowerCase())
  const colCli = (nome: string) => todas.find(c => c.table_id === tClientes.id && c.name.trim().toLowerCase() === nome.toLowerCase())

  // ---------- 1. já é cliente? ----------
  const telCli = colCli('Telefone')
  if (telCli) {
    const { data: clientes } = await admin.from('db_rows').select('id, data')
      .eq('table_id', tClientes.id).order('created_at', { ascending: true }).limit(100000)
    const achado = (clientes as Linha[] | null || []).find(c => chaveTelefone(c.data[telCli.id]) === chave)
    if (achado) {
      const nomeCli = colCli('Nome')
      return Response.json({
        status: 'ja_e_cliente',
        clienteId: achado.id,
        leadId: null,
        nome: nomeCli ? String(achado.data[nomeCli.id] ?? '') || nome : nome,
        emAtendimento: false,
        criado: false,
      })
    }
  }

  // ---------- 2. já está no funil? ----------
  const telLead = colLead('Telefone')
  const colAtendimento = colLead('Atendimento')
  const colDataContato = colLead('Data Contato')
  const colNomeLead = colLead('Nome')
  const colStatusFunil = colLead('Status pré-atendimento')
  const hoje = new Date().toISOString().slice(0, 10)

  const rotuloStatus = (l: Linha) => {
    const v = colStatusFunil ? l.data[colStatusFunil.id] : null
    const o = (colStatusFunil?.config?.options || []).find(x => x.id === v || x.label === v)
    return o?.label || (typeof v === 'string' ? v : null)
  }

  let lead: Linha | null = null
  if (telLead) {
    const { data: leads } = await admin.from('db_rows').select('id, data')
      .eq('table_id', tLeads.id).order('created_at', { ascending: true }).limit(100000)
    lead = (leads as Linha[] | null || []).find(l => chaveTelefone(l.data[telLead.id]) === chave) || null
  }

  if (lead) {
    const jaEmAtendimento = temOpcao(colAtendimento, lead.data[colAtendimento?.id || ''], EM_ATENDIMENTO)
    if (jaEmAtendimento) {
      return Response.json({
        status: 'lead_existente', leadId: lead.id, clienteId: null,
        nome: colNomeLead ? String(lead.data[colNomeLead.id] ?? '') || nome : nome,
        statusFunil: rotuloStatus(lead), emAtendimento: true, criado: false,
      })
    }

    // voltou depois de um contato encerrado: remarca e traz a data para hoje,
    // para a equipe ver o lead subir na lista em vez de ficar com a data velha
    const patch: Record<string, unknown> = { ...lead.data }
    const idOpc = idDaOpcao(colAtendimento, EM_ATENDIMENTO)
    if (colAtendimento && idOpc) patch[colAtendimento.id] = idOpc
    if (colDataContato) patch[colDataContato.id] = hoje
    await admin.from('db_rows').update({ data: patch, updated_at: new Date().toISOString() }).eq('id', lead.id)

    return Response.json({
      status: 'lead_reaberto', leadId: lead.id, clienteId: null,
      nome: colNomeLead ? String(lead.data[colNomeLead.id] ?? '') || nome : nome,
      statusFunil: rotuloStatus(lead), emAtendimento: true, criado: false,
    })
  }

  // ---------- 3. gente nova: entra no funil ----------
  const dados: Record<string, unknown> = {}
  if (colNomeLead) dados[colNomeLead.id] = nome || formatarTelefoneBr(telefone)
  if (telLead) dados[telLead.id] = formatarTelefoneBr(telefone)
  if (colDataContato) dados[colDataContato.id] = hoje
  const idStatus = idDaOpcao(colStatusFunil, STATUS_INICIAL)
  if (colStatusFunil && idStatus) dados[colStatusFunil.id] = idStatus
  const idAtend = idDaOpcao(colAtendimento, EM_ATENDIMENTO)
  if (colAtendimento && idAtend) dados[colAtendimento.id] = idAtend

  // entra no topo da coluna, como o botão "Novo" da tela: o quadro ordena por
  // position, e lead que acabou de escrever é o que a equipe precisa ver
  const { data: menor } = await admin.from('db_rows').select('position')
    .eq('table_id', tLeads.id).order('position', { ascending: true }).limit(1).maybeSingle()

  const { data: criado, error } = await admin.from('db_rows').insert({
    table_id: tLeads.id, data: dados, position: (menor?.position ?? 0) - 1,
  }).select('id').single()
  if (error || !criado) {
    return Response.json({ error: error?.message || 'Falha ao criar o lead.' }, { status: 400 })
  }

  return Response.json({
    status: 'lead_criado', leadId: criado.id, clienteId: null,
    nome: nome || formatarTelefoneBr(telefone),
    statusFunil: STATUS_INICIAL, emAtendimento: true, criado: true,
  })
}
