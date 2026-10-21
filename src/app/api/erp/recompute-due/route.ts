import { NextResponse } from 'next/server'

import { recomputeCustomerDue } from '@/lib/firebase/dues'
import { AuthorizationError, requireSignedIn } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/**
 * Recomputes one dealer's `due` from their ledger on the server, after a write that changed it.
 * The caller only names the dealer; the server reads the ledger itself, so any signed-in user may
 * ask and the saved value is always the ledger's.
 */
export async function POST(request: Request) {
  try {
    const { db } = await requireSignedIn(request)
    const body = (await request.json().catch(() => ({}))) as { customerId?: unknown }
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    if (!/^[\w-]+$/.test(customerId)) throw new Error('Unknown dealer.')

    const due = await recomputeCustomerDue(db, customerId)
    return NextResponse.json({ due })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    const message = reason instanceof Error ? reason.message : 'Unable to recompute the due.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
