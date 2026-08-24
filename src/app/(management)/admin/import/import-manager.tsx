'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Stat } from '@/components/ui/stat'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ActionResult } from '@/lib/actions/result'
import type { ImportSummary } from '@/lib/excel/import'
import type { ImportBatch, ImportRecord } from '@/types/db'
import { cancelBatch, commitImport, setRecordIncluded, stageImport } from './actions'

function UploadButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <Upload className="size-4" />
      {pending ? 'Reading the spreadsheet…' : 'Parse spreadsheet'}
    </Button>
  )
}

export function ImportManager({
  batches,
  activeBatch,
  activeSummary,
  records,
  canCreateEmployees,
}: {
  batches: ImportBatch[]
  activeBatch: ImportBatch | null
  activeSummary: ImportSummary | null
  records: ImportRecord[]
  canCreateEmployees: boolean
}) {
  const router = useRouter()
  const [state, action] = useActionState<ActionResult, FormData>(stageImport, { ok: false })
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [createMissing, setCreateMissing] = useState(true)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn()
      setFeedback(result)
      if (result.ok) router.refresh()
    })

  const unmatched = records.filter((r) => !r.matched_employee_id)
  const unmatchedNames = [...new Set(unmatched.map((r) => r.source_name).filter(Boolean))] as string[]
  const needsReview = records.filter((r) => r.parse_status === 'REVIEW')

  return (
    <div className="flex flex-col gap-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload a duty roster spreadsheet</CardTitle>
          <p className="text-sm text-ink-500">
            The importer expects the Shan Village layout: Name in column B, Position in C, and
            Monday to Sunday in columns D to J, with the dates on the row under the headings.
          </p>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <Field label="Excel file" htmlFor="file" className="min-w-64 flex-1">
              <Input id="file" name="file" type="file" accept=".xlsx,.xlsm,.xls" required />
            </Field>
            <UploadButton />
          </form>
        </CardContent>
      </Card>

      {activeBatch && activeSummary ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Review before importing</CardTitle>
              <p className="text-sm text-ink-500">
                {activeBatch.file_name} · nothing has been written to the roster yet
              </p>
            </div>
            <Badge variant={activeBatch.status === 'COMMITTED' ? 'success' : 'warning'}>
              {activeBatch.status}
            </Badge>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sheets" value={activeBatch.sheet_count} />
              <Stat label="Recognised" value={activeBatch.recognized_rows} tone="good" />
              <Stat
                label="Needs review"
                value={activeBatch.review_rows}
                tone={activeBatch.review_rows > 0 ? 'warn' : 'good'}
              />
              <Stat
                label="Unmatched names"
                value={unmatchedNames.length}
                tone={unmatchedNames.length > 0 ? 'warn' : 'good'}
              />
            </div>

            {activeSummary.warnings.length > 0 ? (
              <Alert tone="warning" title="Things worth checking">
                <ul className="mt-1 flex max-h-52 flex-col gap-1 overflow-y-auto text-xs">
                  {activeSummary.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            <Tabs defaultValue="sheets">
              <TabsList>
                <TabsTrigger value="sheets">Sheets ({activeSummary.sheets.length})</TabsTrigger>
                <TabsTrigger value="review">Needs review ({needsReview.length})</TabsTrigger>
                <TabsTrigger value="names">Names ({activeSummary.names.length})</TabsTrigger>
                <TabsTrigger value="values">Unknown values ({activeSummary.unknownValues.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="sheets" className="mt-3">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Sheet</Th>
                        <Th>Week starts</Th>
                        <Th>Dates from</Th>
                        <Th className="text-right">Employees</Th>
                        <Th className="text-right">Cells</Th>
                        <Th>Note</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSummary.sheets.map((sheet) => (
                        <tr key={sheet.sheetName} className="hover:bg-sand-50">
                          <Td className="font-medium text-ink-900">{sheet.sheetName}</Td>
                          <Td>{sheet.startDate ?? '—'}</Td>
                          <Td>
                            {sheet.dateSource === 'row' ? (
                              <Badge variant="success">Date row</Badge>
                            ) : sheet.dateSource === 'title' ? (
                              <Badge variant="warning">Tab name</Badge>
                            ) : (
                              <Badge variant="danger">None</Badge>
                            )}
                          </Td>
                          <Td className="text-right tabular-nums">{sheet.rowCount}</Td>
                          <Td className="text-right tabular-nums">{sheet.cellCount}</Td>
                          <Td className="max-w-sm text-xs text-ink-500">{sheet.message ?? ''}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </TabsContent>

              <TabsContent value="review" className="mt-3">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Include</Th>
                        <Th>Sheet</Th>
                        <Th>Date</Th>
                        <Th>Employee</Th>
                        <Th>Cell value</Th>
                        <Th>What the parser thinks</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {needsReview.slice(0, 200).map((record) => (
                        <tr key={record.id} className="hover:bg-sand-50">
                          <Td>
                            <input
                              type="checkbox"
                              checked={record.is_included}
                              disabled={pending}
                              onChange={(event) =>
                                run(() => setRecordIncluded(record.id, event.target.checked))
                              }
                              aria-label="Include this row"
                              className="size-4 rounded border-sand-300"
                            />
                          </Td>
                          <Td className="text-xs">{record.sheet_name}</Td>
                          <Td className="text-xs tabular-nums">{record.work_date ?? '—'}</Td>
                          <Td className="text-xs">
                            {record.source_name}
                            {record.matched_employee_id ? null : (
                              <Badge variant="warning" className="ml-1">No match</Badge>
                            )}
                          </Td>
                          <Td className="font-mono text-xs">{record.source_value}</Td>
                          <Td className="max-w-sm text-xs text-ink-500">{record.parse_message ?? '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {needsReview.length === 0 ? (
                    <EmptyState title="Every cell was understood" />
                  ) : null}
                  {needsReview.length > 200 ? (
                    <p className="p-3 text-xs text-ink-500">
                      Showing the first 200 of {needsReview.length}.
                    </p>
                  ) : null}
                </TableWrap>
              </TabsContent>

              <TabsContent value="names" className="mt-3">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Name in the spreadsheet</Th>
                        <Th className="text-right">Rows</Th>
                        <Th>Matched to an employee</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSummary.names.map((entry) => {
                        const matched = records.some(
                          (r) => r.source_name === entry.name && r.matched_employee_id,
                        )
                        return (
                          <tr key={entry.name} className="hover:bg-sand-50">
                            <Td className="font-medium text-ink-900">{entry.name}</Td>
                            <Td className="text-right tabular-nums">{entry.count}</Td>
                            <Td>
                              {matched ? (
                                <Badge variant="success">Matched</Badge>
                              ) : (
                                <Badge variant="warning">No employee record</Badge>
                              )}
                            </Td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
                {activeSummary.possibleDuplicateNames.length > 0 ? (
                  <Alert tone="warning" className="mt-3" title="Possible duplicate spellings">
                    <ul className="mt-1 text-xs">
                      {activeSummary.possibleDuplicateNames.map((group, index) => (
                        <li key={index}>• {group.map((n) => `“${n}”`).join(' and ')}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}
              </TabsContent>

              <TabsContent value="values" className="mt-3">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Cell value</Th>
                        <Th className="text-right">Times</Th>
                        <Th>Why it needs a look</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSummary.unknownValues.map((entry) => (
                        <tr key={entry.value} className="hover:bg-sand-50">
                          <Td className="font-mono text-xs">{entry.value}</Td>
                          <Td className="text-right tabular-nums">{entry.count}</Td>
                          <Td className="text-xs text-ink-500">{entry.message ?? '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {activeSummary.unknownValues.length === 0 ? (
                    <EmptyState title="Every value was recognised" />
                  ) : null}
                </TableWrap>
              </TabsContent>
            </Tabs>

            {activeBatch.status !== 'COMMITTED' && activeBatch.status !== 'CANCELLED' ? (
              <div className="flex flex-col gap-3 border-t border-sand-200 pt-4">
                {canCreateEmployees ? (
                  <label className="flex items-start gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={createMissing}
                      onChange={(event) => setCreateMissing(event.target.checked)}
                      className="mt-0.5 size-4 rounded border-sand-300"
                    />
                    <span>
                      Create employee records for the {unmatchedNames.length} unmatched name
                      {unmatchedNames.length === 1 ? '' : 's'}. They are created as{' '}
                      <strong>inactive</strong>, so they do not appear on new rosters until you
                      activate them.
                    </span>
                  </label>
                ) : (
                  <Alert tone="warning">
                    {unmatchedNames.length} name(s) have no employee record, and you do not have
                    permission to create employees. Those rows will be skipped.
                  </Alert>
                )}

                <Alert tone="info">
                  Committing creates the weekly rosters, writes the assignments with the original
                  cell text kept against each one, then publishes and locks those weeks as history.
                </Alert>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Import these rows into the roster?')) {
                        run(() => commitImport(activeBatch.id, { createMissingEmployees: createMissing && canCreateEmployees }))
                      }
                    }}
                  >
                    <FileSpreadsheet className="size-4" />
                    Import into the roster
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => cancelBatch(activeBatch.id))}
                  >
                    Cancel this import
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th>When</Th>
                  <Th className="text-right">Cells</Th>
                  <Th className="text-right">Recognised</Th>
                  <Th className="text-right">Review</Th>
                  <Th>Status</Th>
                  <Th>Outcome</Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-sand-50">
                    <Td className="font-medium text-ink-900">{batch.file_name}</Td>
                    <Td className="text-xs">{new Date(batch.created_at).toLocaleString('en-GB')}</Td>
                    <Td className="text-right tabular-nums">{batch.total_rows}</Td>
                    <Td className="text-right tabular-nums">{batch.recognized_rows}</Td>
                    <Td className="text-right tabular-nums">{batch.review_rows}</Td>
                    <Td>
                      <Badge
                        variant={
                          batch.status === 'COMMITTED'
                            ? 'success'
                            : batch.status === 'CANCELLED'
                              ? 'muted'
                              : 'warning'
                        }
                      >
                        {batch.status}
                      </Badge>
                    </Td>
                    <Td className="max-w-sm text-xs text-ink-500">{batch.notes ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {batches.length === 0 ? <EmptyState title="No imports yet" /> : null}
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}
