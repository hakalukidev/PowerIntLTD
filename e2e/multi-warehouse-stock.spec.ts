import { expect, test, type Locator, type Page } from '@playwright/test'
import { increment } from 'firebase/database'
import * as XLSX from 'xlsx'

import { ADMIN_EMAIL, loginAsAdmin } from './auth'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins, keepAdminSignedIn, openApprovalsAs, reviewOnCard } from './support/approvals'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'
import { businessDay, planStockMoves, stockMove, warehouseStock, withStockHistory } from '../src/lib/erp/stock'
import type { ProductRecord, StockMovementRecord, WarehouseRecord } from '../src/lib/erp/types'

/**
 * Prompt 25: stock is kept per warehouse. Receive purchase splits the quantity over warehouses,
 * Transfer stock moves it between them after both approvals, an approved order holds stock until
 * its delivery is posted from a warehouse that has it, and a cancelling status gives it back.
 *
 * Seeds two run-unique warehouses, a supplier, a product and two dealers; the admin works through
 * the forms and the seeded Authorizer and Chairman approve. Everything is removed afterwards.
 *
 * Prompt 27: each of those actions writes exactly one stock history row per warehouse it changes,
 * with the warehouse's count after it (TC-25.1–25.4 check the rows, TC-27.x the screens).
 */

const stamp = Date.now()
const tag = `E2E25 ${stamp}`
const ids = {
  dhaka: `e2e25_wh_dhaka_${stamp}`,
  ctg: `e2e25_wh_ctg_${stamp}`,
  supplier: `e2e25_supplier_${stamp}`,
  product: `e2e25_product_${stamp}`,
  dealer: `e2e25_dealer_${stamp}`,
  depotDealer: `e2e25_dealer_depot_${stamp}`,
  order: `e2e25_order_${stamp}`,
  orderRequest: `e2e25_order_request_${stamp}`,
  approvalRequest: `e2e25_approval_request_${stamp}`,
  cancelStatus: `e2e25_cancelled_${stamp}`,
}
const names = {
  dhaka: `${tag} Dhaka`,
  ctg: `${tag} Chattogram`,
  supplier: `${tag} Supplier`,
  product: `${tag} Battery`,
  dealer: `${tag} Dealer`,
  depotDealer: `${tag} Depot Dealer`,
  cancelStatus: `E2E Cancelled ${stamp}`,
}
const deliveryBill = `E2E25-DEL-${stamp}`
const approvalBill = `E2E25-APR-${stamp}`

type Stored = Record<string, Record<string, unknown>>
type StoredProduct = { stockQty: number; reservedQty?: number; stockByWarehouse?: Record<string, number> }

let db: AdminDb
let adminUid = ''
let statusesBefore: Record<string, unknown> | null = null

async function product() {
  return (await db.read<StoredProduct>(`erp/products/${ids.product}`))!
}

type HistoryRow = Pick<StockMovementRecord, 'type' | 'warehouseId' | 'change' | 'balance'>

/** This run's product's stock history rows (optionally only some), as type, warehouse, change and balance. */
async function history(only: (row: StockMovementRecord) => boolean = () => true): Promise<HistoryRow[]> {
  const rows = Object.values((await db.read<Record<string, StockMovementRecord>>('stockMovements')) ?? {})
  return rows
    .filter((row) => row.productId === ids.product && only(row))
    .map(({ type, warehouseId, change, balance }) => ({ type, warehouseId, change, balance }))
}

async function stock() {
  const stored = await product()
  return { dhaka: stored.stockByWarehouse?.[ids.dhaka] ?? 0, ctg: stored.stockByWarehouse?.[ids.ctg] ?? 0, available: stored.stockQty, held: stored.reservedQty ?? 0 }
}

function stubAlerts(page: Page) {
  return page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
}

async function pickOption(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** The Warehouse | Qty row `index` (0-based) of the allocation rows in `scope`. */
function allocationRow(scope: Locator, index: number) {
  return { warehouse: scope.getByRole('combobox', { name: `Warehouse ${index + 1}` }), quantity: scope.getByLabel(`Quantity ${index + 1}`, { exact: true }) }
}

test.describe('Stock movements (pure)', () => {
  const warehouses: Record<string, WarehouseRecord> = {
    a: { id: 'a', name: 'Dhaka', location: '' } as WarehouseRecord,
    b: { id: 'b', name: 'Chattogram', location: '' } as WarehouseRecord,
  }
  const base = { id: 'p', name: 'Battery', minStock: 2, warehouseId: 'a' } as ProductRecord
  const ref = { kind: 'order' as const, id: 'o', label: 'INV-1' }
  const date = '2026-10-22T00:00:00.000Z'
  const now = date
  const by = { id: 'u', name: 'Tester' }

  test('TC-25.0 reserve, delivery, reversal, release and transfer keep shelves − held = available', () => {
    const products = { p: { ...base, stockQty: 20, reservedQty: 0, stockByWarehouse: { a: 12, b: 8 } } }
    // Order approved for 10: held, no warehouse yet.
    const reserve = planStockMoves(products, [stockMove('reserve', 'p', 10, { date, ref })], { now, warehouses, by })
    expect(reserve.after.get('p')).toEqual({ stockQty: 10, reservedQty: 10, byWarehouse: { a: 12, b: 8 } })
    expect(reserve.updates['products/p/stockQty']).toEqual(increment(-10))
    expect(reserve.updates['products/p/reservedQty']).toEqual(increment(10))
    expect(reserve.updates['products/p/stockByWarehouse/a']).toBeUndefined()

    // Posted from Chattogram (8) is refused; from Dhaka (12) it leaves the shelf and is no longer held.
    const held = { p: { ...products.p, stockQty: 10, reservedQty: 10 } }
    expect(() => planStockMoves(held, [stockMove('delivery', 'p', 10, { warehouseId: 'b', date, ref })], { now, warehouses, by })).toThrow('Only 8 of Battery in Chattogram.')
    const delivered = planStockMoves(held, [stockMove('delivery', 'p', 10, { warehouseId: 'a', date, ref })], { now, warehouses, by })
    expect(delivered.after.get('p')).toEqual({ stockQty: 10, reservedQty: 0, byWarehouse: { a: 2, b: 8 } })
    expect(delivered.updates['products/p/stockQty']).toBeUndefined()

    // Moving that delivery to Chattogram: back into Dhaka, out of Chattogram; refused for 10 (only 8 there).
    const after = { p: { ...held.p, reservedQty: 0, stockByWarehouse: { a: 2, b: 8 } } }
    const moved = [stockMove('delivery_reversed', 'p', 10, { warehouseId: 'a', date, ref }), stockMove('delivery', 'p', 10, { warehouseId: 'b', date, ref })]
    expect(() => planStockMoves(after, moved, { now, warehouses, by })).toThrow('Only 8 of Battery in Chattogram.')

    // Released: can be sold again.
    const released = planStockMoves(held, [stockMove('release', 'p', 10, { date, ref })], { now, warehouses, by })
    expect(released.after.get('p')).toEqual({ stockQty: 20, reservedQty: 0, byWarehouse: { a: 12, b: 8 } })

    // Transfer: the total does not change; more than is there is refused.
    const transfer = (quantity: number) => [
      stockMove('transfer_out', 'p', quantity, { warehouseId: 'a', date, ref }),
      stockMove('transfer_in', 'p', quantity, { warehouseId: 'b', date, ref }),
    ]
    expect(planStockMoves(products, transfer(5), { now, warehouses, by }).after.get('p')).toEqual({ stockQty: 20, reservedQty: 0, byWarehouse: { a: 7, b: 13 } })
    expect(() => planStockMoves(products, transfer(13), { now, warehouses, by })).toThrow('Only 12 of Battery in Dhaka.')
  })

  test('TC-27.0 one history row per warehouse a move changes, with its count after; none for reserve and release', () => {
    const products = { p: { ...base, stockQty: 0, reservedQty: 0, stockByWarehouse: {} } }
    const purchase = { kind: 'purchase' as const, id: 'pu', label: 'Battery from Supplier' }
    const received = planStockMoves(
      products,
      [stockMove('purchase', 'p', 12, { warehouseId: 'a', date: '2026-10-20', ref: purchase }), stockMove('purchase', 'p', 8, { warehouseId: 'b', date: '2026-10-20', ref: purchase })],
      { now, warehouses, by }
    )
    const rows = Object.values(received.movements)
    expect(rows.map(({ type, warehouseId, change, balance }) => ({ type, warehouseId, change, balance }))).toEqual([
      { type: 'purchase', warehouseId: 'a', change: 12, balance: 12 },
      { type: 'purchase', warehouseId: 'b', change: 8, balance: 8 },
    ])
    expect(rows[0]).toMatchObject({
      date: '2026-10-20', productId: 'p', productName: 'Battery', warehouseName: 'Dhaka', refKind: 'purchase', refId: 'pu', refLabel: 'Battery from Supplier',
      byId: 'u', byName: 'Tester', createdAt: now, productDay: 'p|2026-10-20', warehouseDay: 'a|2026-10-20',
    })
    expect(rows.every((row) => received.movements[row.id] === row)).toBe(true)
    expect(rows[0].id < rows[1].id, 'ids sort in the order written').toBe(true)

    // Written with the change, at the database root.
    const root = withStockHistory({ ...received.updates, 'purchases/pu': { id: 'pu' } }, received.movements)
    expect(root['erp/purchases/pu']).toEqual({ id: 'pu' })
    expect(root['erp/products/p/stockByWarehouse/a']).toEqual(increment(12))
    expect(root[`stockMovements/${rows[0].id}`]).toBe(rows[0])

    const split = { p: { ...base, stockQty: 20, reservedQty: 0, stockByWarehouse: { a: 12, b: 8 } } }
    const brief = (result: ReturnType<typeof planStockMoves>) => Object.values(result.movements).map(({ type, warehouseId, change, balance }) => ({ type, warehouseId, change, balance }))
    const transfer = { kind: 'transfer' as const, id: 't', label: 'Dhaka → Chattogram' }
    expect(brief(planStockMoves(split, [
      stockMove('transfer_out', 'p', 5, { warehouseId: 'a', date, ref: transfer }),
      stockMove('transfer_in', 'p', 5, { warehouseId: 'b', date, ref: transfer }),
    ], { now, warehouses, by }))).toEqual([
      { type: 'transfer_out', warehouseId: 'a', change: -5, balance: 7 },
      { type: 'transfer_in', warehouseId: 'b', change: 5, balance: 13 },
    ])

    // Reserve and release change no warehouse: no rows.
    expect(planStockMoves(split, [stockMove('reserve', 'p', 10, { date, ref })], { now, warehouses, by }).movements).toEqual({})
    const held = { p: { ...split.p, stockQty: 10, reservedQty: 10 } }
    expect(planStockMoves(held, [stockMove('release', 'p', 10, { date, ref })], { now, warehouses, by }).movements).toEqual({})

    // A delivery is a sale; moving it to another warehouse is a return into the first and a sale from the second.
    expect(brief(planStockMoves(held, [stockMove('delivery', 'p', 10, { warehouseId: 'a', date, ref })], { now, warehouses, by }))).toEqual([
      { type: 'sale', warehouseId: 'a', change: -10, balance: 2 },
    ])
    const delivered = { p: { ...held.p, reservedQty: 0, stockByWarehouse: { a: 2, b: 18 } } }
    expect(brief(planStockMoves(delivered, [
      stockMove('delivery_reversed', 'p', 10, { warehouseId: 'a', date, ref }),
      stockMove('delivery', 'p', 10, { warehouseId: 'b', date, ref }),
    ], { now, warehouses, by }))).toEqual([
      { type: 'return', warehouseId: 'a', change: 10, balance: 12 },
      { type: 'sale', warehouseId: 'b', change: -10, balance: 8 },
    ])

    // An adjustment shows as damage when that is its reason; two moves on one warehouse keep a running balance.
    const adjustment = { kind: 'adjustment' as const, id: 'ad', label: 'Damage' }
    expect(brief(planStockMoves(split, [
      stockMove('adjustment', 'p', -2, { warehouseId: 'a', date, ref: adjustment, reason: 'damage' }),
      stockMove('adjustment', 'p', 3, { warehouseId: 'a', date, ref: adjustment, reason: 'count_correction' }),
    ], { now, warehouses, by }))).toEqual([
      { type: 'damage', warehouseId: 'a', change: -2, balance: 10 },
      { type: 'adjustment', warehouseId: 'a', change: 3, balance: 13 },
    ])

    // Business dates: a form date as it is; a stored time as its local day.
    expect(businessDay('2026-10-20')).toBe('2026-10-20')
    const local = new Date(2026, 9, 20, 23, 30)
    expect(businessDay(local.toISOString())).toBe('2026-10-20')
  })

  test('TC-25.0b a product not yet migrated has its stock in its main warehouse and is written in full the first time', () => {
    const legacy = { p: { ...base, stockQty: 30 } }
    expect(warehouseStock(legacy.p)).toEqual({ a: 30 })
    const { updates, after } = planStockMoves(legacy, [stockMove('purchase', 'p', 5, { warehouseId: 'b', date, ref })], { now, warehouses, by })
    expect(updates['products/p/stockByWarehouse/a']).toBe(30)
    expect(updates['products/p/stockByWarehouse/b']).toBe(5)
    expect(after.get('p')?.stockQty).toBe(35)
    // Held before it was migrated: the shelf still has it.
    expect(warehouseStock({ ...base, stockQty: 27, reservedQty: 3 })).toEqual({ a: 30 })
  })
})

test.describe('Stock per warehouse', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    db = await connectAsAdmin()
    const users = (await db.read<Record<string, { id: string; email?: string }>>('erp/users')) ?? {}
    adminUid = Object.values(users).find((user) => user.email === ADMIN_EMAIL)?.id ?? ''
    statusesBefore = await db.read<Record<string, unknown>>('erp/settings/orderStatuses')
    const now = new Date().toISOString()
    await db.update('erp', {
      [`warehouses/${ids.dhaka}`]: { id: ids.dhaka, name: names.dhaka, location: 'E2E' },
      [`warehouses/${ids.ctg}`]: { id: ids.ctg, name: names.ctg, location: 'E2E' },
      [`suppliers/${ids.supplier}`]: {
        id: ids.supplier, name: names.supplier, company: names.supplier, phone: '', email: '', location: '', supplierType: 'local',
        country: 'Bangladesh', currency: 'BDT', createdAt: now, updatedAt: now,
      },
      // A new product, as Add product leaves it: no stock yet.
      [`products/${ids.product}`]: {
        id: ids.product, name: names.product, category: 'E2E', brand: 'E2E', sku: `E2E25-${stamp}`, warehouseId: ids.dhaka,
        supplierId: ids.supplier, purchasePrice: 1000, sellingPrice: 1200, wholesalePrice: 1200, stockQty: 0, reservedQty: 0,
        minStock: 1, maxStock: 0, status: 'out-of-stock', description: '', createdAt: now, updatedAt: now,
      },
      [`customers/${ids.dealer}`]: testDealer(ids.dealer, names.dealer, `01999-${String(stamp).slice(-6)}`, ''),
      [`customers/${ids.depotDealer}`]: { ...testDealer(ids.depotDealer, names.depotDealer, `01998-${String(stamp).slice(-6)}`, ''), ...(await authorizerDealerFields(db)) },
    })
  })

  test.afterAll(async () => {
    if (!db) return
    const ours = Object.values(ids)
    for (const section of ['warehouses', 'suppliers', 'products', 'customers', 'orders', 'orderRequests', 'purchaseRequests', 'purchases', 'stockTransfers', 'stockAdjustments', 'creditLedgerEntries']) {
      const records = (await db.read<Stored>(`erp/${section}`)) ?? {}
      for (const [id, record] of Object.entries(records)) {
        const text = JSON.stringify(record)
        if (ours.includes(id) || text.includes(tag) || ours.some((ourId) => text.includes(ourId))) await db.remove(`erp/${section}/${id}`)
      }
    }
    for (const section of ['activities', 'notifications', 'auditLog']) {
      const records = (await db.read<Stored>(`erp/${section}`)) ?? {}
      for (const [id, record] of Object.entries(records)) {
        const text = JSON.stringify(record)
        if (text.includes(tag) || text.includes(deliveryBill) || text.includes(approvalBill) || ours.some((ourId) => text.includes(ourId))) await db.remove(`erp/${section}/${id}`)
      }
    }
    for (const [id, row] of Object.entries((await db.read<Record<string, StockMovementRecord>>('stockMovements')) ?? {})) {
      if (row.productId === ids.product || Object.values(ids).includes(row.warehouseId)) await db.remove(`stockMovements/${id}`)
    }
    // Only the status this run added; when the list was not saved before, the defaults it had to write too.
    if (statusesBefore) await db.remove(`erp/settings/orderStatuses/${ids.cancelStatus}`)
    else await db.remove('erp/settings/orderStatuses')
    await db.close()
  })

  test.beforeEach(async () => {
    test.skip(!hasApproverLogins(), 'The Authorizer and Chairman test logins are only seeded on the emulators.')
  })

  test('TC-25.1 receiving 20 as 12 + 8 shows 12 and 8 in the warehouse report and 20 in total', async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000)
    await stubAlerts(page)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Receive purchase' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Receive purchase' })
    await dialog.getByRole('combobox').first().click()
    await dialog.getByPlaceholder('Search products...').fill(names.product)
    await dialog.getByRole('button', { name: names.product }).filter({ hasNotText: 'Create product' }).click()
    await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Quantity received$/ }) }).locator('input').fill('20')
    await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Unit cost$/ }) }).locator('input').fill('1000')

    // The first row is the product's main warehouse with the whole quantity; split 8 off to Chattogram.
    const first = allocationRow(dialog, 0)
    await expect(first.warehouse).toHaveText(names.dhaka)
    await expect(first.quantity).toHaveValue('20')
    await first.quantity.fill('12')
    await expect(dialog.locator('[data-allocation-status]')).toHaveText('Allocated 12 of 20')
    await dialog.getByRole('button', { name: 'Split to another warehouse' }).click()
    const second = allocationRow(dialog, 1)
    await expect(second.quantity).toHaveValue('8')
    await pickOption(page, second.warehouse, names.ctg)
    await expect(dialog.locator('[data-allocation-status]')).toHaveText('Allocated 20 of 20')
    await screenshot(page, 'receive-purchase-split', testInfo)
    await dialog.getByRole('button', { name: 'Send for approval' }).click()
    await expect(page.getByText('Purchase sent for approval.')).toBeVisible({ timeout: 20_000 })
    expect(await stock()).toEqual({ dhaka: 0, ctg: 0, available: 0, held: 0 })

    expect(await history(), 'no history before the final approval').toEqual([])
    await approveThroughBothStages(browser, names.supplier, page)
    await expect.poll(stock).toEqual({ dhaka: 12, ctg: 8, available: 20, held: 0 })
    const received = await history()
    expect(received).toHaveLength(2)
    expect(received).toEqual(expect.arrayContaining([
      { type: 'purchase', warehouseId: ids.dhaka, change: 12, balance: 12 },
      { type: 'purchase', warehouseId: ids.ctg, change: 8, balance: 8 },
    ]))

    await navigate(page, '/admin/approvals')
    await page.getByRole('button', { name: /Stock & warehouse/ }).click()
    const report = page.locator('table[data-report="warehouse"]')
    const rowIn = (warehouseId: string) => report.locator(`tr[data-product-id="${ids.product}"][data-row-warehouse="${warehouseId}"] td:not([data-warehouse-id])`)
    await expect(rowIn(ids.dhaka).nth(1)).toHaveText('12')
    await expect(rowIn(ids.ctg).nth(1)).toHaveText('8')
    const newStock = page.locator(`table[data-report="new-stock"] tr`, { hasText: names.product })
    await expect(newStock.locator('[data-cell="warehouses"]')).toHaveText(`${names.dhaka} 12 · ${names.ctg} 8`)
    await rowIn(ids.dhaka).first().scrollIntoViewIfNeeded()
    await screenshot(page, 'warehouse-report-split', testInfo)

    // Inventory list: 20 in total, 12 and 8 by warehouse.
    await navigate(page, '/admin/stock/overview')
    await page.getByPlaceholder('Search inventory...').fill(names.product)
    const row = page.getByRole('row', { name: new RegExp(names.product) })
    await expect(row).toContainText('20 units')
    await expect(row.locator('[data-warehouse-split]')).toContainText(`${names.dhaka} 12`)
    await expect(row.locator('[data-warehouse-split]')).toContainText(`${names.ctg} 8`)
    note(testInfo, 'Received 20 as Dhaka 12 + Chattogram 8: report rows 12 and 8, product total 20; history rows Dhaka +12 (12), Chattogram +8 (8).')
  })

  test('TC-25.2 a transfer of 5 moves stock only after final approval', async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000)
    await stubAlerts(page)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByPlaceholder('Search inventory...').fill(names.product)
    await page.getByRole('row', { name: new RegExp(names.product) }).getByRole('button', { name: 'Transfer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Transfer stock' })
    await expect(dialog.getByRole('combobox', { name: 'From warehouse' })).toContainText(names.dhaka)
    await pickOption(page, dialog.getByRole('combobox', { name: 'To warehouse' }), `${names.ctg} · 8 in stock`)
    await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Quantity$/ }) }).locator('input').fill('5')
    await expect(dialog.getByText('12 in the warehouse it leaves.')).toBeVisible()
    await screenshot(page, 'transfer-stock-dialog', testInfo)
    await dialog.getByRole('button', { name: 'Send for approval' }).click()
    await expect(page.getByText('Transfer sent for approval.')).toBeVisible({ timeout: 20_000 })
    expect(await stock()).toEqual({ dhaka: 12, ctg: 8, available: 20, held: 0 })

    const card = `${names.product} × 5`
    const authorizer = await openApprovalsAs(browser, 'authorizer')
    await authorizer.page.getByRole('button', { name: /^Transfers/ }).click()
    await reviewOnCard(authorizer.page, card, 'Authorize')
    await authorizer.close()
    expect(await stock(), 'nothing moves at the first approval').toEqual({ dhaka: 12, ctg: 8, available: 20, held: 0 })
    const transfers = (row: StockMovementRecord) => row.refKind === 'transfer'
    expect(await history(transfers), 'no history at the first approval').toEqual([])

    const chairman = await openApprovalsAs(browser, 'chairman')
    await chairman.page.setViewportSize({ width: 360, height: 800 })
    await chairman.page.getByRole('button', { name: /^Transfers/ }).click()
    await screenshot(chairman.page, 'mobile-transfer-approval', testInfo)
    await reviewOnCard(chairman.page, card, 'Final approve')
    await chairman.close()
    await keepAdminSignedIn(page)
    await expect.poll(stock).toEqual({ dhaka: 7, ctg: 13, available: 20, held: 0 })
    const moved = await history(transfers)
    expect(moved).toHaveLength(2)
    expect(moved).toEqual(expect.arrayContaining([
      { type: 'transfer_out', warehouseId: ids.dhaka, change: -5, balance: 7 },
      { type: 'transfer_in', warehouseId: ids.ctg, change: 5, balance: 13 },
    ]))
    const audit = Object.values((await db.read<Stored>('erp/auditLog')) ?? {}).filter((entry) => entry.kind === 'stock_transfer' && String(entry.summary).includes(names.product))
    expect(audit).toHaveLength(1)
    note(testInfo, 'Transfer of 5: Dhaka 12 / Chattogram 8 after the Authorizer, Dhaka 7 / Chattogram 13 after the Chairman.')
  })

  test('TC-25.3 a delivery takes stock from the warehouse it is posted from, and only if it has every line', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    // An approved order for 10, as the final approval leaves it: held against the total, no warehouse yet.
    const now = new Date().toISOString()
    const order = {
      id: ids.order, billNumber: deliveryBill, customerId: ids.dealer, customerName: names.dealer, salesPersonId: adminUid, salesPersonName: 'E2E Admin',
      status: 'pending', paymentStatus: 'paid', subtotal: 12_000, discount: 0, total: 12_000, paid: 12_000, due: 0, deliveryDate: '2099-01-02',
      paymentDueDate: '2099-01-03', dueReference: 'owner', courierName: 'Office Delivery', stockState: 'reserved', createdAt: now,
      items: [{ productId: ids.product, productName: names.product, quantity: 10, unitPrice: 1200, purchasePrice: 1000 }],
    }
    await db.update('erp', {
      [`orders/${ids.order}`]: order,
      [`orderRequests/${ids.orderRequest}`]: { ...order, id: ids.orderRequest, orderId: ids.order, status: 'approved', reviewedByName: 'E2E Approver', reviewedAt: now },
      [`products/${ids.product}/stockQty`]: increment(-10),
      [`products/${ids.product}/reservedQty`]: increment(10),
    })
    expect(await stock()).toEqual({ dhaka: 7, ctg: 13, available: 10, held: 10 })

    const employees = (await db.read<Record<string, { name: string; approvalStatus?: string; employmentStatus?: string }>>('erp/employees')) ?? {}
    const deliveryMan = Object.values(employees).find((employee) => employee.approvalStatus === 'approved' && employee.employmentStatus === 'active')
    test.skip(!deliveryMan, 'No approved, active employee to take the delivery.')

    await loginAsAdmin(page)
    await navigate(page, '/admin/delivery')
    await page.getByPlaceholder('Search dealer, bill, delivery man…').fill(deliveryBill)
    const card = page.locator('div').filter({ hasText: deliveryBill }).filter({ has: page.getByRole('button', { name: 'Post' }) }).last()
    await expect(card).toBeVisible({ timeout: 20_000 })
    const [warehouse, man] = [card.getByRole('combobox').nth(0), card.getByRole('combobox').nth(1)]
    await pickOption(page, warehouse, `${names.dhaka} — E2E`)
    await expect(card.locator('[data-warehouse-stock]')).toHaveAttribute('data-warehouse-stock', 'short')
    await expect(card.locator('[data-warehouse-stock]')).toContainText(`${names.product} 7/10`)
    await man.click()
    await page.getByPlaceholder('Search name...').fill(deliveryMan!.name)
    await page.getByRole('button', { name: deliveryMan!.name }).first().click()
    await card.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText(`Only 7 of ${names.product} in ${names.dhaka}.`)).toBeVisible({ timeout: 20_000 })
    expect(await stock(), 'a refused post moves nothing').toEqual({ dhaka: 7, ctg: 13, available: 10, held: 10 })
    const ofDelivery = (row: StockMovementRecord) => row.refLabel === deliveryBill
    expect(await history(ofDelivery), 'a refused post writes no history').toEqual([])
    await screenshot(page, 'delivery-not-enough-in-warehouse', testInfo)

    await pickOption(page, warehouse, `${names.ctg} — E2E`)
    await expect(card.locator('[data-warehouse-stock]')).toHaveAttribute('data-warehouse-stock', 'ok')
    await card.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText(`${deliveryBill} posted.`)).toBeVisible({ timeout: 20_000 })
    await expect.poll(stock).toEqual({ dhaka: 7, ctg: 3, available: 10, held: 0 })
    expect((await db.read<{ stockState: string }>(`erp/orders/${ids.order}`))?.stockState).toBe('delivered')
    expect(await history(ofDelivery)).toEqual([{ type: 'sale', warehouseId: ids.ctg, change: -10, balance: 3 }])

    // Moving the posted delivery to Dhaka (7 there, 10 needed) is refused and moves nothing.
    await page.getByRole('button', { name: /^Posted/ }).click()
    const posted = page.locator('div').filter({ hasText: deliveryBill }).filter({ has: page.locator('input[type="file"]') }).last()
    await pickOption(page, posted.getByRole('combobox').first(), `${names.dhaka} — E2E`)
    await expect(posted.locator('[data-warehouse-stock]')).toHaveAttribute('data-warehouse-stock', 'short')
    await posted.getByRole('button', { name: /Save/ }).click()
    await expect(page.getByText(`Only 7 of ${names.product} in ${names.dhaka}.`)).toBeVisible({ timeout: 20_000 })
    expect(await stock()).toEqual({ dhaka: 7, ctg: 3, available: 10, held: 0 })
    expect(await history(ofDelivery), 'a refused move writes no history').toEqual([{ type: 'sale', warehouseId: ids.ctg, change: -10, balance: 3 }])
    note(testInfo, 'Posting 10 from Dhaka (7) refused; from Chattogram (13) it left 3 there; moving it to Dhaka refused.')
  })

  test('TC-25.4 an approved order holds stock; a cancelling status gives it back and moving out holds it again', async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000)
    const now = new Date().toISOString()
    await db.set(`erp/orderRequests/${ids.approvalRequest}`, {
      id: ids.approvalRequest, customerId: ids.depotDealer, customerName: names.depotDealer, employeeId: '', employeeName: '',
      items: [{ productId: ids.product, productName: names.product, quantity: 2, unitPrice: 1200, purchasePrice: 1000 }],
      subtotal: 2400, discount: 0, total: 2400, paid: 2400, due: 0, orderDate: now, deliveryDate: now, courierName: '', billNumber: approvalBill,
      overCreditLimit: false, zoneId: '', submittedByRole: 'Admin', status: 'pending', submittedById: adminUid, submittedByName: 'E2E Admin', createdAt: now, updatedAt: now,
    })
    await stubAlerts(page)
    await loginAsAdmin(page)
    await approveThroughBothStages(browser, names.depotDealer, page)
    await expect.poll(stock).toEqual({ dhaka: 7, ctg: 3, available: 8, held: 2 })
    const order = Object.values((await db.read<Record<string, { id: string; billNumber: string; stockState?: string }>>('erp/orders')) ?? {}).find((item) => item.billNumber === approvalBill)
    expect(order?.stockState).toBe('reserved')

    // A "Cancelled" status that gives the stock back (written as the admin dialog saves it).
    const statusChanges: Record<string, unknown> = {
      [ids.cancelStatus]: { id: ids.cancelStatus, label: names.cancelStatus, color: 'rose', order: 99, isFinal: true, isDelivered: false, isCancelled: true },
    }
    if (!statusesBefore) {
      Object.assign(statusChanges, {
        pending: { id: 'pending', label: 'Pending', color: 'amber', order: 0, isFinal: false, isDelivered: false },
        ready: { id: 'ready', label: 'Ready', color: 'sky', order: 1, isFinal: false, isDelivered: false },
        shipped: { id: 'shipped', label: 'Shipped', color: 'violet', order: 2, isFinal: false, isDelivered: false },
        completed: { id: 'completed', label: 'Completed', color: 'emerald', order: 3, isFinal: true, isDelivered: true },
        hold: { id: 'hold', label: 'Hold', color: 'rose', order: 4, isFinal: false, isDelivered: false },
      })
    }
    await db.update('erp/settings/orderStatuses', statusChanges)

    await navigate(page, '/admin/sales')
    await page.getByPlaceholder('Search bill, customer, product, sales person').fill(approvalBill)
    await page.getByRole('row', { name: `View invoice ${approvalBill}` }).click()
    const details = page.getByRole('dialog', { name: `Invoice ${approvalBill}` })
    const status = details.getByRole('combobox', { name: 'Order status' })

    // Completed counts as delivered: refused until the delivery is posted.
    await pickOption(page, status, 'Completed')
    await expect(page.getByText(`Post ${approvalBill} for delivery first`)).toBeVisible({ timeout: 20_000 })
    expect(await stock()).toEqual({ dhaka: 7, ctg: 3, available: 8, held: 2 })

    await pickOption(page, status, names.cancelStatus)
    await expect.poll(stock).toEqual({ dhaka: 7, ctg: 3, available: 10, held: 0 })
    expect((await db.read<{ stockState: string }>(`erp/orders/${order!.id}`))?.stockState).toBe('released')

    await pickOption(page, status, 'Pending')
    await expect.poll(stock).toEqual({ dhaka: 7, ctg: 3, available: 8, held: 2 })
    expect((await db.read<{ stockState: string }>(`erp/orders/${order!.id}`))?.stockState).toBe('reserved')
    expect(await history((row) => row.refLabel === approvalBill), 'holding and giving back change no warehouse: no history').toEqual([])
    note(testInfo, 'Approved order of 2: available 10 → 8 (held 2); Cancelled → 10 (held 0); back to Pending → 8 (held 2). Completed refused before posting.')
  })

  test('TC-25.5 opening stock rows, Transfer stock and Stock adjustment fit a 360px phone in dark mode', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 360, height: 800 })
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    const fits = (dialog: Locator) => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)

    // Add product: opening stock split over two warehouses; nothing is saved.
    await page.getByRole('button', { name: 'Add product' }).click()
    const add = page.getByRole('dialog', { name: 'Add product' })
    await allocationRow(add, 0).quantity.fill('12')
    await add.getByRole('button', { name: 'Split to another warehouse' }).click()
    await allocationRow(add, 1).quantity.fill('8')
    await allocationRow(add, 1).quantity.scrollIntoViewIfNeeded()
    expect(await fits(add)).toBe(true)
    await screenshot(page, 'mobile-add-product-opening-split-dark', testInfo)
    await add.getByRole('button', { name: 'Cancel' }).click()

    for (const [button, title, shot] of [
      ['Transfer stock', 'Transfer stock', 'mobile-transfer-stock-dark'],
      ['Stock adjustment', 'Stock adjustment', 'mobile-stock-adjustment-dark'],
    ] as const) {
      await page.getByRole('button', { name: button }).first().click()
      const dialog = page.getByRole('dialog', { name: title })
      await dialog.getByRole('combobox').first().click()
      await page.getByPlaceholder('Search products...').fill(names.product)
      await page.getByRole('button', { name: new RegExp(names.product) }).first().click()
      expect(await fits(dialog)).toBe(true)
      await screenshot(page, shot, testInfo)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
    }

    // The inventory row lists the stock by warehouse.
    await page.getByPlaceholder('Search inventory...').fill(names.product)
    const split = page.getByRole('row', { name: new RegExp(names.product) }).locator('[data-warehouse-split]')
    await split.scrollIntoViewIfNeeded()
    await expect(split).toContainText(`${names.ctg} 3`)
    await screenshot(page, 'mobile-inventory-warehouse-split-dark', testInfo)
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
  })

  /** The rows of the stock history table in `scope`, as shown: type, warehouse, change and balance. */
  async function shownRows(scope: Locator) {
    const rows = scope.locator('[data-stock-history-table] tbody tr[data-movement-id]')
    return rows.evaluateAll((elements) =>
      elements.map((element) => ({
        type: element.getAttribute('data-movement-type'),
        warehouseId: element.getAttribute('data-warehouse-id'),
        change: element.querySelector('[data-cell="change"]')?.textContent,
        balance: element.querySelector('[data-cell="balance"]')?.textContent,
      }))
    )
  }

  // Everything this run did to the product, newest first (TC-25.1–25.3; TC-25.4 wrote nothing).
  const allRows = [
    { type: 'sale', warehouseId: ids.ctg, change: '-10', balance: '3' },
    { type: 'transfer_in', warehouseId: ids.ctg, change: '+5', balance: '13' },
    { type: 'transfer_out', warehouseId: ids.dhaka, change: '-5', balance: '7' },
    { type: 'purchase', warehouseId: ids.ctg, change: '+8', balance: '8' },
    { type: 'purchase', warehouseId: ids.dhaka, change: '+12', balance: '12' },
  ]
  /** The two purchase rows were written together; their order between themselves is not fixed. */
  const sortPurchases = (rows: Array<Record<string, string | null | undefined>>) =>
    [...rows.slice(0, 3), ...rows.slice(3).sort((left, right) => String(right.change).localeCompare(String(left.change)))]

  test('TC-27.1 the Stock history tab lists every movement newest first, filters by type, and exports to Excel', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Stock history', exact: true }).click()
    const tab = page.locator('[data-stock-history]')
    await tab.locator('[data-history-filter="product"]').getByRole('combobox').click()
    await page.getByPlaceholder('Search products...').fill(names.product)
    await page.getByRole('button', { name: new RegExp(names.product) }).first().click()
    await expect(tab.locator('tbody tr[data-movement-id]')).toHaveCount(5)
    expect(sortPurchases(await shownRows(tab))).toEqual(allRows)
    await expect(tab.locator('tbody tr').first()).toContainText(deliveryBill)
    await screenshot(page, 'stock-history-tab', testInfo)

    await pickOption(page, tab.getByRole('combobox', { name: 'Type' }), 'Transfer out')
    await expect(tab.locator('tbody tr[data-movement-id]')).toHaveCount(1)
    expect(await shownRows(tab)).toEqual([allRows[2]])
    await pickOption(page, tab.getByRole('combobox', { name: 'Type' }), 'All types')
    await expect(tab.locator('tbody tr[data-movement-id]')).toHaveCount(5)

    const [download] = await Promise.all([page.waitForEvent('download'), tab.getByRole('button', { name: 'Export Excel' }).click()])
    expect(download.suggestedFilename()).toMatch(/^stock-history-.*\.xlsx$/)
    const workbook = XLSX.readFile(await download.path())
    const sheet = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
    expect(sheet[0]).toEqual(['Date', 'Product', 'Warehouse', 'Type', 'Change', 'Balance after', 'Reference', 'By', 'Recorded at'])
    expect(sheet).toHaveLength(6)
    expect(sheet[1].slice(1, 7)).toEqual([names.product, names.ctg, 'Sale', -10, 3, deliveryBill])
    expect(String(sheet[1][0])).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    note(testInfo, 'History of the run\'s product: 5 rows newest first (sale, transfer in/out, two purchases); "Transfer out" filter leaves 1; Excel export has the same 5 rows.')
  })

  test('TC-27.2 the product details dialog and a warehouse\'s History show the same history, filtered', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByPlaceholder('Search inventory...').fill(names.product)
    await page.getByRole('row', { name: new RegExp(names.product) }).locator('td').first().click()
    const details = page.locator('[data-product-details]')
    await expect(details.locator('[data-stock-history]'), 'not read until asked for').toHaveCount(0)
    await details.getByRole('button', { name: 'Show stock history' }).click()
    await expect(details.locator('tbody tr[data-movement-id]')).toHaveCount(5)
    expect(sortPurchases(await shownRows(details))).toEqual(allRows)
    await details.locator('[data-stock-history]').scrollIntoViewIfNeeded()
    await screenshot(page, 'product-details-stock-history', testInfo)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Warehouse control', exact: true }).click()
    await page.getByRole('row', { name: new RegExp(names.ctg) }).getByRole('button', { name: 'History' }).click()
    const warehouse = page.locator('[data-warehouse-history]')
    await expect(warehouse.getByRole('heading', { name: `${names.ctg} stock history` })).toBeVisible()
    await expect(warehouse.locator('tbody tr[data-movement-id]')).toHaveCount(3)
    expect(await shownRows(warehouse)).toEqual(allRows.filter((row) => row.warehouseId === ids.ctg))
    await screenshot(page, 'warehouse-stock-history', testInfo)
    note(testInfo, 'Product dialog: the same 5 rows once "Show stock history" is clicked. Chattogram\'s History: its 3 rows (sale −10 → 3, transfer in +5 → 13, purchase +8 → 8).')
  })

  test('TC-27.3 the Stock history tab fits a 360px phone in dark mode', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 360, height: 800 })
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Stock history', exact: true }).click()
    const tab = page.locator('[data-stock-history]')
    await tab.locator('[data-history-filter="product"]').getByRole('combobox').click()
    await page.getByPlaceholder('Search products...').fill(names.product)
    await page.getByRole('button', { name: new RegExp(names.product) }).first().click()
    await expect(tab.locator('tbody tr[data-movement-id]')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways page scroll').toBe(true)
    await tab.scrollIntoViewIfNeeded()
    await screenshot(page, 'mobile-stock-history-dark', testInfo)
    await tab.locator('tbody tr').first().scrollIntoViewIfNeeded()
    await screenshot(page, 'mobile-stock-history-table-dark', testInfo)
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
  })
})
