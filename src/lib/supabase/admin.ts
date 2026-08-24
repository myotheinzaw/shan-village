import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from './env'

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * `server-only` above makes importing this from a client component a build
 * error, not a runtime surprise. Use it exclusively for operations that the
 * Supabase Auth admin API requires — creating a user, resetting a password,
 * deleting an account — and always after checking the caller's permission with
 * requirePermission() first. Never use it to read or write operational data;
 * that is what the user-scoped client is for.
 */
export function createSupabaseAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
