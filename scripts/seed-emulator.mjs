/**
 * Loads the latest erp + portal backup into the Firebase emulators and creates the test logins.
 * It only ever talks to the emulators: it refuses to run unless both emulator hosts are on this
 * machine and the project id is a `demo-` project, and it never loads the service account.
 *
 * Usage (emulators running, see `npm run test:e2e:local`):
 *   node --env-file=.env.test scripts/seed-emulator.mjs [--backup <file>]
 *
 * Without --backup it takes the newest file in ~/powerint-backups that holds both `erp` and
 * `portal` (partial backups such as deposit-ledger-side-*.json are skipped).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const BACKUP_DIR = path.join(os.homedir(), 'powerint-backups')
const LOOPBACK = /^(127\.0\.0\.1|localhost):\d+$/

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? ''
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? ''

if (!LOOPBACK.test(authHost) || !LOOPBACK.test(databaseHost) || !projectId.startsWith('demo-') || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(databaseURL)) {
  console.error('Refusing to seed: this script only writes to local emulators with a demo- project (load .env.test).')
  process.exit(1)
}

function latestBackup() {
  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(BACKUP_DIR, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data?.erp && data?.portal) return { file, data }
  }
  throw new Error(`No backup with both erp and portal in ${BACKUP_DIR}.`)
}

const backupIndex = process.argv.indexOf('--backup')
const { file, data } =
  backupIndex > -1
    ? { file: process.argv[backupIndex + 1], data: JSON.parse(readFileSync(process.argv[backupIndex + 1], 'utf8')) }
    : latestBackup()
const { erp, portal } = data
// Backups from before prompt 27 have neither.
const stockMovements = data.stockMovements ?? null
const migrations = data.migrations ?? null

// One existing account per role keeps its uid, so approvals and reporting lines in the backup
// still point at it; only the email changes to a test address.
const testLogins = [
  { roleId: 'admin', preferUid: 'u_admin', email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  { roleId: 'authorizer', email: process.env.E2E_AUTHORIZER_EMAIL, password: process.env.E2E_AUTHORIZER_PASSWORD },
  { roleId: 'chairman', email: process.env.E2E_CHAIRMAN_EMAIL, password: process.env.E2E_CHAIRMAN_PASSWORD },
]

const users = erp.users ?? {}
const seeded = testLogins.map((login) => {
  if (!login.email || !login.password) throw new Error(`Missing E2E email or password for ${login.roleId} in .env.test.`)
  const candidates = Object.values(users).filter((user) => user.roleId === login.roleId && user.status === 'active')
  const user = candidates.find((candidate) => candidate.id === login.preferUid) ?? candidates[0]
  if (!user) throw new Error(`The backup has no active ${login.roleId} user.`)
  users[user.id] = { ...user, email: login.email }
  return { ...login, uid: user.id, name: user.name }
})

const app = initializeApp({ projectId, databaseURL })
const db = getDatabase(app)
const auth = getAuth(app)

await db.ref().set({ erp: { ...erp, users }, portal, stockMovements, migrations })

// Start from an empty Auth emulator so reruns give the same logins.
const cleared = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' })
if (!cleared.ok) throw new Error(`Could not clear the Auth emulator (${cleared.status}).`)
for (const login of seeded) {
  await auth.createUser({ uid: login.uid, email: login.email, password: login.password, displayName: login.name })
}

console.log(`Seeded emulator from ${file}`)
console.log(`  erp sections: ${Object.keys(erp).length}, portal sections: ${Object.keys(portal).length}`)
for (const login of seeded) console.log(`  ${login.roleId}: ${login.email} (uid ${login.uid}, ${login.name})`)
process.exit(0)
