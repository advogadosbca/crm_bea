import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // nome de cookie FIXO: navegador e servidor precisam usar o mesmo
    // (senão cada um deriva da sua URL e a sessão não é lida → loop de redirect)
    { cookieOptions: { name: 'sb-crm-auth' } }
  )
}
