/**
 * Starts the stock history: one `starting_balance` row per product per warehouse, with the
 * warehouse's current count of the product, dated the day it runs. Once.
 *
 * The history (`stockMovements`, outside `erp`) is written by the app with every stock change from
 * the deploy of prompt 27 on. Older movements are not rebuilt: purchases before prompt 25 have no
 * warehouse, orders before it took stock off a single count, and stock used to be edited by hand.
 * This row is the count each warehouse's history starts from instead.
 *
 * Needs per-warehouse stock: run it after scripts/migrate-stock-by-warehouse.mjs --apply (it is
 * refused until that has run). Run it off-hours, right after the deploy, so no stock moves in
 * between. Products not split by warehouse yet, and counts in warehouses that no longer exist,
 * are skipped and listed. Zero counts get no row.
 *
 * The first --apply records itself at `migrations/stockHistoryStartingBalance`; a second --apply is
 * refused.
 *
 * Usage:
 *   node scripts/stock-history-starting-balance.mjs                          # live, dry run
 *   node scripts/stock-history-starting-balance.mjs --apply --backup <dir>   # live, writes
 *   node --env-file=.env.test scripts/stock-history-starting-balance.mjs     # local emulator
 *
 * <dir> must be outside the repository; the stored products and any history rows are saved there
 * before anything is written. Live runs read the service account from .env / .env.local, like the
 * other scripts here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MARKER = 'migrations/stockHistoryStartingBalance'
const STOCK_MARKER = 'migrations/stockByWarehouse'
const HISTORY = 'stockMovements'
const TIME_ZONE = 'Asia/Dhaka'

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
const read = async (ref) => (await db.ref(ref).get()).val()
const [products, warehouses, marker, stockMarker, history] = await Promise.all(['erp/products', 'erp/warehouses', MARKER, STOCK_MARKER, HISTORY].map(read))

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
if (marker?.appliedAt) console.log(`Already applied at ${marker.appliedAt}: ${marker.rows ?? 0} row(s).`)

const num = (value) => Number(value) || 0
const now = new Date()
const nowIso = now.toISOString()
// The business day in Bangladesh, whatever the machine's time zone ('en-CA' formats as YYYY-MM-DD).
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const allProducts = Object.values(products ?? {}).sort((left, right) => String(left.name).localeCompare(String(right.name)))

const rows = []
const notSplit = []
const missingWarehouse = []
for (const product of allProducts) {
  if (!product.stockByWarehouse) {
    if (num(product.stockQty) + num(product.reservedQty) !== 0) notSplit.push(product)
    continue
  }
  const entries = Object.entries(product.stockByWarehouse)
    .map(([warehouseId, qty]) => ({ warehouseId, qty: num(qty) }))
    .filter((entry) => entry.qty !== 0)
    .sort((left, right) => String(warehouses?.[left.warehouseId]?.name ?? '').localeCompare(String(warehouses?.[right.warehouseId]?.name ?? '')))
  for (const { warehouseId, qty } of entries) {
    if (!warehouses?.[warehouseId]) {
      missingWarehouse.push({ product, warehouseId, qty })
      continue
    }
    rows.push({ product, warehouse: warehouses[warehouseId], qty })
  }
}

// Same id shape as the app's rows (src/lib/erp/stock.ts): they sort in the order they were written.
const time = now.getTime()
const record = ({ product, warehouse, qty }, index) => {
  const id = `stockmove_${time}_${String(index).padStart(3, '0')}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    date: today,
    productId: product.id,
    productName: product.name ?? '',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name ?? '',
    type: 'starting_balance',
    change: qty,
    balance: qty,
    refKind: 'system',
    refId: MARKER,
    refLabel: 'Starting balance',
    byId: 'system',
    byName: 'Starting balance',
    createdAt: nowIso,
    productDay: `${product.id}|${today}`,
    warehouseDay: `${warehouse.id}|${today}`,
  }
}

const line = (...cells) => `  ${cells.join(' ')}`
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${allProducts.length} products, starting balance dated ${today}.\n`)

console.log(`Will write (${rows.length} row(s)), one per product per warehouse holding it:`)
console.log(line('Product'.padEnd(30), 'SKU'.padEnd(16), 'Warehouse'.padEnd(26), 'Count'.padStart(7)))
for (const { product, warehouse, qty } of rows) {
  console.log(line(String(product.name ?? '').slice(0, 30).padEnd(30), String(product.sku ?? '').slice(0, 16).padEnd(16), String(warehouse.name ?? '').slice(0, 26).padEnd(26), String(qty).padStart(7)))
}
if (!rows.length) console.log('  none')

console.log(`\nSkipped: not split by warehouse yet (${notSplit.length}). Run scripts/migrate-stock-by-warehouse.mjs for them first:`)
for (const product of notSplit) console.log(line(String(product.name ?? '').slice(0, 30).padEnd(30), String(product.sku ?? '').slice(0, 16).padEnd(16), `stock ${num(product.stockQty)}`))
if (!notSplit.length) console.log('  none')

console.log(`\nSkipped: count in a warehouse that no longer exists (${missingWarehouse.length}). Correct with a stock adjustment:`)
for (const { product, warehouseId, qty } of missingWarehouse) console.log(line(String(product.name ?? '').slice(0, 30).padEnd(30), warehouseId.padEnd(26), String(qty).padStart(7)))
if (!missingWarehouse.length) console.log('  none')

const existing = Object.keys(history ?? {}).length
if (existing) {
  console.log(`\n${existing} history row(s) already written by the app (stock moved since the deploy). The starting balance is today's count, so it lists after them.`)
}

if (!stockMarker?.appliedAt) {
  console.error('\nStock is not split by warehouse yet: run scripts/migrate-stock-by-warehouse.mjs --apply first.')
  process.exit(APPLY ? 1 : 0)
}
if (marker?.appliedAt) {
  if (APPLY) {
    console.error('\nNot written: the starting balance was already written.')
    process.exit(1)
  }
  process.exit(0)
}
if (!rows.length) {
  console.log('\nNothing to write.')
  process.exit(0)
}
if (!APPLY) {
  console.log(`\nDry run: nothing written. Run again with --apply --backup <dir> to write ${rows.length} row(s).`)
  process.exit(0)
}

mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `stock-history-starting-balance-${nowIso.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ products, stockMovements: history ?? {} }, null, 2))
console.log(`\nBackup of erp/products and ${HISTORY} written to ${backupFile}`)

const records = rows.map(record)
const updates = {}
for (const row of records) updates[`${HISTORY}/${row.id}`] = row
updates[`${MARKER}/appliedAt`] = nowIso
updates[`${MARKER}/date`] = today
updates[`${MARKER}/rows`] = records.length
await db.ref().update(updates)

// Read back: every row is there with the count it was written from.
const after = (await read(HISTORY)) ?? {}
const wrong = records.filter((row) => after[row.id]?.balance !== row.balance)
console.log(`Wrote ${records.length} row(s). Checked after the write: ${wrong.length ? `${wrong.length} missing or different: ${wrong.map((row) => row.id).join(', ')}` : 'all present'}.`)
process.exit(wrong.length ? 1 : 0)
