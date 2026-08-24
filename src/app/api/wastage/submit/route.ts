import { randomUUID } from 'node:crypto'
import { NextResponse, after, type NextRequest } from 'next/server'
import { createSupabaseAnonClient } from '@/lib/supabase/public'
import {
  isStorageConfigured,
  removeWastagePhoto,
  uploadWastagePhoto,
} from '@/lib/supabase/storage'
import { publishIfAutoEnabled } from '@/lib/wastage/export'
import {
  MAX_PHOTO_BYTES,
  isAcceptedPhotoType,
  photoObjectPath,
  submissionSchema,
} from '@/lib/wastage/schema'

/**
 * The public wastage submission endpoint.
 *
 * This is the one unauthenticated write in the system, so the shape is
 * deliberate: the link token is checked by the database inside
 * `app.wastage_submit`, not here, and this route holds no credential that
 * could write a row. Its own job is the parts SQL cannot do — reading a
 * multipart body, refusing a file that is not an image, and putting the photo
 * in the private bucket before the row that references it is written.
 *
 * Failure policy: an entry is worth more than its photo. If the upload fails,
 * the entry is still recorded, and the response says the photo did not arrive.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ResolvedLink {
  link_id: string
  require_name: boolean
  require_photo: boolean
  require_reason: boolean
  today: string
  now_time: string
}

function field(form: FormData, key: string): string | undefined {
  const value = form.get(key)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'That form could not be read.' }, { status: 400 })
  }

  const token = field(form, 'token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'This link is missing its code.' }, { status: 400 })
  }

  const supabase = createSupabaseAnonClient()

  const { data: resolved, error: resolveError } = await supabase
    .rpc('wastage_link_resolve', { p_token: token })
    .maybeSingle()

  if (resolveError || !resolved) {
    return NextResponse.json(
      { ok: false, error: 'This wastage link is no longer active. Ask your manager for the current link.' },
      { status: 403 },
    )
  }
  const link = resolved as ResolvedLink

  const parsed = submissionSchema.safeParse({
    reportedBy: field(form, 'reportedBy'),
    employeeId: field(form, 'employeeId'),
    itemName: field(form, 'itemName'),
    note: field(form, 'note'),
    entryDate: field(form, 'entryDate'),
    entryTime: field(form, 'entryTime'),
    outletId: field(form, 'outletId'),
    reasonId: field(form, 'reasonId'),
    quantity: field(form, 'quantity'),
    unit: field(form, 'unit'),
    estimatedValue: field(form, 'estimatedValue'),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { ok: false, error: issue?.message ?? 'Please check what you entered.' },
      { status: 400 },
    )
  }
  const value = parsed.data

  const photo = form.get('photo')
  const hasPhoto = photo instanceof File && photo.size > 0

  // Either half of "choose or type" satisfies the name requirement; which one
  // was used is settled in SQL, where the chosen employee's own spelling wins.
  if (link.require_name && !value.reportedBy && !value.employeeId) {
    return NextResponse.json({ ok: false, error: 'Please enter your name.' }, { status: 400 })
  }
  if (link.require_photo && !hasPhoto) {
    return NextResponse.json({ ok: false, error: 'A photo is required.' }, { status: 400 })
  }
  if (link.require_reason && !value.reasonId) {
    return NextResponse.json({ ok: false, error: 'Please choose a reason.' }, { status: 400 })
  }
  if (!hasPhoto && !value.itemName && !value.note) {
    return NextResponse.json(
      { ok: false, error: 'Add a photo, or say what was thrown away.' },
      { status: 400 },
    )
  }

  const entryDate = value.entryDate ?? link.today
  let photoPath: string | null = null
  let photoMime: string | null = null
  let photoSize: number | null = null
  let photoWarning: string | null = null

  if (hasPhoto) {
    const file = photo as File
    const mime = (file.type || 'image/jpeg').toLowerCase()
    if (!isAcceptedPhotoType(mime)) {
      return NextResponse.json(
        { ok: false, error: 'That file is not a photo. Take a picture and try again.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'That photo is too large. Take a new one and try again.' },
        { status: 413 },
      )
    }
    if (!isStorageConfigured()) {
      photoWarning = 'The photo could not be stored on this deployment, so the entry was saved without it.'
    } else {
      const path = photoObjectPath(entryDate, randomUUID(), mime)
      const upload = await uploadWastagePhoto(path, await file.arrayBuffer(), mime)
      if (upload.ok) {
        photoPath = path
        photoMime = mime
        photoSize = file.size
      } else {
        photoWarning = 'The photo could not be saved, so the entry was recorded without it.'
      }
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .rpc('wastage_submit', {
      p_token: token,
      p_reported_by: value.reportedBy ?? '',
      p_employee_id: value.employeeId,
      p_item_name: value.itemName ?? '',
      p_note: value.note ?? '',
      p_entry_date: entryDate,
      p_entry_time: value.entryTime ?? link.now_time,
      p_outlet_id: value.outletId,
      p_reason_id: value.reasonId,
      p_quantity: value.quantity,
      p_unit: value.unit,
      p_estimated_value: value.estimatedValue,
      p_photo_path: photoPath,
      p_photo_mime: photoMime,
      p_photo_size: photoSize,
    })
    .maybeSingle()

  if (insertError || !inserted) {
    // Do not leave a photo in the bucket that no row points at.
    if (photoPath) await removeWastagePhoto(photoPath).catch(() => undefined)
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? 'The entry could not be saved. Try again.' },
      { status: 400 },
    )
  }

  const entry = inserted as { reference: string; entry_date: string; entry_time: string }

  // The Owner's Drive copy is refreshed after the reporter already has their
  // confirmation, so a slow or broken Drive never delays the person at the bin.
  after(() => publishIfAutoEnabled(entry.entry_date))

  return NextResponse.json({
    ok: true,
    reference: entry.reference,
    entryDate: entry.entry_date,
    entryTime: entry.entry_time.slice(0, 5),
    photoSaved: Boolean(photoPath),
    warning: photoWarning,
  })
}
