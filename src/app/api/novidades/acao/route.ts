import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'
import { criarTarefas, formatarCnj, type DadosAprovacao, type TeorComunicacao } from '@/lib/novidades'
import { clientesPorProcesso, telefoneE164, type ClienteDoProcesso } from '@/lib/clientes-por-processo'
import type { TipoComunicacao } from '@/lib/ia-classificacao'

/**
 * POST /api/novidades/acao — ler | dispensar | aprovar
 *
 * Toda mutação de comunicação passa por aqui (a tabela tem RLS só de leitura).
 * Assim a criação da tarefa, o registro de auditoria e o disparo ao cliente
 * ficam num lugar só, e ninguém aprova pulando essa lógica pelo PostgREST.
 *
 * TRAVAS DE IDEMPOTÊNCIA
 *  - aprovar de novo devolve a tarefa já criada, não cria outra (nem pendência,
 *    nem linha de audiência, nem cartão no Quadro de Tarefas);
 *  - `webhook_enviado_em` impede mandar a mesma mensagem duas vezes ao cliente.
 */
export async function POST(req: Request) {
  const { profile } = await getAuthProfile()
  if (!profile) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  const acao = String(body.acao || '')
  if (!id) return Response.json({ error: 'id ausente.' }, { status: 400 })

  const admin = adminClient()
  const { data: com } = await admin.from('comunicacoes').select('*').eq('id', id).maybeSingle()
  if (!com || com.workspace_id !== profile.workspace_id) {
    return Response.json({ error: 'Comunicação não encontrada.' }, { status: 404 })
  }

  const agora = new Date().toISOString()

  // ---------- marcar como lida ----------
  if (acao === 'ler') {
    if (!com.lida_em) await admin.from('comunicacoes').update({ lida_em: agora }).eq('id', id)
    return Response.json({ ok: true, lida_em: com.lida_em || agora })
  }

  // ---------- dispensar ----------
  if (acao === 'dispensar') {
    await admin.from('comunicacoes').update({
      status: 'dispensada',
      dispensada_motivo: String(body.motivo || '').slice(0, 300) || null,
      lida_em: com.lida_em || agora,
      aprovada_por: profile.id,
      aprovada_em: agora,
    }).eq('id', id)
    await registrarAuditoria(admin, profile, com, 'dispensou comunicação', { motivo: body.motivo || null })
    return Response.json({ ok: true, status: 'dispensada' })
  }

  // ---------- aprovar ----------
  if (acao !== 'aprovar') return Response.json({ error: `ação desconhecida: ${acao}` }, { status: 400 })

  const d = (body.dados || {}) as Partial<DadosAprovacao>
  const dados: DadosAprovacao = {
    tipo: (d.tipo || 'outro') as TipoComunicacao,
    tipoPendencia: String(d.tipoPendencia || ''),
    prioridade: String(d.prioridade || 'Média'),
    dataRetorno: d.dataRetorno || null,
    membros: Array.isArray(d.membros) ? d.membros.map(String) : [],
    observacao: String(d.observacao || ''),
    criarAudiencia: d.criarAudiencia === true,
    audienciaData: d.audienciaData || null,
    audienciaHora: d.audienciaHora || null,
  }

  const mapa = await clientesPorProcesso(admin, profile.workspace_id, [com.cnj as string])
  const cliente: ClienteDoProcesso | undefined = mapa[com.cnj as string]

  // já aprovada: devolve o que existe em vez de duplicar
  let pendenciaRowId = com.pendencia_row_id as string | null
  let audienciaRowId = com.audiencia_row_id as string | null
  let cartaoId = com.tarefa_card_id as string | null

  if (!pendenciaRowId) {
    // o cartão do Quadro carrega a publicação inteira: quem for cumprir o prazo
    // lê o que o juiz mandou sem voltar para a Central de Novidades
    const teor: TeorComunicacao = {
      texto: String(com.texto || ''),
      resumo: String((com.classificacao as { resumo?: string } | null)?.resumo || ''),
      link: String(com.link || ''),
      tribunal: String(com.tribunal || ''),
      orgao: String(com.orgao || ''),
      dataPublicacao: (com.data_publicacao as string) || null,
    }

    const r = await criarTarefas({
      admin, workspaceId: profile.workspace_id, autorId: profile.id,
      cnj: com.cnj as string,
      cliente: cliente?.nome || '', clienteRowId: cliente?.clienteRowId || null,
      dados, teor,
    })
    pendenciaRowId = r.pendenciaRowId
    audienciaRowId = r.audienciaRowId
    cartaoId = r.cartaoId

    await admin.from('comunicacoes').update({
      status: 'aprovada',
      aprovada_por: profile.id,
      aprovada_em: agora,
      lida_em: com.lida_em || agora,
      pendencia_row_id: pendenciaRowId,
      audiencia_row_id: audienciaRowId,
      tarefa_card_id: cartaoId,
    }).eq('id', id)

    await registrarAuditoria(admin, profile, com, 'aprovou comunicação', {
      tipo: dados.tipo, pendencia: pendenciaRowId, audiencia: audienciaRowId, cartao: cartaoId,
    })
  }

  // ---------- aviso ao cliente (opcional, sempre explícito) ----------
  let aviso: Record<string, unknown> = { enviado: false }
  if (body.avisarCliente === true && !com.webhook_enviado_em) {
    aviso = await avisarCliente(admin, profile.workspace_id, com, String(body.mensagemCliente || ''), cliente)
    if (aviso.enviado) {
      await admin.from('comunicacoes').update({ webhook_enviado_em: new Date().toISOString() }).eq('id', id)
      await registrarAuditoria(admin, profile, com, 'avisou cliente', { canal: 'webhook' })
    }
  } else if (com.webhook_enviado_em) {
    aviso = { enviado: false, motivo: 'cliente já avisado anteriormente' }
  }

  return Response.json({ ok: true, status: 'aprovada', pendenciaRowId, audienciaRowId, cartaoId, aviso })
}

/**
 * Dispara o webhook do n8n com o aviso ao cliente. O CRM não fala com o
 * WhatsApp direto: manda o payload e o n8n decide o canal.
 *
 * O telefone vai junto, cru e em E.164 — sem ele o n8n teria que descobrir o
 * destinatário sozinho, e é exatamente aí que mensagem vai para o número errado.
 * Sem telefone no cadastro, não envia: melhor falhar aqui, com a tarefa já
 * criada, do que disparar para lugar nenhum e marcar como avisado.
 */
async function avisarCliente(
  admin: ReturnType<typeof adminClient>, workspaceId: string,
  com: Record<string, unknown>, mensagem: string, cliente?: ClienteDoProcesso,
): Promise<Record<string, unknown>> {
  const { data: cfg } = await admin.from('workspace_secrets')
    .select('webhook_cliente_url').eq('workspace_id', workspaceId).maybeSingle()
  const url = (cfg?.webhook_cliente_url as string) || ''
  if (!url) return { enviado: false, motivo: 'webhook não configurado em Settings → IA' }
  if (!mensagem.trim()) return { enviado: false, motivo: 'mensagem vazia' }
  if (!cliente?.nome) return { enviado: false, motivo: 'nenhum cliente vinculado a este processo' }
  if (!cliente.telefone) return { enviado: false, motivo: `cliente ${cliente.nome} está sem telefone no cadastro` }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comunicacaoId: com.id,
        processo: formatarCnj(String(com.cnj)),
        cliente: cliente.nome,
        telefone: cliente.telefone,
        telefoneE164: telefoneE164(cliente.telefone),
        clienteRowId: cliente.clienteRowId,
        mensagem: mensagem.trim(),
        tribunal: com.tribunal,
        orgao: com.orgao,
        dataPublicacao: com.data_publicacao,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) return { enviado: false, motivo: `webhook respondeu HTTP ${r.status}` }
    return { enviado: true }
  } catch (e) {
    return { enviado: false, motivo: (e as Error).message }
  }
}

/** Usa a mesma tabela de auditoria do resto do sistema. */
async function registrarAuditoria(
  admin: ReturnType<typeof adminClient>,
  profile: { id: string; workspace_id: string },
  com: Record<string, unknown>, acao: string, contexto: Record<string, unknown>,
) {
  await admin.from('audit_logs').insert({
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    action: acao,
    table_name: 'comunicacoes',
    record_id: com.id,
    record_label: formatarCnj(String(com.cnj)),
    context: contexto,
  })
}
