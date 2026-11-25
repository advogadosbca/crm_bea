import { headers } from 'next/headers'
import { ShieldCheck, Eye, Ban } from 'lucide-react'
import { AuthShell, Aviso, OURO } from '@/components/auth/AuthShell'
import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'
import {
  ESCOPO, PAPEIS_QUE_AUTORIZAM, assinarPedido, redirectRegistrado, urlBaseDeCabecalhos, urlRecursoMcp,
} from '@/lib/mcp/oauth'

/**
 * Tela de permissão do conector do Claude (authorization_endpoint do OAuth).
 *
 * O Claude abre esta página no navegador; o proxy já mandou para o login quem
 * não estava logado (e trouxe de volta, ver ?next= em src/proxy.ts). Aqui só
 * se valida o pedido e se mostra, com clareza, QUEM está pedindo e O QUÊ — o
 * endereço de retorno aparece na tela, como pede a especificação do MCP.
 */

type Busca = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams
  const base = urlBaseDeCabecalhos(await headers())

  if (um(sp.erro)) return <Falha msg={um(sp.erro)} />

  const clientId = um(sp.client_id)
  const redirectUri = um(sp.redirect_uri)
  const challenge = um(sp.code_challenge)
  const resource = um(sp.resource)

  if (um(sp.response_type) !== 'code') return <Falha msg="Pedido inválido: response_type precisa ser code." />
  if (!challenge || um(sp.code_challenge_method) !== 'S256') return <Falha msg="Pedido inválido: falta PKCE (S256)." />
  if (resource && resource.replace(/\/+$/, '') !== urlRecursoMcp(base) && resource.replace(/\/+$/, '') !== base) {
    return <Falha msg="Pedido inválido: o recurso pedido não é este CRM." />
  }

  const { data: cliente } = await adminClient().from('mcp_oauth_clients')
    .select('client_id, client_name, redirect_uris').eq('client_id', clientId).maybeSingle()
  // cliente ou retorno desconhecido: NÃO redireciona para lugar nenhum (seria
  // abrir porta para mandar a pessoa a um endereço qualquer)
  if (!cliente) return <Falha msg="Conexão desconhecida. Volte ao Claude e adicione o conector de novo." />
  if (!redirectRegistrado(redirectUri, cliente.redirect_uris || [])) return <Falha msg="Endereço de retorno não registrado para esta conexão." />

  const { profile } = await getAuthProfile()
  if (!profile) return <Falha msg="Entre no CRM e tente de novo." />
  if (!PAPEIS_QUE_AUTORIZAM.includes(profile.role || '')) {
    return <Falha msg="Só os sócios (perfil admin) podem conectar o Claude ao CRM. Peça a um deles." />
  }

  const pedido = assinarPedido({
    clientId,
    clientName: cliente.client_name || 'Claude',
    redirectUri,
    codeChallenge: challenge,
    state: um(sp.state),
    scope: ESCOPO,
    resource,
    profileId: profile.id,
    exp: Date.now() + 10 * 60 * 1000,
  })
  const hostRetorno = new URL(redirectUri).host

  return (
    <AuthShell titulo="Conectar o Claude" subtitulo={<>Conectado como <b>{profile.full_name || profile.email}</b></>}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#ebd480' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--notion-text-2)' }}>
            <b style={{ color: 'var(--notion-text)' }}>{cliente.client_name || 'Claude'}</b> quer acesso ao CRM do escritório.
            Ao permitir, ele volta para <b style={{ color: 'var(--notion-text)' }}>{hostRetorno}</b>.
          </p>
        </div>

        <ul className="space-y-2 text-xs" style={{ color: 'var(--notion-text-2)' }}>
          <li className="flex gap-2"><Eye className="w-4 h-4 shrink-0" style={{ color: '#34D399' }} />
            Pode <b>ler</b> clientes, processos, prazos, audiências, tarefas e as demais tabelas do CRM.</li>
          <li className="flex gap-2"><Ban className="w-4 h-4 shrink-0" style={{ color: '#F87171' }} />
            <span>Começa <b>somente leitura</b>: não cria nem altera nada até um sócio ligar <b>Pode editar</b> nesta conexão em Configurações → Claude.
              Mesmo assim, <b>nunca</b> apaga nem arquiva registros.</span></li>
        </ul>

        <p className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
          Os dados consultados passam pelo Claude. Para cortar o acesso, use Configurações → Claude no CRM.
        </p>

        <form method="post" action="/api/oauth/autorizar" className="flex gap-2 pt-1">
          <input type="hidden" name="pedido" value={pedido} />
          <button type="submit" name="decisao" value="negar"
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
            style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            Negar
          </button>
          <button type="submit" name="decisao" value="permitir"
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-105"
            style={{ background: OURO, color: '#1c2738' }}>
            Permitir
          </button>
        </form>
      </div>
    </AuthShell>
  )
}

function Falha({ msg }: { msg: string }) {
  return (
    <AuthShell titulo="Conectar o Claude">
      <Aviso tipo="erro">{msg}</Aviso>
    </AuthShell>
  )
}
