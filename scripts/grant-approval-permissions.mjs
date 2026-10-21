/**
 * Gives the stored Authorizer role `approvals.authorize` and the stored Chairman role
 * `approvals.final`, the permissions the two approval stages now check.
 *
 * Roles saved in the database keep the permission list they were saved with, so without this the
 * built-in defaults never reach them and only an admin could authorize or give final approval.
 * Roles that already have the permission are left alone; nothing is ever removed.
 *
 * Usage:
 *   node scripts/grant-approval-permissions.mjs                                   # live, dry run
 *   node scripts/grant-approval-permissions.mjs --apply                           # live, writes
 *   node --env-file=.env.test scripts/grant-approval-permissions.mjs --apply      # local emulator
 *
 * Live runs read the service account from .env / .env.local, like the other scripts here.
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const GRANTS = {
  authorizer: 'approvals.authorize',
  chairman: 'approvals.final',
}

function loadEnvFile(file) {
  try {
    for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator === -1) continue
      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // Missing env files are fine; the variables may already be set.
  }
}

const { cert, initializeApp } = await import('firebase-admin/app')
const { getDatabase } = await import('firebase-admin/database')

const emulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === '1'
if (emulator) {
  const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || !(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '').startsWith('demo-')) {
    console.error('Emulator mode needs a local FIREBASE_DATABASE_EMULATOR_HOST and a demo- project (load .env.test).')
    process.exit(1)
  }
  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL })
} else {
  loadEnvFile('.env')
  loadEnvFile('.env.local')
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  })
}

const db = getDatabase()
const roles = (await db.ref('erp/roles').get()).val() ?? {}
const updates = {}

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
for (const [roleId, permission] of Object.entries(GRANTS)) {
  const role = roles[roleId]
  if (!role) {
    console.log(`  ${roleId}: not stored, so it already uses the built-in role with ${permission}.`)
    continue
  }
  const permissions = Array.isArray(role.permissions) ? role.permissions : Object.values(role.permissions ?? {})
  if (permissions.includes(permission)) {
    console.log(`  ${roleId}: already has ${permission}.`)
    continue
  }
  updates[`erp/roles/${roleId}/permissions`] = [...permissions, permission]
  console.log(`  ${roleId}: add ${permission}.`)
}

if (!Object.keys(updates).length) {
  console.log('Nothing to change.')
} else if (!APPLY) {
  console.log('Dry run: nothing written. Run again with --apply to save.')
} else {
  await db.ref().update(updates)
  console.log(`Saved ${Object.keys(updates).length} role(s).`)
}
process.exit(0)
