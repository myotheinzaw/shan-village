'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { ActionResult } from '@/lib/actions/result'
import type { Module } from '@/types/db'
import { setModuleEnabled } from '../actions'

export function ModulesManager({
  modules,
  permissionCounts,
}: {
  modules: Module[]
  permissionCounts: Record<string, number>
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      {modules.map((module) => (
        <Card key={module.key}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink-900">{module.name}</p>
                {module.is_core ? <Badge variant="primary">Platform</Badge> : null}
                {module.is_enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="muted">Disabled</Badge>
                )}
              </div>
              <p className="text-sm text-ink-500">{module.description}</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-500">
                {module.key} · {permissionCounts[module.key] ?? 0} permission
                {(permissionCounts[module.key] ?? 0) === 1 ? '' : 's'}
              </p>
            </div>

            <Switch
              checked={module.is_enabled}
              disabled={module.is_core || pending}
              aria-label={`Enable ${module.name}`}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  const result = await setModuleEnabled(module.key, checked)
                  setFeedback(result)
                  if (result.ok) router.refresh()
                })
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
