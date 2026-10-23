import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import { devices, expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins, keepAdminSignedIn, openApprovalsAs, reviewOnCard } from './support/approvals'
import { evidencePath, navigate, note, pdfText, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'
import { buildCustomerLedger, reversedOrderIds } from '../src/lib/erp/ledger'
import type { CreditLedgerEntryRecord, ERPData, OrderRecord } from '../src/lib/erp/types'
import { buildDashboardSnapshot, buildUserReport, computeCustomerTotals, countedOrders } from '../src/lib/erp/utils'

/**
 * Cancelling an approved order goes through the Authorizer and the Chairman. Final approval moves
 * the order to the cancelling status, gives its held stock back and writes "Cancelled <bill>" on the
 * dealer's ledger in one write, so the due drops by the bill; what was paid stays as an advance.
 * Bringing it back is the same kind of request. Cancelled orders count in no sales total, and their
 * invoice carries a CANCELLED stamp. scripts/reverse-cancelled-orders.mjs gives orders cancelled
 * before this the same ledger line.
 *
 * Seeds a run-unique warehouse, product, dealer, cancelling status and three orders: one held
 * (not posted), one posted, one already cancelled the old way. Everything is removed afterwards.
 */

const stamp = Date.now()
const tag = `E2EX ${stamp}`
const ids = {
  warehouse: `e2ex_wh_${stamp}`,
  product: `e2ex_product_${stamp}`,
  dealer: `e2ex_dealer_${stamp}`,
  held: `e2ex_order_held_${stamp}`,
  posted: `e2ex_order_posted_${stamp}`,
  legacy: `e2ex_order_legacy_${stamp}`,
  cancelStatus: `e2ex_void_${stamp}`,
}
const cancelLabel = `E2E Void ${stamp}`
const bills = { held: `E2EX-HLD-${stamp}`, posted: `E2EX-PST-${stamp}`, legacy: `E2EX-OLD-${stamp}` }
const dealerName = `${tag} Dealer`

type StoredProduct = { stockQty: number; reservedQty?: number }
type StoredOrder = OrderRecord
type Request = { id: string; orderId: string; action: string; status: string; entryId?: string }

let db: AdminDb
let statusesBefore: Record<string, unknown> | null = null
// Dealer due from the ledger: held 2,400 − 400 paid, posted 1,000, legacy 500.
const DUE_START = 2_000 + 1_000 + 500

function today() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

const money = (text: string) => Number(text.replace(/[^\d.-]/g, ''))

function order(id: string, billNumber: string, extra: Partial<OrderRecord> & Record<string, unknown>) {
  const now = new Date().toISOString()
  return {
    id,
    billNumber,
    customerId: ids.dealer,
    customerName: dealerName,
    salesPersonId: 'e2e',
    salesPersonName: 'E2E Tester',
    status: 'pending',
    paymentStatus: 'unpaid',
    subtotal: 0,
    discount: 0,
    total: 0,
    paid: 0,
    due: 0,
    deliveryDate: '2099-01-02',
    // A future due date, so the app never raises an overdue notification for these.
    paymentDueDate: '2099-01-03',
    dueReference: 'owner',
    createdAt: now,
    items: [],
    ...extra,
  }
}

const heldOrder = order(ids.held, bills.held, {
  paymentStatus: 'partial',
  subtotal: 2_400,
  total: 2_400,
  paid: 400,
  due: 2_000,
  stockState: 'reserved',
  items: [{ productId: ids.product, productName: `${tag} Battery`, quantity: 2, unitPrice: 1_200, purchasePrice: 1_000 }],
})
const postedOrder = order(ids.posted, bills.posted, {
  status: 'shipped',
  subtotal: 1_000,
  total: 1_000,
  due: 1_000,
  stockState: 'delivered',
  items: [{ productId: ids.product, productName: `${tag} Battery`, quantity: 1, unitPrice: 1_000, purchasePrice: 900 }],
  delivery: {
    status: 'posted', warehouseId: ids.warehouse, warehouseName: `${tag} Warehouse`, deliveryManId: 'e2e', deliveryManName: 'E2E Delivery Man',
    courierName: '', trackingNumber: '', vehicle: '', deliveryCharge: 0, note: '', documentUrl: '', documentPublicId: '',
    postedById: 'e2e', postedByName: 'E2E Tester', postedAt: new Date().toISOString(), submittedById: '', submittedByName: '', submittedAt: '',
    updatedAt: new Date().toISOString(),
  },
})
// Cancelled before cancellations needed approval: its bill is still on the dealer's due.
const legacyOrder = order(ids.legacy, bills.legacy, {
  status: ids.cancelStatus,
  subtotal: 500,
  total: 500,
  due: 500,
  stockState: 'released',
  items: [{ productId: ids.product, productName: `${tag} Battery`, quantity: 1, unitPrice: 500, purchasePrice: 400 }],
})

async function stored<T>(section: string, id: string) {
  return db.read<T>(`erp/${section}/${id}`)
}
async function due() {
  return (await db.read<number>(`erp/customers/${ids.dealer}/due`)) ?? 0
}
async function requests() {
  return Object.values((await db.read<Record<string, Request>>('erp/orderCancellationRequests')) ?? {}).filter((request) => request.orderId.includes(String(stamp)))
}
async function reversalLines(orderId: string) {
  return Object.values((await db.read<Record<string, CreditLedgerEntryRecord>>('erp/creditLedgerEntries')) ?? {}).filter((entry) => entry.orderId === orderId)
}

async function openOrder(page: Page, billNumber: string, statusFilter?: string, checkRow?: (row: Locator) => Promise<void>) {
  await navigate(page, '/admin/sales')
  if (statusFilter) {
    await page.getByRole('combobox', { name: 'Status filter' }).click()
    await page.getByRole('option', { name: statusFilter, exact: true }).click()
  }
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(billNumber)
  const row = page.getByRole('row', { name: `View invoice ${billNumber}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  // The open dialog hides the table, so the row is checked first.
  if (checkRow) await checkRow(row)
  await row.getByRole('cell').nth(1).click()
  return page.getByRole('dialog', { name: `Invoice ${billNumber}` })
}

async function pickStatus(page: Page, dialog: Locator, label: string) {
  await dialog.getByRole('combobox', { name: 'Order status' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

// Seeded once for the whole file, so the phone test below still has its order.
test.beforeAll(async () => {
  db = await connectAsAdmin()
  statusesBefore = await db.read<Record<string, unknown>>('erp/settings/orderStatuses')
  const now = new Date().toISOString()
  // A status that cancels the order, written as the admin dialog saves it.
  const statusChanges: Record<string, unknown> = {
    [ids.cancelStatus]: { id: ids.cancelStatus, label: cancelLabel, color: 'rose', order: 98, isFinal: true, isDelivered: false, isCancelled: true },
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
  await db.update('erp', {
    [`warehouses/${ids.warehouse}`]: { id: ids.warehouse, name: `${tag} Warehouse`, location: 'E2E' },
    // 10 on the shelf, 2 of them held for the held order.
    [`products/${ids.product}`]: {
      id: ids.product, name: `${tag} Battery`, category: 'E2E', brand: 'E2E', sku: `E2EX-${stamp}`, warehouseId: ids.warehouse, supplierId: '',
      purchasePrice: 1000, sellingPrice: 1200, wholesalePrice: 1200, stockQty: 8, reservedQty: 2, stockByWarehouse: { [ids.warehouse]: 10 },
      minStock: 1, maxStock: 0, status: 'active', description: '', createdAt: now, updatedAt: now,
    },
    [`customers/${ids.dealer}`]: { ...testDealer(ids.dealer, dealerName, `01997-${String(stamp).slice(-6)}`, ''), ...(await authorizerDealerFields(db)) },
    [`orders/${ids.held}`]: heldOrder,
    [`orders/${ids.posted}`]: postedOrder,
    [`orders/${ids.legacy}`]: legacyOrder,
  })
})

test.afterAll(async () => {
  if (!db) return
  const ours = Object.values(ids)
  for (const section of ['orders', 'orderCancellationRequests', 'creditLedgerEntries', 'products', 'warehouses', 'customers', 'activities', 'notifications', 'auditLog']) {
    const records = (await db.read<Record<string, unknown>>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      const text = JSON.stringify(record)
      if (ours.includes(id) || text.includes(tag) || Object.values(bills).some((bill) => text.includes(bill)) || ours.some((ourId) => text.includes(ourId))) {
        await db.remove(`erp/${section}/${id}`)
      }
    }
  }
  // The script's --only run stays recorded under migrations/, which only the admin SDK can read; the emulator is reseeded each run.
  if (statusesBefore) await db.remove(`erp/settings/orderStatuses/${ids.cancelStatus}`)
  else await db.remove('erp/settings/orderStatuses')
  await db.close()
})

test.describe('Cancelled orders (pure)', () => {
  test('TC-CX.0 cancelled orders count in no total; their ledger line is not removable', () => {
    const settings = { orderStatuses: { pending: { id: 'pending', label: 'Pending', color: 'amber', order: 0, isFinal: false, isDelivered: false }, void: { id: 'void', label: 'Void', color: 'rose', order: 1, isFinal: true, isDelivered: false, isCancelled: true } } }
    const now = new Date().toISOString()
    const base = { customerId: 'c', customerName: 'C', salesPersonId: 'u', salesPersonName: 'U', paymentStatus: 'unpaid', paid: 0, deliveryDate: now, paymentDueDate: now, dueReference: '', createdAt: now } as const
    const live = { ...base, id: 'a', billNumber: 'A', status: 'pending', total: 100, due: 100, items: [{ productId: 'p', productName: 'P', quantity: 1, unitPrice: 100, purchasePrice: 50 }] } as OrderRecord
    const voided = { ...base, id: 'b', billNumber: 'B', status: 'void', total: 300, due: 300, items: [{ productId: 'p', productName: 'P', quantity: 3, unitPrice: 100, purchasePrice: 50 }] } as OrderRecord
    const data = { orders: { a: live, b: voided }, settings, users: { u: { id: 'u', name: 'U', roleId: 'admin' } }, roles: {}, products: {}, purchases: {}, tasks: {}, notifications: {}, activities: {} } as unknown as ERPData

    expect(countedOrders(data).map((entry) => entry.id)).toEqual(['a'])
    expect(buildDashboardSnapshot(data).metrics.todaySales).toBe(100)
    expect(buildDashboardSnapshot(data).orderStatusCounts).toEqual({ pending: 1, void: 1 })
    expect(computeCustomerTotals(data)).toEqual({ c: 100 })
    expect(buildUserReport(data)[0]).toMatchObject({ totalOrders: 1, revenue: 100 })

    const line = { id: 'x', customerId: 'c', customerName: 'C', date: now, particulars: 'Cancelled B', qty: 0, unitPrice: 0, debit: 300, credit: 0, kind: 'order_cancelled', orderId: 'b', billNumber: 'B', createdAt: now } as CreditLedgerEntryRecord
    expect(reversedOrderIds([line])).toEqual(new Set(['b']))
    expect(reversedOrderIds([line, { ...line, id: 'y', kind: 'order_reinstated', debit: 0, credit: 300 }])).toEqual(new Set())
    const rows = buildCustomerLedger('c', [live, voided], [line])
    expect(rows.find((row) => row.id === 'x')).toMatchObject({ billNumber: 'B', removable: false, debit: 300 })
    expect(rows.reduce((sum, row) => sum + row.credit - row.debit, 0)).toBe(100)
  })
})

test.describe('Order cancellation through both approvals', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    test.skip(!hasApproverLogins(), 'The Authorizer and Chairman test logins are only seeded on the emulators.')
  })

  let receivableBefore = 0
  let todaySalesBefore = 0

  test('TC-CX.1 cancelling asks for approval and changes nothing yet; a posted order is refused; a rejection leaves it open', async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await navigate(page, '/admin/dashboard')
    todaySalesBefore = money(await page.getByTestId('kpi-todaySales').innerText())
    await navigate(page, '/admin/sales')
    receivableBefore = money(await page.getByTestId('sales-receivable').innerText())

    // Posted: its goods have left, so it cannot be cancelled.
    let dialog = await openOrder(page, bills.posted)
    await pickStatus(page, dialog, cancelLabel)
    await expect(dialog).toContainText(`${bills.posted} has been posted for delivery`)
    expect(await requests()).toEqual([])
    await page.keyboard.press('Escape')

    dialog = await openOrder(page, bills.held)
    await pickStatus(page, dialog, cancelLabel)
    await expect(dialog.getByRole('status')).toContainText(`Cancelling ${bills.held} was sent for approval`)
    await expect.poll(async () => (await requests()).map((request) => [request.action, request.status])).toEqual([['cancel', 'pending']])
    expect((await stored<StoredOrder>('orders', ids.held))?.status).toBe('pending')
    expect(await stored<StoredProduct>('products', ids.product)).toMatchObject({ stockQty: 8, reservedQty: 2 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('row', { name: `View invoice ${bills.held}` }).getByTestId('cancellation-pending')).toHaveText('Cancellation waits for approval')
    await screenshot(page, 'order-cancellation-pending-row', testInfo)

    // The Authorizer sees the due change and rejects it: the order stays as it was.
    const authorizer = await openApprovalsAs(browser, 'authorizer')
    try {
      await authorizer.page.getByRole('button', { name: /^Cancellations/ }).click()
      const card = authorizer.page.getByTestId(/^order-cancellation-/).filter({ hasText: bills.held })
      await expect(card).toContainText('Dealer due after')
      await expect(card).toContainText('stays on the sheet as the dealer')
      await screenshot(authorizer.page, 'order-cancellation-approval-card', testInfo)
      await reviewOnCard(authorizer.page, `Cancel ${bills.held}`, 'Reject')
    } finally {
      await authorizer.close()
    }
    await keepAdminSignedIn(page)
    expect((await requests()).map((request) => request.status)).toEqual(['rejected'])
    expect((await stored<StoredOrder>('orders', ids.held))?.status).toBe('pending')
    expect(await reversalLines(ids.held)).toEqual([])
    note(testInfo, `Posted ${bills.posted} refused; ${bills.held} cancellation waited for approval with nothing changed, and the Authorizer's rejection left it open.`)
  })

  test('TC-CX.2 final approval cancels it: status, stock and the dealer ledger together; it leaves every total', async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000)
    await loginAsAdmin(page)
    let dialog = await openOrder(page, bills.held)
    await pickStatus(page, dialog, cancelLabel)
    await expect(dialog.getByRole('status')).toContainText('was sent for approval')
    await page.keyboard.press('Escape')

    await approveThroughBothStages(browser, `Cancel ${bills.held}`, page)
    await expect.poll(async () => (await stored<StoredOrder>('orders', ids.held))?.status, { timeout: 20_000 }).toBe(ids.cancelStatus)
    const cancelled = (await stored<StoredOrder>('orders', ids.held))!
    expect(cancelled.stockState).toBe('released')
    expect(cancelled.items.map((item) => item.status)).toEqual([ids.cancelStatus])
    expect(await stored<StoredProduct>('products', ids.product)).toMatchObject({ stockQty: 10, reservedQty: 0 })
    const [line] = await reversalLines(ids.held)
    expect(line).toMatchObject({ kind: 'order_cancelled', particulars: `Cancelled ${bills.held}`, debit: 2_400, credit: 0, billNumber: bills.held })
    // The 400 paid stays on the sheet: the due drops by the whole bill.
    await expect.poll(due, { timeout: 20_000 }).toBe(DUE_START - 2_400)
    const audit = Object.values((await db.read<Record<string, { kind: string; refId: string; decision: string; summary: string }>>('erp/auditLog')) ?? {})
    expect(audit.filter((entry) => entry.kind === 'order_cancellation').map((entry) => entry.decision)).toEqual(expect.arrayContaining(['rejected', 'approved']))

    // Not in the table unless its status is picked, and in no total.
    await navigate(page, '/admin/sales')
    await expect.poll(async () => money(await page.getByTestId('sales-receivable').innerText())).toBe(receivableBefore - 2_000)
    await page.getByPlaceholder('Search bill, customer, product, sales person').fill(bills.held)
    await expect(page.getByText('No sales orders match the current filters.')).toBeVisible()
    dialog = await openOrder(page, bills.held, cancelLabel, async (row) => expect(row).toHaveAttribute('data-cancelled', 'true'))
    await expect(dialog.getByTestId('order-cancelled-banner')).toContainText('paid stays as their advance')
    await screenshot(page, 'order-cancelled-dialog', testInfo)

    // The invoice keeps its number and carries the CANCELLED stamp and status line.
    const [popup] = await Promise.all([page.waitForEvent('popup'), dialog.getByRole('button', { name: 'Print' }).click()])
    await popup.waitForLoadState()
    await expect(popup.locator('[data-cancelled-stamp]')).toHaveText('CANCELLED')
    await expect(popup.locator('.cancelled-line')).toHaveText(`Status: CANCELLED on ${today()}`)
    await expect(popup.locator('.totals .grand')).toHaveText(['Due amountCancelled'])
    await expect(popup.locator('.meta')).toContainText(`No: ${bills.held.replace(/\D/g, '').slice(-8).padStart(8, '0')}`)
    await popup.screenshot({ path: evidencePath('order-cancelled-invoice.png') })
    await popup.close()
    await page.keyboard.press('Escape')

    // Full PDF with the cancelling status picked lists it, but counts it in no total.
    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full PDF' }).click()])
    const pdfPath = testInfo.outputPath(pdfDownload.suggestedFilename())
    await pdfDownload.saveAs(pdfPath)
    expect(pdfText(pdfPath).replace(/\s+/g, ' ')).toContain('1 cancelled, not counted')

    await navigate(page, '/admin/dashboard')
    await expect.poll(async () => money(await page.getByTestId('kpi-todaySales').innerText())).toBe(todaySalesBefore - 2_400)
    note(testInfo, `Final approval: ${bills.held} on "${cancelLabel}", 2 back in stock, "Cancelled ${bills.held}" debit 2,400, dealer due ${DUE_START} → ${DUE_START - 2_400}; receivable −2,000 and today's sales −2,400.`)
  })

  test('TC-CX.3 bringing it back is the same request: status, held stock and the bill return together', async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000)
    await loginAsAdmin(page)
    const dialog = await openOrder(page, bills.held, cancelLabel)
    await pickStatus(page, dialog, 'Pending')
    await expect(dialog.getByRole('status')).toContainText(`Bringing back ${bills.held} was sent for approval`)
    expect((await stored<StoredOrder>('orders', ids.held))?.status).toBe(ids.cancelStatus)
    await page.keyboard.press('Escape')

    await approveThroughBothStages(browser, `Bring back ${bills.held}`, page)
    await expect.poll(async () => (await stored<StoredOrder>('orders', ids.held))?.status, { timeout: 20_000 }).toBe('pending')
    expect((await stored<StoredOrder>('orders', ids.held))?.stockState).toBe('reserved')
    expect(await stored<StoredProduct>('products', ids.product)).toMatchObject({ stockQty: 8, reservedQty: 2 })
    expect((await reversalLines(ids.held)).map((entry) => [entry.kind, entry.debit, entry.credit]).sort()).toEqual([
      ['order_cancelled', 2_400, 0],
      ['order_reinstated', 0, 2_400],
    ])
    await expect.poll(due, { timeout: 20_000 }).toBe(DUE_START)
    note(testInfo, `Brought back: Pending, 2 held again, "Reinstated ${bills.held}" credit 2,400, due back to ${DUE_START}.`)
  })

  test('TC-CX.4 the script lists an order cancelled the old way and, with --apply, takes its bill off the due', async ({}, testInfo) => {
    const run = (...args: string[]) => execFileSync('node', ['scripts/reverse-cancelled-orders.mjs', ...args], { env: process.env, encoding: 'utf8' })
    const willWrite = (output: string) => output.split('Bill still on the due, but posted')[0]

    const dry = run()
    expect(dry).toContain('DRY RUN')
    expect(willWrite(dry)).toContain(ids.legacy)
    expect(willWrite(dry)).not.toContain(ids.held)
    expect(await reversalLines(ids.legacy)).toEqual([])

    // Without a backup folder outside the repository nothing is written.
    expect(() => run('--apply', '--only', ids.legacy)).toThrow()
    const applied = run('--apply', '--only', ids.legacy, '--backup', path.join(os.tmpdir(), 'powerint-e2e-backups'))
    expect(applied).toContain('Wrote 1 "Cancelled" line(s)')
    const [line] = await reversalLines(ids.legacy)
    expect(line).toMatchObject({ kind: 'order_cancelled', debit: 500, particulars: `Cancelled ${bills.legacy}` })
    expect(await due()).toBe(DUE_START - 500)

    expect(willWrite(run())).not.toContain(ids.legacy)
    note(testInfo, `Dry run listed ${bills.legacy}; --apply --only wrote "Cancelled ${bills.legacy}" (debit 500) and the due ${DUE_START} → ${DUE_START - 500}; a second dry run no longer lists it.`)
  })
})

test.describe('Order cancellation on a phone in dark mode', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test.beforeEach(async () => {
    test.skip(!hasApproverLogins(), 'The Authorizer and Chairman test logins are only seeded on the emulators.')
  })

  test('TC-CX.5 the cancellation card and the cancelled order fit 360px in dark mode', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const dialog = await openOrder(page, bills.held)
    await pickStatus(page, dialog, cancelLabel)
    await expect(dialog.getByRole('status')).toContainText('was sent for approval')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await navigate(page, '/admin/approvals')
    await page.getByRole('button', { name: /^Cancellations/ }).click()
    const card = page.getByTestId(/^order-cancellation-/).filter({ hasText: bills.held })
    await expect(card).toBeVisible()
    // The admin submitted it, so they can see it but not review it.
    await expect(card.getByRole('button', { name: /Authorize|Final approve/ })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-dark-order-cancellation-card', testInfo)

    // Leave things as they were: the request goes, and the theme back.
    for (const request of (await requests()).filter((entry) => entry.status === 'pending')) await db.remove(`erp/orderCancellationRequests/${request.id}`)
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })
})
