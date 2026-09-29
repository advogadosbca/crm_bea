import { authApiKey, unauthorized } from '@/lib/api-auth'
import { chaveTelefone, formatarTelefoneBr } from '@/lib/telefone'
import { acharPorTelefone, contextoLeads } from '@/lib/leads-crm'

/**
 * POST /api/v1/casos/criar — a Sofia manda um caso novo para o advogado aprovar.
 *
 * Aparece em Notificações → Casos novos. Se a mesma pessoa já tem um caso
 * PENDENTE, ele é atualizado em vez de duplicado: a cliente costuma contar
 * mais coisa depois, e a Sofia reenvia o relato completo. O caso volta a ficar
 * "não lido" para o advogado perceber que mudou.
 *
 * Caso já decidido não é reaberto: um relato novo depois da decisão abre outro.
 *
 * { telefone, nome, area, relato, leadId? } -> { criado, atualizado, casoId, status }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const telefone = String(body.telefone || '').trim()
  const chave = chaveTelefone(telefone)
  const nome = String(body.nome || '').trim().slice(0, 200)
  const area = String(body.area || '').trim().slice(0, 120)
  const relato = String(body.relato || '').trim().slice(0, 20000)

  if (!chave) return Response.json({ error: 'telefone ausente ou curto demais para identificar alguém.' }, { status: 400 })
  if (!relato) return Response.json({ error: 'relato vazio — é ele que o advogado lê para aprovar.' }, { status: 400 })

  // o lead do funil, para a tela poder abrir a ficha. Quem chama pode mandar o
  // id que já tem (veio da /leads/consulta); sem ele, procura pelo telefone.
  let leadRowId: string | null = typeof body.leadId === 'string' && body.leadId ? body.leadId : null
  if (!leadRowId) {
    const ctx = await contextoLeads(admin, workspaceId)
    if (ctx) leadRowId = (await acharPorTelefone(admin, ctx.leadsId, ctx.colLead('Telefone'), telefone))?.id || null
  }

  const campos = {
    telefone: formatarTelefoneBr(telefone),
    nome, area, relato,
    lead_row_id: leadRowId,
    lida_em: null,
  }

  const atualizar = async () => {
    const { data: pendente } = await admin.from('casos_novos').select('id')
      .eq('workspace_id', workspaceId).eq('telefone_chave', chave).eq('status', 'pendente').maybeSingle()
    if (!pendente) return null
    await admin.from('casos_novos').update(campos).eq('id', pendente.id)
    return pendente.id as string
  }

  const existente = await atualizar()
  if (existente) return Response.json({ criado: false, atualizado: true, casoId: existente, status: 'pendente' })

  const { data: novo, error } = await admin.from('casos_novos')
    .insert({ ...campos, workspace_id: workspaceId, telefone_chave: chave })
    .select('id').single()

  if (error) {
    // duas mensagens da mesma pessoa chegando juntas: a outra chamada criou o
    // pendente entre a nossa consulta e o insert (índice único). Vira update.
    if (error.code === '23505') {
      const id = await atualizar()
      if (id) return Response.json({ criado: false, atualizado: true, casoId: id, status: 'pendente' })
    }
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({ criado: true, atualizado: false, casoId: novo.id, status: 'pendente' })
}
