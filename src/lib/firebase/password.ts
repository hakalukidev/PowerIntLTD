import type { Database } from 'firebase-admin/database'

import type { LoginHistoryEntry } from '@/lib/erp/types'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'

export type { LoginHistoryEntry }

export class InvalidCredentialsError extends AuthorizationError {
  constructor(message = 'Invalid email, phone number, or password.') {
    super(message, 401)
  }
}

/**
 * Checks an email and password against Firebase Authentication and returns the account's uid.
 * The Admin SDK cannot check a password, so this asks the same sign-in endpoint the browser
 * would use. Every kind of mismatch gives the same error, so it cannot reveal which accounts exist.
 */
export async function verifyPassword(email: string, password: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) {
    throw new Error('Server is missing NEXT_PUBLIC_FIREBASE_API_KEY.')
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  })
  const result = (await response.json().catch(() => null)) as { localId?: string; error?: { message?: string } } | null

  if (response.ok && result?.localId) {
    return result.localId
  }

  const code = result?.error?.message ?? ''
  if (code.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    throw new AuthorizationError('Too many failed attempts. Wait a few minutes and try again.', 429)
  }
  if (code.startsWith('USER_DISABLED')) {
    throw new AuthorizationError('This account is inactive.', 403)
  }
  if (['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_EMAIL', 'MISSING_PASSWORD'].some((known) => code.startsWith(known))) {
    throw new InvalidCredentialsError()
  }
  console.error('Firebase password check failed:', code || response.status)
  throw new Error('Sign-in is unavailable right now. Please try again shortly.')
}

/** Where a sign-in came from, for the login history admins see. */
export function requestOrigin(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') ?? ''
  return {
    ip: forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '',
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, 300),
  }
}

/**
 * Keeps the login history outside `erp`, which every signed-in user can read: only the server
 * writes it, and admins read it through the users API.
 */
export const LOGIN_HISTORY_PATH = 'loginHistory'
export const LOGIN_HISTORY_LIMIT = 50

export async function recordLogin(db: Database, uid: string, entry: LoginHistoryEntry, previousCount = 0) {
  await db.ref(`${LOGIN_HISTORY_PATH}/${uid}`).push(entry)
  await db.ref(`erp/users/${uid}`).update({ lastLoginAt: entry.at, loginCount: previousCount + 1 })

  // Trim the oldest entries so the history stays a fixed size.
  const snapshot = await db.ref(`${LOGIN_HISTORY_PATH}/${uid}`).orderByKey().get()
  const keys = Object.keys((snapshot.val() as Record<string, unknown> | null) ?? {})
  if (keys.length > LOGIN_HISTORY_LIMIT) {
    const stale = Object.fromEntries(keys.slice(0, keys.length - LOGIN_HISTORY_LIMIT).map((key) => [key, null]))
    await db.ref(`${LOGIN_HISTORY_PATH}/${uid}`).update(stale)
  }
}
