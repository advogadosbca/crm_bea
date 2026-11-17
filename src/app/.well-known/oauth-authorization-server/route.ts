import { ESCOPO, jsonOAuth, preflightCors, urlBase } from '@/lib/mcp/oauth'

/**
 * Metadados do servidor de autorização (RFC 8414) — o Claude lê aqui onde
 * registrar, autorizar e trocar o código. Ver src/lib/mcp/oauth.ts.
 *
 * Sem `client_id_metadata_document_supported`: fica só o registro dinâmico
 * (DCR), que é o caminho padrão do Claude quando o CIMD não é anunciado.
 */
export async function GET(req: Request) {
  const base = urlBase(req)
  return jsonOAuth({
    issuer: base,
    authorization_endpoint: `${base}/oauth/autorizar`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [ESCOPO],
    service_documentation: `${base}/settings`,
  })
}

export const OPTIONS = preflightCors
