'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquare, Undo2, X } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/field'
import { RequestStatusBadge } from '@/components/ui/status'
import { EmptyState } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ActionResult } from '@/lib/actions/result'
import type { UnifiedRequest } from '@/lib/data/requests'
import { decideRequest, type DecisionAction } from '@/lib/actions/requests'

export interface ApprovalCentreProps {
  operational: UnifiedRequest[]
  financial: UnifiedRequest[]
  permissions: {
    canReview: boolean
    canApprove: boolean
    canApproveLeave: boolean
    canFinanceView: boolean
    canFinanceApprove: boolean
  }
}

const ACTION_LABEL: Record<DecisionAction, string> = {
  SUBMIT: 'Submit',
  CANCEL: 'Cancel',
  REVIEW: 'Mark reviewed',
  RECOMMEND: 'Recommend',
  APPROVE: 'Approve',
  REJECT: 'Reject',
  RETURN: 'Return for clarification',
  PAY: 'Mark as paid',
  CLOSE: 'Close',
}

export function ApprovalCentre({ operational, financial, permissions }: ApprovalCentreProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [prompt, setPrompt] = useState<{ request: UnifiedRequest; action: DecisionAction } | null>(null)
  const [pending, startTransition] = useTransition()

  const decide = (request: UnifiedRequest, action: DecisionAction, comment?: string) =>
    startTransition(async () => {
      const result = await decideRequest(request.type, request.id, action, comment)
      setFeedback(result)
      setPrompt(null)
      if (result.ok) router.refresh()
    })

  const renderList = (requests: UnifiedRequest[], financialList: boolean) => {
    if (requests.length === 0) {
      return (
        <EmptyState
          title="Nothing waiting"
          description={
            financialList
              ? 'No financial requests are awaiting a decision.'
              : 'No leave, shift change or swap requests are awaiting a decision.'
          }
        />
      )
    }

    return (
      <ul className="flex flex-col gap-2">
        {requests.map((request) => {
          const canDecide = financialList
            ? permissions.canFinanceApprove
            : permissions.canApprove || (request.type === 'LEAVE' && permissions.canApproveLeave)

          const swapBlocked =
            request.type === 'SHIFT_SWAP' && request.counterpartyResponse !== 'ACCEPTED'

          return (
            <li key={`${request.type}-${request.id}`}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">{request.employeeName}</p>
                        <RequestStatusBadge status={request.status} />
                        {request.shortNotice ? <Badge variant="warning">Short notice</Badge> : null}
                        {swapBlocked ? <Badge variant="info">Waiting for colleague</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-ink-700">{request.title}</p>
                      <p className="text-sm text-ink-700">{request.detail}</p>
                      {request.financial && request.amount !== null ? (
                        <p className="mt-0.5 text-base font-semibold text-ink-900">
                          {request.currency} {request.amount.toFixed(2)}
                        </p>
                      ) : null}
                      {request.reason ? (
                        <p className="mt-1 text-xs text-ink-500">“{request.reason}”</p>
                      ) : null}
                      {request.managerComment ? (
                        <p className="mt-1 text-xs text-ink-700">
                          <strong>Manager note:</strong> {request.managerComment}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[11px] text-ink-500">
                        {request.reference} · submitted{' '}
                        {request.submittedAt
                          ? new Date(request.submittedAt).toLocaleDateString('en-GB')
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {permissions.canReview && request.status === 'SUBMITTED' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => setPrompt({ request, action: 'REVIEW' })}
                      >
                        <MessageSquare className="size-4" />
                        Review &amp; comment
                      </Button>
                    ) : null}

                    {canDecide ? (
                      <>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={pending || swapBlocked}
                          title={swapBlocked ? 'The colleague has not accepted this swap yet.' : undefined}
                          onClick={() => setPrompt({ request, action: 'APPROVE' })}
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={pending}
                          onClick={() => setPrompt({ request, action: 'REJECT' })}
                        >
                          <X className="size-4" />
                          Reject
                        </Button>
                      </>
                    ) : null}

                    {permissions.canReview ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setPrompt({ request, action: 'RETURN' })}
                      >
                        <Undo2 className="size-4" />
                        Return for clarification
                      </Button>
                    ) : null}

                    {financialList &&
                    permissions.canFinanceApprove &&
                    request.type === 'CASH_ADVANCE' &&
                    request.status === 'APPROVED' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => setPrompt({ request, action: 'PAY' })}
                      >
                        Mark as paid
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      <Tabs defaultValue="operational">
        <TabsList>
          <TabsTrigger value="operational">
            Shift &amp; leave {operational.length > 0 ? `(${operational.length})` : ''}
          </TabsTrigger>
          {permissions.canFinanceView ? (
            <TabsTrigger value="financial">
              Financial {financial.length > 0 ? `(${financial.length})` : ''}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="operational" className="mt-3">
          {renderList(operational, false)}
        </TabsContent>

        {permissions.canFinanceView ? (
          <TabsContent value="financial" className="mt-3">
            <Alert tone="warning" className="mb-3">
              Financial requests are visible only to users with the finance permissions. Approving one
              does not authorise payment on its own — follow the restaurant&apos;s payment process.
            </Alert>
            {renderList(financial, true)}
          </TabsContent>
        ) : null}
      </Tabs>

      {prompt ? (
        <DecisionDialog
          request={prompt.request}
          action={prompt.action}
          pending={pending}
          onClose={() => setPrompt(null)}
          onConfirm={(comment) => decide(prompt.request, prompt.action, comment)}
        />
      ) : null}
    </div>
  )
}

function DecisionDialog({
  request,
  action,
  pending,
  onClose,
  onConfirm,
}: {
  request: UnifiedRequest
  action: DecisionAction
  pending: boolean
  onClose: () => void
  onConfirm: (comment: string) => void
}) {
  const [comment, setComment] = useState('')
  const commentRequired = action === 'REJECT' || action === 'RETURN'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${ACTION_LABEL[action]} — ${request.employeeName}`}
        description={`${request.title} · ${request.detail}`}
      >
        {action === 'APPROVE' && request.type === 'LEAVE' ? (
          <Alert tone="info" className="mb-3">
            Approving this will mark those days as leave on the roster.
          </Alert>
        ) : null}
        {action === 'APPROVE' && (request.type === 'SHIFT_CHANGE' || request.type === 'SHIFT_SWAP') ? (
          <Alert tone="info" className="mb-3">
            Approving this will update the published roster and notify the employee.
          </Alert>
        ) : null}

        <Field
          label="Comment"
          htmlFor="decision-comment"
          required={commentRequired}
          hint="Recorded in the approval history and shown to the employee."
        >
          <Textarea
            id="decision-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={action === 'REJECT' ? 'danger' : 'primary'}
            disabled={pending || (commentRequired && !comment.trim())}
            onClick={() => onConfirm(comment)}
          >
            {ACTION_LABEL[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
