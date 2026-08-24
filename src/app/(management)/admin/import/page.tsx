import { PageHeader } from '@/components/layout/app-shell'
import { Alert } from '@/components/ui/alert'
import { can, requirePermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ImportSummary } from '@/lib/excel/import'
import type { ImportBatch, ImportRecord } from '@/types/db'
import { ImportManager } from './import-manager'

export const metadata = { title: 'Excel Import' }
export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const user = await requirePermission('import.run')
  const supabase = await createSupabaseServerClient()

  const { data: batchRows } = await supabase
    .from('import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  const batches = (batchRows ?? []) as ImportBatch[]
  const activeBatch = batches.find((b) => b.status === 'REVIEWING' || b.status === 'PARSED') ?? null

  let records: ImportRecord[] = []
  if (activeBatch) {
    const { data } = await supabase
      .from('import_records')
      .select('*')
      .eq('batch_id', activeBatch.id)
      .order('sheet_name')
      .order('row_number')
      .limit(5000)
    records = (data ?? []) as ImportRecord[]
  }

  return (
    <>
      <PageHeader
        title="Excel Import"
        description="Bring the historical duty roster spreadsheets into the system, with a review step before anything is written."
      />
      <Alert tone="info" className="mb-4" title="How this import behaves">
        The spreadsheet is read into a staging area first. You see what was understood, what needs a
        decision and which names have no employee record. Only when you press Import is anything
        written — and every imported row keeps the original cell text, so the history stays
        auditable.
      </Alert>

      <ImportManager
        batches={batches}
        activeBatch={activeBatch}
        activeSummary={(activeBatch?.summary as unknown as ImportSummary) ?? null}
        records={records}
        canCreateEmployees={can(user, 'staff.create')}
      />
    </>
  )
}
