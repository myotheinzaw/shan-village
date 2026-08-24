import { BrandLockup } from '@/components/ui/brand'
import { ResetPasswordForm } from './reset-form'

export const metadata = { title: 'Choose a new password' }
export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-sand-100 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLockup subtitle="Operations Management" />
          <p className="text-sm text-ink-500">Choose a new password for your account.</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-sand-200 bg-white p-6 shadow-sm">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  )
}
