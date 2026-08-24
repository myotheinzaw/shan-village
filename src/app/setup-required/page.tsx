import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Setup required' }

export default function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Configuration required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink-700">
          <p>
            This deployment has no Supabase connection configured, so there is nothing to sign in
            against yet.
          </p>
          <p>Set the following environment variables and redeploy:</p>
          <ul className="list-inside list-disc font-mono text-xs">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>SUPABASE_SERVICE_ROLE_KEY</li>
          </ul>
          <p className="text-ink-500">
            Full instructions, including how to create the first Owner account, are in
            <span className="font-mono"> docs/DEPLOYMENT.md</span>.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
