import { Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { QuerySelect } from '@/components/layout/query-filters'
import { EmptyState, Table, TableWrap, Td, Th } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { getEmployeeDirectory, getOutlets, getPositions } from '@/lib/data/roster'
import { REPORTS, type ReportKey } from '@/lib/reports'
import { addDaysISO, startOfWeekISO, todayInTimeZone } from '@/lib/roster/dates'
import { DateRangeFields } from './date-range'

export interface ReportPageProps {
  reportKey: ReportKey
  title: string
  description: string
  filters?: ('employee' | 'position' | 'outlet' | 'status')[]
  statusOptions?: { value: string; label: string }[]
  searchParams: Promise<Record<string, string | undefined>>
}

export async function ReportPage({
  reportKey,
  title,
  description,
  filters = [],
  statusOptions = [],
  searchParams,
}: ReportPageProps) {
  const user = await requirePermission('reports.view')
  const settings = await getSettings()
  const params = await searchParams

  const today = todayInTimeZone(settings.timezone)
  // Default window: the current week plus the three before it, which is the
  // span a manager usually wants without having to pick dates.
  const defaultFrom = addDaysISO(startOfWeekISO(today, settings.week_start_day), -21)
  const defaultTo = addDaysISO(startOfWeekISO(today, settings.week_start_day), 6)

  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : defaultTo

  const [employees, positions, outlets] = await Promise.all([
    filters.includes('employee') ? getEmployeeDirectory() : Promise.resolve([]),
    filters.includes('position') ? getPositions(true) : Promise.resolve([]),
    filters.includes('outlet') ? getOutlets() : Promise.resolve([]),
  ])

  const table = await REPORTS[reportKey]({
    from,
    to,
    employeeId: params.employee,
    positionId: params.position,
    outletId: params.outlet,
    status: params.status,
  })

  const exportQuery = new URLSearchParams({ from, to })
  for (const key of ['employee', 'position', 'outlet', 'status'] as const) {
    if (params[key]) exportQuery.set(key, params[key]!)
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          can(user, 'reports.export') ? (
            <Button asChild variant="secondary">
              <a href={`/api/reports/${reportKey}?${exportQuery.toString()}`} download>
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DateRangeFields from={from} to={to} />
        {filters.includes('employee') ? (
          <QuerySelect
            name="employee"
            label="Filter by employee"
            allLabel="All employees"
            value={params.employee ?? ''}
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
          />
        ) : null}
        {filters.includes('position') ? (
          <QuerySelect
            name="position"
            label="Filter by position"
            allLabel="All positions"
            value={params.position ?? ''}
            options={positions.map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : null}
        {filters.includes('outlet') ? (
          <QuerySelect
            name="outlet"
            label="Filter by outlet"
            allLabel="All outlets"
            value={params.outlet ?? ''}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          />
        ) : null}
        {filters.includes('status') && statusOptions.length > 0 ? (
          <QuerySelect
            name="status"
            label="Filter by status"
            allLabel="Any status"
            value={params.status ?? ''}
            options={statusOptions}
          />
        ) : null}
      </div>

      <p className="mb-2 text-sm text-ink-500">
        {table.rows.length} row{table.rows.length === 1 ? '' : 's'} · {table.title}
      </p>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              {table.headers.map((header, index) => (
                <Th key={header} className={index >= 5 ? 'text-right' : undefined}>
                  {header}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-sand-50">
                {row.map((cell, cellIndex) => (
                  <Td
                    key={cellIndex}
                    className={
                      typeof cell === 'number' ? 'text-right tabular-nums' : undefined
                    }
                  >
                    {cell === null || cell === '' ? '—' : String(cell)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.totals ? (
            <tfoot>
              <tr className="bg-sand-50 font-semibold">
                {table.totals.map((cell, index) => (
                  <Td key={index} className={typeof cell === 'number' ? 'text-right tabular-nums' : undefined}>
                    {cell === null || cell === '' ? '' : String(cell)}
                  </Td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </Table>
        {table.rows.length === 0 ? (
          <EmptyState title="Nothing in this range" description="Widen the dates or clear the filters." />
        ) : null}
      </TableWrap>
    </>
  )
}
