/**
 * Removes the demo dealers created while the system was being tested, with everything that
 * belongs to them, and puts back the stock their demo orders took.
 *
 * The nine dealers below were made in one scripted batch on 2026-09-27 (PIL-CUS-0001 to 0009,
 * seconds apart, phones 01711000001–09, no owner, NID or documents). Banani Power also holds a
 * 1,325,476 test deposit ("xjsrts"). The script checks each record still looks like that before
 * touching it, and stops if anything else in the database points at these dealers.
 *
 * Usage:
 *   node scripts/cleanup-demo-data.mjs                         # dry run, changes nothing
 *   node scripts/cleanup-demo-data.mjs --apply --backup <dir>  # backs up erp and portal, then deletes
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

// [id, name, phone]
const DEMO_DEALERS = [
  ['customer_1790506126516_48hpl1', 'Karim Traders', '01711000001'],
  ['customer_1790506129314_no6ixo', 'Rahman & Co.', '01711000002'],
  ['customer_1790506131837_z4ku6x', 'Alam Brothers', '01711000003'],
  ['customer_1790506134017_0muj3u', 'Sinha Enterprise', '01711000004'],
  ['customer_1790506138748_e292o0', 'Boalia Battery House', '01711000005'],
  ['customer_1790506141664_sagodq', 'Motihar Electric', '01711000006'],
  ['customer_1790506144463_efyhbh', 'Agrabad Auto', '01711000007'],
  ['customer_1790506135999_oy3yl4', 'Banani Power', '01711000008'],
  ['customer_1790507459678_e526jl', 'Mohakhali Traders', '01711000009'],
]
const BANANI_TEST_DEPOSIT = { depositId: 'deposit_1791011194586_bex9ey', entryId: 'credit_entry_1791512880647_a2baoo', note: 'xjsrts', amount: 1325476 }
// Agrabad's pending order was authorized on 2026-10-20 by an e2e run signed in as u_admin; anyone else means a real review.
const AGRABAD = { id: 'customer_1790506144463_efyhbh', requestId: 'order_request_1792427545130_cffrq6', allowedAuthorizer: 'u_admin' }

// Sections whose records belong to a dealer by `customerId`.
const OWNED_SECTIONS = ['orders', 'orderRequests', 'deposits', 'creditLedgerEntries', 'ledgerEntryRequests', 'complaints', 'replacements', 'batteryReports', 'couriers']

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

const fail = (message) => {
  console.error(`STOP: ${message}`)
  process.exit(1)
}
const day = (value) => String(value ?? '').slice(0, 10)

// 1. Each dealer must still be the demo record it was.
const dealers = []
for (const [id, name, phone] of DEMO_DEALERS) {
  const customer = erp.customers?.[id]
  if (!customer) {
    console.log(`  ${name}: already gone`)
    continue
  }
  if (customer.name !== name || customer.phone !== phone || day(customer.createdAt) !== '2026-09-27') {
    fail(`${id} is now "${customer.name}" / ${customer.phone} / ${customer.createdAt}; not the demo record.`)
  }
  dealers.push(customer)
}

const agrabadRequest = erp.orderRequests?.[AGRABAD.requestId]
if (agrabadRequest && agrabadRequest.authorizedById && agrabadRequest.authorizedById !== AGRABAD.allowedAuthorizer) {
  console.log(`  Agrabad Auto kept: its order was authorized by ${agrabadRequest.authorizedByName} (${agrabadRequest.authorizedById}).`)
  dealers.splice(dealers.findIndex((dealer) => dealer.id === AGRABAD.id), 1)
}

const banani = erp.deposits?.[BANANI_TEST_DEPOSIT.depositId]
if (banani && (banani.note !== BANANI_TEST_DEPOSIT.note || banani.amount !== BANANI_TEST_DEPOSIT.amount)) {
  fail(`Banani Power's deposit ${BANANI_TEST_DEPOSIT.depositId} no longer matches the test deposit.`)
}

const ids = new Set(dealers.map((dealer) => dealer.id))
const names = dealers.map((dealer) => dealer.name)

// 2. Everything that belongs to them.
const updates = {}
const deleted = []
const remove = (pathKey, type, label) => {
  updates[pathKey] = null
  deleted.push({ type, path: pathKey, label })
}

for (const dealer of dealers) {
  remove(`erp/customers/${dealer.id}`, 'dealer', `${dealer.code} ${dealer.name}`)
  for (const [commitmentId, commitment] of Object.entries(dealer.commitments ?? {})) {
    deleted.push({ type: 'commitment (inside the dealer)', path: `erp/customers/${dealer.id}/commitments/${commitmentId}`, label: `${dealer.name}: ${commitment.note}` })
  }
}

const orderIds = new Set()
const billNumbers = new Set()
const recordIds = new Set()
for (const section of OWNED_SECTIONS) {
  for (const [id, record] of Object.entries(erp[section] ?? {})) {
    if (!ids.has(record.customerId)) continue
    recordIds.add(id)
    if (section === 'orders') {
      orderIds.add(id)
      if (record.billNumber) billNumbers.add(record.billNumber)
    }
    const label = [record.customerName, record.billNumber, record.particulars, record.amount ?? record.total ?? record.credit ?? record.debit, record.status].filter((part) => part !== undefined && part !== '').join(' · ')
    remove(`erp/${section}/${id}`, section, label)
  }
}

for (const [id, request] of Object.entries(erp.changeRequests ?? {})) {
  if (ids.has(request.targetId) || ids.has(request.input?.customerId) || recordIds.has(request.targetId)) remove(`erp/changeRequests/${id}`, 'changeRequests', request.targetName)
}

// Activities and notifications that name one of these dealers, orders or bills (whole words only).
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = new RegExp(`(^|[^\\w])(${[...names, ...orderIds, ...billNumbers, ...recordIds].map(escape).join('|')})(?![\\w])`)
for (const section of ['activities', 'notifications']) {
  for (const [id, record] of Object.entries(erp[section] ?? {})) {
    const text = `${record.title ?? ''} ${record.message ?? ''} ${record.body ?? ''}`
    if (mentions.test(text)) remove(`erp/${section}/${id}`, section, text.trim().slice(0, 90))
  }
}
for (const [id, entry] of Object.entries(erp.auditLog ?? {})) {
  if (names.includes(entry.party) || recordIds.has(entry.refId)) remove(`erp/auditLog/${id}`, 'auditLog', `${entry.kind} ${entry.decision} · ${entry.party} · ${entry.amount}`)
}

for (const dealer of dealers) {
  const thread = portal.messages?.[`customer__${dealer.id}`]
  if (thread) remove(`portal/messages/customer__${dealer.id}`, 'portal messages', `${dealer.name}: ${Object.keys(thread).length} message(s)`)
}
for (const [id, account] of Object.entries(portal.accounts ?? {})) {
  if (ids.has(account.partyId)) remove(`portal/accounts/${id}`, 'portal account', `${account.partyKind} ${account.partyId}`)
}
for (const key of Object.keys(portal.alerted ?? {})) {
  if (recordIds.has(key.split('__')[1])) remove(`portal/alerted/${key}`, 'portal alert marker', key)
}

// 3. Nothing else may point at these dealers or their records.
const handled = new Set(Object.keys(updates))
const strays = []
function walk(node, at) {
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) walk(value, `${at}/${key}`)
    return
  }
  if (typeof node === 'string' && (ids.has(node) || recordIds.has(node)) && ![...handled].some((pathKey) => at === pathKey || at.startsWith(`${pathKey}/`))) strays.push(`${at} = ${node}`)
}
walk(erp, 'erp')
walk(portal, 'portal')
if (strays.length) fail(`other records point at these dealers:\n  ${strays.join('\n  ')}`)

// 4. Stock the demo orders took goes back, where it was taken from (see planStockMoves in
// src/lib/erp/stock.ts): an order held since approval (`reserved`) stops holding it, one posted
// for delivery (`delivered`) puts it back on that warehouse's shelf, one cancelled (`released`)
// already gave it back. An order from before per-warehouse stock took it off the single count,
// so it goes back there (and into the main warehouse once the product is split).
const stockBack = new Map()
const back = (productId) => {
  if (!stockBack.has(productId)) stockBack.set(productId, { available: 0, reserved: 0, shelves: new Map() })
  return stockBack.get(productId)
}
for (const id of orderIds) {
  const order = erp.orders[id]
  if (order.stockState === 'released') continue
  for (const item of order.items ?? []) {
    const quantity = Number(item.quantity)
    const entry = back(item.productId)
    entry.available += quantity
    if (order.stockState === 'reserved') entry.reserved -= quantity
    else {
      const warehouseId = order.stockState === 'delivered' ? order.delivery?.warehouseId : erp.products?.[item.productId]?.warehouseId
      if (warehouseId) entry.shelves.set(warehouseId, (entry.shelves.get(warehouseId) ?? 0) + quantity)
    }
  }
}
const now = new Date().toISOString()
// The stock put back on a shelf is a `return` in the stock history (stockMovements, see
// src/lib/erp/stock.ts), with the same id shape and the business day in Bangladesh.
const historyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
let historySequence = 0
const stockLines = []
for (const [productId, { available, reserved, shelves }] of stockBack) {
  const product = erp.products?.[productId]
  if (!product) {
    stockLines.push(`  ${productId}: product no longer exists, ${available} not returned`)
    continue
  }
  const stockQty = Number(product.stockQty) + available
  // Same rule as getProductStatus in src/lib/erp/utils.ts.
  const status = stockQty <= 0 ? 'out-of-stock' : stockQty <= Number(product.minStock) ? 'low-stock' : 'active'
  updates[`erp/products/${productId}/stockQty`] = stockQty
  if (reserved) updates[`erp/products/${productId}/reservedQty`] = Math.max(Number(product.reservedQty ?? 0) + reserved, 0)
  // A product not split yet keeps all its stock in the single count.
  if (product.stockByWarehouse) {
    for (const [warehouseId, quantity] of shelves) {
      const balance = Number(product.stockByWarehouse[warehouseId] ?? 0) + quantity
      updates[`erp/products/${productId}/stockByWarehouse/${warehouseId}`] = balance
      const id = `stockmove_${Date.parse(now)}_${String(historySequence++).padStart(3, '0')}_${Math.random().toString(36).slice(2, 8)}`
      updates[`stockMovements/${id}`] = {
        id, date: historyDay, productId, productName: product.name ?? '', warehouseId, warehouseName: erp.warehouses?.[warehouseId]?.name ?? '',
        type: 'return', change: quantity, balance, refKind: 'system', refId: 'cleanup-demo-data', refLabel: 'Demo orders removed',
        byId: 'system', byName: 'Demo data cleanup', createdAt: now, productDay: `${productId}|${historyDay}`, warehouseDay: `${warehouseId}|${historyDay}`,
      }
    }
  }
  updates[`erp/products/${productId}/status`] = status
  updates[`erp/products/${productId}/updatedAt`] = now
  stockLines.push(`  ${product.name} (${productId}): ${product.stockQty} + ${available} = ${stockQty} (${status})`)
}

// Report.
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${dealers.length} demo dealers: ${names.join(', ')}\n`)
const byType = {}
for (const item of deleted) (byType[item.type] ??= []).push(item)
for (const [type, items] of Object.entries(byType)) {
  console.log(`${type} (${items.length})`)
  for (const item of items) console.log(`  ${item.path}  ${item.label ?? ''}`)
}
console.log(`\nStock returned`)
for (const line of stockLines) console.log(line)

if (!APPLY) {
  console.log('\nNothing written. Run with --apply --backup <dir> to delete these records.')
  process.exit(0)
}

mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `demo-cleanup-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ erp, portal }, null, 2))
console.log(`\nBackup of erp and portal written to ${backupFile}`)
await db.ref().update(updates)
console.log(`Deleted ${deleted.filter((item) => !item.type.startsWith('commitment')).length} records and returned stock for ${stockBack.size} product(s).`)
process.exit(0)
