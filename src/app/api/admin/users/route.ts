import { NextResponse } from 'next/server'

import { AuthorizationError, requirePermission } from '@/lib/firebase/requireAdmin'
import { getAdminAuth } from '@/lib/firebase/admin'
import { LOGIN_HISTORY_PATH } from '@/lib/firebase/password'
import { resolveRoles } from '@/lib/erp/roles'
import { normalizePhone } from '@/lib/erp/utils'
import type { RoleRecord, UserRecord, ZoneRecord } from '@/lib/erp/types'
import { subZoneKeyFor, teamUserIds, zoneSubZones } from '@/lib/erp/zones'

export const runtime = 'nodejs'

type UserPayload = {
  name?: string
  loginId?: string
  email?: string
  phone?: string
  password?: string
  roleId?: string
  title?: string
  zoneIds?: unknown
  areaKeys?: unknown
  reportsTo?: unknown
  extraRoleIds?: unknown
}

function normalizeLookup(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
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
  // Built-in roles (such as Zonal Manager) exist even before anything about them is stored.
  const roles = resolveRoles((await db.ref('erp/roles').get()).val() as Record<string, RoleRecord> | null)
  if (!roles[roleId]) {
    throw new Error('Selected role does not exist.')
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
    : []
}

/**
 * The user's territory and supervisor, keeping only zones and areas that exist and a
 * supervisor that exists and is not the user or one of the user's own subordinates.
 */
async function resolveAssignment(
  db: Awaited<ReturnType<typeof requirePermission>>['db'],
  body: UserPayload,
  userId?: string,
  existing?: UserRecord
) {
  const zones = ((await db.ref('erp/zones').get()).val() as Record<string, ZoneRecord> | null) ?? {}
  const users = ((await db.ref('erp/users').get()).val() as Record<string, UserRecord> | null) ?? {}

  const zoneIds = body.zoneIds === undefined ? existing?.zoneIds ?? [] : stringList(body.zoneIds).filter((id) => zones[id])
  const areaKeys =
    body.areaKeys === undefined
      ? existing?.areaKeys ?? []
      : stringList(body.areaKeys).filter((key) => {
          const [zoneId, subZone] = key.split('|')
          return zoneSubZones(zones[zoneId]).some((name) => subZoneKeyFor(zoneId, name) === subZoneKeyFor(zoneId, subZone ?? ''))
        })

  const reportsTo = body.reportsTo === undefined ? existing?.reportsTo ?? '' : typeof body.reportsTo === 'string' ? body.reportsTo.trim() : ''
  if (reportsTo) {
    if (!users[reportsTo]) {
      throw new Error('The selected supervisor does not exist.')
    }
    if (userId && teamUserIds(userId, Object.values(users)).has(reportsTo)) {
      throw new Error('A user cannot report to themselves or to someone who reports to them.')
    }
  }

  return { zoneIds, areaKeys, reportsTo }
}

/**
 * Splits the additional roles asked for into the ones the user holds now and the ones waiting
 * for an admin. An admin's choice applies at once. Anyone else can take roles away, but a role
 * they add only becomes a request. Admin itself can only be a user's main role.
 */
async function resolveExtraRoles(
  db: Awaited<ReturnType<typeof requirePermission>>['db'],
  requested: unknown,
  primaryRoleId: string,
  callerIsAdmin: boolean,
  existing?: UserRecord
) {
  const current = existing?.extraRoleIds ?? []
  const pending = existing?.pendingRoleIds ?? []
  const roles = resolveRoles((await db.ref('erp/roles').get()).val() as Record<string, RoleRecord> | null)
  const valid = (roleId: string) => roleId !== primaryRoleId && roleId !== 'admin' && Boolean(roles[roleId])

  if (requested === undefined) {
    return { extraRoleIds: current.filter(valid), pendingRoleIds: pending.filter(valid) }
  }

  const wanted = stringList(requested).filter(valid)
  if (callerIsAdmin) {
    // An admin can see the open requests separately, so leaving one out here does not drop it.
    return { extraRoleIds: wanted, pendingRoleIds: pending.filter((roleId) => valid(roleId) && !wanted.includes(roleId)) }
  }

  const extraRoleIds = current.filter((roleId) => wanted.includes(roleId))
  return { extraRoleIds, pendingRoleIds: wanted.filter((roleId) => !extraRoleIds.includes(roleId)) }
}

export async function POST(request: Request) {
  try {
    const { uid, db, isAdmin } = await requirePermission(request, 'users.edit')
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
    if (roleId === 'admin' && !isAdmin) {
      throw new AuthorizationError('Only an admin can give someone the Admin role.', 403)
    }
    await assertUnique(db, { loginId, phone, email })
    const assignment = await resolveAssignment(db, body)
    const extraRoles = await resolveExtraRoles(db, body.extraRoleIds, roleId, isAdmin)

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
      ...assignment,
      ...extraRoles,
      roleRequestedBy: extraRoles.pendingRoleIds.length ? uid : '',
      passwordChangedAt: new Date().toISOString(),
      passwordChangedBy: uid,
    }

    await db.ref(`erp/users/${created.uid}`).set(user)

    return NextResponse.json({ user })
  } catch (reason) {
    return fail(reason)
  }
}

export async function PATCH(request: Request) {
  try {
    const { uid, db, isAdmin } = await requirePermission(request, 'users.edit')
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
    if (roleId === 'admin' && existing.roleId !== 'admin' && !isAdmin) {
      throw new AuthorizationError('Only an admin can give someone the Admin role.', 403)
    }
    await assertUnique(db, { loginId, phone, email }, userId)
    const assignment = await resolveAssignment(db, body, userId, existing)
    const extraRoles = await resolveExtraRoles(db, body.extraRoleIds, roleId, isAdmin, existing)
    const hasNewRequest = extraRoles.pendingRoleIds.some((pendingId) => !(existing.pendingRoleIds ?? []).includes(pendingId))

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
      ...assignment,
      ...extraRoles,
      roleRequestedBy: !extraRoles.pendingRoleIds.length ? '' : hasNewRequest ? uid : existing.roleRequestedBy ?? '',
      ...(password ? { passwordChangedAt: new Date().toISOString(), passwordChangedBy: uid } : {}),
    }

    await db.ref(`erp/users/${userId}`).set(user)

    return NextResponse.json({ user })
  } catch (reason) {
    return fail(reason)
  }
}

/** An admin approves or rejects a requested additional role. */
export async function PUT(request: Request) {
  try {
    const { db, isAdmin } = await requirePermission(request, 'users.edit')
    if (!isAdmin) {
      throw new AuthorizationError('Only an admin can approve or reject role requests.', 403)
    }

    const body = (await request.json()) as { userId?: string; roleId?: string; decision?: string }
    const userId = (body.userId ?? '').trim()
    const roleId = (body.roleId ?? '').trim()
    const existing = (await db.ref(`erp/users/${userId}`).get()).val() as UserRecord | null

    if (!existing) {
      throw new Error('User not found.')
    }
    if (!(existing.pendingRoleIds ?? []).includes(roleId)) {
      throw new Error('There is no open request for that role.')
    }
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new Error('Choose to approve or reject the request.')
    }
    if (body.decision === 'approve') {
      await assertRoleExists(db, roleId)
    }

    const pendingRoleIds = (existing.pendingRoleIds ?? []).filter((id) => id !== roleId)
    const extraRoleIds =
      body.decision === 'approve' ? Array.from(new Set([...(existing.extraRoleIds ?? []), roleId])) : existing.extraRoleIds ?? []
    const user: UserRecord = {
      ...existing,
      extraRoleIds,
      pendingRoleIds,
      roleRequestedBy: pendingRoleIds.length ? existing.roleRequestedBy ?? '' : '',
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

    // Direct reports of a deleted user no longer have a supervisor.
    const users = ((await db.ref('erp/users').get()).val() as Record<string, UserRecord> | null) ?? {}
    const updates: Record<string, unknown> = { [userId]: null }
    for (const user of Object.values(users)) {
      if (user.reportsTo === userId) updates[`${user.id}/reportsTo`] = ''
    }
    await db.ref('erp/users').update(updates)
    await db.ref(`${LOGIN_HISTORY_PATH}/${userId}`).remove()

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
