import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Exchanges the one-time code in a Supabase email link (password reset, account
 * invitation) for a session, then sends the user on to the right page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/'}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`)
}
