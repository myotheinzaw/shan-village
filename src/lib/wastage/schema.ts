import { z } from 'zod'

/**
 * The submission contract, shared by the public form and the route that
 * receives it. The form uses it to disable the button; the route uses it as the
 * actual gate, because a form control is a courtesy and never a check.
 */

/** Phone cameras produce large files; anything above this is refused politely. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

/**
 * The form downscales before upload, so a photo normally arrives well under a
 * megabyte. HEIC is accepted because that is what an iPhone sends when the
 * browser hands the original file straight through.
 */
export const ACCEPTED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

/** Longest edge, in pixels, the form resizes a photo down to before uploading. */
export const PHOTO_MAX_EDGE = 1600
export const PHOTO_JPEG_QUALITY = 0.72

export const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'portion', 'tray', 'box', 'bag'] as const

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : v))

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' ? null : v))
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, 'Choose a valid option')

/**
 * A number typed by someone standing at a bin: "12", "12.5", "1,250", "AED 40".
 * Anything that is not a number becomes null rather than failing the whole
 * submission — losing a price is better than losing the record of the wastage.
 */
const loose = (max: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null
      const cleaned = String(v).replace(/[^0-9.]/g, '')
      if (cleaned === '' || cleaned === '.') return null
      const parsed = Number(cleaned)
      return Number.isFinite(parsed) ? parsed : null
    })
    .refine((v) => v === null || (v >= 0 && v <= max), `Enter a number up to ${max}`)

export const submissionSchema = z
  .object({
    reportedBy: optionalText(120),
    itemName: optionalText(200),
    note: optionalText(2000),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
      .optional(),
    // <input type="time"> gives "14:05"; Android sometimes adds seconds.
    entryTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Choose a time')
      .optional(),
    outletId: optionalUuid,
    reasonId: optionalUuid,
    quantity: loose(1_000_000),
    unit: optionalText(24),
    estimatedValue: loose(10_000_000),
  })
  .refine((v) => v.quantity === null || v.quantity > 0, {
    message: 'Quantity must be more than zero',
    path: ['quantity'],
  })

export type WastageSubmission = z.infer<typeof submissionSchema>

export function isAcceptedPhotoType(type: string): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type.toLowerCase())
}

/**
 * Storage key for a photo: `2026/08/24/<uuid>.jpg`. Date-partitioned so a
 * month's photos can be listed, archived or deleted as a unit.
 */
export function photoObjectPath(entryDate: string, id: string, mime: string): string {
  const [year, month, day] = entryDate.split('-')
  const extension =
    mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp'
    : mime === 'image/heic' || mime === 'image/heif' ? 'heic'
    : 'jpg'
  return `${year}/${month}/${day}/${id}.${extension}`
}
