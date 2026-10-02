import { createBrowserClient } from '@supabase/ssr'

/**
 * Trava de gravação do visualizador. Quem barra de verdade é a RLS
 * (sql/012-visualizador-e-abas.sql); isto só evita a ida ao banco e avisa na
 * tela, em vez de cada componente mostrar um erro diferente — ou nenhum.
 */
let somenteLeitura = false
export const EVENTO_SOMENTE_LEITURA = 'crm:somente-leitura'
export function setSomenteLeitura(v: boolean) { somenteLeitura = v }

const fetchComTrava: typeof fetch = (input, init) => {
  if (somenteLeitura) {
    const metodo = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (metodo !== 'GET' && metodo !== 'HEAD' && /\/(rest|storage)\/v1\//.test(url)) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_SOMENTE_LEITURA))
      return Promise.resolve(new Response(
        JSON.stringify({ code: '42501', message: 'Seu acesso é somente de visualização.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ))
    }
  }
  return fetch(input, init)
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // nome de cookie FIXO: navegador e servidor precisam usar o mesmo
    // (senão cada um deriva da sua URL e a sessão não é lida → loop de redirect)
    { cookieOptions: { name: 'sb-crm-auth' }, global: { fetch: fetchComTrava } }
  )
}
