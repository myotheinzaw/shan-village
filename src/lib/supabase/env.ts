/**
 * Environment access, deliberately lazy.
 *
 * Reading these at module scope would break `next build` on a machine without
 * a .env file, so they are read per call and fail with an actionable message.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in — see docs/DEPLOYMENT.md.`,
    )
  }
  return value
}

export const supabaseUrl = () => required('NEXT_PUBLIC_SUPABASE_URL')
export const supabaseAnonKey = () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const supabaseServiceRoleKey = () => required('SUPABASE_SERVICE_ROLE_KEY')
export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
