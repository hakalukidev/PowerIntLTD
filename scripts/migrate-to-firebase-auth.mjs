/**
 * One-time migration: moves ERP logins from plaintext passwords stored in the
 * Realtime Database into Firebase Authentication.
 *
 * For every record under `erp/users` it
 *   1. creates (or reuses) a Firebase Auth account whose uid equals the record's
 *      existing id, so nothing else in the database needs re-keying, and
 *   2. deletes the `password` field from the database record.
 *
 * It is idempotent: running it twice will not duplicate or reset accounts that
 * are already migrated, unless you explicitly pass a new admin password.
 *
 * An existing Auth account can be kept by address: pass its email through
 * USER_ACCOUNTS and add --reclaim-emails, and the account is recreated under the
 * correct uid so the rest of the database keeps lining up.
 *
 * Usage:
 *   node scripts/migrate-to-firebase-auth.mjs                 # dry run, changes nothing
 *   node scripts/migrate-to-firebase-auth.mjs --apply
 *   USER_ACCOUNTS='{"u_admin":{"email":"admin@example.com","password":"..."}}' \
 *     node scripts/migrate-to-firebase-auth.mjs --apply --reclaim-emails
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const APPLY = process.argv.includes('--apply')
const RECLAIM_EMAILS = process.argv.includes('--reclaim-emails')

function loadEnvFile(path) {
  try {
    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator === -1) continue
      const key = line.slice(0, separator).trim()
      if (process.env[key] !== undefined) continue
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // no .env.local - rely on the real environment
  }
}

loadEnvFile('.env.local')

const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']
const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`Missing service-account settings: ${missing.join(', ')}`)
  console.error('Download a service account key from Firebase Console -> Project settings -> Service accounts.')
  process.exit(1)
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})

const auth = getAuth()
const db = getDatabase()

const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? 'u_admin'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

/** Per-user overrides: { "<erp user id>": { "email": "...", "password": "..." } } */
let USER_ACCOUNTS = {}

if (process.env.USER_ACCOUNTS) {
  try {
    USER_ACCOUNTS = JSON.parse(process.env.USER_ACCOUNTS)
  } catch (reason) {
    console.error('USER_ACCOUNTS is not valid JSON:', reason.message)
    process.exit(1)
  }
}

if (ADMIN_EMAIL || ADMIN_PASSWORD) {
  USER_ACCOUNTS[ADMIN_USER_ID] = {
    email: ADMIN_EMAIL ?? USER_ACCOUNTS[ADMIN_USER_ID]?.email,
    password: ADMIN_PASSWORD ?? USER_ACCOUNTS[ADMIN_USER_ID]?.password,
  }
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

function generatePassword() {
  return `Pw-${randomBytes(9).toString('base64url').slice(0, 12)}`
}

async function findExistingAuthUser(uid, email) {
  try {
    return await auth.getUser(uid)
  } catch {
    // fall through and try the email instead
  }

  try {
    return await auth.getUserByEmail(email)
  } catch {
    return null
  }
}

async function main() {
  const snapshot = await db.ref('erp/users').get()
  const users = snapshot.val()

  if (!users) {
    console.error('No users found under erp/users - nothing to migrate.')
    process.exit(1)
  }

  console.log(APPLY ? 'Applying migration...\n' : 'DRY RUN - nothing will be changed. Re-run with --apply.\n')

  const issued = []
  const skipped = []
  const failed = []

  for (const [uid, record] of Object.entries(users)) {
   try {
    const override = USER_ACCOUNTS[uid] ?? {}
    const email = (override.email ?? record.email ?? '').trim().toLowerCase()

    if (!email) {
      console.log(`  SKIP  ${uid} (${record.name ?? 'unnamed'}) - no email address on the record`)
      skipped.push({ uid, name: record.name, reason: 'no email address' })
      continue
    }

    if (!looksLikeEmail(email)) {
      console.log(`  SKIP  ${uid} (${record.name ?? 'unnamed'}) - "${email}" is not a usable address`)
      skipped.push({ uid, name: record.name, reason: `unusable address "${email}"` })
      continue
    }

    let existing = await findExistingAuthUser(uid, email)

    // The address we want is held by an account under some other uid. Its uid
    // cannot be changed, so recreate the account under the uid the ERP expects.
    if (existing && existing.uid !== uid) {
      if (!RECLAIM_EMAILS) {
        console.log(
          `  WARN  ${uid} (${record.name}) - ${email} belongs to uid ${existing.uid}. Re-run with --reclaim-emails to move it, or pick another address.`
        )
        continue
      }

      console.log(`  MOVE  ${uid.padEnd(28)}${email} (was uid ${existing.uid})`)

      if (APPLY) {
        await auth.deleteUser(existing.uid)
      }

      existing = null
    }

    const password = override.password ?? (existing ? null : generatePassword())
    const action = existing ? 'update' : 'create'
    console.log(`  ${action.toUpperCase().padEnd(6)}${uid.padEnd(28)}${email}`)

    if (!APPLY) {
      if (password) issued.push({ name: record.name, email, password })
      continue
    }

    if (existing) {
      const patch = {}
      if (existing.email !== email) patch.email = email
      if (password) patch.password = password
      if (Object.keys(patch).length > 0) await auth.updateUser(uid, patch)
    } else {
      await auth.createUser({ uid, email, password, displayName: record.name })
    }

    // The database must never hold a credential again.
    await db.ref(`erp/users/${uid}`).update({ email, password: null })

    if (password) issued.push({ name: record.name, email, password })
   } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.log(`  FAIL  ${uid.padEnd(28)}${message}`)
    failed.push({ uid, name: record.name, reason: message })
   }
  }

  if (issued.length > 0) {
    console.log('\nCredentials (shown once - store them safely, then delete this output):')
    for (const entry of issued) {
      console.log(`  ${String(entry.name).padEnd(20)}${entry.email.padEnd(40)}${entry.password}`)
    }
  }

  if (skipped.length > 0) {
    console.log('\nSkipped (these accounts still cannot sign in):')
    for (const entry of skipped) {
      console.log(`  ${String(entry.uid).padEnd(28)}${entry.name ?? 'unnamed'} - ${entry.reason}`)
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed:')
    for (const entry of failed) {
      console.log(`  ${String(entry.uid).padEnd(28)}${entry.name ?? 'unnamed'} - ${entry.reason}`)
    }
  }

  console.log(APPLY ? '\nDone.' : '\nDry run complete. Re-run with --apply to make these changes.')
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((reason) => {
  console.error('Migration failed:', reason)
  process.exit(1)
})
