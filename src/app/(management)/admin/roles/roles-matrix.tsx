'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { ActionResult } from '@/lib/actions/result'
import { cn } from '@/lib/utils'
import { setRolePermission } from './actions'

export interface MatrixRole {
  id: string
  key: string
  name: string
  isSystem: boolean
}

export interface MatrixPermission {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  moduleKey: string
  moduleEnabled: boolean
  isActive: boolean
  isSensitive: boolean
}

export function RolesMatrix({
  roles,
  permissions,
  grants,
  canEdit,
}: {
  roles: MatrixRole[]
  permissions: MatrixPermission[]
  grants: Record<string, string[]>
  canEdit: boolean
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  const categories = [...new Set(permissions.map((p) => p.category))]

  const toggle = (roleId: string, permissionId: string, granted: boolean) =>
    startTransition(async () => {
      const result = await setRolePermission(roleId, permissionId, granted)
      setFeedback(result)
      if (result.ok) router.refresh()
    })

  return (
    <div className="flex flex-col gap-4">
      {feedback?.error ? <Alert tone="danger">{feedback.error}</Alert> : null}
      {feedback?.ok && feedback.message ? <Alert tone="success">{feedback.message}</Alert> : null}

      <div className="roster-scroll rounded-[var(--radius-card)] border border-sand-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="roster-sticky-col w-80 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="border-b border-sand-200 bg-sand-50 px-3 py-2 text-center text-xs font-semibold text-ink-700"
                >
                  {role.name}
                  {role.key === 'admin' ? (
                    <span className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-normal text-ink-500">
                      <Lock className="size-3" /> always all
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          {categories.map((category) => (
            <tbody key={category}>
              <tr>
                <td
                  colSpan={roles.length + 1}
                  className="roster-sticky-col border-b border-sand-200 bg-sand-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-700"
                >
                  {category}
                </td>
              </tr>
              {permissions
                .filter((permission) => permission.category === category)
                .map((permission) => {
                  const unavailable = !permission.moduleEnabled || !permission.isActive
                  return (
                    <tr key={permission.id} className={cn('hover:bg-sand-50', unavailable && 'opacity-60')}>
                      <td className="roster-sticky-col border-b border-sand-100 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-ink-900">{permission.name}</span>
                          {permission.isSensitive ? <Badge variant="danger">Sensitive</Badge> : null}
                          {unavailable ? <Badge variant="muted">Module off</Badge> : null}
                        </div>
                        <p className="font-mono text-[11px] text-ink-500">{permission.key}</p>
                      </td>

                      {roles.map((role) => {
                        const isAdmin = role.key === 'admin'
                        const has = isAdmin || (grants[role.id] ?? []).includes(permission.id)
                        return (
                          <td key={role.id} className="border-b border-sand-100 px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={!canEdit || isAdmin || pending || unavailable}
                              onChange={(event) => toggle(role.id, permission.id, event.target.checked)}
                              aria-label={`${permission.name} for ${role.name}`}
                              className="size-4 rounded border-sand-300 disabled:opacity-50"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
