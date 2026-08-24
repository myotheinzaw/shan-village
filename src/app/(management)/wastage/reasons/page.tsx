import { PageHeader } from '@/components/layout/app-shell'
import { SimpleMaster } from '@/components/masters/simple-master'
import { requireModule, requirePermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { WastageReason } from '@/types/db'
import { saveWastageReason } from './actions'

export const metadata = { title: 'Wastage Reasons' }
export const dynamic = 'force-dynamic'

export default async function WastageReasonsPage() {
  await requireModule('wastage')
  await requirePermission('wastage.manage')

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('wastage_reasons').select('*').order('sort_order')
  const reasons = (data ?? []) as WastageReason[]

  return (
    <>
      <PageHeader
        title="Wastage Reasons"
        description="The list a staff member picks from. Keep it short — a long list gets ignored."
      />

      <SimpleMaster
        entityLabel="Reason"
        canManage
        emptyDescription="Add the reasons your kitchen actually throws food away for."
        rows={reasons.map((reason) => ({
          id: reason.id,
          code: reason.code,
          name: reason.name,
          description: reason.description ?? '',
          sort_order: reason.sort_order,
          is_active: reason.is_active,
        }))}
        columns={[
          { key: 'name', label: 'Reason' },
          { key: 'code', label: 'Code', type: 'mono' },
          { key: 'description', label: 'Description' },
          { key: 'sort_order', label: 'Order', align: 'right' },
          { key: 'is_active', label: 'Active', type: 'boolean' },
        ]}
        fields={[
          { name: 'name', label: 'Reason', type: 'text', required: true, full: true },
          {
            name: 'code',
            label: 'Code',
            type: 'text',
            required: true,
            hint: 'Capitals and underscores, e.g. OVER_PRODUCTION. Reports group by this.',
          },
          { name: 'sort_order', label: 'Order in the list', type: 'number', defaultValue: 50 },
          { name: 'description', label: 'Description', type: 'textarea', full: true },
          { name: 'is_active', label: 'Active — staff can choose it', type: 'checkbox' },
        ]}
        action={saveWastageReason}
      />
    </>
  )
}
