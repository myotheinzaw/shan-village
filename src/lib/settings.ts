import 'server-only'

import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AppSetting } from '@/types/db'

/**
 * Every configurable policy comes from app_settings. Nothing in the application
 * hard-codes a notice period, an hours threshold or a staffing minimum.
 *
 * The defaults below are a safety net for a database that has not been seeded
 * yet; the seeded values are the ones that actually apply, and the Admin can
 * change any of them at Administration → Settings.
 */
export const SETTING_DEFAULTS = {
  restaurant_name: 'Shan Village',
  timezone: 'Asia/Dubai',
  week_start_day: 1,
  default_shift_hours: 10,
  max_weekly_hours_warning: 60,
  max_shift_hours_warning: 14,
  min_off_days_per_week: 1,
  staff_can_view_team_roster: true,
  manager_can_publish: false,
  leave_advance_notice_days: 90,
  leave_notice_blocks: false,
  encashment_notice_days: 90,
  encashment_max_days: 15,
  currency: 'AED',
  cash_advance_max: 0,
  encashment_policy_text:
    'Subject to company policy, eligibility verification and final management approval.',
  cash_advance_policy_text:
    'I acknowledge that this advance is subject to company policy, management approval, and the repayment arrangement recorded above.',
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] }

export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('app_settings').select('key, value')

  const settings = { ...SETTING_DEFAULTS } as Record<string, unknown>
  for (const row of (data ?? []) as Pick<AppSetting, 'key' | 'value'>[]) {
    if (row.key in SETTING_DEFAULTS) settings[row.key] = row.value
  }
  return settings as Settings
})

/** All settings including private ones — requires admin.settings via RLS. */
export const getAllSettings = cache(async (): Promise<AppSetting[]> => {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('app_settings')
    .select('*')
    .order('category')
    .order('key')
  return (data ?? []) as AppSetting[]
})
