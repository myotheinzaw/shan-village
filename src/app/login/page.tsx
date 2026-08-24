import Link from 'next/link'
import { BrandLockup } from '@/components/ui/brand'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-sand-100 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLockup subtitle="Operations Management" />
          <p className="text-sm text-ink-500">Sign in to see your roster and requests.</p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-sand-200 bg-white p-6 shadow-sm">
          <LoginForm next={next} />
        </div>

        <p className="mt-4 text-center text-sm text-ink-500">
          <Link href="/forgot-password" className="font-medium text-spice-600 hover:underline">
            Forgotten your password?
          </Link>
        </p>
      </div>
    </main>
  )
}
