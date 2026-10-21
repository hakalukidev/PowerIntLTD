import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { partyApproveButton } from './support/approvals'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Task 12: an approved order stores the dealer's previous due and total due, the Sales table's
 * "Total due" column and the invoice show them, and a later payment does not change them.
 *
 * Runs on a seeded test dealer (1,000 due), product and employee, so no real stock, due or ledger
 * changes. The dealer alert route is stubbed. Every record the run creates (requests, orders,
 * deposits, ledger entries, activities, notifications, audit entries) is removed afterwards.
 */

let db: AdminDb
const stamp = Date.now()
const dealer = { id: `e2e_dealer_${stamp}`, name: `E2E Snapshot Dealer ${stamp}` }
const product = { id: `e2e_product_${stamp}`, name: `E2E Snapshot Product ${stamp}`, sku: `E2E-SNAP-${stamp}` }
const employee = { id: `e2e_employee_${stamp}`, name: `E2E Snapshot Employee ${stamp}` }
const depositId = `e2e_deposit_${stamp}`

type StoredRequest = { id: string; customerId: string; status: string; orderId?: string }
type StoredOrder = { id: string; billNumber: string; due: number; previousDue?: number; totalDueAfter?: number }

async function requestsForDealer() {
  const all = (await db.read<Record<string, StoredRequest>>('erp/orderRequests')) ?? {}
  return Object.values(all).filter((request) => request.customerId === dealer.id)
}

/** Opens a Combobox by its current text, searches, and picks the option holding `optionText`. */
async function pick(page: Page, trigger: string, search: string, optionText: string) {
  await page.getByRole('combobox').filter({ hasText: trigger }).first().click()
  await page.keyboard.type(search)
  await page.locator('button:not([role="combobox"])').filter({ hasText: optionText }).first().click()
}

/** Clicks Authorize / Final approve on the dealer's own approval card until `done` holds; `state` is what each click changes. */
async function approveAll(page: Page, state: () => Promise<unknown>, done: () => Promise<boolean>) {
  await navigate(page, '/admin/approvals')
  for (let step = 0; step < 4 && !(await done()); step += 1) {
    const before = JSON.stringify(await state())
    await (await partyApproveButton(page, dealer.name)).click()
    // Final approval creates the order, then writes activity and notifications, before the request changes.
    await expect.poll(async () => JSON.stringify(await state()) !== before, { timeout: 20_000 }).toBe(true)
  }
  await expect.poll(done, { timeout: 20_000 }).toBe(true)
}

async function invoiceHtml(page: Page, order: StoredOrder) {
  await navigate(page, '/admin/sales')
  const row = page.getByRole('row', { name: `View invoice ${order.billNumber}` })
  const [popup] = await Promise.all([page.waitForEvent('popup'), row.getByRole('button', { name: `Print invoice ${order.id}` }).click()])
  await popup.waitForLoadState()
  const html = await popup.content()
  await popup.close()
  return html
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  // A phone number that cannot belong to anyone; the alert route is stubbed as well.
  // The dealer owes 1,000 going in: an opening due line on their sheet, and the due worked out from it.
  await db.set(`erp/customers/${dealer.id}`, { ...testDealer(dealer.id, dealer.name, '000-E2E-TEST', ''), due: 1000, creditLimit: 0 })
  await db.set(`erp/creditLedgerEntries/credit_entry_opening_${dealer.id}`, {
    id: `credit_entry_opening_${dealer.id}`, customerId: dealer.id, customerName: dealer.name, date: '2026-01-01T00:00:00.000Z',
    particulars: 'Opening due', qty: 0, unitPrice: 0, debit: 0, credit: 1000, kind: 'opening', createdAt: now,
  })
  await db.set(`erp/products/${product.id}`, {
    id: product.id, name: product.name, category: 'E2E', brand: 'E2E', sku: product.sku, warehouseId: '', supplierId: '',
    purchasePrice: 1500, sellingPrice: 2450, wholesalePrice: 2450, stockQty: 10, minStock: 0, maxStock: 100,
    status: 'active', description: 'Created by the e2e test; removed automatically.', createdAt: now, updatedAt: now,
  })
  await db.set(`erp/employees/${employee.id}`, {
    id: employee.id, name: employee.name, address: '', phone: '000-E2E-TEST', designation: 'E2E', joiningDate: now, zoneId: '', area: '',
    fatherName: '', motherName: '', dateOfBirth: '', nid: '', experience: '', compensationType: 'salary', approvalStatus: 'approved',
    submittedBy: 'e2e', approvedBy: 'e2e', approvedAt: now, probationMonths: 0, employmentStatus: 'active', baseSalary: 0, taDa: 0,
    daPerDay: 0, houseRent: 0, mobileBill: 0, monthlyUnitTarget: 0, monthlyAmountTarget: 0, commissionPerUnit: 0,
    notes: 'Created by the e2e test; removed automatically.', createdAt: now, updatedAt: now,
  })
})

test.afterAll(async () => {
  if (!db) return
  const names = [dealer.name, product.name, employee.name]
  const requests = await requestsForDealer()
  const orderIds = requests.map((request) => request.orderId).filter((id): id is string => Boolean(id))
  for (const request of requests) await db.remove(`erp/orderRequests/${request.id}`)
  for (const section of ['orders', 'deposits', 'creditLedgerEntries']) {
    const records = (await db.read<Record<string, { customerId?: string }>>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      if (record.customerId === dealer.id) await db.remove(`erp/${section}/${id}`)
    }
  }
  for (const section of ['activities', 'notifications']) {
    const entries = (await db.read<Record<string, { message?: string; title?: string; body?: string }>>(`erp/${section}`)) ?? {}
    for (const [id, entry] of Object.entries(entries)) {
      const text = `${entry.title ?? ''} ${entry.message ?? ''} ${entry.body ?? ''}`
      if (names.some((name) => text.includes(name)) || orderIds.some((orderId) => text.includes(orderId))) await db.remove(`erp/${section}/${id}`)
    }
  }
  const audit = (await db.read<Record<string, { party?: string; refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (entry.party === dealer.name || orderIds.includes(entry.refId ?? '') || entry.refId === depositId) await db.remove(`erp/auditLog/${id}`)
  }
  await db.remove(`erp/customers/${dealer.id}`)
  await db.remove(`erp/products/${product.id}`)
  await db.remove(`erp/employees/${employee.id}`)
  await db.close()
})

test.beforeEach(async ({ page }) => {
  // Approving an order or deposit alerts the dealer by WhatsApp; never let a test send one.
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAsAdmin(page)
})

test('TC-12.1 invoice shows Previous due 1,000 and Total due 3,450, unchanged by a later payment', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  // A 2,450 order on credit for a dealer who already owes 1,000.
  await navigate(page, '/admin/order-form')
  await pick(page, 'Select dealer', dealer.name, dealer.name)
  await pick(page, 'Select employee', employee.name, employee.name)
  await pick(page, 'Select product', product.sku, product.name)
  await pick(page, 'Choose a courier', 'Office Delivery', 'Office Delivery')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })

  await approveAll(page, requestsForDealer, async () => (await requestsForDealer()).some((request) => request.status === 'approved' && request.orderId))
  const [request] = await requestsForDealer()
  const order = (await db.read<StoredOrder>(`erp/orders/${request.orderId}`))!
  expect(order).toMatchObject({ due: 2450, previousDue: 1000, totalDueAfter: 3450 })
  expect((await db.read<{ due: number }>(`erp/customers/${dealer.id}`))?.due).toBe(3450)

  // Sales table: Total due with the order's own due underneath.
  await navigate(page, '/admin/sales')
  const row = page.getByRole('row', { name: `View invoice ${order.billNumber}` })
  await expect(page.getByRole('columnheader', { name: 'Total due' })).toBeVisible()
  await expect(row).toContainText('3,450')
  await expect(row).toContainText('This order: BDT 2,450')

  const before = await invoiceHtml(page, order)
  expect(before).toMatch(/Due amount<\/span><strong>[^<]*2,450/)
  expect(before).toMatch(/Previous due<\/span><strong>[^<]*1,000/)
  expect(before).toMatch(/Total due<\/span><strong>[^<]*3,450/)

  // A later 1,000 payment lowers the dealer's due but not this order's snapshot.
  const now = new Date().toISOString()
  await db.set(`erp/deposits/${depositId}`, {
    id: depositId, customerId: dealer.id, customerName: dealer.name, date: now, amount: 1000, method: 'Cash', note: 'E2E snapshot test',
    status: 'pending', zoneId: '', submittedById: 'e2e', submittedByName: 'E2E Tester', createdAt: now, updatedAt: now,
  })
  const depositState = () => db.read<{ status: string; authorizedAt?: string }>(`erp/deposits/${depositId}`)
  await approveAll(page, depositState, async () => (await depositState())?.status === 'approved')
  expect((await db.read<{ due: number }>(`erp/customers/${dealer.id}`))?.due).toBe(2450)
  expect(await db.read<StoredOrder>(`erp/orders/${order.id}`)).toMatchObject({ due: 2450, previousDue: 1000, totalDueAfter: 3450 })
  // The deposit lands on the credit sheet as a debit (money received), like hand-entered deposits.
  const { entryId } = (await db.read<{ entryId?: string }>(`erp/deposits/${depositId}`)) ?? {}
  expect(await db.read(`erp/creditLedgerEntries/${entryId}`)).toMatchObject({ customerId: dealer.id, debit: 1000, credit: 0 })

  const after = await invoiceHtml(page, order)
  expect(after).toMatch(/Previous due<\/span><strong>[^<]*1,000/)
  expect(after).toMatch(/Total due<\/span><strong>[^<]*3,450/)

  // Phone width, dark mode: the row still shows both figures without the page scrolling sideways.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('row', { name: `View invoice ${order.billNumber}` }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'sales-total-due-mobile-dark', testInfo)
  note(testInfo, `Order ${order.billNumber}: previous due ${order.previousDue}, total due ${order.totalDueAfter}; unchanged after a 1,000 deposit`)
})

test('TC-12.2 an order without the snapshot shows only its own due', async ({ page }) => {
  // Older orders: seeded without previousDue / totalDueAfter and removed by afterAll (same dealer).
  const id = `e2e-old-order-${stamp}`
  const billNumber = `E2E-OLD-${stamp}`
  await db.set(`erp/orders/${id}`, {
    id, billNumber, customerId: dealer.id, customerName: dealer.name, salesPersonId: 'e2e', salesPersonName: 'E2E Tester',
    status: 'pending', paymentStatus: 'unpaid', subtotal: 980, discount: 0, total: 980, paid: 0, due: 980,
    deliveryDate: '2099-01-02', paymentDueDate: '2099-01-03', dueReference: 'owner', createdAt: '2026-10-15T09:00:00.000Z',
    items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 980, purchasePrice: 0 }],
  })
  const html = await invoiceHtml(page, { id, billNumber, due: 980 })
  expect(html).toMatch(/Due amount<\/span><strong>[^<]*980/)
  expect(html).not.toContain('Previous due')
  const row = page.getByRole('row', { name: `View invoice ${billNumber}` })
  await expect(row).toContainText('980')
  await expect(row).not.toContainText('This order:')
})
