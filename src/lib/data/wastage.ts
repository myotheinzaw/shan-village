import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  Outlet,
  WastageEntry,
  WastageExport,
  WastageLink,
  WastageReason,
} from '@/types/db'

/**
 * Page data for the wastage screens. Everything reads through the caller's own
 * client, so RLS decides what comes back; the only thing this layer adds is
 * masking the estimated value, which is column-level and therefore cannot be a
 * policy.
 */

/**
 * Removes the estimated value from rows when the caller does not hold
 * wastage.cost_view. RLS protects rows, not columns, so this is the one place
 * that decides who sees money — mirror any change here in the export route.
 */
export function maskValues(entries: WastageEntry[], canSeeValues: boolean): WastageEntry[] {
  if (canSeeValues) return entries
  return entries.map((entry) => ({ ...entry, estimated_value: null }))
}

export interface WastageDayPage {
  entries: WastageEntry[]
  outlets: Outlet[]
  reasons: WastageReason[]
  lastExport: WastageExport | null
}

export async function getWastageDay(
  date: string,
  options: { outletId?: string | null; canSeeValues: boolean },
): Promise<WastageDayPage> {
  const supabase = await createSupabaseServerClient()

  const entriesQuery = supabase
    .from('wastage_entries')
    .select('*')
    .eq('entry_date', date)
    .order('entry_time', { ascending: false })
    .order('created_at', { ascending: false })
  if (options.outletId) entriesQuery.eq('outlet_id', options.outletId)

  const [{ data: entries }, { data: outlets }, { data: reasons }, { data: exports }] =
    await Promise.all([
      entriesQuery,
      supabase.from('outlets').select('*').order('sort_order'),
      supabase.from('wastage_reasons').select('*').order('sort_order'),
      supabase
        .from('wastage_exports')
        .select('*')
        .eq('report_date', date)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

  return {
    entries: maskValues((entries ?? []) as WastageEntry[], options.canSeeValues),
    outlets: (outlets ?? []) as Outlet[],
    reasons: (reasons ?? []) as WastageReason[],
    lastExport: ((exports ?? []) as WastageExport[])[0] ?? null,
  }
}

export async function getWastageLinks(): Promise<{ links: WastageLink[]; outlets: Outlet[] }> {
  const supabase = await createSupabaseServerClient()
  const [{ data: links }, { data: outlets }] = await Promise.all([
    supabase.from('wastage_links').select('*').order('created_at', { ascending: false }),
    supabase.from('outlets').select('*').order('sort_order'),
  ])
  return {
    links: (links ?? []) as WastageLink[],
    outlets: (outlets ?? []) as Outlet[],
  }
}

/** Recent Drive publishes, newest first — the module's delivery history. */
export async function getRecentExports(limit = 10): Promise<WastageExport[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('wastage_exports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as WastageExport[]
}
