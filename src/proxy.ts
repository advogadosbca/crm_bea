import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Valida a sessão via getUser (usa a URL interna do Docker — rápido e sem
  // hairpin pela URL pública, que o getClaims faria ao buscar o JWKS do issuer).
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthed = !!user

  const path = request.nextUrl.pathname
  const isPublic = path.startsWith('/login') || path.startsWith('/forgot-password') || path.startsWith('/reset-password') || path.startsWith('/definir-senha') || path.startsWith('/auth')

  if (!isAuthed && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // logado tentando acessar login/forgot vai pro app; reset/definir-senha são permitidos mesmo logado (sessão de convite/recuperação)
  if (isAuthed && (path.startsWith('/login') || path.startsWith('/forgot-password'))) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
