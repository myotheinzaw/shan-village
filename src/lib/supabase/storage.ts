import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from './env'

/**
 * Storage-only service-role client.
 *
 * `wastage-photos` is a private bucket. Two callers need to reach past its
 * policies, and both do so *after* an authorization check the database cannot
 * make for them:
 *
 *   1. the public submission route, once it has verified the link token — an
 *      anonymous caller must never hold a storage credential of its own;
 *   2. management screens issuing a short-lived signed URL for a photo the
 *      caller has already been allowed to see by RLS on wastage_entries.
 *
 * Row data is never read or written here; that stays on the user-scoped client
 * so RLS keeps deciding who sees which entry.
 */
export const WASTAGE_PHOTO_BUCKET = 'wastage-photos'

function storageClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export async function uploadWastagePhoto(
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await storageClient()
    .from(WASTAGE_PHOTO_BUCKET)
    .upload(path, body, { contentType, upsert: false })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function downloadWastagePhoto(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await storageClient().from(WASTAGE_PHOTO_BUCKET).download(path)
  if (error || !data) return null
  return data.arrayBuffer()
}

/** A signed URL for viewing one photo. Short-lived: this is a private bucket. */
export async function signedPhotoUrl(path: string, expiresInSeconds = 900): Promise<string | null> {
  const { data, error } = await storageClient()
    .from(WASTAGE_PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return error ? null : (data?.signedUrl ?? null)
}

export async function removeWastagePhoto(path: string): Promise<void> {
  await storageClient().from(WASTAGE_PHOTO_BUCKET).remove([path])
}
