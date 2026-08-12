import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'

/**
 * Configuração da IA que classifica as comunicações.
 *
 * A chave NUNCA volta para o navegador — nem aqui, nem via Supabase do cliente
 * (a tabela `workspace_secrets` tem RLS ligada e nenhuma policy, então só a
 * service_role enxerga). O GET devolve apenas se existe chave e os 4 últimos
 * caracteres, o suficiente para o admin conferir qual está gravada.
 */

const ADMIN = ['super_admin', 'admin']

async function exigirAdmin() {
  const { profile } = await getAuthProfile()
  if (!profile || !ADMIN.includes(profile.role || '')) return null
  return profile
}

export async function GET() {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const admin = adminClient()
  const { data } = await admin.from('workspace_secrets')
    .select('ia_provider, ia_modelo, ia_api_key, webhook_cliente_url, updated_at')
    .eq('workspace_id', profile.workspace_id).maybeSingle()

  const chave = (data?.ia_api_key as string | undefined) || ''
  return Response.json({
    provider: data?.ia_provider || 'gemini',
    modelo: data?.ia_modelo || 'gemini-2.5-flash',
    temChave: !!chave,
    final: chave ? chave.slice(-4) : null,
    webhookCliente: (data?.webhook_cliente_url as string) || '',
    atualizadaEm: data?.updated_at || null,
  })
}

export async function PUT(req: Request) {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  }
  if (typeof body.provider === 'string' && body.provider) patch.ia_provider = body.provider
  if (typeof body.modelo === 'string' && body.modelo) patch.ia_modelo = body.modelo.trim()
  // string vazia = apagar a chave; ausente = manter a que está lá
  if (typeof body.apiKey === 'string') patch.ia_api_key = body.apiKey.trim() || null
  if (typeof body.webhookCliente === 'string') patch.webhook_cliente_url = body.webhookCliente.trim() || null

  const admin = adminClient()
  const { error } = await admin.from('workspace_secrets').upsert(patch, { onConflict: 'workspace_id' })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ ok: true })
}

/**
 * POST = testar a chave. Chama o endpoint de modelos do Gemini e devolve os que
 * a conta enxerga — assim o admin escolhe o nome do modelo a partir do que
 * existe de verdade, em vez de digitar de cabeça e só descobrir o erro quando a
 * primeira comunicação cair na caixa.
 */
export async function POST(req: Request) {
  const profile = await exigirAdmin()
  if (!profile) return Response.json({ error: 'Somente admins.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const admin = adminClient()

  let chave = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  if (!chave) {
    const { data } = await admin.from('workspace_secrets')
      .select('ia_api_key').eq('workspace_id', profile.workspace_id).maybeSingle()
    chave = (data?.ia_api_key as string | undefined) || ''
  }
  if (!chave) return Response.json({ ok: false, erro: 'Nenhuma chave gravada.' }, { status: 400 })

  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': chave },
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      return Response.json({ ok: false, erro: j?.error?.message || `HTTP ${r.status}` }, { status: 200 })
    }
    const modelos = (j.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: { name: string }) => String(m.name).replace(/^models\//, ''))
      .sort()
    return Response.json({ ok: true, modelos })
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 200 })
  }
}
