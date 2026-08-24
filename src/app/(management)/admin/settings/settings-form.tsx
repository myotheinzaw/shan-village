'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/field'
import type { ActionResult } from '@/lib/actions/result'
import type { AppSetting } from '@/types/db'
import { saveSettings } from '../actions'

const CATEGORY_TITLES: Record<string, string> = {
  general: 'Restaurant',
  roster: 'Roster rules',
  leave: 'Leave policy',
  finance: 'Financial requests',
}

const CATEGORY_NOTES: Record<string, string> = {
  roster: 'These are warning thresholds. The roster builder flags them but never blocks an Admin.',
  leave: 'The advance notice period only warns, unless you switch on “Short notice blocks leave”.',
  finance:
    'Financial policy text is stored with each request, so a record always shows what the employee agreed to at the time.',
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : 'Save settings'}
    </Button>
  )
}

export function SettingsForm({ settings }: { settings: AppSetting[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveSettings, { ok: false })

  const categories = [...new Set(settings.map((s) => s.category))]

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{CATEGORY_TITLES[category] ?? category}</CardTitle>
            {CATEGORY_NOTES[category] ? (
              <p className="text-sm text-ink-500">{CATEGORY_NOTES[category]}</p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {settings
              .filter((s) => s.category === category)
              .map((setting) => {
                const name = `setting__${setting.key}`
                const value = setting.value

                if (setting.data_type === 'boolean') {
                  return (
                    <label
                      key={setting.key}
                      className="col-span-full flex items-start gap-2 text-sm text-ink-700"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        defaultChecked={value === true}
                        className="mt-0.5 size-4 rounded border-sand-300"
                      />
                      <span>
                        <span className="font-medium text-ink-900">{setting.label}</span>
                        {setting.description ? (
                          <span className="block text-xs text-ink-500">{setting.description}</span>
                        ) : null}
                      </span>
                    </label>
                  )
                }

                const isLongText =
                  setting.data_type === 'string' && String(value ?? '').length > 60

                return (
                  <Field
                    key={setting.key}
                    label={setting.label}
                    htmlFor={name}
                    hint={setting.description ?? undefined}
                    className={isLongText ? 'col-span-full' : undefined}
                  >
                    {isLongText ? (
                      <Textarea id={name} name={name} defaultValue={String(value ?? '')} />
                    ) : (
                      <Input
                        id={name}
                        name={name}
                        type={setting.data_type === 'number' ? 'number' : 'text'}
                        step={setting.data_type === 'number' ? 'any' : undefined}
                        defaultValue={
                          setting.data_type === 'json'
                            ? JSON.stringify(value)
                            : String(value ?? '')
                        }
                      />
                    )}
                  </Field>
                )
              })}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 flex justify-end">
        <SaveButton />
      </div>
    </form>
  )
}
