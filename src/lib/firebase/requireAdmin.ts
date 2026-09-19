import { getAdminAuth, getAdminDatabase } from '@/lib/firebase/admin'

export class AuthorizationError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Verifies the caller's Firebase ID token and checks that their role grants
 * `permission`. Roles and permissions are read server-side so a tampered client
 * cannot grant itself access.
 */
export async function requirePermission(request: Request, permission: string) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''

  if (!token) {
    throw new AuthorizationError('You need to be signed in.', 401)
  }

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    throw new AuthorizationError('Your session has expired. Please sign in again.', 401)
  }

  const db = getAdminDatabase()
  const callerSnapshot = await db.ref(`erp/users/${uid}`).get()
  const caller = callerSnapshot.val() as { roleId?: string; status?: string } | null

  if (!caller) {
    throw new AuthorizationError('Your account is no longer available.', 403)
  }

  if (caller.status !== 'active') {
    throw new AuthorizationError('This account is inactive.', 403)
  }

  const roleSnapshot = await db.ref(`erp/roles/${caller.roleId}/permissions`).get()
  const permissions = (roleSnapshot.val() as string[] | null) ?? []

  if (!permissions.includes(permission)) {
    throw new AuthorizationError('You do not have permission to do that.', 403)
  }

  return { uid, db }
}
