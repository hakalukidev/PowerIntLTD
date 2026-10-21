/**
 * Gives every stored role `<module>.create` wherever it has `<module>.edit`, once.
 *
 * "Create & edit" used to be one permission (`<module>.edit`). It is now two, Create and Edit, and
 * the "Add …"/"New …" buttons check Create. Roles saved in the database keep the list they were
 * saved with, so without this they would lose every Add button. Nothing is ever removed.
 *
 * The first --apply records itself at `migrations/editCreateSplit`; after that --apply is refused,
 * so a Create someone has since unticked in the role editor is never granted again. A dry run then
 * lists the roles that have Edit without Create. If a role was saved in the old role editor during
 * the deploy window (which drops `.create`), re-run for that role only with --only.
 *
 * Usage:
 *   node scripts/split-edit-permission.mjs                                            # live, dry run
 *   node scripts/split-edit-permission.mjs --apply --backup <dir>                     # live, writes
 *   node scripts/split-edit-permission.mjs --apply --only <roleId,...> --backup <dir> # those roles only, even after the first run
 *   node --env-file=.env.test scripts/split-edit-permission.mjs --apply --backup <dir> # local emulator
 *
 * <dir> must be outside the repository; the stored roles are saved there before anything is written.
 * Live runs read the service account from .env / .env.local, like the other scripts here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The modules that have a Create permission: keep in step with buildPermissionCatalog() in src/lib/erp/defaultData.ts. */
const CREATE_MODULES = [
  'sales',
  'inventory',
  'suppliers',
  'customers',
  'credit_sheet',
  'zones',
  'sellers',
  'couriers',
  'damage_products',
  'leads',
  'finance',
  'employees',
  'users',
  'roles',
]
const MARKER = 'migrations/editCreateSplit'

const APPLY = process.argv.includes('--apply')
const backupIndex = process.argv.indexOf('--backup')
const BACKUP_DIR = backupIndex > -1 ? path.resolve(process.argv[backupIndex + 1] ?? '') : ''
const onlyIndex = process.argv.indexOf('--only')
const ONLY = onlyIndex > -1 ? (process.argv[onlyIndex + 1] ?? '').split(',').map((id) => id.trim()).filter(Boolean) : null
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
if (APPLY && (!BACKUP_DIR || BACKUP_DIR === REPO || BACKUP_DIR.startsWith(`${REPO}${path.sep}`))) {
  console.error('--apply needs --backup <dir> outside the repository.')
  process.exit(1)
}
if (ONLY && !ONLY.length) {
  console.error('--only needs a comma-separated list of role ids, e.g. --only head_of_sales,sales_person')
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
const marker = (await db.ref(MARKER).get()).val()

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
if (marker?.appliedAt) console.log(`Already applied at ${marker.appliedAt} to: ${(marker.roles ?? []).join(', ') || 'no roles'}.`)

if (ONLY) {
  const unknown = ONLY.filter((roleId) => !roles[roleId])
  if (unknown.length) {
    console.error(`Not stored in erp/roles: ${unknown.join(', ')}.`)
    process.exit(1)
  }
}

const updates = {}
const changed = []
for (const [roleId, role] of Object.entries(roles)) {
  // The admin role always resolves to every permission, whatever is stored.
  if (roleId === 'admin' || (ONLY && !ONLY.includes(roleId))) continue
  const permissions = Array.isArray(role.permissions) ? role.permissions : Object.values(role.permissions ?? {})
  const missing = CREATE_MODULES.filter((module) => permissions.includes(`${module}.edit`) && !permissions.includes(`${module}.create`))
  if (!missing.length) continue
  updates[`erp/roles/${roleId}/permissions`] = [...permissions, ...missing.map((module) => `${module}.create`)]
  changed.push(roleId)
  console.log(`  ${roleId} (${role.name ?? 'unnamed'}): add ${missing.map((module) => `${module}.create`).join(', ')}`)
}

if (!changed.length) {
  console.log('Nothing to change: every stored role with Edit also has Create.')
  process.exit(0)
}
if (marker?.appliedAt && !ONLY) {
  console.log(
    '\nThese roles have Edit without Create. That is either deliberate (Create unticked in the role editor) or the role was\n' +
      'saved in the old role editor during the deploy window. Only for the latter, run again with\n' +
      '  --apply --only <roleId,...> --backup <dir>'
  )
  if (APPLY) {
    console.error('\nNot written: the split was already applied. Use --only to name the roles to fix.')
    process.exit(1)
  }
  process.exit(0)
}
if (!APPLY) {
  console.log(`\nDry run: nothing written. Run again with --apply --backup <dir>${ONLY ? ` --only ${ONLY.join(',')}` : ''} to save.`)
  process.exit(0)
}

const now = new Date().toISOString()
mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `split-edit-permission-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ roles }, null, 2))
console.log(`\nBackup of erp/roles written to ${backupFile}`)

if (ONLY) {
  updates[`${MARKER}/onlyRuns/${now.replace(/[:.]/g, '-')}`] = changed
} else {
  updates[`${MARKER}/appliedAt`] = now
  updates[`${MARKER}/roles`] = changed
}
await db.ref().update(updates)
console.log(`Saved ${changed.length} role(s).`)
process.exit(0)
