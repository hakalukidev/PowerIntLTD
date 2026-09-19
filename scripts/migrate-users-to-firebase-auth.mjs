// One-time migration: creates a Firebase Auth account for every user in erp/users,
// re-keys the record by the Auth uid (what the database rules expect) and drops the
// plaintext password. Run with --dry-run first.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate-users-to-firebase-auth.mjs [--dry-run]
import 'dotenv/config'
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const DOMAIN = 'erp.powerinternationalbd.local' // keep in sync with src/lib/erp/authEmail.ts
const dryRun = process.argv.includes('--dry-run')

const phoneKey = (v = '') => {
  const digits = String(v).replace(/\D/g, '')
  return digits ? digits.replace(/^(?:880|88|0)+/, '') : ''
}
const loginKey = (v = '') => String(v).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
const emailFor = (u) => `${phoneKey(u.phone) || loginKey(u.loginId)}@${DOMAIN}`

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
initializeApp({
  credential: rawKey ? cert(JSON.parse(rawKey)) : applicationDefault(),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})
const auth = getAuth()
const db = getDatabase()

const users = (await db.ref('erp/users').get()).val() ?? {}
const report = []

for (const [oldId, user] of Object.entries(users)) {
  const email = emailFor(user)
  let record
  try {
    record = await auth.getUserByEmail(email)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
  }

  const password = user.password
  if (!record) {
    if (!password || password.length < 6) {
      report.push(`SKIP  ${user.name} (${email}): no usable password stored (min 6 chars)`)
      continue
    }
    if (!dryRun) record = await auth.createUser({ email, password, displayName: user.name })
    report.push(`AUTH  ${user.name} -> ${email}`)
  } else {
    report.push(`FOUND ${user.name} -> ${email} (already in Auth)`)
  }

  const uid = record?.uid ?? '(new uid)'
  if (!dryRun) {
    const { password: _drop, ...clean } = user
    await db.ref(`erp/users/${uid}`).set({ ...clean, id: uid })
    if (oldId !== uid) await db.ref(`erp/users/${oldId}`).remove()
  }
  report.push(`DB    erp/users/${oldId} -> erp/users/${uid}`)
}

console.log(report.join('\n'))
console.log(dryRun ? '\nDry run only - nothing was changed.' : '\nMigration complete.')
process.exit(0)
