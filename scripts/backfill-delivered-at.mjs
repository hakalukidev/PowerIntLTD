/**
 * Fills `deliveredAt` on older orders from their delivery records, once.
 *
 * Orders now get a delivered date when the delivery document is submitted or the order moves to a
 * status that counts as delivered. Orders from before that have none. The only real record of when
 * one was delivered is its submitted delivery document (`delivery.submittedAt`), so an order is
 * filled only when it has one, is still in a delivered status, and has no `deliveredAt` yet.
 *
 * Orders in a delivered status without a submitted document were marked by hand and stay empty;
 * the dry run lists them with their last status change from the Daily Audit, for reference only.
 *
 * The first --apply records itself at `migrations/deliveredAtBackfill`; after that --apply is
 * refused unless --only names the orders to fill.
 *
 * Usage:
 *   node scripts/backfill-delivered-at.mjs                                             # live, dry run
 *   node scripts/backfill-delivered-at.mjs --apply --backup <dir>                      # live, writes
 *   node scripts/backfill-delivered-at.mjs --apply --only <orderId,...> --backup <dir> # those orders only, even after the first run
 *   node --env-file=.env.test scripts/backfill-delivered-at.mjs                        # local emulator
 *
 * <dir> must be outside the repository; the stored orders are saved there before anything is written.
 * Live runs read the service account from .env / .env.local, like the other scripts here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Keep in step with DEFAULT_ORDER_STATUSES and getOrderStatuses() in src/lib/erp/utils.ts. */
const DEFAULT_DELIVERED_STATUS_IDS = ['completed']
const MARKER = 'migrations/deliveredAtBackfill'

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
  console.error('--only needs a comma-separated list of order ids.')
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
const [orders, savedStatuses, auditLog, marker] = await Promise.all(
  ['erp/orders', 'erp/settings/orderStatuses', 'erp/auditLog', MARKER].map(async (ref) => (await db.ref(ref).get()).val())
)

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
if (marker?.appliedAt) console.log(`Already applied at ${marker.appliedAt} to ${(marker.orders ?? []).length} order(s).`)

// A saved list from before `isDelivered` existed keeps Completed as the delivered step, as the app does.
const statuses = Object.values(savedStatuses ?? {})
const deliveredIds = new Set(
  statuses.length
    ? statuses.filter((status) => status.isDelivered ?? status.id === 'completed').map((status) => status.id)
    : DEFAULT_DELIVERED_STATUS_IDS
)
const labelOf = (statusId) => statuses.find((status) => status.id === statusId)?.label ?? statusId
const dayOf = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? String(iso)
    : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}
const lastStatusChange = (orderId) =>
  Object.values(auditLog ?? {})
    .filter((entry) => entry.kind === 'order_status' && entry.refId === orderId)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))[0]

const allOrders = Object.values(orders ?? {}).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
if (ONLY) {
  const unknown = ONLY.filter((orderId) => !orders?.[orderId])
  if (unknown.length) {
    console.error(`Not stored in erp/orders: ${unknown.join(', ')}.`)
    process.exit(1)
  }
}

const fill = []
const handMarked = []
const notDelivered = []
for (const order of allOrders) {
  if (order.deliveredAt || (ONLY && !ONLY.includes(order.id))) continue
  const submittedAt = order.delivery?.status === 'submitted' ? order.delivery.submittedAt : ''
  const delivered = deliveredIds.has(order.status)
  if (submittedAt && delivered) fill.push({ order, deliveredAt: submittedAt })
  else if (submittedAt) notDelivered.push(order)
  else if (delivered) handMarked.push(order)
}
const alreadySet = allOrders.filter((order) => order.deliveredAt).length

const row = (order, extra) =>
  `  ${String(order.billNumber || order.id).padEnd(16)} ${String(order.customerName ?? '').slice(0, 26).padEnd(26)} ${labelOf(order.status).padEnd(12)} ${extra}`

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${allOrders.length} orders, ${alreadySet} already have a delivered date.`)
console.log(`Statuses that count as delivered: ${[...deliveredIds].map(labelOf).join(', ') || 'none'}\n`)

console.log(`Will fill from the submitted delivery document (${fill.length}):`)
console.log(`  ${'Bill'.padEnd(16)} ${'Dealer'.padEnd(26)} ${'Status'.padEnd(12)} Delivered date`)
for (const { order, deliveredAt } of fill) console.log(row(order, `${dayOf(deliveredAt)}  (${deliveredAt})`))
if (!fill.length) console.log('  none')

console.log(`\nLeft empty: in a delivered status but no delivery document, so no real date (${handMarked.length}):`)
for (const order of handMarked) {
  const change = lastStatusChange(order.id)
  console.log(row(order, change ? `last status change ${dayOf(change.submittedAt)}: ${change.summary}` : 'no status change on the Daily Audit'))
}
if (!handMarked.length) console.log('  none')

console.log(`\nLeft empty: document submitted, but since moved to a status that is not delivered (${notDelivered.length}):`)
for (const order of notDelivered) console.log(row(order, `document submitted ${dayOf(order.delivery.submittedAt)}`))
if (!notDelivered.length) console.log('  none')

if (!fill.length) {
  console.log('\nNothing to write.')
  process.exit(0)
}
if (marker?.appliedAt && !ONLY) {
  console.log('\nThe backfill was already applied; orders that have since been delivered got their date from the app.')
  if (APPLY) {
    console.error('Not written. Use --only <orderId,...> to fill named orders.')
    process.exit(1)
  }
  process.exit(0)
}
if (!APPLY) {
  console.log(`\nDry run: nothing written. Run again with --apply --backup <dir>${ONLY ? ` --only ${ONLY.join(',')}` : ''} to save ${fill.length} date(s).`)
  process.exit(0)
}

const now = new Date().toISOString()
mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `backfill-delivered-at-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ orders }, null, 2))
console.log(`\nBackup of erp/orders written to ${backupFile}`)

const updates = {}
for (const { order, deliveredAt } of fill) updates[`erp/orders/${order.id}/deliveredAt`] = deliveredAt
if (ONLY) {
  updates[`${MARKER}/onlyRuns/${now.replace(/[:.]/g, '-')}`] = fill.map(({ order }) => order.id)
} else {
  updates[`${MARKER}/appliedAt`] = now
  updates[`${MARKER}/orders`] = fill.map(({ order }) => order.id)
}
await db.ref().update(updates)
console.log(`Saved ${fill.length} delivered date(s).`)
process.exit(0)
