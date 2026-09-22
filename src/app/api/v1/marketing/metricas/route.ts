import { authApiKey, unauthorized } from '@/lib/api-auth'

const PLATAFORMAS = ['google_ads', 'meta_ads'] as const
type Plataforma = typeof PLATAFORMAS[number]

function numero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * POST /api/v1/marketing/metricas — grava o retrato diário (D-1) de uma conta
 * de anúncios (Google Ads ou Meta Ads) na aba Marketing > Anúncios do CRM.
 *
 * Chamada pelo fluxo n8n que roda uma vez por dia. Upsert por
 * (workspace, plataforma, conta, data): reprocessar o mesmo dia atualiza a
 * linha em vez de duplicar.
 *
 * { plataforma, data, conta_id, conta_nome?, anuncios_ativos?, impressoes?,
 *   cliques?, leads?, investimento?, cpm?, ctr?, cpc? } -> { ok, id }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))

  const plataforma = String(body.plataforma || '') as Plataforma
  if (!PLATAFORMAS.includes(plataforma)) {
    return Response.json({ error: `plataforma deve ser uma de: ${PLATAFORMAS.join(', ')}.` }, { status: 400 })
  }

  const data = String(body.data || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return Response.json({ error: 'data ausente ou fora do formato YYYY-MM-DD.' }, { status: 400 })
  }

  const contaId = String(body.conta_id || '').trim()
  if (!contaId) {
    return Response.json({ error: 'conta_id ausente.' }, { status: 400 })
  }

  const linha = {
    workspace_id: workspaceId,
    plataforma,
    conta_id: contaId,
    conta_nome: body.conta_nome ? String(body.conta_nome).trim() : null,
    data,
    anuncios_ativos: Math.round(numero(body.anuncios_ativos)),
    impressoes: Math.round(numero(body.impressoes)),
    cliques: Math.round(numero(body.cliques)),
    leads: Math.round(numero(body.leads)),
    investimento: numero(body.investimento),
    cpm: numero(body.cpm),
    ctr: numero(body.ctr),
    cpc: numero(body.cpc),
  }

  const { data: salvo, error } = await admin
    .from('marketing_ads_metricas')
    .upsert(linha, { onConflict: 'workspace_id,plataforma,conta_id,data' })
    .select('id')
    .single()

  if (error || !salvo) {
    return Response.json({ error: error?.message || 'Falha ao gravar a métrica.' }, { status: 400 })
  }

  return Response.json({ ok: true, id: salvo.id })
}
