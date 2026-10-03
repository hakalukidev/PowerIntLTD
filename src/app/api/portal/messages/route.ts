import { NextResponse } from 'next/server'

import { partyKey, PORTAL_MESSAGES_PATH, requirePortalAccount } from '@/lib/firebase/portal'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/** Marks messages in the signed-in party's own inbox as read. */
export async function PATCH(request: Request) {
  try {
    const { db, account } = await requirePortalAccount(request)
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && /^[\w-]+$/.test(id)) : []

    const path = `${PORTAL_MESSAGES_PATH}/${partyKey(account.partyKind, account.partyId)}`
    const existing = ((await db.ref(path).get()).val() as Record<string, unknown> | null) ?? {}
    const updates = Object.fromEntries(ids.filter((id) => existing[id]).map((id) => [`${id}/read`, true]))
    if (Object.keys(updates).length) {
      await db.ref(path).update(updates)
    }

    return NextResponse.json({ ok: true })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    console.error('Portal message update failed:', reason)
    return NextResponse.json({ error: 'Unable to update messages right now.' }, { status: 500 })
  }
}
