import { NextResponse } from 'next/server'

<<<<<<< HEAD
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
=======
import { adminAuth, adminDatabase } from '@/lib/firebase/admin'
import { authEmailForUser, normalizePhoneKey } from '@/lib/erp/authEmail'
import type { UserRecord } from '@/lib/erp/types'

type UserPayload = {
  name: string
  loginId: string
  phone: string
  password?: string
  roleId: string
  title: string
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function requireCaller(request: Request, permission: string) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new ApiError('Missing sign-in token.', 401)

  let uid: string
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid
  } catch {
    throw new ApiError('Invalid or expired sign-in token.', 401)
  }

  const db = adminDatabase()
  const caller = (await db.ref(`erp/users/${uid}`).get()).val() as UserRecord | null
  if (!caller || caller.status !== 'active') throw new ApiError('Your account is not active.', 403)

  if (caller.roleId !== 'admin') {
    const permissions = ((await db.ref(`erp/roles/${caller.roleId}/permissions`).get()).val() ?? []) as string[]
    if (!permissions.includes(permission)) throw new ApiError('You do not have permission for this action.', 403)
  }

  return { uid, db }
}

function validate(payload: UserPayload) {
  const name = payload.name?.trim()
  const loginId = payload.loginId?.trim().toLowerCase()
  const phone = normalizePhoneKey(payload.phone ?? '')
  if (!name || !loginId || !payload.roleId) throw new ApiError('Name, login ID and role are required.', 400)
  if (payload.password && payload.password.length < 6) {
    throw new ApiError('Password must be at least 6 characters.', 400)
  }
  return { name, loginId, phone, roleId: payload.roleId, title: payload.title?.trim() ?? '' }
}

async function assertUnique(db: ReturnType<typeof adminDatabase>, loginId: string, phone: string, exceptUid?: string) {
  const users = ((await db.ref('erp/users').get()).val() ?? {}) as Record<string, UserRecord>
  for (const [id, user] of Object.entries(users)) {
    if (id === exceptUid) continue
    if (user.loginId?.trim().toLowerCase() === loginId) throw new ApiError('That login ID is already in use.', 409)
    if (phone && normalizePhoneKey(user.phone ?? '') === phone) {
      throw new ApiError('That phone number is already in use.', 409)
    }
  }
}

function toResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: Request) {
  try {
    const { db } = await requireCaller(request, 'users.edit')
    const payload = (await request.json()) as UserPayload
    const fields = validate(payload)
    if (!payload.password) throw new ApiError('A password is required for new users.', 400)
    if (!(await db.ref(`erp/roles/${fields.roleId}`).get()).exists()) throw new ApiError('Selected role does not exist.', 400)
    await assertUnique(db, fields.loginId, fields.phone)

    const authUser = await adminAuth().createUser({
      email: authEmailForUser(fields),
      password: payload.password,
      displayName: fields.name,
    })

    const record: UserRecord = {
      id: authUser.uid,
      name: fields.name,
      loginId: fields.loginId,
      email: `${fields.loginId}@local`,
      phone: fields.phone,
      roleId: fields.roleId,
      title: fields.title,
      status: 'active',
    }
    await db.ref(`erp/users/${authUser.uid}`).set(record)

    return NextResponse.json({ user: record })
  } catch (error) {
    return toResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { db } = await requireCaller(request, 'users.edit')
    const { userId, ...payload } = (await request.json()) as UserPayload & { userId: string }
    if (!userId) throw new ApiError('User ID is required.', 400)

    const existing = (await db.ref(`erp/users/${userId}`).get()).val() as UserRecord | null
    if (!existing) throw new ApiError('User not found.', 404)

    const fields = validate(payload)
    if (!(await db.ref(`erp/roles/${fields.roleId}`).get()).exists()) throw new ApiError('Selected role does not exist.', 400)
    await assertUnique(db, fields.loginId, fields.phone, userId)

    await adminAuth().updateUser(userId, {
      email: authEmailForUser(fields),
      displayName: fields.name,
      ...(payload.password ? { password: payload.password } : {}),
    })

    const { password: _legacyPassword, ...rest } = existing
    void _legacyPassword
    const record: UserRecord = {
      ...rest,
      id: userId,
      name: fields.name,
      loginId: fields.loginId,
      email: `${fields.loginId}@local`,
      phone: fields.phone,
      roleId: fields.roleId,
      title: fields.title,
    }
    await db.ref(`erp/users/${userId}`).set(record)

    return NextResponse.json({ user: record })
  } catch (error) {
    return toResponse(error)
>>>>>>> 64d31e6 (update)
  }
}

export async function DELETE(request: Request) {
  try {
<<<<<<< HEAD
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
=======
    const { uid, db } = await requireCaller(request, 'users.delete')
    const { userId } = (await request.json()) as { userId?: string }
    if (!userId) throw new ApiError('User ID is required.', 400)
    if (userId === uid) throw new ApiError('You cannot delete your own account.', 400)

    await adminAuth().deleteUser(userId).catch((reason: { code?: string }) => {
      if (reason?.code !== 'auth/user-not-found') throw reason
    })
    await db.ref(`erp/users/${userId}`).remove()

    return NextResponse.json({ ok: true })
  } catch (error) {
    return toResponse(error)
>>>>>>> 64d31e6 (update)
  }
}
