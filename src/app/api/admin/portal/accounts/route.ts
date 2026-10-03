import { NextResponse } from 'next/server'

import { isPlaceholderEmail, PORTAL_PLACEHOLDER_EMAIL_DOMAIN } from '@/lib/erp/portal'
import type { PortalAccountRecord, PortalPartyKind, UserRecord } from '@/lib/erp/types'
import { normalizePhone } from '@/lib/erp/utils'
import { getAdminAuth } from '@/lib/firebase/admin'
import { isPartyKind, loadParty, PORTAL_ACCOUNTS_PATH } from '@/lib/firebase/portal'
import { AuthorizationError, callerPermissions, requireSignedIn } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

type Database = Awaited<ReturnType<typeof requireSignedIn>>['db']

/** Dealer logins are managed by whoever may edit dealers; supplier logins by whoever may edit suppliers. */
const EDIT_PERMISSION: Record<PortalPartyKind, string> = { customer: 'customers.edit', supplier: 'suppliers.edit' }
const VIEW_PERMISSION: Record<PortalPartyKind, string> = { customer: 'customers.view', supplier: 'suppliers.view' }

function fail(reason: unknown) {
  if (reason instanceof AuthorizationError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status })
  }
  const message = reason instanceof Error ? reason.message : 'Something went wrong.'
  return NextResponse.json({ error: message }, { status: 400 })
}

async function assertPortalPermission(signedIn: Awaited<ReturnType<typeof requireSignedIn>>, kind: PortalPartyKind, level: 'view' | 'edit') {
  const permissions = await callerPermissions(signedIn.db, signedIn.caller)
  if (!permissions.includes((level === 'edit' ? EDIT_PERMISSION : VIEW_PERMISSION)[kind])) {
    throw new AuthorizationError('You do not have permission to do that.', 403)
  }
  return signedIn
}

async function readAccounts(db: Database) {
  return ((await db.ref(PORTAL_ACCOUNTS_PATH).get()).val() as Record<string, PortalAccountRecord> | null) ?? {}
}

/** Staff and portal logins share one sign-in form, so an email or phone may belong to only one of them. */
async function assertUnique(db: Database, candidate: { email: string; phone: string }, ignoreId?: string) {
  const users = Object.values(((await db.ref('erp/users').get()).val() as Record<string, UserRecord> | null) ?? {})
  const accounts = Object.values(await readAccounts(db)).filter((account) => account.id !== ignoreId)

  for (const other of [...users, ...accounts]) {
    if (candidate.email && other.email?.trim().toLowerCase() === candidate.email) {
      throw new Error('That email address is already used by another login.')
    }
    if (candidate.phone && normalizePhone(other.phone) === candidate.phone) {
      throw new Error('That phone number is already used by another login.')
    }
  }
}

function readEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.')
  }
  if (email && isPlaceholderEmail(email)) {
    throw new Error('Enter the dealer\'s real email address, or leave it empty.')
  }
  return email
}

/** Portal logins the caller may see: dealers with `customers.view`, suppliers with `suppliers.view`. */
export async function GET(request: Request) {
  try {
    const { db, caller } = await requireSignedIn(request)
    const permissions = await callerPermissions(db, caller)
    const accounts = Object.values(await readAccounts(db)).filter((account) => permissions.includes(VIEW_PERMISSION[account.partyKind]))
    return NextResponse.json({ accounts })
  } catch (reason) {
    return fail(reason)
  }
}

/** Registers a dealer's or supplier's first login and sets their password. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (!isPartyKind(body.partyKind)) throw new Error('Choose a dealer or supplier.')
    const partyKind = body.partyKind
    const { uid, db, caller } = await assertPortalPermission(await requireSignedIn(request), partyKind, 'edit')

    const partyId = typeof body.partyId === 'string' ? body.partyId.trim() : ''
    const party = partyId ? await loadParty(db, partyKind, partyId) : null
    if (!party) throw new Error(partyKind === 'customer' ? 'Dealer not found.' : 'Supplier not found.')

    const accounts = Object.values(await readAccounts(db))
    if (accounts.some((account) => account.partyKind === partyKind && account.partyId === partyId)) {
      throw new Error(`${party.name} already has a portal login. Reset its password instead.`)
    }

    const email = readEmail(body.email)
    const phone = normalizePhone(body.phone)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email && !phone) throw new Error('Enter an email address or a phone number to sign in with.')
    if (password.length < 8) throw new Error('Password must be at least 8 characters long.')
    await assertUnique(db, { email, phone })

    // Firebase needs an email; a phone-only login gets a stand-in the dealer never sees.
    const authEmail = email || `${partyKind}-${partyId.replace(/[^\w-]/g, '').toLowerCase()}@${PORTAL_PLACEHOLDER_EMAIL_DOMAIN}`
    const created = await getAdminAuth().createUser({ email: authEmail, password, displayName: party.name })

    const now = new Date().toISOString()
    const account: PortalAccountRecord = {
      id: created.uid,
      partyKind,
      partyId,
      name: party.name,
      email: authEmail,
      phone,
      status: 'active',
      createdAt: now,
      createdById: uid,
      createdByName: caller.name,
      passwordChangedAt: now,
      passwordChangedBy: uid,
    }
    await db.ref(`${PORTAL_ACCOUNTS_PATH}/${created.uid}`).set(account)

    return NextResponse.json({ account })
  } catch (reason) {
    return fail(reason)
  }
}

/** Changes a portal login's email, phone, or status, or sets a new password. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
    const signedIn = await requireSignedIn(request)
    const existing = accountId ? (await readAccounts(signedIn.db))[accountId] : undefined
    if (!existing) throw new Error('Portal login not found.')
    const { uid, db } = await assertPortalPermission(signedIn, existing.partyKind, 'edit')

    const email = body.email === undefined ? (isPlaceholderEmail(existing.email) ? '' : existing.email) : readEmail(body.email)
    const phone = body.phone === undefined ? existing.phone : normalizePhone(body.phone)
    const password = typeof body.password === 'string' ? body.password : ''
    const status = body.status === 'active' || body.status === 'inactive' ? body.status : existing.status
    if (!email && !phone) throw new Error('Keep an email address or a phone number to sign in with.')
    if (password && password.length < 8) throw new Error('Password must be at least 8 characters long.')
    await assertUnique(db, { email, phone }, accountId)

    const authEmail = email || (isPlaceholderEmail(existing.email) ? existing.email : `${existing.partyKind}-${existing.partyId.replace(/[^\w-]/g, '').toLowerCase()}@${PORTAL_PLACEHOLDER_EMAIL_DOMAIN}`)
    const credentialUpdate: { email?: string; password?: string; disabled?: boolean } = {}
    if (authEmail !== existing.email) credentialUpdate.email = authEmail
    if (password) credentialUpdate.password = password
    if (status !== existing.status) credentialUpdate.disabled = status === 'inactive'
    if (Object.keys(credentialUpdate).length) {
      await getAdminAuth().updateUser(accountId, credentialUpdate)
    }
    // Turning a login off also ends the sessions it already has.
    if (status === 'inactive' && existing.status !== 'inactive') {
      await getAdminAuth().revokeRefreshTokens(accountId)
    }

    const account: PortalAccountRecord = {
      ...existing,
      email: authEmail,
      phone,
      status,
      ...(password ? { passwordChangedAt: new Date().toISOString(), passwordChangedBy: uid } : {}),
    }
    await db.ref(`${PORTAL_ACCOUNTS_PATH}/${accountId}`).set(account)

    return NextResponse.json({ account })
  } catch (reason) {
    return fail(reason)
  }
}

/** Removes a portal login. The dealer's sheet and messages stay. */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
    const signedIn = await requireSignedIn(request)
    const existing = accountId ? (await readAccounts(signedIn.db))[accountId] : undefined
    if (!existing) throw new Error('Portal login not found.')
    const { db } = await assertPortalPermission(signedIn, existing.partyKind, 'edit')

    await db.ref(`${PORTAL_ACCOUNTS_PATH}/${accountId}`).remove()
    try {
      await getAdminAuth().deleteUser(accountId)
    } catch {
      // The login record is gone either way; a missing Auth user is not fatal.
    }

    return NextResponse.json({ ok: true })
  } catch (reason) {
    return fail(reason)
  }
}
