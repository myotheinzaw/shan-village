import { PageHeader } from '@/components/layout/app-shell'
import { QuerySearch, QuerySelect } from '@/components/layout/query-filters'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { Alert } from '@/components/ui/alert'
import { requirePermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { AuditLog } from '@/types/db'

export const metadata = { title: 'Audit Log' }
export const dynamic = 'force-dynamic'

const ENTITY_OPTIONS = [
  'ROSTER_ASSIGNMENT', 'ROSTER_PERIOD', 'ROSTER_PUBLICATION', 'EMPLOYEE', 'POSITION',
  'SHIFT_TEMPLATE', 'LEAVE_REQUEST', 'SHIFT_CHANGE_REQUEST', 'SHIFT_SWAP_REQUEST',
  'LEAVE_ENCASHMENT_REQUEST', 'CASH_ADVANCE_REQUEST', 'APPROVAL_ACTION',
  'ROLE', 'USER_ROLE', 'ROLE_PERMISSION', 'USER_PERMISSION', 'PROFILE',
  'SETTING', 'MODULE', 'ANNOUNCEMENT', 'IMPORT_BATCH', 'STAFFING_REQUIREMENT',
]

/** Shows only what changed, so a row is readable at a glance. */
function diff(oldValue: unknown, newValue: unknown): string {
  if (!oldValue || typeof oldValue !== 'object') return ''
  if (!newValue || typeof newValue !== 'object') return ''
  const before = oldValue as Record<string, unknown>
  const after = newValue as Record<string, unknown>
  const ignored = new Set(['updated_at', 'updated_by', 'created_at', 'scheduled_hours'])

  const parts: string[] = []
  for (const key of Object.keys(after)) {
    if (ignored.has(key)) continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      parts.push(`${key}: ${JSON.stringify(before[key]) ?? '—'} → ${JSON.stringify(after[key])}`)
    }
  }
  return parts.slice(0, 6).join('; ')
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; q?: string; page?: string }>
}) {
  await requirePermission('audit.view')
  const params = await searchParams
  const supabase = await createSupabaseServerClient()

  const page = Math.max(1, Number(params.page ?? '1') || 1)
  const pageSize = 100
  const offset = (page - 1) * pageSize

  const query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (params.entity) query.eq('entity_type', params.entity)
  if (params.q) query.or(`actor_email.ilike.%${params.q}%,summary.ilike.%${params.q}%,action.ilike.%${params.q}%`)

  const { data, count } = await query
  const logs = (data ?? []) as AuditLog[]

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every change, who made it and when. These records cannot be edited or deleted by anyone, including the Owner."
      />

      <Alert tone="info" className="mb-4">
        The audit table has no update or delete policy in the database, and a trigger refuses both
        even for a direct connection. This log is append-only by construction.
      </Alert>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <QuerySearch name="q" placeholder="Search user, action or summary…" defaultValue={params.q ?? ''} />
        <QuerySelect
          name="entity"
          label="Filter by record type"
          allLabel="All record types"
          value={params.entity ?? ''}
          options={ENTITY_OPTIONS.map((e) => ({ value: e, label: e.replace(/_/g, ' ').toLowerCase() }))}
        />
      </div>

      <p className="mb-2 text-sm text-ink-500">
        {count ?? 0} record{count === 1 ? '' : 's'} · showing {logs.length}
      </p>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Record</Th>
              <Th>Change</Th>
              <Th>Reason</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="align-top hover:bg-sand-50">
                <Td className="whitespace-nowrap text-xs text-ink-500">
                  {new Date(log.created_at).toLocaleString('en-GB')}
                </Td>
                <Td className="text-xs">{log.actor_email ?? 'system'}</Td>
                <Td>
                  <Badge
                    variant={
                      log.action.includes('DELETE')
                        ? 'danger'
                        : log.action.includes('INSERT') || log.action.includes('PUBLISH')
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {log.action}
                  </Badge>
                </Td>
                <Td className="text-xs">
                  <span className="block text-ink-700">{log.entity_type.replace(/_/g, ' ').toLowerCase()}</span>
                  {log.summary ? <span className="block text-ink-500">{log.summary}</span> : null}
                </Td>
                <Td className="max-w-md text-xs text-ink-500">
                  {log.action === 'UPDATE' ? diff(log.old_value, log.new_value) : ''}
                </Td>
                <Td className="max-w-48 text-xs text-ink-700">{log.reason ?? ''}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {logs.length === 0 ? <EmptyState title="Nothing recorded yet" /> : null}
      </TableWrap>
    </>
  )
}
