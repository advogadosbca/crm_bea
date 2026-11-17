import { adminClient } from '@/lib/api-auth'
import {
  ESCOPO, PAPEIS_QUE_AUTORIZAM, VALIDADE_ACESSO_S, VALIDADE_RENOVACAO_S,
  jsonOAuth, pkceConfere, preflightCors, redirectRegistrado, sha256, tokenAleatorio,
} from '@/lib/mcp/oauth'

/**
 * Endpoint de token (OAuth 2.1). O Claude manda form-urlencoded (RFC 6749
 * §4.1.3), mas JSON também é aceito para facilitar teste.
 *
 * - authorization_code: troca o código (5 min, uso único) com PKCE S256.
 * - refresh_token: renova e TROCA o token de renovação (cliente público tem
 *   que rotacionar — OAuth 2.1). O antigo deixa de valer na mesma resposta.
 *
 * Erro de token inválido/vencido é sempre `invalid_grant` — é o código que faz
 * o Claude pedir login de novo em vez de ficar tentando.
 */

async function lerCorpo(req: Request): Promise<Record<string, string>> {
  const tipo = req.headers.get('content-type') || ''
  if (tipo.includes('application/json')) {
    const j = await req.json().catch(() => ({}))
    return Object.fromEntries(Object.entries(j || {}).map(([k, v]) => [k, String(v ?? '')]))
  }
  const txt = await req.text()
  return Object.fromEntries(new URLSearchParams(txt))
}

const erro = (codigo: string, descricao: string, status = 400) =>
  jsonOAuth({ error: codigo, error_description: descricao }, status)

async function aindaPodeAutorizar(profileId: string, workspaceId: string) {
  const { data } = await adminClient().from('profiles').select('role, workspace_id').eq('id', profileId).maybeSingle()
  return !!data && data.workspace_id === workspaceId && PAPEIS_QUE_AUTORIZAM.includes(data.role || '')
}

function emitir() {
  const access = tokenAleatorio('crm_at')
  const refresh = tokenAleatorio('crm_rt')
  const agora = Date.now()
  return {
    access, refresh,
    linha: {
      access_hash: sha256(access),
      access_expires_at: new Date(agora + VALIDADE_ACESSO_S * 1000).toISOString(),
      refresh_hash: sha256(refresh),
      refresh_expires_at: new Date(agora + VALIDADE_RENOVACAO_S * 1000).toISOString(),
    },
  }
}

const resposta = (access: string, refresh: string, scope: string) => jsonOAuth({
  access_token: access,
  token_type: 'Bearer',
  expires_in: VALIDADE_ACESSO_S,
  refresh_token: refresh,
  scope: scope || ESCOPO,
})

export async function POST(req: Request) {
  const p = await lerCorpo(req)
  const admin = adminClient()

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.code_verifier || !p.client_id || !p.redirect_uri) {
      return erro('invalid_request', 'Faltam code, code_verifier, client_id ou redirect_uri.')
    }

    // marca como usado e devolve na mesma operação: dois pedidos simultâneos
    // com o mesmo código não conseguem os dois passar
    const { data: cod } = await admin.from('mcp_oauth_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code_hash', sha256(p.code)).is('used_at', null)
      .select('client_id, profile_id, workspace_id, redirect_uri, code_challenge, scope, expires_at')
      .maybeSingle()
    if (!cod) return erro('invalid_grant', 'Código inválido ou já usado.')
    if (Date.parse(cod.expires_at) <= Date.now()) return erro('invalid_grant', 'Código vencido.')
    if (cod.client_id !== p.client_id) return erro('invalid_grant', 'Código emitido para outro cliente.')
    if (!redirectRegistrado(p.redirect_uri, [cod.redirect_uri])) return erro('invalid_grant', 'redirect_uri não confere.')
    if (!pkceConfere(p.code_verifier, cod.code_challenge)) return erro('invalid_grant', 'code_verifier não confere (PKCE).')
    if (!(await aindaPodeAutorizar(cod.profile_id, cod.workspace_id))) return erro('invalid_grant', 'Esta conta não pode mais conectar o Claude.')

    const { data: cli } = await admin.from('mcp_oauth_clients').select('client_name').eq('client_id', cod.client_id).maybeSingle()
    const t = emitir()
    const { error } = await admin.from('mcp_oauth_tokens').insert({
      client_id: cod.client_id,
      client_name: cli?.client_name || 'Claude',
      profile_id: cod.profile_id,
      workspace_id: cod.workspace_id,
      scope: cod.scope || ESCOPO,
      ...t.linha,
    })
    if (error) return erro('server_error', error.message, 500)
    return resposta(t.access, t.refresh, cod.scope)
  }

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return erro('invalid_request', 'Falta refresh_token.')
    const { data: con } = await admin.from('mcp_oauth_tokens')
      .select('id, client_id, profile_id, workspace_id, scope, refresh_expires_at, revoked_at')
      .eq('refresh_hash', sha256(p.refresh_token)).maybeSingle()
    if (!con || con.revoked_at) return erro('invalid_grant', 'Conexão revogada ou token de renovação inválido.')
    if (Date.parse(con.refresh_expires_at) <= Date.now()) return erro('invalid_grant', 'Token de renovação vencido.')
    if (p.client_id && p.client_id !== con.client_id) return erro('invalid_grant', 'Token emitido para outro cliente.')
    if (!(await aindaPodeAutorizar(con.profile_id, con.workspace_id))) return erro('invalid_grant', 'Esta conta não pode mais conectar o Claude.')

    const t = emitir()
    // a troca só vale se o token antigo ainda for o atual (corrida entre duas renovações)
    const { data: trocado, error } = await admin.from('mcp_oauth_tokens')
      .update(t.linha).eq('id', con.id).eq('refresh_hash', sha256(p.refresh_token)).is('revoked_at', null)
      .select('id').maybeSingle()
    if (error) return erro('server_error', error.message, 500)
    if (!trocado) return erro('invalid_grant', 'Token de renovação já foi usado.')
    return resposta(t.access, t.refresh, con.scope)
  }

  return erro('unsupported_grant_type', 'Use authorization_code ou refresh_token.')
}

export const OPTIONS = preflightCors
