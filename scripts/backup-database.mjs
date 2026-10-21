/**
 * Saves the live `erp` and `portal` trees to one JSON file, in the format
 * scripts/seed-emulator.mjs loads, so a backup can also be replayed on the emulators.
 *
 * Usage:
 *   node scripts/backup-database.mjs <dir>      # writes <dir>/powerint-<timestamp>.json
 *
 * <dir> must be outside the repository (the backup holds customer data). Reads the service
 * account from .env / .env.local, like the other scripts here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const target = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || target === REPO || target.startsWith(`${REPO}${path.sep}`)) {
  console.error('Usage: node scripts/backup-database.mjs <dir outside the repository>')
  process.exit(1)
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

loadEnvFile('.env')
loadEnvFile('.env.local')
const { cert, initializeApp } = await import('firebase-admin/app')
const { getDatabase } = await import('firebase-admin/database')
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})

const db = getDatabase()
const [erp, portal] = await Promise.all([db.ref('erp').get(), db.ref('portal').get()]).then((snaps) => snaps.map((snap) => snap.val() ?? {}))

mkdirSync(target, { recursive: true })
const file = path.join(target, `powerint-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify({ erp, portal }))
console.log(`Backed up ${Object.keys(erp).length} erp sections and ${Object.keys(portal).length} portal sections to ${file}`)
process.exit(0)
