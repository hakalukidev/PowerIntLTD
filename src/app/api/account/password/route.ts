import { NextResponse } from 'next/server'

import { getAdminAuth } from '@/lib/firebase/admin'
import { verifyPassword } from '@/lib/firebase/password'
import { AuthorizationError, requireSignedIn } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/**
 * A signed-in user changes their own password. The current password is checked first, and
 * the change is stamped on the user's record so the admin panel shows it right away. Changing
 * the password ends the user's other sessions, so a fresh token is returned for this one.
 */
export async function POST(request: Request) {
  try {
    const { uid, db, caller } = await requireSignedIn(request)
    const body = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown }
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (newPassword.length < 8) {
      throw new AuthorizationError('The new password must be at least 8 characters long.', 400)
    }
    if (newPassword === currentPassword) {
      throw new AuthorizationError('The new password must be different from the current one.', 400)
    }

    const email = (await getAdminAuth().getUser(uid)).email ?? caller.email
    try {
      if ((await verifyPassword(email, currentPassword)) !== uid) throw new Error('mismatch')
    } catch (reason) {
      if (reason instanceof AuthorizationError && reason.status === 429) throw reason
      throw new AuthorizationError('Your current password is not correct.', 400)
    }

    await getAdminAuth().updateUser(uid, { password: newPassword })
    const changedAt = new Date().toISOString()
    await db.ref(`erp/users/${uid}`).update({ passwordChangedAt: changedAt, passwordChangedBy: uid })

    return NextResponse.json({ token: await getAdminAuth().createCustomToken(uid), passwordChangedAt: changedAt })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    console.error('Password change failed:', reason)
    return NextResponse.json({ error: 'Unable to change the password right now.' }, { status: 500 })
  }
}
