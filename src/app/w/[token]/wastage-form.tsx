'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import {
  MAX_PHOTO_BYTES,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_EDGE,
  UNITS,
  isAcceptedPhotoType,
} from '@/lib/wastage/schema'

interface Option {
  id: string
  name: string
}

interface StaffOption extends Option {
  position: string
}

/** The value the name dropdown carries for "I am not on this list". */
const TYPE_IT = '__type__'

/** Remembers the reporter's name between entries on the same phone. */
const NAME_KEY = 'shan-village.wastage.name'
const STAFF_KEY = 'shan-village.wastage.employee'

/**
 * Downscales a camera photo before upload.
 *
 * A modern phone produces 4–8 MB per picture, and the people using this are on
 * restaurant wifi at the end of a shift. 1600px on the long edge is plenty to
 * see what was thrown away and turns that into roughly 200 KB. If the browser
 * cannot decode the file (an iPhone handing over an untouched HEIC, for
 * instance) the original is uploaded unchanged rather than failing.
 */
async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], 'wastage.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

interface Submitted {
  reference: string
  entryTime: string
  photoSaved: boolean
  warning: string | null
}

export function WastageForm({
  token,
  currency,
  today,
  nowTime,
  requireName,
  requirePhoto,
  requireReason,
  fixedOutlet,
  outlets,
  reasons,
  staff,
  showOutletPicker,
}: {
  token: string
  currency: string
  today: string
  nowTime: string
  requireName: boolean
  requirePhoto: boolean
  requireReason: boolean
  fixedOutlet: string | null
  outlets: Option[]
  reasons: Option[]
  staff: StaffOption[]
  showOutletPicker: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  // '' = nothing chosen yet, TYPE_IT = typing instead, otherwise an employee id.
  const [employeeId, setEmployeeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Submitted | null>(null)
  // The date and time are seeded from the restaurant's clock on the server, so
  // a phone with the wrong timezone still files the entry against the right day.
  const [entryDate, setEntryDate] = useState(today)
  const [entryTime, setEntryTime] = useState(nowTime)

  useEffect(() => {
    try {
      const storedName = window.localStorage.getItem(NAME_KEY)
      if (storedName) setName(storedName)
      const storedStaff = window.localStorage.getItem(STAFF_KEY)
      // Only reuse the remembered person if they are still on the list; someone
      // who has left should not keep appearing on this phone.
      if (storedStaff && staff.some((person) => person.id === storedStaff)) {
        setEmployeeId(storedStaff)
      } else if (storedName && staff.length > 0) {
        setEmployeeId(TYPE_IT)
      }
    } catch {
      // Private browsing; the name simply is not remembered.
    }
  }, [staff])

  useEffect(() => {
    if (!photo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type && !isAcceptedPhotoType(file.type)) {
      setError('That file is not a photo. Use the camera button.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That photo is too large. Take a new one.')
      return
    }
    setError(null)
    setPhoto(await shrink(file))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    form.set('token', token)
    if (photo) form.set('photo', photo)

    if (requirePhoto && !photo) {
      setError('Please take a photo.')
      return
    }
    if (requireName && !form.get('employeeId') && !String(form.get('reportedBy') ?? '').trim()) {
      setError('Choose your name from the list, or type it.')
      return
    }
    if (!photo && !String(form.get('itemName') ?? '').trim() && !String(form.get('note') ?? '').trim()) {
      setError('Add a photo, or say what was thrown away.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/wastage/submit', { method: 'POST', body: form })
      const payload = (await response.json()) as {
        ok: boolean
        error?: string
        reference?: string
        entryTime?: string
        photoSaved?: boolean
        warning?: string | null
      }

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? 'That did not save. Try again.')
        return
      }

      try {
        const reporter = String(form.get('reportedBy') ?? '').trim()
        if (reporter) window.localStorage.setItem(NAME_KEY, reporter)
        const chosen = String(form.get('employeeId') ?? '')
        if (chosen) window.localStorage.setItem(STAFF_KEY, chosen)
        else window.localStorage.removeItem(STAFF_KEY)
      } catch {
        // Nothing to do; remembering the name is a convenience.
      }

      setDone({
        reference: payload.reference ?? '',
        entryTime: payload.entryTime ?? entryTime,
        photoSaved: Boolean(payload.photoSaved),
        warning: payload.warning ?? null,
      })
    } catch {
      setError('No connection. Check the wifi and try again — nothing has been sent yet.')
    } finally {
      setBusy(false)
    }
  }

  function reportAnother() {
    setDone(null)
    setPhoto(null)
    setError(null)
    // The name is deliberately kept: the same person usually files the next one.
    setEntryDate(today)
    setEntryTime(new Date().toTimeString().slice(0, 5))
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
        <CheckCircle2 className="size-14 text-teal-600" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Thank you — it is recorded</h1>
          <p className="mt-1 text-sm text-ink-500">
            {done.reference ? `Reference ${done.reference} · ` : null}
            {done.entryTime}
          </p>
        </div>
        {done.warning ? <Alert tone="warning">{done.warning}</Alert> : null}
        <Button type="button" variant="secondary" size="lg" onClick={reportAnother}>
          <RotateCcw aria-hidden />
          Report another
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 py-5">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Report wastage</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Take a picture and say what happened. Everything except the photo and the note is optional.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Photo — the first and largest control, because it is the main job. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onPickPhoto}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="The wastage you photographed" className="h-56 w-full object-cover" />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className="absolute right-2 top-2 rounded-full bg-ink-900/70 p-2 text-white"
            aria-label="Remove the photo"
          >
            <X className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full border-t border-sand-200 py-2.5 text-sm font-medium text-spice-700"
          >
            Take a different photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-sand-300 bg-white text-ink-700"
        >
          <Camera className="size-8 text-spice-600" aria-hidden />
          <span className="text-base font-medium">Take a photo</span>
          <span className="text-xs text-ink-500">
            {requirePhoto ? 'Required' : 'Recommended — it saves every question later'}
          </span>
        </button>
      )}

      <Field label="What was thrown away" htmlFor="itemName">
        <Input id="itemName" name="itemName" placeholder="e.g. Chicken curry, 2 trays" maxLength={200} />
      </Field>

      <Field label="Note" htmlFor="note" hint="What happened, in your own words.">
        <Textarea id="note" name="note" rows={3} maxLength={2000} placeholder="e.g. Left out of the fridge overnight" />
      </Field>

      <Field label="Why" htmlFor="reasonId" required={requireReason}>
        <Select id="reasonId" name="reasonId" defaultValue="" required={requireReason}>
          <option value="">Choose a reason</option>
          {reasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="How much" htmlFor="quantity">
          <Input id="quantity" name="quantity" inputMode="decimal" placeholder="e.g. 2" />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Select id="unit" name="unit" defaultValue="">
            <option value="">—</option>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label={`Value (${currency})`}
        htmlFor="estimatedValue"
        hint="Only if you know it. Leave it blank otherwise — a guess is worse than nothing."
      >
        <Input id="estimatedValue" name="estimatedValue" inputMode="decimal" placeholder="e.g. 45" />
      </Field>

      {showOutletPicker ? (
        <Field label="Outlet" htmlFor="outletId">
          <Select id="outletId" name="outletId" defaultValue="">
            <option value="">Choose the outlet</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : fixedOutlet ? (
        <p className="text-xs text-ink-500">Recorded against {fixedOutlet}.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="entryDate">
          <Input
            id="entryDate"
            name="entryDate"
            type="date"
            value={entryDate}
            max={today}
            onChange={(event) => setEntryDate(event.target.value)}
          />
        </Field>
        <Field label="Time" htmlFor="entryTime">
          <Input
            id="entryTime"
            name="entryTime"
            type="time"
            value={entryTime}
            onChange={(event) => setEntryTime(event.target.value)}
          />
        </Field>
      </div>

      {staff.length > 0 ? (
        <Field
          label="Your name"
          htmlFor="staffPicker"
          required={requireName}
          hint="Pick yourself from the list so the report groups your entries together."
        >
          <Select
            id="staffPicker"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            required={requireName && employeeId !== TYPE_IT}
          >
            <option value="">Choose your name</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.position ? `${person.name} — ${person.position}` : person.name}
              </option>
            ))}
            <option value={TYPE_IT}>My name is not on the list — type it</option>
          </Select>
        </Field>
      ) : null}

      {/* The id only travels when a real person is chosen; TYPE_IT is a UI
          state, not something the server should ever see. */}
      {employeeId && employeeId !== TYPE_IT ? (
        <input type="hidden" name="employeeId" value={employeeId} />
      ) : null}

      {staff.length === 0 || employeeId === TYPE_IT ? (
        <Field
          label={staff.length === 0 ? 'Your name' : 'Type your name'}
          htmlFor="reportedBy"
          required={requireName}
        >
          <Input
            id="reportedBy"
            name="reportedBy"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required={requireName}
            maxLength={120}
            autoComplete="name"
            placeholder="So the manager knows who to ask"
          />
        </Field>
      ) : null}

      <Button type="submit" size="lg" disabled={busy} className="mt-1 h-14 text-base">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {busy ? 'Sending…' : 'Submit wastage'}
      </Button>
    </form>
  )
}
