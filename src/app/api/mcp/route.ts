import { autenticarBearer, naoAutorizado, preflightCors } from '@/lib/mcp/oauth'
import { FERRAMENTAS, NOMES_FERRAMENTAS, executar } from '@/lib/mcp/ferramentas'

/**
 * Conector do Claude — servidor MCP (Streamable HTTP, sem estado, SÓ LEITURA).
 *
 * Endereço para colar no Claude: https://<crm>/api/mcp
 * Login: OAuth do próprio CRM (src/lib/mcp/oauth.ts) — só sócios (admin).
 *
 * Implementado à mão, sem SDK: o protocolo que o conector usa é pequeno
 * (initialize, tools/list, tools/call, ping) e responder JSON direto evita
 * dependência nova e sessão em memória — o CRM roda em contêiner que reinicia
 * a cada deploy. Não há stream SSE: GET responde 405, como a especificação
 * permite para servidor que não envia mensagens por conta própria.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCOES = [
  'CRM do escritório de advocacia Bernardes & Azevedo, em modo SOMENTE LEITURA: nada pode ser criado, alterado ou apagado por aqui.',
  'Comece por panorama_escritorio para conhecer as bases e os campos. Para um cliente ou processo: buscar → ver_registro (traz processos, pendências, audiências, comentários e tarefas ligados).',
  'Os dados são de clientes reais (sigilo profissional e LGPD): use só para o trabalho do escritório.',
  'Prazos do CRM são sugestões já conferidas pelo advogado; não recalcule prazo processual por conta própria.',
].join('\n')

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const falha = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

export async function POST(req: Request) {
  const ctx = await autenticarBearer(req)
  if (!ctx) return naoAutorizado(req)

  let corpo: unknown
  try { corpo = await req.json() } catch {
    return Response.json(falha(null, -32700, 'JSON inválido.'), { status: 400 })
  }

  const lote = Array.isArray(corpo)
  const msgs = (lote ? corpo : [corpo]) as Rpc[]
  const respostas: unknown[] = []

  for (const m of msgs) {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
      // resposta de cliente ou lixo: nada a fazer
      if (m && typeof m === 'object' && 'id' in m && !('method' in m)) continue
      respostas.push(falha(m?.id ?? null, -32600, 'Requisição inválida.'))
      continue
    }
    const ehNotificacao = m.id === undefined || m.id === null
    try {
      const r = await tratar(m, ctx)
      if (!ehNotificacao) respostas.push(r)
    } catch (e) {
      if (!ehNotificacao) respostas.push(falha(m.id, -32603, (e as Error).message || 'Erro interno.'))
    }
  }

  if (!respostas.length) return new Response(null, { status: 202 })
  return Response.json(lote ? respostas : respostas[0], { headers: { 'Cache-Control': 'no-store' } })
}

async function tratar(m: Rpc, ctx: NonNullable<Awaited<ReturnType<typeof autenticarBearer>>>) {
  const p = m.params || {}
  switch (m.method) {
    case 'initialize': {
      const pedida = String(p.protocolVersion || '')
      return ok(m.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'crm-bernardes-azevedo', title: 'CRM Bernardes & Azevedo', version: '1.0.0' },
        instructions: INSTRUCOES,
      })
    }
    case 'ping':
      return ok(m.id, {})
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return ok(m.id, {})
    case 'tools/list':
      return ok(m.id, { tools: FERRAMENTAS })
    case 'tools/call': {
      const nome = String(p.name || '')
      if (!NOMES_FERRAMENTAS.has(nome)) return falha(m.id, -32602, `Ferramenta desconhecida: ${nome}`)
      const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>
      try {
        const texto = await executar(nome, args, ctx)
        return ok(m.id, { content: [{ type: 'text', text: texto }], isError: false })
      } catch (e) {
        // erro da ferramenta vai como resultado, para o Claude ler e corrigir o pedido
        return ok(m.id, { content: [{ type: 'text', text: `Erro ao consultar o CRM: ${(e as Error).message}` }], isError: true })
      }
    }
    case 'resources/list':
      return ok(m.id, { resources: [] })
    case 'prompts/list':
      return ok(m.id, { prompts: [] })
    default:
      return falha(m.id, -32601, `Método não suportado: ${m.method}`)
  }
}

export async function GET(req: Request) {
  const ctx = await autenticarBearer(req)
  if (!ctx) return naoAutorizado(req)
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}

export const OPTIONS = preflightCors
