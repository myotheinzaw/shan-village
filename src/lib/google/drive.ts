import 'server-only'

import { createSign } from 'node:crypto'

/**
 * A very small Google Drive client, built on a service account.
 *
 * Deliberately dependency-free: `googleapis` is a large tree for the four calls
 * this module makes (get a token, find a file, create a file, replace a file's
 * content), and a restaurant's daily report should not carry that weight.
 *
 * Setup is documented in docs/WASTAGE.md. The short version: create a service
 * account, download its JSON key, put the client email and private key in the
 * environment, and share the Drive folder with that email as an Editor.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export class DriveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveError'
  }
}

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
}

export function configuredFolderId(): string {
  return process.env.GOOGLE_DRIVE_WASTAGE_FOLDER_ID ?? ''
}

/**
 * Vercel and most CI systems store a multi-line key as a single line with
 * literal `\n`. Both forms are accepted, as is a base64-encoded key.
 */
function privateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY ?? ''
  const value = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  return value.replace(/\\n/g, '\n').trim()
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (!isDriveConfigured()) throw new DriveError('Google Drive is not configured on this deployment.')
  // 60s of slack so a token never expires mid-upload.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const issued = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issued,
      exp: issued + 3600,
    }),
  )

  let signature: string
  try {
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${claims}`)
    signature = base64url(signer.sign(privateKey()))
  } catch {
    throw new DriveError(
      'The Google service-account private key could not be read. Check GOOGLE_PRIVATE_KEY.',
    )
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new DriveError(
      `Google refused the service account: ${payload.error_description ?? payload.error ?? response.status}`,
    )
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // Drive's own message names the problem far better than a status code:
    // "File not found" for a folder that was never shared with the service
    // account, "storageQuotaExceeded" for a personal-Drive folder, and so on.
    throw new DriveError(`Google Drive returned ${response.status}: ${body.slice(0, 400)}`)
  }
  return response
}

export interface DriveFile {
  id: string
  name: string
  webViewLink?: string
}

/** Escapes a value for a Drive `q` string, where the only escapes are \\ and '. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export async function findFile(
  name: string,
  parentId: string,
  mimeType?: string,
): Promise<DriveFile | null> {
  const clauses = [
    `name = ${quote(name)}`,
    `${quote(parentId)} in parents`,
    'trashed = false',
    ...(mimeType ? [`mimeType = ${quote(mimeType)}`] : []),
  ]
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,webViewLink)',
    pageSize: '1',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const response = await driveFetch(`${DRIVE_API}/files?${params}`)
  const payload = (await response.json()) as { files?: DriveFile[] }
  return payload.files?.[0] ?? null
}

/** Finds the named sub-folder inside `parentId`, creating it the first time. */
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const existing = await findFile(name, parentId, FOLDER_MIME)
  if (existing) return existing.id

  const response = await driveFetch(`${DRIVE_API}/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  const payload = (await response.json()) as { id: string }
  return payload.id
}

/**
 * Writes a file into a folder. When `fileId` is given the existing file's
 * content is replaced, which is what keeps a day's report at one stable link
 * however many times it is regenerated.
 */
export async function uploadFile(options: {
  name: string
  mimeType: string
  data: Uint8Array
  parentId?: string
  fileId?: string
}): Promise<DriveFile> {
  const { name, mimeType, data, parentId, fileId } = options
  const metadata: Record<string, unknown> = { name }
  if (!fileId && parentId) metadata.parents = [parentId]

  const boundary = `shan-village-${Math.random().toString(36).slice(2)}`
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,webViewLink',
    supportsAllDrives: 'true',
  })
  const response = await driveFetch(`${DRIVE_UPLOAD_API}/files${fileId ? `/${fileId}` : ''}?${params}`, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  })
  return (await response.json()) as DriveFile
}

/** Creates the file if it is not there, replaces its content if it is. */
export async function upsertFile(options: {
  name: string
  mimeType: string
  data: Uint8Array
  parentId: string
  knownFileId?: string | null
}): Promise<DriveFile> {
  const { name, mimeType, data, parentId, knownFileId } = options

  if (knownFileId) {
    try {
      return await uploadFile({ name, mimeType, data, fileId: knownFileId })
    } catch {
      // The file was moved to the bin or deleted in Drive. Fall through and
      // make a new one rather than failing the day's report.
    }
  }

  const existing = await findFile(name, parentId)
  if (existing) return uploadFile({ name, mimeType, data, fileId: existing.id })
  return uploadFile({ name, mimeType, data, parentId })
}

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}
