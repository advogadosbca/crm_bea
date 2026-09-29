import type { SupabaseClient } from '@supabase/supabase-js'
import { telefoneE164 } from '@/lib/clientes-por-processo'

/**
 * Casos novos: o relato que a Sofia colheu no WhatsApp esperando o advogado
 * aprovar (ver sql/010-casos-novos.sql para o fluxo inteiro).
 */

export type StatusCaso = 'pendente' | 'aprovado' | 'recusado'

export interface CasoNovo {
  id: string
  telefone: string
  nome: string
  area: string
  relato: string
  lead_row_id: string | null
  status: StatusCaso
  lida_em: string | null
  decidido_por: string | null
  decidido_em: string | null
  observacao: string | null
  webhook_enviado_em: string | null
  webhook_erro: string | null
  created_at: string
  updated_at: string
}

/**
 * Avisa o n8n da decisão para ele mandar a mensagem à cliente.
 *
 * O CRM não escreve a mensagem: manda os dados e o fluxo do outro lado decide
 * o texto e o canal. O `status` vai junto porque recusa também dispara — é o
 * n8n que escolhe o que dizer em cada caso.
 *
 * Grava o resultado no próprio caso (enviado ou o erro), e nunca desfaz a
 * decisão: a Sofia lê o status daqui, então um webhook fora do ar atrasa o
 * aviso mas não perde a aprovação.
 */
export async function avisarDecisao(
  admin: SupabaseClient, workspaceId: string, caso: CasoNovo, decididoPorNome: string,
): Promise<{ enviado: boolean; motivo?: string }> {
  const { data: cfg } = await admin.from('workspace_secrets')
    .select('webhook_caso_url').eq('workspace_id', workspaceId).maybeSingle()
  const url = (cfg?.webhook_caso_url as string) || ''

  let resultado: { enviado: boolean; motivo?: string }
  if (!url) {
    resultado = { enviado: false, motivo: 'webhook de casos novos não configurado em Settings → IA' }
  } else {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'caso_decidido',
          casoId: caso.id,
          status: caso.status,
          nome: caso.nome,
          telefone: caso.telefone,
          telefoneE164: telefoneE164(caso.telefone),
          area: caso.area,
          observacao: caso.observacao || null,
          decididoPor: decididoPorNome,
          decididoEm: caso.decidido_em,
          leadId: caso.lead_row_id,
        }),
        signal: AbortSignal.timeout(20000),
      })
      resultado = r.ok ? { enviado: true } : { enviado: false, motivo: `webhook respondeu HTTP ${r.status}` }
    } catch (e) {
      resultado = { enviado: false, motivo: (e as Error).message }
    }
  }

  await admin.from('casos_novos').update(resultado.enviado
    ? { webhook_enviado_em: new Date().toISOString(), webhook_erro: null }
    : { webhook_erro: (resultado.motivo || 'falha desconhecida').slice(0, 300) },
  ).eq('id', caso.id)

  return resultado
}

/** Mesma tabela de auditoria do resto do sistema. */
export async function auditarCaso(
  admin: SupabaseClient, workspaceId: string, userId: string | null, caso: CasoNovo, acao: string,
) {
  await admin.from('audit_logs').insert({
    workspace_id: workspaceId,
    user_id: userId,
    action: acao,
    table_name: 'casos_novos',
    record_id: caso.id,
    record_label: [caso.nome || caso.telefone, caso.area].filter(Boolean).join(' — '),
    context: 'Notificações',
  })
}
