import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/api-auth'
import { getAuthProfile } from '@/lib/auth'
import { PAPEIS_QUE_AUTORIZAM, VALIDADE_CODIGO_S, lerPedido, sha256, tokenAleatorio, urlBase } from '@/lib/mcp/oauth'

/**
 * Decisão da tela /oauth/autorizar (botões Permitir / Negar).
 *
 * O formulário traz o pedido assinado pela própria tela (ver `assinarPedido`):
 * aqui confere a assinatura, se quem está logado é a mesma pessoa que viu a
 * tela e se ela ainda é sócia (admin). Só então grava o código e devolve o
 * navegador ao Claude.
 */
export async function POST(req: Request) {
  const form = await req.formData()
  const pedido = lerPedido(String(form.get('pedido') || ''))
  const base = urlBase(req)
  // 303: o navegador segue com GET, nunca reenvia o formulário
  const voltarTela = (msg: string) => NextResponse.redirect(`${base}/oauth/autorizar?erro=${encodeURIComponent(msg)}`, 303)

  if (!pedido) return voltarTela('O pedido venceu ou foi alterado. Volte ao Claude e conecte de novo.')

  const { profile } = await getAuthProfile()
  if (!profile || profile.id !== pedido.profileId) return voltarTela('Sessão diferente da que abriu o pedido. Entre de novo e repita.')
  if (!PAPEIS_QUE_AUTORIZAM.includes(profile.role || '')) return voltarTela('Só sócios (admin) podem conectar o Claude ao CRM.')

  const destino = new URL(pedido.redirectUri)
  if (pedido.state) destino.searchParams.set('state', pedido.state)
  destino.searchParams.set('iss', base)

  if (form.get('decisao') !== 'permitir') {
    destino.searchParams.set('error', 'access_denied')
    destino.searchParams.set('error_description', 'A pessoa negou o acesso.')
    return NextResponse.redirect(destino.toString(), 303)
  }

  const code = tokenAleatorio('crm_code')
  const { error } = await adminClient().from('mcp_oauth_codes').insert({
    code_hash: sha256(code),
    client_id: pedido.clientId,
    profile_id: profile.id,
    workspace_id: profile.workspace_id,
    redirect_uri: pedido.redirectUri,
    code_challenge: pedido.codeChallenge,
    scope: pedido.scope,
    resource: pedido.resource || null,
    expires_at: new Date(Date.now() + VALIDADE_CODIGO_S * 1000).toISOString(),
  })
  if (error) {
    destino.searchParams.set('error', 'server_error')
    return NextResponse.redirect(destino.toString(), 303)
  }

  destino.searchParams.set('code', code)
  return NextResponse.redirect(destino.toString(), 303)
}
