import { randomBytes } from 'crypto'
import { adminClient } from '@/lib/api-auth'
import { jsonOAuth, preflightCors, redirectPermitido } from '@/lib/mcp/oauth'

/**
 * Registro dinâmico de cliente (RFC 7591). O Claude chama a cada conexão nova.
 *
 * Aceita só redirects do próprio Claude (ver `redirectPermitido`): um registro
 * com endereço de outro site é recusado aqui, antes de chegar à tela de
 * permissão. Cliente público — sem segredo, a prova é o PKCE.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return jsonOAuth({ error: 'invalid_client_metadata', error_description: 'Corpo JSON inválido.' }, 400)

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : []
  if (!uris.length) return jsonOAuth({ error: 'invalid_redirect_uri', error_description: 'redirect_uris é obrigatório.' }, 400)
  const recusada = uris.find(u => !redirectPermitido(u))
  if (recusada) {
    return jsonOAuth({ error: 'invalid_redirect_uri', error_description: `Este CRM só aceita conexões do Claude. Endereço recusado: ${recusada}` }, 400)
  }

  const metodo = String(body.token_endpoint_auth_method || 'none')
  if (metodo !== 'none') {
    return jsonOAuth({ error: 'invalid_client_metadata', error_description: 'Só clientes públicos (token_endpoint_auth_method=none, com PKCE).' }, 400)
  }

  const clientId = `crm_mcp_${randomBytes(16).toString('hex')}`
  const clientName = String(body.client_name || 'Claude').slice(0, 120)

  const { error } = await adminClient().from('mcp_oauth_clients')
    .insert({ client_id: clientId, client_name: clientName, redirect_uris: uris })
  if (error) return jsonOAuth({ error: 'server_error', error_description: error.message }, 500)

  return jsonOAuth({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, 201)
}

export const OPTIONS = preflightCors
