import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './env'

/**
 * Public routes. Everything else needs a session.
 * `/offline` is public because the service worker fetches it during install,
 * before anyone has signed in — a redirect there would poison the precache.
 */
const PUBLIC_PATHS = [
  '/login',
  // The wastage submission link and the endpoint it posts to. Anyone holding a
  // valid token may use them; the token is checked by the database, and neither
  // reaches anything else.
  '/w',
  '/api/wastage/submit',
  // Scheduled jobs authenticate with CRON_SECRET, not with a session.
  '/api/cron',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/setup-required',
  '/offline',
]

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  if (!isSupabaseConfigured()) {
    // Without configuration there is nothing to authenticate against; send the
    // operator to a page that explains what is missing rather than a crash loop.
    if (request.nextUrl.pathname !== '/setup-required') {
      const url = request.nextUrl.clone()
      url.pathname = '/setup-required'
      return NextResponse.redirect(url)
    }
    return response
  }

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() revalidates the token with Supabase; getSession() would trust a
  // cookie the browser could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
