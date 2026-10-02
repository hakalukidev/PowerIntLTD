import { NextResponse } from 'next/server'

import { LOGIN_HISTORY_LIMIT, LOGIN_HISTORY_PATH, type LoginHistoryEntry } from '@/lib/firebase/password'
import { AuthorizationError, requirePermission } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/** A user's recent sign-ins, newest first, for the admin panel. */
export async function GET(request: Request) {
  try {
    const { db } = await requirePermission(request, 'users.view')
    const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? ''

    if (!userId || userId.includes('/') || userId.includes('.')) {
      throw new AuthorizationError('User not found.', 400)
    }

    const snapshot = await db.ref(`${LOGIN_HISTORY_PATH}/${userId}`).orderByKey().limitToLast(LOGIN_HISTORY_LIMIT).get()
    const entries = Object.values((snapshot.val() as Record<string, LoginHistoryEntry> | null) ?? {}).reverse()

    return NextResponse.json({ entries })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    return NextResponse.json({ error: 'Unable to load the login history.' }, { status: 500 })
  }
}
