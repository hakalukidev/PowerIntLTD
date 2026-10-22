/**
 * Moves each product's single stock count into per-warehouse stock, once.
 *
 * Stock is now kept per warehouse (`stockByWarehouse`), with `reservedQty` for approved orders not
 * yet posted for delivery and `stockQty` as what can still be sold. A product from before that has
 * only `stockQty`, all of it in its main warehouse (`warehouseId`). This writes
 * `stockByWarehouse = { [warehouseId]: stockQty + reservedQty }` and an explicit `reservedQty` for
 * those products. `stockQty` itself is never written, so every product's total is the same after.
 *
 * Skipped and listed: products whose main warehouse no longer exists, and products with stock
 * below zero. Products already split (by this script, or by the app the first time their stock
 * moved) are left alone; the dry run checks they add up.
 *
 * It also lists products that look like the same item entered once per warehouse (same name or
 * same model/SKU). They are not merged.
 *
 * Run it after the code deploy: the old code changes `stockQty` without the warehouse counts, so a
 * product split before then would stop adding up.
 *
 * The first --apply records itself at `migrations/stockByWarehouse`; after that --apply is
 * refused unless --only names the products to split.
 *
 * Usage:
 *   node scripts/migrate-stock-by-warehouse.mjs                                               # live, dry run
 *   node scripts/migrate-stock-by-warehouse.mjs --apply --backup <dir>                        # live, writes
 *   node scripts/migrate-stock-by-warehouse.mjs --apply --only <productId,...> --backup <dir> # those products only, even after the first run
 *   node --env-file=.env.test scripts/migrate-stock-by-warehouse.mjs                          # local emulator
 *
 * <dir> must be outside the repository; the stored products are saved there before anything is written.
 * Live runs read the service account from .env / .env.local, like the other scripts here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MARKER = 'migrations/stockByWarehouse'

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
  console.error('--only needs a comma-separated list of product ids.')
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
const [products, warehouses, marker] = await Promise.all(['erp/products', 'erp/warehouses', MARKER].map(read))

console.log(`${emulator ? 'Emulator' : 'Live'} database: ${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}`)
if (marker?.appliedAt) console.log(`Already applied at ${marker.appliedAt} to ${(marker.products ?? []).length} product(s).`)

const num = (value) => Number(value) || 0
const warehouseName = (id) => warehouses?.[id]?.name ?? `(missing ${id || 'warehouse'})`
const onHand = (product) => Object.values(product.stockByWarehouse ?? {}).reduce((sum, qty) => sum + num(qty), 0)
const allProducts = Object.values(products ?? {}).sort((left, right) => String(left.name).localeCompare(String(right.name)))
if (ONLY) {
  const unknown = ONLY.filter((id) => !products?.[id])
  if (unknown.length) {
    console.error(`Not stored in erp/products: ${unknown.join(', ')}.`)
    process.exit(1)
  }
}

const split = []
const noWarehouse = []
const negative = []
const alreadySplit = []
const offBalance = []
for (const product of allProducts) {
  if (ONLY && !ONLY.includes(product.id)) continue
  const stockQty = num(product.stockQty)
  const reservedQty = num(product.reservedQty)
  if (product.stockByWarehouse) {
    alreadySplit.push(product)
    if (onHand(product) - reservedQty !== stockQty) offBalance.push(product)
    continue
  }
  if (!warehouses?.[product.warehouseId]) noWarehouse.push(product)
  else if (stockQty + reservedQty < 0) negative.push(product)
  else split.push({ product, shelf: stockQty + reservedQty, reservedQty })
}

const row = (product, extra) => `  ${String(product.name ?? '').slice(0, 30).padEnd(30)} ${String(product.sku ?? '').slice(0, 16).padEnd(16)} ${extra}`

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${allProducts.length} products${ONLY ? ` (only ${ONLY.length})` : ''}.\n`)

console.log(`Will split (${split.length}). The total stays the same; it is never written:`)
console.log(`  ${'Product'.padEnd(30)} ${'SKU'.padEnd(16)} ${'Total before'.padStart(12)} ${'Total after'.padStart(12)}  Warehouse`)
for (const { product, shelf, reservedQty } of split) {
  const stockQty = num(product.stockQty)
  console.log(row(product, `${String(stockQty).padStart(12)} ${String(shelf - reservedQty).padStart(12)}  ${warehouseName(product.warehouseId)} ${shelf}${reservedQty ? ` (${reservedQty} held for orders)` : ''}`))
}
if (!split.length) console.log('  none')

console.log(`\nSkipped: main warehouse no longer exists (${noWarehouse.length}). Give them a main warehouse in Edit product, then run with --only:`)
for (const product of noWarehouse) console.log(row(product, `stock ${num(product.stockQty)}, warehouse ${product.warehouseId || '(none)'}`))
if (!noWarehouse.length) console.log('  none')

console.log(`\nSkipped: stock below zero (${negative.length}). Correct them with a stock adjustment first:`)
for (const product of negative) console.log(row(product, `stock ${num(product.stockQty)}`))
if (!negative.length) console.log('  none')

console.log(`\nAlready split (${alreadySplit.length}), ${offBalance.length} of them not adding up (shelves − held ≠ available):`)
for (const product of offBalance) {
  const shelves = Object.entries(product.stockByWarehouse).map(([id, qty]) => `${warehouseName(id)} ${num(qty)}`).join(' · ')
  console.log(row(product, `available ${num(product.stockQty)}, held ${num(product.reservedQty)}, shelves ${shelves}`))
}

// Same item entered once per warehouse: same name (ignoring case and spacing) or same SKU.
const normalise = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const groups = new Map()
for (const product of Object.values(products ?? {})) {
  for (const key of [`name:${normalise(product.name)}`, `sku:${normalise(product.sku)}`]) {
    if (key.endsWith(':')) continue
    groups.set(key, [...(groups.get(key) ?? []), product])
  }
}
const seen = new Set()
const duplicates = [...groups.entries()]
  .filter(([, items]) => items.length > 1)
  .filter(([, items]) => {
    const signature = items.map((item) => item.id).sort().join(',')
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
console.log(`\nLook like the same item entered more than once (${duplicates.length} group(s)). Not merged; review them by hand:`)
for (const [key, items] of duplicates) {
  const [by, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  const sameWarehouse = new Set(items.map((item) => item.warehouseId)).size === 1
  console.log(`  Same ${by === 'name' ? 'name' : 'model/SKU'} "${value}"${sameWarehouse ? ' (same warehouse)' : ' (different warehouses)'}:`)
  for (const item of items) console.log(`    ${String(item.id).padEnd(34)} ${String(item.sku ?? '').padEnd(16)} ${warehouseName(item.warehouseId).padEnd(24)} stock ${num(item.stockQty)}`)
}
if (!duplicates.length) console.log('  none')

if (!split.length) {
  console.log('\nNothing to write.')
  process.exit(0)
}
if (marker?.appliedAt && !ONLY) {
  console.log('\nThe migration was already applied; products split since then were split by the app.')
  if (APPLY) {
    console.error('Not written. Use --only <productId,...> to split named products.')
    process.exit(1)
  }
  process.exit(0)
}
if (!APPLY) {
  console.log(`\nDry run: nothing written. Run again with --apply --backup <dir>${ONLY ? ` --only ${ONLY.join(',')}` : ''} to split ${split.length} product(s).`)
  process.exit(0)
}

const now = new Date().toISOString()
mkdirSync(BACKUP_DIR, { recursive: true })
const backupFile = path.join(BACKUP_DIR, `migrate-stock-by-warehouse-${now.replace(/[:.]/g, '-')}.json`)
writeFileSync(backupFile, JSON.stringify({ products }, null, 2))
console.log(`\nBackup of erp/products written to ${backupFile}`)

const updates = {}
for (const { product, shelf, reservedQty } of split) {
  updates[`erp/products/${product.id}/stockByWarehouse/${product.warehouseId}`] = shelf
  updates[`erp/products/${product.id}/reservedQty`] = reservedQty
}
const ids = split.map(({ product }) => product.id)
if (ONLY) {
  updates[`${MARKER}/onlyRuns/${now.replace(/[:.]/g, '-')}`] = ids
} else {
  updates[`${MARKER}/appliedAt`] = now
  updates[`${MARKER}/products`] = ids
}
await db.ref().update(updates)

// Read back: every product's total is what it was, and its shelves less what is held add up to it.
const after = (await read('erp/products')) ?? {}
const changed = ids.filter((id) => num(after[id]?.stockQty) !== num(products[id].stockQty) || onHand(after[id]) - num(after[id]?.reservedQty) !== num(after[id]?.stockQty))
console.log(`Split ${ids.length} product(s). Totals checked after the write: ${changed.length ? `${changed.length} differ: ${changed.join(', ')}` : 'all identical'}.`)
process.exit(changed.length ? 1 : 0)
