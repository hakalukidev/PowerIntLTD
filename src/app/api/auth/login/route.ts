import { NextResponse } from 'next/server'

import { normalizePhone } from '@/lib/erp/utils'
import type { PortalAccountRecord, UserRecord } from '@/lib/erp/types'
import { getAdminAuth, getAdminDatabase } from '@/lib/firebase/admin'
import { InvalidCredentialsError, recordLogin, requestOrigin, verifyPassword, type LoginHistoryEntry } from '@/lib/firebase/password'
import { PORTAL_ACCOUNTS_PATH } from '@/lib/firebase/portal'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/**
 * Signs a user in with their email address or phone number (or login ID) and password. Dealers
 * and suppliers with a portal login sign in here too and get a portal session.
 * The account is looked up here so the browser never learns which email belongs to a phone
 * number. On success the login is recorded and a custom token is returned for the browser
 * to sign in with.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { identifier?: unknown; password?: unknown }
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!identifier || !password) {
      throw new AuthorizationError('Enter your email or phone number and your password.', 400)
    }

    const db = getAdminDatabase()
    const users = Object.values(((await db.ref('erp/users').get()).val() as Record<string, UserRecord> | null) ?? {})
    // Dealers and suppliers registered for the portal sign in on the same form.
    const portalAccounts = Object.values(
      ((await db.ref(PORTAL_ACCOUNTS_PATH).get()).val() as Record<string, PortalAccountRecord> | null) ?? {}
    )
    const phone = normalizePhone(identifier)
    const isEmail = identifier.includes('@')
    const looksLikePhone = !isEmail && Boolean(phone) && /^[\d\s+()-]+$/.test(identifier)

    let method: LoginHistoryEntry['method'] = 'email'
    let email: string | undefined = isEmail ? identifier : undefined
    if (!isEmail) {
      const byPhone = looksLikePhone
        ? users.find((candidate) => normalizePhone(candidate.phone) === phone) ??
          portalAccounts.find((candidate) => normalizePhone(candidate.phone) === phone)
        : undefined
      if (byPhone) {
        method = 'phone'
        email = byPhone.email
      } else {
        method = 'loginId'
        email = users.find((candidate) => candidate.loginId?.trim().toLowerCase() === identifier)?.email
      }
    }

    // An unknown account gets the same answer as a wrong password.
    if (!email) {
      throw new InvalidCredentialsError()
    }

    const uid = await verifyPassword(email, password)
    const record = users.find((candidate) => candidate.id === uid)

    if (!record) {
      const account = portalAccounts.find((candidate) => candidate.id === uid)
      if (!account) {
        throw new AuthorizationError('This account is not set up in the ERP. Ask an administrator to add you.', 403)
      }
      if (account.status !== 'active') {
        throw new AuthorizationError('This account is inactive.', 403)
      }

      await db.ref(`${PORTAL_ACCOUNTS_PATH}/${uid}`).update({ lastLoginAt: new Date().toISOString(), loginCount: (account.loginCount ?? 0) + 1 })
      // The claim sends the app to the portal and keeps the session away from the ERP workspace.
      const token = await getAdminAuth().createCustomToken(uid, { portal: true })
      return NextResponse.json({ token, portal: true })
    }
    if (record.status !== 'active') {
      throw new AuthorizationError('This account is inactive.', 403)
    }

    await recordLogin(db, uid, { at: new Date().toISOString(), method, ...requestOrigin(request) }, record.loginCount ?? 0)
    const token = await getAdminAuth().createCustomToken(uid)

    return NextResponse.json({ token })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    console.error('Sign-in failed:', reason)
    return NextResponse.json({ error: 'Sign-in is unavailable right now. Please try again shortly.' }, { status: 500 })
  }
}
