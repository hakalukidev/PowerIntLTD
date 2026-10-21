/**
 * Moves app-approved deposits to the debit side of the credit sheet.
 *
 * Until this fix, approving a deposit wrote its ledger entry as a credit, which raised the dealer's
 * ledger balance instead of lowering it (money received is a debit, as on the paper sheets and the
 * hand-entered deposits). The dealer's `due` was always lowered correctly; only the sheet was wrong.
 *
 * An entry is changed only when exactly one entry matches an approved deposit: same dealer, date,
 * amount and "Deposit (method)" text, written at the moment the deposit was approved, and still on
 * the credit side. Anything else is listed and left alone.
 *
 * Usage:
 *   node scripts/fix-deposit-ledger-side.mjs                              # dry run, changes nothing
 *   node scripts/fix-deposit-ledger-side.mjs --apply --backup <dir>       # backs up, then writes
 *   ... --only <entryId,entryId>                                          # limits the fix to these entries
 *
 * --apply first saves erp/creditLedgerEntries, erp/customers and erp/deposits as JSON in <dir>.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const backupIndex = process.argv.indexOf('--backup')
const BACKUP_DIR = backupIndex > -1 ? process.argv[backupIndex + 1] : ''
// --only id,id: fix just these ledger entries (the rest are still listed, as left alone).
const onlyIndex = process.argv.indexOf('--only')
const ONLY = onlyIndex > -1 ? new Set(String(process.argv[onlyIndex + 1] ?? '').split(',').filter(Boolean)) : null
if (APPLY && !BACKUP_DIR) {
  console.error('--apply needs --backup <dir>, so the records can be restored.')
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

const read = async (key) => (await db.ref(`erp/${key}`).get()).val() ?? {}
const [customers, orders, entries, deposits] = await Promise.all([read('customers'), read('orders'), read('creditLedgerEntries'), read('deposits')])

const money = (value) => Number(value || 0).toLocaleString('en-US')
const day = (value) => String(value ?? '').slice(0, 10)

/** The dealer's sheet balance, as buildCustomerLedger + withRunningBalance in src/lib/erp/ledger.ts work it out. */
function ledgerBalance(customerId, entryList) {
  let balance = 0
  for (const order of Object.values(orders)) {
    if (order.customerId !== customerId) continue
    balance += (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
    balance -= Number(order.discount ?? 0) + Number(order.paid ?? 0)
  }
  for (const entry of entryList) {
    if (entry.customerId === customerId) balance += Number(entry.credit ?? 0) - Number(entry.debit ?? 0)
  }
  return balance
}

const fixes = []
const skipped = []
for (const deposit of Object.values(deposits)) {
  if (deposit.status !== 'approved') continue
  const amount = Number(deposit.amount)
  const candidates = deposit.entryId
    ? [entries[deposit.entryId]].filter(Boolean)
    : Object.values(entries).filter(
        (entry) =>
          entry.customerId === deposit.customerId &&
          entry.date === deposit.date &&
          entry.createdAt === deposit.reviewedAt &&
          String(entry.particulars).startsWith(`Deposit (${deposit.method})`) &&
          Math.max(Number(entry.credit), Number(entry.debit)) === amount
      )
  const label = `${deposit.customerName} · ${day(deposit.date)} · ${money(amount)} · deposit ${deposit.id}`
  if (candidates.length !== 1) {
    skipped.push(`${label}: ${candidates.length} matching ledger entries`)
    continue
  }
  const [entry] = candidates
  if (Number(entry.debit) === amount && !Number(entry.credit)) continue
  if (Number(entry.credit) !== amount || Number(entry.debit)) {
    skipped.push(`${label}: entry ${entry.id} has debit ${money(entry.debit)} / credit ${money(entry.credit)}`)
    continue
  }
  if (ONLY && !ONLY.has(entry.id)) {
    skipped.push(`${label}: entry ${entry.id} is on the wrong side but not in --only`)
    continue
  }
  fixes.push({ deposit, entry })
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${fixes.length} ledger entr${fixes.length === 1 ? 'y' : 'ies'} on the wrong side\n`)
for (const { deposit, entry } of fixes) {
  console.log(`  ${deposit.customerName.padEnd(28)} ${day(entry.date)}  ${money(entry.credit).padStart(12)}  entry ${entry.id}  (deposit ${deposit.id})`)
}
if (skipped.length) {
  console.log(`\nLeft alone (check by hand):`)
  for (const line of skipped) console.log(`  ${line}`)
}

const fixedEntries = Object.values(entries).map((entry) => {
  const fix = fixes.find((item) => item.entry.id === entry.id)
  return fix ? { ...entry, debit: Number(entry.credit), credit: 0 } : entry
})
const dealerIds = [...new Set(fixes.map((fix) => fix.deposit.customerId))]
if (dealerIds.length) {
  console.log(`\n  ${'Dealer'.padEnd(28)} ${'Ledger before'.padStart(14)} ${'Ledger after'.padStart(14)} ${'customer.due'.padStart(14)}  Match`)
  for (const id of dealerIds) {
    const before = ledgerBalance(id, Object.values(entries))
    const after = ledgerBalance(id, fixedEntries)
    const due = Number(customers[id]?.due ?? 0)
    console.log(`  ${String(customers[id]?.name ?? id).padEnd(28)} ${money(before).padStart(14)} ${money(after).padStart(14)} ${money(due).padStart(14)}  ${after === due ? 'yes' : `no (${money(after - due)})`}`)
  }
}

if (!APPLY) {
  console.log('\nNothing written. Run with --apply --backup <dir> to fix these entries.')
  process.exit(0)
}

mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `deposit-ledger-side-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ creditLedgerEntries: entries, customers, deposits }, null, 2))
console.log(`\nBackup written to ${backupFile}`)

const updates = {}
for (const { deposit, entry } of fixes) {
  updates[`creditLedgerEntries/${entry.id}/debit`] = Number(entry.credit)
  updates[`creditLedgerEntries/${entry.id}/credit`] = 0
  updates[`deposits/${deposit.id}/entryId`] = entry.id
}
if (Object.keys(updates).length) await db.ref('erp').update(updates)
console.log(`Fixed ${fixes.length} entr${fixes.length === 1 ? 'y' : 'ies'}.`)
process.exit(0)
