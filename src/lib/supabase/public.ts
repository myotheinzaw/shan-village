import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * An anonymous client with no session at all.
 *
 * The public wastage form is served to people who are not signed in, so there
 * is no cookie to bind to. This client therefore acts as the `anon` role, which
 * the schema revokes from every table — it can reach nothing except the three
 * SECURITY DEFINER functions in migration 1000, each of which checks the link
 * token itself. Do not use it for anything else.
 */
export function createSupabaseAnonClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
