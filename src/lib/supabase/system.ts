import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from './env'

/**
 * Service-role client for scheduled and background work. BYPASSES RLS.
 *
 * There is exactly one job in this system with no user behind it: publishing
 * the daily wastage workbook to Google Drive. It runs from a cron request, and
 * from the `after()` hook of a public submission by someone with no account at
 * all, so there is no session whose permissions could be applied — and it must
 * read every entry for the day regardless of who filed it.
 *
 * The rule that goes with it: a caller-initiated export checks the caller's
 * `wastage.export` permission in the route *before* reaching this client, and
 * nothing here is ever driven by data the caller supplied beyond a date.
 */
export function createSupabaseSystemClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
