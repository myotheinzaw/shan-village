import Link from 'next/link'
import { BrandLockup } from '@/components/ui/brand'
import { ForgotPasswordForm } from './forgot-form'

export const metadata = { title: 'Reset your password' }
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-sand-100 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLockup subtitle="Operations Management" />
          <p className="text-sm text-ink-500">
            Enter your email address and we will send you a reset link.
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-sand-200 bg-white p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
        <p className="mt-4 text-center text-sm text-ink-500">
          <Link href="/login" className="font-medium text-spice-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
