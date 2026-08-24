import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { signedPhotoUrl } from '@/lib/supabase/storage'

/**
 * Opens a wastage photo.
 *
 * The bucket is private, so the picture is reached through a short-lived signed
 * URL. Whether the caller may see it at all is decided by RLS on the entry row:
 * the lookup below runs on their own client, and a row they cannot read simply
 * is not there.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!user.enabledModules.has('wastage')) return new NextResponse('Not found', { status: 404 })

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('wastage_entries')
    .select('photo_path')
    .eq('id', id)
    .maybeSingle()

  const path = (data as { photo_path: string | null } | null)?.photo_path
  if (!path) return new NextResponse('Not found', { status: 404 })

  const url = await signedPhotoUrl(path)
  if (!url) return new NextResponse('That photo is not available.', { status: 404 })

  return NextResponse.redirect(url)
}
