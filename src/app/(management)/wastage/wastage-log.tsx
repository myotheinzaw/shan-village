'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CloudUpload, Image as ImageIcon, Loader2, RotateCcw, X } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import type { ActionResult } from '@/lib/actions/result'
import type { WastageEntry, WastageStatus } from '@/types/db'
import { sourceLabel } from '@/lib/wastage/workbook'
import { publishWastageReport, reviewWastageEntry } from './actions'

const EMPTY: ActionResult = { ok: false }

const STATUS: Record<WastageStatus, { label: string; variant: 'info' | 'success' | 'danger' }> = {
  SUBMITTED: { label: 'Awaiting review', variant: 'info' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
}

interface Option {
  id: string
  name: string
}

function describe(entry: WastageEntry): string {
  const item = entry.item_name.trim()
  if (item) return item
  const note = entry.note.trim()
  return note || 'Not described'
}

export function WastageLog({
  date,
  entries,
  outlets,
  reasons,
  currency,
  canReview,
  canExport,
  canSeeValues,
}: {
  date: string
  entries: WastageEntry[]
  outlets: Option[]
  reasons: Option[]
  currency: string
  canReview: boolean
  canExport: boolean
  canSeeValues: boolean
}) {
  const router = useRouter()
  const [reviewState, review, reviewing] = useActionState(reviewWastageEntry, EMPTY)
  const [publishState, publish, publishing] = useActionState(publishWastageReport, EMPTY)
  const [notice, setNotice] = useState<ActionResult | null>(null)

  useEffect(() => {
    const latest = reviewState.message || reviewState.error ? reviewState : null
    if (latest) {
      setNotice(latest)
      if (latest.ok) router.refresh()
    }
  }, [reviewState, router])

  useEffect(() => {
    const latest = publishState.message || publishState.error ? publishState : null
    if (latest) {
      setNotice(latest)
      if (latest.ok) router.refresh()
    }
  }, [publishState, router])

  const outletName = (id: string | null) =>
    (id && outlets.find((o) => o.id === id)?.name) || '—'
  const reasonName = (id: string | null) =>
    (id && reasons.find((r) => r.id === id)?.name) || 'Not stated'

  return (
    <section className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </h2>
        {canExport ? (
          <form action={publish}>
            <input type="hidden" name="date" value={date} />
            <Button type="submit" variant="secondary" disabled={publishing}>
              {publishing ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />}
              {publishing ? 'Publishing…' : 'Publish to Google Drive'}
            </Button>
          </form>
        ) : null}
      </div>

      {notice ? (
        <Alert tone={notice.ok ? 'success' : 'danger'} className="mb-3">
          {notice.message ?? notice.error}
        </Alert>
      ) : null}

      <TableWrap>
        {entries.length === 0 ? (
          <EmptyState
            title="Nothing was reported on this day"
            description="Entries appear here the moment a staff member submits one from the wastage link."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Photo</Th>
                <Th>What</Th>
                <Th>Outlet</Th>
                <Th>Reason</Th>
                <Th className="text-right">Qty</Th>
                {canSeeValues ? <Th className="text-right">Value ({currency})</Th> : null}
                <Th>Reported by</Th>
                <Th>Status</Th>
                {canReview ? <Th>Review</Th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <Td className="whitespace-nowrap font-medium tabular-nums">
                    {entry.entry_time.slice(0, 5)}
                    <span className="block text-xs font-normal text-ink-500">{entry.reference}</span>
                  </Td>
                  <Td>
                    {entry.photo_path ? (
                      <a
                        href={entry.drive_photo_url ?? `/api/wastage/photo/${entry.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-spice-700 underline-offset-4 hover:underline"
                      >
                        <ImageIcon className="size-4" aria-hidden />
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-ink-500">None</span>
                    )}
                  </Td>
                  <Td className="max-w-xs">
                    <p className="font-medium text-ink-900">{describe(entry)}</p>
                    {entry.note && entry.item_name ? (
                      <p className="mt-0.5 text-xs text-ink-500">{entry.note}</p>
                    ) : null}
                    {entry.review_note ? (
                      <p className="mt-0.5 text-xs italic text-ink-500">Review: {entry.review_note}</p>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{outletName(entry.outlet_id)}</Td>
                  <Td className="whitespace-nowrap">{reasonName(entry.reason_id)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {entry.quantity ? `${entry.quantity} ${entry.unit ?? ''}`.trim() : '—'}
                  </Td>
                  {canSeeValues ? (
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {entry.estimated_value === null ? '—' : entry.estimated_value.toFixed(2)}
                    </Td>
                  ) : null}
                  <Td className="whitespace-nowrap">
                    {entry.reported_by_name || 'Not stated'}
                    <span className="block text-xs text-ink-500">{sourceLabel(entry.source)}</span>
                  </Td>
                  <Td>
                    <Badge variant={STATUS[entry.status].variant}>{STATUS[entry.status].label}</Badge>
                  </Td>
                  {canReview ? (
                    <Td>
                      <div className="flex gap-1">
                        {entry.status !== 'CONFIRMED' ? (
                          <form action={review}>
                            <input type="hidden" name="id" value={entry.id} />
                            <input type="hidden" name="decision" value="CONFIRMED" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="success"
                              disabled={reviewing}
                              aria-label="Confirm this entry"
                            >
                              <Check aria-hidden />
                            </Button>
                          </form>
                        ) : null}
                        {entry.status !== 'REJECTED' ? (
                          <form action={review}>
                            <input type="hidden" name="id" value={entry.id} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="danger"
                              disabled={reviewing}
                              aria-label="Reject this entry"
                            >
                              <X aria-hidden />
                            </Button>
                          </form>
                        ) : null}
                        {entry.status !== 'SUBMITTED' ? (
                          <form action={review}>
                            <input type="hidden" name="id" value={entry.id} />
                            <input type="hidden" name="decision" value="SUBMITTED" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              disabled={reviewing}
                              aria-label="Reopen this entry"
                            >
                              <RotateCcw aria-hidden />
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </section>
  )
}
