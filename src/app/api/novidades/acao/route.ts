import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'
import { criarTarefas, formatarCnj, type DadosAprovacao } from '@/lib/novidades'
import type { TipoComunicacao } from '@/lib/ia-classificacao'

/**
 * POST /api/novidades/acao — ler | dispensar | aprovar
 *
 * Toda mutação de comunicação passa por aqui (a tabela tem RLS só de leitura).
 * Assim a criação da tarefa, o registro de auditoria e o disparo ao cliente
 * ficam num lugar só, e ninguém aprova pulando essa lógica pelo PostgREST.
 *
 * TRAVAS DE IDEMPOTÊNCIA
 *  - aprovar de novo devolve a tarefa já criada, não cria outra;
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

  const cliente = await nomeDoCliente(admin, profile.workspace_id, com.cnj as string)

  // já aprovada: devolve o que existe em vez de duplicar
  let pendenciaRowId = com.pendencia_row_id as string | null
  let audienciaRowId = com.audiencia_row_id as string | null

  if (!pendenciaRowId) {
    const r = await criarTarefas({
      admin, workspaceId: profile.workspace_id, cnj: com.cnj as string, cliente, dados,
    })
    pendenciaRowId = r.pendenciaRowId
    audienciaRowId = r.audienciaRowId

    await admin.from('comunicacoes').update({
      status: 'aprovada',
      aprovada_por: profile.id,
      aprovada_em: agora,
      lida_em: com.lida_em || agora,
      pendencia_row_id: pendenciaRowId,
      audiencia_row_id: audienciaRowId,
    }).eq('id', id)

    await registrarAuditoria(admin, profile, com, 'aprovou comunicação', {
      tipo: dados.tipo, pendencia: pendenciaRowId, audiencia: audienciaRowId,
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

  return Response.json({ ok: true, status: 'aprovada', pendenciaRowId, audienciaRowId, aviso })
}

/** Nome do cliente ligado ao processo, para a tarefa e para a mensagem. */
async function nomeDoCliente(admin: ReturnType<typeof adminClient>, workspaceId: string, cnj: string) {
  const { data: t } = await admin.from('db_tables').select('id')
    .eq('workspace_id', workspaceId).eq('module_key', 'processos').maybeSingle()
  if (!t) return ''
  const { data: cols } = await admin.from('db_columns').select('id, name, type, config').eq('table_id', t.id)
  const colNum = (cols || []).find(c => c.name === 'Processo')
  const colCli = (cols || []).find(c => c.name === 'Cliente')
  if (!colNum || !colCli) return ''

  const { data: rows } = await admin.from('db_rows').select('data').eq('table_id', t.id)
  const linha = (rows || []).find(r =>
    String((r.data as Record<string, unknown>)[colNum.id] ?? '').replace(/\D/g, '').includes(cnj))
  if (!linha) return ''

  const ref = (linha.data as Record<string, unknown>)[colCli.id]
  const ids = Array.isArray(ref) ? ref.map(String) : ref ? [String(ref)] : []
  if (!ids.length) return ''

  const fonteId = (colCli.config as { sourceTableId?: string })?.sourceTableId
  if (!fonteId) return ''
  const { data: alvo } = await admin.from('db_rows').select('data').eq('id', ids[0]).maybeSingle()
  if (!alvo) return ''
  const { data: colsCli } = await admin.from('db_columns').select('id, name').eq('table_id', fonteId)
  const colNome = (colsCli || []).find(c => c.name === 'Nome')
  return colNome ? String((alvo.data as Record<string, unknown>)[colNome.id] ?? '') : ''
}

/**
 * Dispara o webhook do n8n com o aviso ao cliente. O CRM não fala com o
 * WhatsApp direto: manda o payload e o n8n decide o canal.
 */
async function avisarCliente(
  admin: ReturnType<typeof adminClient>, workspaceId: string,
  com: Record<string, unknown>, mensagem: string, cliente: string,
): Promise<Record<string, unknown>> {
  const { data: cfg } = await admin.from('workspace_secrets')
    .select('webhook_cliente_url').eq('workspace_id', workspaceId).maybeSingle()
  const url = (cfg?.webhook_cliente_url as string) || ''
  if (!url) return { enviado: false, motivo: 'webhook não configurado em Settings → IA' }
  if (!mensagem.trim()) return { enviado: false, motivo: 'mensagem vazia' }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comunicacaoId: com.id,
        processo: formatarCnj(String(com.cnj)),
        cliente,
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
