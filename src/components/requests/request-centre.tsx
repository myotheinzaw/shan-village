'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { ArrowLeftRight, Banknote, CalendarOff, Clock, Coins, Plus } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { RequestStatusBadge } from '@/components/ui/status'
import { EmptyState } from '@/components/ui/table'
import type { ActionResult } from '@/lib/actions/result'
import type { UnifiedRequest } from '@/lib/data/requests'
import type { LeaveType, RequestType } from '@/types/db'
import {
  createCashAdvanceRequest,
  createEncashmentRequest,
  createLeaveRequest,
  createShiftChangeRequest,
  createShiftSwapRequest,
  decideRequest,
  respondToSwap,
} from '@/lib/actions/requests'

export interface SwapCandidate {
  assignmentId: string
  employeeId: string
  employeeName: string
  date: string
  summary: string
}

export interface IncomingSwap {
  id: string
  reference: string
  requesterName: string
  theirDate: string
  theirShift: string | null
  myDate: string
  myShift: string | null
  reason: string | null
}

export interface RequestCentreProps {
  requests: UnifiedRequest[]
  incomingSwaps: IncomingSwap[]
  leaveTypes: LeaveType[]
  myShifts: SwapCandidate[]
  colleagueShifts: SwapCandidate[]
  policy: {
    leaveNoticeDays: number
    leaveNoticeBlocks: boolean
    encashmentMaxDays: number
    encashmentNoticeDays: number
    encashmentPolicyText: string
    cashAdvancePolicyText: string
    currency: string
    cashAdvanceMax: number
  }
  canCreate: boolean
  showFinancial: boolean
  linkedToEmployee: boolean
}

type FormKind = 'SHIFT_CHANGE' | 'SHIFT_SWAP' | 'LEAVE' | 'LEAVE_ENCASHMENT' | 'CASH_ADVANCE'

const REQUEST_ICON: Record<RequestType, typeof Clock> = {
  SHIFT_CHANGE: Clock,
  SHIFT_SWAP: ArrowLeftRight,
  LEAVE: CalendarOff,
  LEAVE_ENCASHMENT: Coins,
  CASH_ADVANCE: Banknote,
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? 'Submitting…' : label}</Button>
}

export function RequestCentre(props: RequestCentreProps) {
  const { requests, incomingSwaps, canCreate, showFinancial, linkedToEmployee } = props
  const router = useRouter()
  const [openForm, setOpenForm] = useState<FormKind | null>(null)
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  const visible = requests.filter((r) => (r.financial ? showFinancial : true))

  const options: { kind: FormKind; label: string; description: string; financial?: boolean }[] = [
    { kind: 'SHIFT_CHANGE', label: 'Shift change', description: 'Ask to work a different shift on a day' },
    { kind: 'SHIFT_SWAP', label: 'Shift swap', description: 'Swap a shift with a colleague' },
    { kind: 'LEAVE', label: 'Leave', description: 'Annual, sick, emergency or unpaid leave' },
    { kind: 'LEAVE_ENCASHMENT', label: 'Leave encashment', description: 'Cash alternative to leave days', financial: true },
    { kind: 'CASH_ADVANCE', label: 'Cash / salary advance', description: 'Request an advance against salary', financial: true },
  ]

  return (
    <div className="flex flex-col gap-4">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      {!linkedToEmployee ? (
        <Alert tone="warning" title="Your login is not linked to an employee record">
          You can view this page, but requests can only be raised once the office links your account
          to your employee record.
        </Alert>
      ) : null}

      {incomingSwaps.length > 0 ? (
        <Card className="border-spice-200 bg-spice-50/60">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold text-spice-700">
              {incomingSwaps.length} swap request{incomingSwaps.length === 1 ? '' : 's'} waiting for your answer
            </p>
            <ul className="flex flex-col gap-3">
              {incomingSwaps.map((swap) => (
                <li key={swap.id} className="rounded-lg border border-sand-200 bg-white p-3">
                  <p className="text-sm text-ink-900">
                    <strong>{swap.requesterName}</strong> would like to take your{' '}
                    <strong>{swap.myDate}</strong> shift ({swap.myShift ?? '—'}) and give you their{' '}
                    <strong>{swap.theirDate}</strong> shift ({swap.theirShift ?? '—'}).
                  </p>
                  {swap.reason ? <p className="mt-1 text-xs text-ink-500">“{swap.reason}”</p> : null}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await respondToSwap(swap.id, 'ACCEPTED')
                          setFeedback(result)
                          if (result.ok) router.refresh()
                        })
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await respondToSwap(swap.id, 'DECLINED')
                          setFeedback(result)
                          if (result.ok) router.refresh()
                        })
                      }
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canCreate && linkedToEmployee ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options
            .filter((option) => (option.financial ? true : true))
            .map((option) => {
              const Icon = REQUEST_ICON[option.kind as RequestType]
              return (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => setOpenForm(option.kind)}
                  className="flex items-start gap-3 rounded-[var(--radius-card)] border border-sand-200 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-spice-300 hover:bg-spice-50/40"
                >
                  <span className="mt-0.5 rounded-lg bg-spice-100 p-2 text-spice-700">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                      {option.label}
                      <Plus className="size-3.5 text-ink-500" />
                    </span>
                    <span className="block text-xs text-ink-500">{option.description}</span>
                  </span>
                </button>
              )
            })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description={canCreate ? 'Use the buttons above to raise your first request.' : undefined}
          />
        ) : (
          visible.map((request) => {
            const Icon = REQUEST_ICON[request.type]
            return (
              <Card key={`${request.type}-${request.id}`}>
                <CardContent className="flex flex-wrap items-start gap-3 p-4">
                  <span className="mt-0.5 rounded-lg bg-sand-100 p-2 text-ink-700">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900">{request.title}</p>
                      <RequestStatusBadge status={request.status} />
                      {request.shortNotice ? <Badge variant="warning">Short notice</Badge> : null}
                      {request.counterpartyResponse === 'PENDING' ? (
                        <Badge variant="info">Waiting for colleague</Badge>
                      ) : null}
                      {request.counterpartyResponse === 'ACCEPTED' ? (
                        <Badge variant="success">Colleague accepted</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-700">{request.detail}</p>
                    {request.financial && request.amount !== null ? (
                      <p className="mt-0.5 text-sm font-semibold text-ink-900">
                        {request.currency} {request.amount.toFixed(2)}
                      </p>
                    ) : null}
                    {request.reason ? (
                      <p className="mt-1 text-xs text-ink-500">“{request.reason}”</p>
                    ) : null}
                    {request.managerComment ? (
                      <p className="mt-1 text-xs text-ink-700">
                        <strong>Manager:</strong> {request.managerComment}
                      </p>
                    ) : null}
                    {request.adminComment ? (
                      <p className="mt-1 text-xs text-ink-700">
                        <strong>Management:</strong> {request.adminComment}
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-[11px] text-ink-500">{request.reference}</p>
                  </div>
                  {['DRAFT', 'SUBMITTED', 'MANAGER_REVIEWED', 'RETURNED'].includes(request.status) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await decideRequest(request.type, request.id, 'CANCEL')
                          setFeedback(result)
                          if (result.ok) router.refresh()
                        })
                      }
                    >
                      Cancel
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {openForm ? (
        <RequestForm
          kind={openForm}
          props={props}
          onClose={() => setOpenForm(null)}
          onDone={(result) => {
            setFeedback(result)
            setOpenForm(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function RequestForm({
  kind,
  props,
  onClose,
  onDone,
}: {
  kind: FormKind
  props: RequestCentreProps
  onClose: () => void
  onDone: (result: ActionResult) => void
}) {
  const actionByKind = {
    SHIFT_CHANGE: createShiftChangeRequest,
    SHIFT_SWAP: createShiftSwapRequest,
    LEAVE: createLeaveRequest,
    LEAVE_ENCASHMENT: createEncashmentRequest,
    CASH_ADVANCE: createCashAdvanceRequest,
  }[kind]

  const [state, action] = useActionState<ActionResult, FormData>(actionByKind, { ok: false })

  useEffect(() => {
    if (state.ok) onDone(state)
  }, [state, onDone])

  const titles: Record<FormKind, string> = {
    SHIFT_CHANGE: 'Request a shift change',
    SHIFT_SWAP: 'Request a shift swap',
    LEAVE: 'Request leave',
    LEAVE_ENCASHMENT: 'Leave encashment / cash alternative',
    CASH_ADVANCE: 'Cash / salary advance request',
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={titles[kind]} className="max-w-lg">
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          {kind === 'SHIFT_CHANGE' ? <ShiftChangeFields /> : null}
          {kind === 'SHIFT_SWAP' ? <SwapFields props={props} /> : null}
          {kind === 'LEAVE' ? <LeaveFields props={props} /> : null}
          {kind === 'LEAVE_ENCASHMENT' ? <EncashmentFields props={props} /> : null}
          {kind === 'CASH_ADVANCE' ? <CashAdvanceFields props={props} /> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <SubmitButton label="Submit request" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ShiftChangeFields() {
  const [status, setStatus] = useState('WORK')
  return (
    <>
      <Field label="Date" htmlFor="work_date" required>
        <Input id="work_date" name="work_date" type="date" required />
      </Field>
      <Field label="What are you asking for?" htmlFor="requested_status">
        <Select id="requested_status" name="requested_status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="WORK">A different working shift</option>
          <option value="OFF">An OFF day</option>
        </Select>
      </Field>
      {status === 'WORK' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred start" htmlFor="requested_start" required>
              <Input id="requested_start" name="requested_start" type="time" defaultValue="13:00" required />
            </Field>
            <Field label="Preferred end" htmlFor="requested_end" required>
              <Input id="requested_end" name="requested_end" type="time" defaultValue="23:00" required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="requested_crosses" className="size-4 rounded border-sand-300" />
            Finishes after midnight
          </label>
        </>
      ) : null}
      <Field label="Reason" htmlFor="reason" required>
        <Textarea id="reason" name="reason" required placeholder="Why do you need this change?" />
      </Field>
    </>
  )
}

function SwapFields({ props }: { props: RequestCentreProps }) {
  const [colleagueId, setColleagueId] = useState('')
  const colleagues = [...new Map(props.colleagueShifts.map((s) => [s.employeeId, s])).values()]
  const theirShifts = props.colleagueShifts.filter((s) => s.employeeId === colleagueId)

  if (props.myShifts.length === 0) {
    return (
      <Alert tone="info">
        You have no published shifts in the next few weeks to swap. Once the roster is published, your
        shifts will appear here.
      </Alert>
    )
  }

  return (
    <>
      <Field label="Your shift" htmlFor="requester_assignment_id" required>
        <Select id="requester_assignment_id" name="requester_assignment_id" required>
          <option value="">Choose your shift…</option>
          {props.myShifts.map((s) => (
            <option key={s.assignmentId} value={s.assignmentId}>
              {s.date} · {s.summary}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Colleague" htmlFor="counterparty_employee_id" required>
        <Select
          id="counterparty_employee_id"
          name="counterparty_employee_id"
          value={colleagueId}
          onChange={(e) => setColleagueId(e.target.value)}
          required
        >
          <option value="">Choose a colleague…</option>
          {colleagues.map((c) => (
            <option key={c.employeeId} value={c.employeeId}>{c.employeeName}</option>
          ))}
        </Select>
      </Field>

      <Field label="Their shift" htmlFor="counterparty_assignment_id" required>
        <Select id="counterparty_assignment_id" name="counterparty_assignment_id" required disabled={!colleagueId}>
          <option value="">{colleagueId ? 'Choose their shift…' : 'Choose a colleague first'}</option>
          {theirShifts.map((s) => (
            <option key={s.assignmentId} value={s.assignmentId}>
              {s.date} · {s.summary}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Reason" htmlFor="reason">
        <Textarea id="reason" name="reason" />
      </Field>

      <Alert tone="info">
        Your colleague is asked first. Only if they accept does it go to a manager, and the roster is
        not changed until it is approved.
      </Alert>
    </>
  )
}

function LeaveFields({ props }: { props: RequestCentreProps }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const days =
    from && to && to >= from
      ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
      : 0

  const noticeDays = from
    ? Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000)
    : null

  const shortNotice = noticeDays !== null && noticeDays < props.policy.leaveNoticeDays

  return (
    <>
      <Field label="Leave type" htmlFor="leave_type_id" required>
        <Select id="leave_type_id" name="leave_type_id" required>
          <option value="">Choose…</option>
          {props.leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="from_date" required>
          <Input id="from_date" name="from_date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" htmlFor="to_date" required>
          <Input id="to_date" name="to_date" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
      </div>

      {days > 0 ? (
        <p className="text-sm text-ink-700">
          That is <strong>{days}</strong> day{days === 1 ? '' : 's'}.
        </p>
      ) : null}

      {shortNotice ? (
        <Alert tone={props.policy.leaveNoticeBlocks ? 'danger' : 'warning'}>
          This request is being submitted within the standard advance notice period of{' '}
          {props.policy.leaveNoticeDays} days
          {props.policy.leaveNoticeBlocks
            ? ' and cannot be submitted under the current policy.'
            : ' and may require exception approval.'}
        </Alert>
      ) : null}

      <Field label="Reason" htmlFor="reason">
        <Textarea id="reason" name="reason" />
      </Field>

      <Field
        label="Attachment link"
        htmlFor="attachment_url"
        hint="Optional. Paste a link to a document, e.g. a medical certificate stored in the office drive."
      >
        <Input id="attachment_url" name="attachment_url" type="url" placeholder="https://…" />
      </Field>
    </>
  )
}

function EncashmentFields({ props }: { props: RequestCentreProps }) {
  const year = new Date().getFullYear()
  return (
    <>
      <Alert tone="warning">{props.policy.encashmentPolicyText}</Alert>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Leave year" htmlFor="leave_year" required>
          <Input id="leave_year" name="leave_year" type="number" defaultValue={year} min={year - 3} max={year + 1} required />
        </Field>
        <Field
          label="Days requested"
          htmlFor="requested_days"
          hint={props.policy.encashmentMaxDays > 0 ? `Maximum ${props.policy.encashmentMaxDays}` : undefined}
          required
        >
          <Input
            id="requested_days"
            name="requested_days"
            type="number"
            min={0.5}
            step="0.5"
            max={props.policy.encashmentMaxDays > 0 ? props.policy.encashmentMaxDays : undefined}
            required
          />
        </Field>
      </div>

      <Field
        label="Preferred date"
        htmlFor="requested_date"
        hint={`The expected advance notice is ${props.policy.encashmentNoticeDays} days.`}
      >
        <Input id="requested_date" name="requested_date" type="date" />
      </Field>

      <Field label="Reason" htmlFor="reason">
        <Textarea id="reason" name="reason" />
      </Field>

      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input type="checkbox" name="policy_acknowledged" className="mt-0.5 size-4 rounded border-sand-300" required />
        <span>I understand that this request is {props.policy.encashmentPolicyText.toLowerCase()}</span>
      </label>
    </>
  )
}

function CashAdvanceFields({ props }: { props: RequestCentreProps }) {
  return (
    <>
      <Alert tone="warning">
        Cash and salary advances are reviewed by management. Submitting a request does not guarantee
        approval or payment.
      </Alert>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={`Amount (${props.policy.currency})`}
          htmlFor="amount"
          hint={props.policy.cashAdvanceMax > 0 ? `Ceiling ${props.policy.cashAdvanceMax}` : undefined}
          required
        >
          <Input id="amount" name="amount" type="number" min={1} step="0.01" required />
        </Field>
        <Field label="Requested payment date" htmlFor="requested_payment_date">
          <Input id="requested_payment_date" name="requested_payment_date" type="date" />
        </Field>
      </div>

      <Field label="Reason" htmlFor="reason" required>
        <Textarea id="reason" name="reason" required />
      </Field>

      <Field
        label="Repayment arrangement"
        htmlFor="repayment_arrangement"
        hint="How would this be repaid? e.g. deducted over two months."
        required
      >
        <Textarea id="repayment_arrangement" name="repayment_arrangement" required />
      </Field>

      <Field label="Attachment link" htmlFor="attachment_url" hint="Optional supporting document link.">
        <Input id="attachment_url" name="attachment_url" type="url" placeholder="https://…" />
      </Field>

      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input type="checkbox" name="employee_acknowledged" className="mt-0.5 size-4 rounded border-sand-300" required />
        <span>{props.policy.cashAdvancePolicyText}</span>
      </label>
    </>
  )
}
