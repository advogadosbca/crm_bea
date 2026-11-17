import { ESCOPO, jsonOAuth, preflightCors, urlBase, urlRecursoMcp } from '@/lib/mcp/oauth'

/**
 * Metadados do recurso protegido (RFC 9728). Responde tanto em
 * /.well-known/oauth-protected-resource quanto em
 * /.well-known/oauth-protected-resource/api/mcp — o Claude tenta os dois.
 * `resource` tem que ser exatamente o endereço do conector digitado no Claude.
 */
export async function GET(req: Request) {
  const base = urlBase(req)
  return jsonOAuth({
    resource: urlRecursoMcp(base),
    authorization_servers: [base],
    scopes_supported: [ESCOPO],
    bearer_methods_supported: ['header'],
    resource_name: 'CRM Bernardes & Azevedo (somente leitura)',
  })
}

export const OPTIONS = preflightCors
