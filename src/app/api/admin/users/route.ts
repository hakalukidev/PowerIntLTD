import { NextResponse } from 'next/server'

import { AuthorizationError, requirePermission } from '@/lib/firebase/requireAdmin'
import { getAdminAuth } from '@/lib/firebase/admin'
import type { UserRecord } from '@/lib/erp/types'

export const runtime = 'nodejs'

type UserPayload = {
  name?: string
  loginId?: string
  email?: string
  phone?: string
  password?: string
  roleId?: string
  title?: string
}

function normalizeLookup(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

// Mirrors normalizePhoneLookup in the ERP provider so both sides agree on duplicates.
function normalizePhone(value: unknown) {
  const digits = typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : ''

  if (!digits) {
    return ''
  }

  return digits.replace(/^(?:880|88|0)+/, '')
}

function fail(reason: unknown) {
  if (reason instanceof AuthorizationError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status })
  }

  const message = reason instanceof Error ? reason.message : 'Something went wrong.'
  return NextResponse.json({ error: message }, { status: 400 })
}

/** Rejects a login ID, phone, or email that another account already uses. */
async function assertUnique(
  db: Awaited<ReturnType<typeof requirePermission>>['db'],
  candidate: { loginId: string; phone: string; email: string },
  ignoreUid?: string
) {
  const snapshot = await db.ref('erp/users').get()
  const users = Object.values((snapshot.val() as Record<string, UserRecord> | null) ?? {})

  for (const user of users) {
    if (user.id === ignoreUid) {
      continue
    }

    if (normalizeLookup(user.loginId) === candidate.loginId) {
      throw new Error('That login ID is already in use.')
    }

    if (candidate.phone && normalizePhone(user.phone) === candidate.phone) {
      throw new Error('That phone number is already in use.')
    }

    if (candidate.email && normalizeLookup(user.email) === candidate.email) {
      throw new Error('That email address is already in use.')
    }
  }
}

async function assertRoleExists(
  db: Awaited<ReturnType<typeof requirePermission>>['db'],
  roleId: string
) {
  const snapshot = await db.ref(`erp/roles/${roleId}`).get()
  if (!snapshot.exists()) {
    throw new Error('Selected role does not exist.')
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await requirePermission(request, 'users.edit')
    const body = (await request.json()) as UserPayload

    const name = (body.name ?? '').trim()
    const loginId = normalizeLookup(body.loginId)
    const email = normalizeLookup(body.email)
    const phone = normalizePhone(body.phone)
    const password = body.password ?? ''
    const roleId = (body.roleId ?? '').trim()

    if (!name || !loginId || !email || !roleId) {
      throw new Error('Name, login ID, email address, and role are required.')
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.')
    }

    await assertRoleExists(db, roleId)
    await assertUnique(db, { loginId, phone, email })

    // Firebase Auth owns the credential; the database never sees the password.
    const created = await getAdminAuth().createUser({ email, password, displayName: name })

    const user: UserRecord = {
      id: created.uid,
      name,
      loginId,
      email,
      phone,
      roleId,
      title: (body.title ?? '').trim(),
      status: 'active',
    }

    await db.ref(`erp/users/${created.uid}`).set(user)

    return NextResponse.json({ user })
  } catch (reason) {
    return fail(reason)
  }
}

export async function PATCH(request: Request) {
  try {
    const { db } = await requirePermission(request, 'users.edit')
    const body = (await request.json()) as UserPayload & { userId?: string }
    const userId = (body.userId ?? '').trim()

    if (!userId) {
      throw new Error('User not found.')
    }

    const snapshot = await db.ref(`erp/users/${userId}`).get()
    const existing = snapshot.val() as UserRecord | null

    if (!existing) {
      throw new Error('User not found.')
    }

    const name = (body.name ?? '').trim() || existing.name
    const loginId = normalizeLookup(body.loginId) || normalizeLookup(existing.loginId)
    const email = normalizeLookup(body.email) || normalizeLookup(existing.email)
    const phone = normalizePhone(body.phone) || normalizePhone(existing.phone)
    const roleId = (body.roleId ?? '').trim() || existing.roleId
    const password = body.password ?? ''

    if (password && password.length < 8) {
      throw new Error('Password must be at least 8 characters long.')
    }

    await assertRoleExists(db, roleId)
    await assertUnique(db, { loginId, phone, email }, userId)

    const credentialUpdate: { email?: string; password?: string; displayName?: string } = {}
    if (email !== normalizeLookup(existing.email)) {
      credentialUpdate.email = email
    }
    if (password) {
      credentialUpdate.password = password
    }
    if (name !== existing.name) {
      credentialUpdate.displayName = name
    }

    if (Object.keys(credentialUpdate).length > 0) {
      await getAdminAuth().updateUser(userId, credentialUpdate)
    }

    const user: UserRecord = {
      ...existing,
      id: userId,
      name,
      loginId,
      email,
      phone,
      roleId,
      title: (body.title ?? '').trim() || existing.title,
    }

    await db.ref(`erp/users/${userId}`).set(user)

    return NextResponse.json({ user })
  } catch (reason) {
    return fail(reason)
  }
}

export async function DELETE(request: Request) {
  try {
    const { uid, db } = await requirePermission(request, 'users.delete')
    const body = (await request.json()) as { userId?: string }
    const userId = (body.userId ?? '').trim()

    if (!userId) {
      throw new Error('User not found.')
    }

    if (userId === uid) {
      throw new Error('You cannot delete your own account.')
    }

    await db.ref(`erp/users/${userId}`).remove()

    try {
      await getAdminAuth().deleteUser(userId)
    } catch {
      // The database record is gone either way; a missing Auth user is not fatal.
    }

    return NextResponse.json({ ok: true })
  } catch (reason) {
    return fail(reason)
  }
}
