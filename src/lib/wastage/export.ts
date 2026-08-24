import 'server-only'

import { formatInTimeZone } from 'date-fns-tz'
import {
  DriveError,
  XLSX_MIME,
  configuredFolderId,
  driveFileUrl,
  ensureFolder,
  isDriveConfigured,
  upsertFile,
} from '@/lib/google/drive'
import { createSupabaseSystemClient } from '@/lib/supabase/system'
import { downloadWastagePhoto, isStorageConfigured } from '@/lib/supabase/storage'
import { SETTING_DEFAULTS } from '@/lib/settings'
import type { AppSetting, WastageEntry, WastageExportTrigger } from '@/types/db'
import { buildReportData, loadWastageDay } from './report'
import { buildWastageWorkbook, reportFileName, totalValue } from './workbook'

/**
 * Publishing the day's workbook to Google Drive.
 *
 * Two rules shape this module:
 *
 *   1. A wastage entry is never lost because Drive is unavailable. Every path
 *      here reports a failure as a row in wastage_exports and returns it; none
 *      of them throws into a submission.
 *   2. The same day is published to the same file. The workbook is regenerated
 *      and its content replaced, so the Owner's link never changes and the
 *      folder does not fill up with fifteen versions of one Tuesday.
 */

export interface PublishOutcome {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  message: string
  reportDate: string
  entryCount: number
  totalValue: number
  fileName?: string
  driveUrl?: string
}

type Settings = typeof SETTING_DEFAULTS

async function loadSettings(client: ReturnType<typeof createSupabaseSystemClient>): Promise<Settings> {
  const { data } = await client.from('app_settings').select('key, value')
  const settings = { ...SETTING_DEFAULTS } as Record<string, unknown>
  for (const row of (data ?? []) as Pick<AppSetting, 'key' | 'value'>[]) {
    if (row.key in SETTING_DEFAULTS) settings[row.key] = row.value
  }
  return settings as Settings
}

async function record(
  client: ReturnType<typeof createSupabaseSystemClient>,
  values: {
    reportDate: string
    status: PublishOutcome['status']
    trigger: WastageExportTrigger
    actorId?: string | null
    entryCount?: number
    totalValue?: number
    fileName?: string | null
    driveFileId?: string | null
    driveUrl?: string | null
    error?: string | null
  },
): Promise<void> {
  await client.from('wastage_exports').insert({
    report_date: values.reportDate,
    status: values.status,
    trigger: values.trigger,
    entry_count: values.entryCount ?? 0,
    total_value: values.totalValue ?? 0,
    file_name: values.fileName ?? null,
    drive_file_id: values.driveFileId ?? null,
    drive_url: values.driveUrl ?? null,
    error: values.error ?? null,
    created_by: values.actorId ?? null,
  })
}

/**
 * Copies photos that are not in Drive yet into a dated sub-folder, and records
 * the Drive link on the entry. A photo that fails to copy is skipped, not
 * retried forever: the entry keeps its Supabase copy and the report simply has
 * no link in that row.
 */
async function copyPhotosToDrive(
  client: ReturnType<typeof createSupabaseSystemClient>,
  entries: WastageEntry[],
  reportDate: string,
  reportFolderId: string,
): Promise<void> {
  const pending = entries.filter((e) => e.photo_path && !e.drive_photo_id)
  if (pending.length === 0 || !isStorageConfigured()) return

  const photosRoot = await ensureFolder('Photos', reportFolderId)
  const dayFolder = await ensureFolder(reportDate, photosRoot)

  for (const entry of pending) {
    try {
      const bytes = await downloadWastagePhoto(entry.photo_path as string)
      if (!bytes) continue
      const extension = (entry.photo_path as string).split('.').pop() ?? 'jpg'
      const uploaded = await upsertFile({
        name: `${entry.reference ?? entry.id} ${entry.entry_time.slice(0, 5).replace(':', '')}.${extension}`,
        mimeType: entry.photo_mime ?? 'image/jpeg',
        data: new Uint8Array(bytes),
        parentId: dayFolder,
      })
      const url = uploaded.webViewLink ?? driveFileUrl(uploaded.id)
      await client
        .from('wastage_entries')
        .update({ drive_photo_id: uploaded.id, drive_photo_url: url })
        .eq('id', entry.id)
      entry.drive_photo_id = uploaded.id
      entry.drive_photo_url = url
    } catch {
      // Leave the entry without a Drive photo; the workbook handles a null link.
    }
  }
}

export async function publishDailyWastageReport(options: {
  date: string
  trigger: WastageExportTrigger
  actorId?: string | null
}): Promise<PublishOutcome> {
  const { date, trigger, actorId = null } = options
  const client = createSupabaseSystemClient()
  const base: Pick<PublishOutcome, 'reportDate' | 'entryCount' | 'totalValue'> = {
    reportDate: date,
    entryCount: 0,
    totalValue: 0,
  }

  try {
    const settings = await loadSettings(client)
    const folderId = (settings.wastage_drive_folder_id || configuredFolderId()).trim()

    if (!isDriveConfigured()) {
      const message =
        'Google Drive is not connected yet. Add the service account credentials and the report will publish itself — see docs/WASTAGE.md.'
      await record(client, { ...base, reportDate: date, status: 'SKIPPED', trigger, actorId, error: message })
      return { ...base, status: 'SKIPPED', message }
    }
    if (!folderId) {
      const message = 'No Google Drive folder is configured for the wastage report.'
      await record(client, { ...base, reportDate: date, status: 'SKIPPED', trigger, actorId, error: message })
      return { ...base, status: 'SKIPPED', message }
    }

    const day = await loadWastageDay(client, date)
    if (day.entries.length === 0) {
      const message = `No wastage was recorded on ${date}, so nothing was published.`
      await record(client, { ...base, reportDate: date, status: 'SKIPPED', trigger, actorId, error: message })
      return { ...base, status: 'SKIPPED', message }
    }

    const reportFolderId = settings.wastage_drive_subfolder.trim()
      ? await ensureFolder(settings.wastage_drive_subfolder.trim(), folderId)
      : folderId

    if (settings.wastage_photos_to_drive) {
      await copyPhotosToDrive(client, day.entries, date, reportFolderId)
    }

    const report = buildReportData(day, {
      restaurantName: settings.restaurant_name,
      currency: settings.currency,
      // The Drive folder is the Owner's own; the workbook there is the complete
      // record, including what each entry was thought to be worth.
      includeValues: true,
      generatedAt: formatInTimeZone(new Date(), settings.timezone, "yyyy-MM-dd HH:mm 'local time'"),
    })

    const fileName = reportFileName(settings.restaurant_name, date)
    const workbook = buildWastageWorkbook(report)

    // Reuse the file this day was published to before, so re-publishing
    // rewrites one file rather than accumulating copies.
    const { data: previous } = await client
      .from('wastage_exports')
      .select('drive_file_id')
      .eq('report_date', date)
      .eq('status', 'SUCCESS')
      .not('drive_file_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const file = await upsertFile({
      name: fileName,
      mimeType: XLSX_MIME,
      data: workbook,
      parentId: reportFolderId,
      knownFileId: (previous as { drive_file_id: string } | null)?.drive_file_id ?? null,
    })

    const driveUrl = file.webViewLink ?? driveFileUrl(file.id)
    const value = totalValue(report.entries)

    await record(client, {
      reportDate: date,
      status: 'SUCCESS',
      trigger,
      actorId,
      entryCount: day.entries.length,
      totalValue: value,
      fileName,
      driveFileId: file.id,
      driveUrl,
    })

    await client
      .from('wastage_entries')
      .update({ exported_at: new Date().toISOString() })
      .eq('entry_date', date)

    return {
      status: 'SUCCESS',
      message: `${day.entries.length} entr${day.entries.length === 1 ? 'y' : 'ies'} published to Google Drive.`,
      reportDate: date,
      entryCount: day.entries.length,
      totalValue: value,
      fileName,
      driveUrl,
    }
  } catch (error) {
    const message =
      error instanceof DriveError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'The report could not be published.'
    await record(client, { ...base, reportDate: date, status: 'FAILED', trigger, actorId, error: message })
    return { ...base, status: 'FAILED', message }
  }
}

/**
 * Fire-and-forget wrapper for the submission path, run after the response has
 * gone back. A staff member reporting a dropped tray must never see a Google
 * error, and must never have their entry rejected because Drive was slow.
 *
 * The auto-publish setting is read here rather than at the call site, because
 * the caller may be anonymous and cannot read app_settings at all.
 */
export async function publishIfAutoEnabled(date: string): Promise<void> {
  try {
    const client = createSupabaseSystemClient()
    const settings = await loadSettings(client)
    if (!settings.wastage_auto_export) return
    await publishDailyWastageReport({ date, trigger: 'AUTO' })
  } catch {
    // publishDailyWastageReport already records failures; this is the last net.
  }
}
