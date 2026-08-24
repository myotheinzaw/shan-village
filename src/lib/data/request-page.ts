import 'server-only'

import { getCurrentUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { getLeaveTypes } from '@/lib/data/roster'
import { addDaysISO, todayInTimeZone } from '@/lib/roster/dates'
import { loadIncomingSwaps, loadRequests, loadSwapCandidates } from '@/lib/data/requests'
import type { RequestCentreProps } from '@/components/requests/request-centre'

/** Everything the Request Centre needs, assembled once for both entry points. */
export async function buildRequestCentreProps(): Promise<RequestCentreProps> {
  const user = await getCurrentUser()
  const settings = await getSettings()
  const employeeId = user?.employee?.id ?? null

  const today = todayInTimeZone(settings.timezone)
  const horizon = addDaysISO(today, 28)

  const [requests, leaveTypes, incomingSwaps, swapCandidates] = await Promise.all([
    employeeId ? loadRequests({ employeeId }) : Promise.resolve([]),
    getLeaveTypes(),
    employeeId ? loadIncomingSwaps(employeeId) : Promise.resolve([]),
    employeeId
      ? loadSwapCandidates(employeeId, today, horizon)
      : Promise.resolve({ mine: [], colleagues: [] }),
  ])

  return {
    requests,
    incomingSwaps,
    leaveTypes,
    myShifts: swapCandidates.mine,
    colleagueShifts: swapCandidates.colleagues,
    policy: {
      leaveNoticeDays: settings.leave_advance_notice_days,
      leaveNoticeBlocks: settings.leave_notice_blocks,
      encashmentMaxDays: settings.encashment_max_days,
      encashmentNoticeDays: settings.encashment_notice_days,
      encashmentPolicyText: settings.encashment_policy_text,
      cashAdvancePolicyText: settings.cash_advance_policy_text,
      currency: settings.currency,
      cashAdvanceMax: settings.cash_advance_max,
    },
    canCreate: Boolean(user?.permissions.has('requests.create')),
    // Own financial requests are always visible to the person who raised them.
    showFinancial: true,
    linkedToEmployee: Boolean(employeeId),
  }
}
