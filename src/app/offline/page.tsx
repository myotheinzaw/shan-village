import { BrandLockup } from '@/components/ui/brand'

export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandLockup subtitle="Operations Management" />
      <h1 className="text-lg font-semibold text-ink-900">You are offline</h1>
      <p className="max-w-sm text-sm text-ink-500">
        Your roster is not stored on this device, so a connection is needed to see it. Try again once
        you have signal.
      </p>
    </main>
  )
}
