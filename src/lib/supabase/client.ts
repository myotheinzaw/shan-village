'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Browser client. Uses the anon key, so every request it makes is subject to
 * Row Level Security — which is the point: even if this client is driven from
 * devtools, it can only reach what the signed-in user is allowed to reach.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
