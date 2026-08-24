import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Server client bound to the signed-in user's cookies. Everything the
 * application reads and writes goes through this, so RLS applies to server
 * rendering and server actions exactly as it does in the browser.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
