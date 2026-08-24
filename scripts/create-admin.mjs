#!/usr/bin/env node
/**
 * Creates the first Owner / Admin account.
 *
 * Run once, after the migrations have been applied:
 *
 *   SETUP_ADMIN_EMAIL=owner@example.com \
 *   SETUP_ADMIN_PASSWORD='a-long-password' \
 *   node scripts/create-admin.mjs
 *
 * Credentials come from the environment and are never written to the
 * repository. The service-role key is required because creating a Supabase Auth
 * user is not possible with an anonymous client.
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.SETUP_ADMIN_EMAIL
const name = process.env.SETUP_ADMIN_NAME ?? 'Owner'
let password = process.env.SETUP_ADMIN_PASSWORD

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

if (!url || !serviceKey) fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
if (!email) fail('Set SETUP_ADMIN_EMAIL to the owner’s email address.')

let generated = false
if (!password) {
  password = randomBytes(18).toString('base64url')
  generated = true
} else if (password.length < 10) {
  fail('SETUP_ADMIN_PASSWORD must be at least 10 characters.')
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: name },
})

if (createError) fail(`Could not create the account: ${createError.message}`)
const userId = created.user.id

const { error: profileError } = await supabase
  .from('profiles')
  .upsert({ id: userId, email, full_name: name, is_active: true }, { onConflict: 'id' })
if (profileError) fail(`Account created, but the profile failed: ${profileError.message}`)

const { data: role, error: roleLookupError } = await supabase
  .from('roles')
  .select('id')
  .eq('key', 'admin')
  .maybeSingle()
if (roleLookupError || !role) {
  fail('The admin role is missing. Apply the migrations in supabase/migrations first.')
}

const { error: roleError } = await supabase
  .from('user_roles')
  .upsert({ profile_id: userId, role_id: role.id }, { onConflict: 'profile_id,role_id' })
if (roleError) fail(`Account created, but the role assignment failed: ${roleError.message}`)

console.log(`\n  Owner account ready: ${email}`)
if (generated) {
  console.log(`  Generated password: ${password}`)
  console.log('  Sign in and change it from Profile straight away.')
}
console.log('')
