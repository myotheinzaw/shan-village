import { z } from 'zod'
import { AuthorizationError } from '@/lib/auth/session'

export interface ActionResult {
  ok: boolean
  error?: string
  message?: string
  id?: string
}

/**
 * Converts a thrown error into something safe to show a restaurant manager:
 * an authorization message, the first validation problem, or the database's
 * own message for constraint violations (which are genuinely informative,
 * e.g. a duplicate employee code).
 */
export function actionFailure(error: unknown): ActionResult {
  if (error instanceof AuthorizationError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    return {
      ok: false,
      error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'That information is not valid.',
    }
  }
  if (error instanceof Error) {
    if (error.message.includes('duplicate key')) {
      return { ok: false, error: 'That code is already in use. Choose a different one.' }
    }
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'You do not have permission to do this.' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'Something went wrong.' }
}
