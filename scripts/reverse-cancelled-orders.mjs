/**
 * Takes the bill of every already-cancelled order off its dealer's sheet, once.
 *
 * Cancelling an approved order now goes through the Authorizer and the Chairman, and the final
 * approval writes a "Cancelled <bill>" ledger line (a debit of the bill after discount) so the
 * dealer's due no longer includes it. Orders moved to a cancelling status before that still have
 * their whole bill on the dealer's due. This lists them and, with --apply, writes the same line
 * the app writes (kind `order_cancelled`), then saves each dealer's due from their ledger.
 *
 * What was paid on the order stays on the sheet, so the dealer keeps it as an advance, as in the app.
 * Reserved stock is not touched: the app already gave it back when the order was cancelled.
 *
 * Orders already posted for delivery are listed but not written: their goods left, so check them
 * first and name them with --only if their bill should come off.
 *
 * The first --apply records itself at `migrations/cancelledOrderReversals`; after that --apply is
 * refused unless --only names the orders.
 *
 * Usage:
 *   node scripts/reverse-cancelled-orders.mjs                                             # live, dry run
 *   node scripts/reverse-cancelled-orders.mjs --apply --backup <dir>                      # live, writes
 *   node scripts/reverse-cancelled-orders.mjs --apply --only <orderId,...> --backup <dir> # those orders only, even posted ones
 *   node --env-file=.env.test scripts/reverse-cancelled-orders.mjs                        # local emulator
 *
 * <dir> must be outside the repository; orders, ledger lines and dealers are saved there first.
 * Live runs read the service account from .env / .env.local, like the other scripts here.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MARKER = 'migrations/cancelledOrderReversals'

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
const { getDatabase, ServerValue } = await import('firebase-admin/database')

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
const [orders, savedStatuses, ledgerEntries, customers, marker] = await Promise.all(
  ['erp/orders', 'erp/settings/orderStatuses', 'erp/creditLedgerEntries', 'erp/customers', MARKER].map(async (ref) => (await db.ref(ref).get()).val())
)

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
if (marker?.appliedAt) console.log(`Already applied at ${marker.appliedAt} to ${(marker.orders ?? []).length} order(s).`)

// The default status list (no saved list) has no cancelling status, as in the app.
const statuses = Object.values(savedStatuses ?? {})
const cancellingIds = new Set(statuses.filter((status) => status.isCancelled).map((status) => status.id))
const labelOf = (statusId) => statuses.find((status) => status.id === statusId)?.label ?? statusId
const money = (value) => Number(value || 0).toLocaleString('en-US')

/** As reversedOrderIds in src/lib/erp/ledger.ts: more "Cancelled" than "Reinstated" lines. */
const entries = Object.values(ledgerEntries ?? {})
const netReversals = new Map()
for (const entry of entries) {
  if (!entry.orderId || (entry.kind !== 'order_cancelled' && entry.kind !== 'order_reinstated')) continue
  netReversals.set(entry.orderId, (netReversals.get(entry.orderId) ?? 0) + (entry.kind === 'order_cancelled' ? 1 : -1))
}
const isReversed = (orderId) => (netReversals.get(orderId) ?? 0) > 0

const allOrders = Object.values(orders ?? {}).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
if (ONLY) {
  const unknown = ONLY.filter((orderId) => !orders?.[orderId])
  if (unknown.length) {
    console.error(`Not stored in erp/orders: ${unknown.join(', ')}.`)
    process.exit(1)
  }
  const open = ONLY.filter((orderId) => !cancellingIds.has(orders[orderId].status) || isReversed(orderId))
  if (open.length) {
    console.error(`Not cancelled, or already taken off the sheet: ${open.join(', ')}.`)
    process.exit(1)
  }
}

const cancelled = allOrders.filter((order) => cancellingIds.has(order.status))
const missing = cancelled.filter((order) => !isReversed(order.id))
const posted = missing.filter((order) => order.delivery)
const write = ONLY ? missing.filter((order) => ONLY.includes(order.id)) : missing.filter((order) => !order.delivery)
// Taken off the sheet while the order is open again: the app never leaves it like this.
const openButReversed = allOrders.filter((order) => !cancellingIds.has(order.status) && isReversed(order.id))

const row = (order, extra = '') =>
  `  ${String(order.id).padEnd(28)} ${String(order.billNumber || '').padEnd(16)} ${String(order.customerName ?? '').slice(0, 26).padEnd(26)} ${labelOf(order.status).padEnd(12)} ${money(order.total).padStart(12)}  ${extra}`
const header = `  ${'Order id'.padEnd(28)} ${'Bill'.padEnd(16)} ${'Dealer'.padEnd(26)} ${'Status'.padEnd(12)} ${'Bill (net)'.padStart(12)}  Paid`

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${allOrders.length} orders; cancelling statuses: ${[...cancellingIds].map(labelOf).join(', ') || 'none'}.`)
console.log(`${cancelled.length} order(s) on a cancelling status, ${cancelled.length - missing.length} already off the dealer's sheet.\n`)

console.log(`Bill still on the dealer's due${ONLY ? ' (named with --only)' : ', not posted for delivery'} — will get a "Cancelled" line (${write.length}):`)
console.log(header)
for (const order of write) console.log(row(order, `${money(order.paid)}${order.paid > 0 ? ' (stays as advance)' : ''}`))
if (!write.length) console.log('  none')

const postedLeft = posted.filter((order) => !write.includes(order))
console.log(`\nBill still on the due, but posted for delivery — check first, then use --only (${postedLeft.length}):`)
for (const order of postedLeft) console.log(row(order, `posted ${order.delivery.postedAt ?? ''}${order.delivery.status === 'submitted' ? ', document submitted' : ''}`))
if (!postedLeft.length) console.log('  none')

console.log(`\nOff the sheet but no longer cancelled — listed only (${openButReversed.length}):`)
for (const order of openButReversed) console.log(row(order))
if (!openButReversed.length) console.log('  none')

if (!write.length) {
  console.log('\nNothing to write.')
  process.exit(0)
}
if (marker?.appliedAt && !ONLY) {
  console.log('\nThis was already applied; orders cancelled since then got their line from the app.')
  if (APPLY) {
    console.error('Not written. Use --only <orderId,...> to reverse named orders.')
    process.exit(1)
  }
  process.exit(0)
}
if (!APPLY) {
  console.log(`\nDry run: nothing written. Run again with --apply --backup <dir>${ONLY ? ` --only ${ONLY.join(',')}` : ''} to write ${write.length} line(s).`)
  process.exit(0)
}

const now = new Date().toISOString()
mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `reverse-cancelled-orders-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ orders, creditLedgerEntries: ledgerEntries, customers }, null, 2))
console.log(`\nBackup of erp/orders, erp/creditLedgerEntries and erp/customers written to ${backupFile}`)

const updates = {}
const newEntries = []
for (const order of write) {
  const customer = customers?.[order.customerId]
  if (!customer) {
    console.warn(`  skipped ${order.billNumber || order.id}: dealer ${order.customerId} no longer exists`)
    continue
  }
  const id = `credit_entry_${Date.now()}_${randomBytes(4).toString('hex')}`
  const entry = {
    id,
    customerId: customer.id,
    customerName: customer.name,
    date: now,
    particulars: `Cancelled ${order.billNumber || order.id}`,
    qty: 0,
    unitPrice: 0,
    debit: Number(order.total || 0),
    credit: 0,
    kind: 'order_cancelled',
    orderId: order.id,
    billNumber: order.billNumber ?? '',
    createdAt: now,
  }
  newEntries.push(entry)
  updates[`erp/creditLedgerEntries/${id}`] = entry
}

// Each dealer's due from their ledger with the new lines, as computeCustomerBalance does.
const ledger = [...entries, ...newEntries]
const dues = []
for (const customerId of new Set(newEntries.map((entry) => entry.customerId))) {
  let balance = 0
  for (const order of allOrders) {
    if (order.customerId !== customerId) continue
    balance += (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
    balance -= Number(order.discount ?? 0) + Number(order.paid ?? 0)
  }
  for (const entry of ledger) {
    if (entry.customerId === customerId) balance += Number(entry.credit ?? 0) - Number(entry.debit ?? 0)
  }
  updates[`erp/customers/${customerId}/due`] = balance
  updates[`erp/customers/${customerId}/ledgerRev`] = ServerValue.increment(1)
  dues.push(`  ${customers[customerId].name}: ${money(customers[customerId].due)} → ${money(balance)}`)
}

const ids = newEntries.map((entry) => entry.orderId)
if (ONLY) {
  updates[`${MARKER}/onlyRuns/${now.replace(/[:.]/g, '-')}`] = ids
} else {
  updates[`${MARKER}/appliedAt`] = now
  updates[`${MARKER}/orders`] = ids
}
await db.ref().update(updates)
console.log(`Wrote ${newEntries.length} "Cancelled" line(s). Dealer dues:`)
for (const line of dues) console.log(line)
process.exit(0)
