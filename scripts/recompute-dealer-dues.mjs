/**
 * Makes every dealer's `customer.due` equal their ledger balance, the way the app now keeps it.
 *
 * The balance is worked out as computeCustomerBalance in src/lib/erp/ledger.ts does: order lines,
 * less the order's discount and payment, plus Credit Sheet entries (credit − debit), including the
 * "Opening due" line. A negative balance (an advance) is kept as it is.
 *
 * A dealer with a due but no orders and no ledger lines at all can only have got it from the old
 * customer form, so that amount becomes their "Opening due" line. Any other difference is the
 * ledger being right and the stored due being stale, and is only listed.
 *
 * Usage:
 *   node scripts/recompute-dealer-dues.mjs                         # dry run, changes nothing
 *   node scripts/recompute-dealer-dues.mjs --apply --backup <dir>  # backs up erp and portal, then writes
 *
 * <dir> must be outside the repository.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const backupIndex = process.argv.indexOf('--backup')
const BACKUP_DIR = backupIndex > -1 ? path.resolve(process.argv[backupIndex + 1] ?? '') : ''
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
if (APPLY && (!BACKUP_DIR || BACKUP_DIR === REPO || BACKUP_DIR.startsWith(`${REPO}${path.sep}`))) {
  console.error('--apply needs --backup <dir> outside the repository.')
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

const money = (value) => Number(value || 0).toLocaleString('en-US')
const orders = Object.values(erp.orders ?? {})
const entries = Object.values(erp.creditLedgerEntries ?? {})
const openingId = (customerId) => `credit_entry_opening_${customerId}`

function ledgerBalance(customerId, entryList) {
  let balance = 0
  for (const order of orders) {
    if (order.customerId !== customerId) continue
    balance += (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
    balance -= Number(order.discount ?? 0) + Number(order.paid ?? 0)
  }
  for (const entry of entryList) {
    if (entry.customerId === customerId) balance += Number(entry.credit ?? 0) - Number(entry.debit ?? 0)
  }
  return balance
}

const now = new Date().toISOString()
const updates = {}
const rows = []
for (const customer of Object.values(erp.customers ?? {}).sort((left, right) => String(left.code).localeCompare(String(right.code)))) {
  const stored = Number(customer.due ?? 0)
  const hasHistory = orders.some((order) => order.customerId === customer.id) || entries.some((entry) => entry.customerId === customer.id)
  const myEntries = [...entries]
  let opening = ''
  if (!hasHistory && stored > 0) {
    const entry = {
      id: openingId(customer.id),
      customerId: customer.id,
      customerName: customer.name,
      date: customer.createdAt,
      particulars: 'Opening due',
      qty: 0,
      unitPrice: 0,
      debit: 0,
      credit: stored,
      kind: 'opening',
      createdAt: now,
    }
    myEntries.push(entry)
    updates[`erp/creditLedgerEntries/${entry.id}`] = entry
    opening = `adds Opening due ${money(stored)}`
  }
  const balance = ledgerBalance(customer.id, myEntries)
  if (balance !== stored) updates[`erp/customers/${customer.id}/due`] = balance
  rows.push({ customer, stored, balance, opening })
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${rows.length} dealers\n`)
console.log(`  ${'Code'.padEnd(13)} ${'Dealer'.padEnd(28)} ${'Stored due'.padStart(12)} ${'Ledger'.padStart(12)}  Change`)
for (const { customer, stored, balance, opening } of rows) {
  const change = [balance !== stored ? `due ${money(stored)} → ${money(balance)}` : '', opening].filter(Boolean).join('; ') || 'none'
  console.log(`  ${String(customer.code ?? '').padEnd(13)} ${String(customer.name).padEnd(28)} ${money(stored).padStart(12)} ${money(balance).padStart(12)}  ${change}`)
}

if (!APPLY) {
  console.log(`\n${Object.keys(updates).length} write(s) planned. Nothing written. Run with --apply --backup <dir> to save them.`)
  process.exit(0)
}

mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `recompute-dues-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ erp, portal }, null, 2))
console.log(`\nBackup of erp and portal written to ${backupFile}`)
if (Object.keys(updates).length) await db.ref().update(updates)
console.log(`Saved ${Object.keys(updates).length} write(s).`)
process.exit(0)
