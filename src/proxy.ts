import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

  // Verificação rápida e LOCAL do token (sem ida à rede). Só cai pro getUser
  // (que renova o token) quando o claim está ausente/expirado.
  let userId: string | undefined
  const { data: claimData } = await supabase.auth.getClaims()
  userId = claimData?.claims?.sub as string | undefined
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id
  }
  const isAuthed = !!userId

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
