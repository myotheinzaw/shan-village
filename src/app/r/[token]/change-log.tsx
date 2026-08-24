import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'

export interface ChangeLogEntry {
  changed_at: string
  actor: string
  action: string
  entity: string
  employee_name: string
  work_date: string | null
  summary: string
}

const ACTION_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
}

/**
 * The Change Log, for the Owner and Admin codes only.
 *
 * It reads the same append-only audit trail the Administration screen reads,
 * reduced to what a roster reader needs: when, who, and which shift moved. The
 * before/after JSON never leaves the database.
 */
export function ChangeLog({ entries }: { entries: ChangeLogEntry[] }) {
  return (
    <section className="mt-2">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
        <History className="size-4" aria-hidden />
        Change Log
      </h2>

      <TableWrap>
        {entries.length === 0 ? (
          <EmptyState
            title="No roster changes recorded yet"
            description="Every publication, edit and deletion appears here once it happens."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Person</Th>
                <Th>Shift date</Th>
                <Th>Change</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.changed_at}-${index}`}>
                  <Td className="whitespace-nowrap text-ink-500">
                    {new Date(entry.changed_at).toLocaleString()}
                  </Td>
                  <Td className="whitespace-nowrap font-medium text-ink-900">{entry.actor}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>{entry.entity}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{entry.employee_name || '—'}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{entry.work_date ?? '—'}</Td>
                  <Td>{entry.summary}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </section>
  )
}
