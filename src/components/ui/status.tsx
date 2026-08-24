import { Badge } from './badge'
import type { AssignmentStatus, RequestStatus, RosterStatus } from '@/types/db'

const ROSTER: Record<RosterStatus, { label: string; variant: 'neutral' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Draft', variant: 'warning' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  LOCKED: { label: 'Locked', variant: 'neutral' },
}

export function RosterStatusBadge({ status }: { status: RosterStatus }) {
  const { label, variant } = ROSTER[status]
  return <Badge variant={variant}>{label}</Badge>
}

const REQUEST: Record<
  RequestStatus,
  { label: string; variant: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted' }
> = {
  DRAFT: { label: 'Draft', variant: 'muted' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  MANAGER_REVIEWED: { label: 'Manager reviewed', variant: 'primary' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  RETURNED: { label: 'Returned for clarification', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'muted' },
  PAID: { label: 'Paid', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'neutral' },
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const entry = REQUEST[status] ?? { label: status, variant: 'neutral' as const }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

export const ASSIGNMENT_STYLES: Record<AssignmentStatus, string> = {
  WORK: 'bg-white text-ink-900 border-sand-200',
  OFF: 'bg-sand-100 text-ink-500 border-sand-200',
  PH: 'bg-teal-50 text-teal-800 border-teal-200',
  LEAVE: 'bg-sky-50 text-sky-800 border-sky-200',
  TRIAL: 'bg-purple-50 text-purple-800 border-purple-200',
  OTHER: 'bg-amber-50 text-amber-800 border-amber-200',
}

export const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = {
  WORK: 'Working',
  OFF: 'OFF',
  PH: 'Public holiday',
  LEAVE: 'Leave',
  TRIAL: 'Trial',
  OTHER: 'Other',
}
