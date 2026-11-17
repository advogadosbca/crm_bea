import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/api-auth'

/**
 * Login OAuth 2.1 do conector do Claude (MCP).
 *
 * POR QUE OAUTH E NÃO A API KEY DE /settings: o claude.ai só aceita, num
 * conector personalizado, OAuth (com registro dinâmico de cliente) ou nenhuma
 * autenticação. Chave em cabeçalho fixo é beta restrito e chave na URL a
 * documentação proíbe. De quebra, o OAuth amarra cada conexão a uma PESSOA do
 * CRM: dá para saber quem conectou e revogar só a dela.
 *
 * O fluxo, do lado do Claude:
 *   1. chama /api/mcp sem token → 401 com o endereço dos metadados
 *   2. lê /.well-known/oauth-protected-resource e /.well-known/oauth-authorization-server
 *   3. registra-se em /api/oauth/register (RFC 7591)
 *   4. abre /oauth/autorizar no navegador — a pessoa entra com a conta do CRM e permite
 *   5. troca o código em /api/oauth/token (PKCE S256) e passa a mandar Bearer
 *
 * Só admin/super_admin pode autorizar (decisão da v1): o conector enxerga o
 * escritório inteiro, e quem decide isso são os sócios.
 */

export const ESCOPO = 'crm.leitura'
export const VALIDADE_CODIGO_S = 5 * 60
export const VALIDADE_ACESSO_S = 60 * 60
export const VALIDADE_RENOVACAO_S = 30 * 24 * 60 * 60
export const PAPEIS_QUE_AUTORIZAM = ['super_admin', 'admin']

/**
 * Endereço público do CRM. Atrás do Traefik o `req.url` chega com o host
 * interno do contêiner, então vale, nesta ordem: variável de ambiente,
 * cabeçalhos X-Forwarded-* e, por último, o próprio `req.url` (dev local).
 * O emissor (`issuer`) tem que ser sempre o mesmo, senão o Claude recusa.
 */
export function urlBase(req: Request): string {
  return urlBaseDeCabecalhos(req.headers) || new URL(req.url).origin
}

/** mesma regra, para páginas (server component), que só têm `headers()` */
export function urlBaseDeCabecalhos(h: Headers): string {
  const env = process.env.CRM_PUBLIC_URL?.replace(/\/+$/, '')
  if (env) return env
  const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim()
  if (!host) return ''
  const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim()
    || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

export const urlRecursoMcp = (base: string) => `${base}/api/mcp`
export const urlMetadadosRecurso = (base: string) => `${base}/.well-known/oauth-protected-resource/api/mcp`

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const tokenAleatorio = (prefixo: string) => `${prefixo}_${randomBytes(32).toString('base64url')}`

/**
 * Para onde o código pode voltar. Só o Claude: o callback do claude.ai /
 * claude.com e o retorno local do Claude Code (qualquer porta, localhost ou
 * 127.0.0.1). Sem essa lista, qualquer site poderia se registrar com o próprio
 * endereço e, convencendo um sócio a clicar em "Permitir", levar o acesso.
 */
export function redirectPermitido(uri: string): boolean {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.hash) return false
  if (u.protocol === 'https:' && ['claude.ai', 'claude.com'].includes(u.hostname) && u.pathname === '/api/mcp/auth_callback') return true
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && u.pathname === '/callback') return true
  return false
}

/** compara o redirect pedido com os registrados; loopback casa sem olhar a porta (RFC 8252 §7.3) */
export function redirectRegistrado(pedido: string, registrados: string[]): boolean {
  if (registrados.includes(pedido)) return true
  let p: URL
  try { p = new URL(pedido) } catch { return false }
  if (p.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(p.hostname)) return false
  return registrados.some(r => {
    try {
      const x = new URL(r)
      return x.protocol === 'http:' && x.hostname === p.hostname && x.pathname === p.pathname
    } catch { return false }
  })
}

/** PKCE S256: base64url(sha256(verifier)) === challenge */
export function pkceConfere(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  const calc = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(calc), b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/* ------------------------------------------------------------------------
 * Pedido de autorização assinado.
 *
 * A tela de consentimento mostra o pedido e o formulário devolve um campo
 * escondido com ele assinado (HMAC) junto do id de quem está logado. Assim o
 * POST não aceita parâmetros trocados no meio do caminho nem um formulário
 * montado por outro site em nome de outra pessoa. A chave sai da service role,
 * que só o servidor conhece.
 * ---------------------------------------------------------------------- */
export interface PedidoAutorizacao {
  clientId: string
  clientName: string
  redirectUri: string
  codeChallenge: string
  state: string
  scope: string
  resource: string
  profileId: string
  exp: number
}

const chaveAssinatura = () => createHash('sha256')
  .update(`crm-mcp-consentimento:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest()

export function assinarPedido(p: PedidoAutorizacao): string {
  const corpo = Buffer.from(JSON.stringify(p)).toString('base64url')
  const sig = createHmac('sha256', chaveAssinatura()).update(corpo).digest('base64url')
  return `${corpo}.${sig}`
}

export function lerPedido(assinado: string): PedidoAutorizacao | null {
  const [corpo, sig] = String(assinado || '').split('.')
  if (!corpo || !sig) return null
  const esperado = createHmac('sha256', chaveAssinatura()).update(corpo).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as PedidoAutorizacao
    return p.exp > Date.now() ? p : null
  } catch { return null }
}

/* ------------------------------------------------------------------------
 * Validação do Bearer nas chamadas ao /api/mcp
 * ---------------------------------------------------------------------- */
export interface ContextoMcp {
  admin: SupabaseClient
  workspaceId: string
  profileId: string
  nome: string
  role: string
  isAdmin: boolean
  conexaoId: string
}

export async function autenticarBearer(req: Request): Promise<ContextoMcp | null> {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1].trim()
  if (!token.startsWith('crm_at_')) return null

  const admin = adminClient()
  const { data: t } = await admin.from('mcp_oauth_tokens')
    .select('id, profile_id, workspace_id, access_expires_at, revoked_at')
    .eq('access_hash', sha256(token)).maybeSingle()
  if (!t || t.revoked_at || Date.parse(t.access_expires_at) <= Date.now()) return null

  // o papel é relido a cada chamada: sócio rebaixado perde o conector na hora,
  // sem esperar o token vencer
  const { data: perfil } = await admin.from('profiles')
    .select('id, full_name, role, workspace_id').eq('id', t.profile_id).maybeSingle()
  if (!perfil || perfil.workspace_id !== t.workspace_id || !PAPEIS_QUE_AUTORIZAM.includes(perfil.role || '')) return null

  admin.from('mcp_oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id).then(() => {})

  return {
    admin,
    workspaceId: t.workspace_id,
    profileId: perfil.id,
    nome: perfil.full_name || '',
    role: perfil.role,
    isAdmin: ['admin', 'super_admin'].includes(perfil.role),
    conexaoId: t.id,
  }
}

/** 401 no formato que o Claude usa para descobrir onde fazer login */
export function naoAutorizado(req: Request, descricao = 'Token ausente, vencido ou revogado.') {
  const base = urlBase(req)
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: descricao }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${urlMetadadosRecurso(base)}", scope="${ESCOPO}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** resposta JSON das rotas OAuth (sem cache, com CORS aberto — não há cookie envolvido) */
export function jsonOAuth(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const preflightCors = () => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
    'Access-Control-Max-Age': '86400',
  },
})
