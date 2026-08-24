import { notFound } from 'next/navigation'
import { BrandLockup } from '@/components/ui/brand'
import { createSupabaseAnonClient } from '@/lib/supabase/public'
import { WastageForm } from './wastage-form'

/**
 * The public wastage form.
 *
 * No login, no app shell, no navigation: this is a page someone opens from a
 * QR code stuck next to the bin, fills in with one hand, and closes. Everything
 * it knows comes from the link token, and an unknown or revoked token is a 404
 * rather than an explanation.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Report wastage',
  robots: { index: false, follow: false },
}

interface ResolvedLink {
  link_id: string
  label: string
  outlet_id: string | null
  outlet_name: string | null
  require_name: boolean
  require_photo: boolean
  require_reason: boolean
  restaurant_name: string
  timezone: string
  currency: string
  today: string
  now_time: string
}

interface FormOption {
  kind: 'REASON' | 'OUTLET' | 'EMPLOYEE'
  id: string
  code: string
  name: string
}

export default async function PublicWastagePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createSupabaseAnonClient()

  const { data } = await supabase.rpc('wastage_link_resolve', { p_token: token }).maybeSingle()
  const link = data as ResolvedLink | null
  if (!link) notFound()

  const { data: optionRows } = await supabase.rpc('wastage_form_options', { p_token: token })
  const options = (optionRows ?? []) as FormOption[]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-sand-50">
      <header className="flex items-center justify-between gap-3 border-b border-sand-200 bg-white px-4 py-3">
        <BrandLockup subtitle="Daily wastage" />
        {link.outlet_name ? (
          <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-700">
            {link.outlet_name}
          </span>
        ) : null}
      </header>

      <WastageForm
        token={token}
        currency={link.currency}
        today={link.today}
        nowTime={link.now_time.slice(0, 5)}
        requireName={link.require_name}
        requirePhoto={link.require_photo}
        requireReason={link.require_reason}
        fixedOutlet={link.outlet_name}
        outlets={options.filter((o) => o.kind === 'OUTLET').map((o) => ({ id: o.id, name: o.name }))}
        reasons={options.filter((o) => o.kind === 'REASON').map((o) => ({ id: o.id, name: o.name }))}
        staff={options
          .filter((o) => o.kind === 'EMPLOYEE')
          .map((o) => ({ id: o.id, name: o.name, position: o.code }))}
        showOutletPicker={!link.outlet_id}
      />

      <footer className="px-4 py-6 text-center text-xs text-ink-500">
        {link.restaurant_name} · {link.label}
      </footer>
    </main>
  )
}
