import 'server-only'

/**
 * The viewer's unlock session lives in one cookie per link.
 *
 * Named from the link's own address and scoped to that path, so unlocking the
 * card by the time clock does not silently unlock the card by the pass — and so
 * a phone that has opened two links keeps two separate sessions. The value is
 * an opaque token issued by the database; nothing about the code or the role is
 * stored in the browser, because a cookie is something the viewer can edit.
 */
export function shareCookieName(token: string): string {
  return `sv_roster_${token.slice(0, 16).replace(/[^A-Za-z0-9_-]/g, '')}`
}

export function shareCookiePath(token: string): string {
  return `/r/${token}`
}

/** Twelve hours: long enough for a double shift, short enough to matter. */
export const SHARE_COOKIE_MAX_AGE = 12 * 60 * 60
