import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Outlet, WastageEntry, WastageReason } from '@/types/db'
import type { WastageReportData, WastageReportEntry } from './workbook'

/**
 * Turns a day of wastage rows into the report structure the workbook and the
 * on-screen table both render.
 *
 * The Supabase client is a parameter rather than a module import on purpose:
 * a manager downloading the report reads through their own client so RLS
 * applies, while the scheduled Drive publish runs as a system job. Which one is
 * in use is then obvious at every call site.
 */

/** "14:05:00" (postgres `time`) -> "14:05". */
export function formatEntryTime(value: string): string {
  return value.slice(0, 5)
}

export function describeItem(entry: WastageEntry): string {
  const item = entry.item_name.trim()
  if (item) return item
  // An entry can legitimately be a photo and a note with no item named. Falling
  // back to the note keeps the row meaningful instead of showing a blank cell.
  const note = entry.note.trim()
  if (note) return note.length > 80 ? `${note.slice(0, 77)}…` : note
  return 'Not described'
}

export interface WastageDay {
  date: string
  entries: WastageEntry[]
  outlets: Map<string, string>
  reasons: Map<string, string>
}

export async function loadWastageDay(
  client: SupabaseClient,
  date: string,
  options: { outletId?: string | null } = {},
): Promise<WastageDay> {
  const query = client
    .from('wastage_entries')
    .select('*')
    .eq('entry_date', date)
    .order('entry_time', { ascending: true })
    .order('created_at', { ascending: true })
  if (options.outletId) query.eq('outlet_id', options.outletId)

  const [{ data: entries }, { data: outlets }, { data: reasons }] = await Promise.all([
    query,
    client.from('outlets').select('id, name'),
    client.from('wastage_reasons').select('id, name'),
  ])

  return {
    date,
    entries: (entries ?? []) as WastageEntry[],
    outlets: new Map(((outlets ?? []) as Pick<Outlet, 'id' | 'name'>[]).map((o) => [o.id, o.name])),
    reasons: new Map(
      ((reasons ?? []) as Pick<WastageReason, 'id' | 'name'>[]).map((r) => [r.id, r.name]),
    ),
  }
}

export function toReportEntry(
  entry: WastageEntry,
  day: Pick<WastageDay, 'outlets' | 'reasons'>,
  includeValues: boolean,
): WastageReportEntry {
  return {
    reference: entry.reference ?? '',
    time: formatEntryTime(entry.entry_time),
    outlet: (entry.outlet_id && day.outlets.get(entry.outlet_id)) || 'Not stated',
    item: describeItem(entry),
    quantity: entry.quantity,
    unit: entry.unit,
    reason: (entry.reason_id && day.reasons.get(entry.reason_id)) || 'Not stated',
    reportedBy: entry.reported_by_name || 'Not stated',
    estimatedValue: includeValues ? entry.estimated_value : null,
    status: entry.status,
    source: entry.source,
    note: entry.note,
    photoUrl: entry.drive_photo_url,
  }
}

export function buildReportData(
  day: WastageDay,
  options: { restaurantName: string; currency: string; includeValues: boolean; generatedAt: string },
): WastageReportData {
  return {
    restaurantName: options.restaurantName,
    reportDate: day.date,
    currency: options.currency,
    generatedAt: options.generatedAt,
    includeValues: options.includeValues,
    entries: day.entries.map((entry) => toReportEntry(entry, day, options.includeValues)),
  }
}
