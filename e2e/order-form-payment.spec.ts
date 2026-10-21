import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { approveAllThroughBothStages, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Task 10: "New sale" is gone from Sales & Billing; the Order Form has an optional Payment section
 * whose values reach the approved order, and a Print quotation button that saves nothing.
 *
 * Everything runs on a seeded test dealer, product and employee, so no real stock, due or ledger
 * changes. The dealer alert route is stubbed so no WhatsApp or portal message is sent. Every record
 * the run creates (requests, orders, activities, notifications, audit entries) is removed afterwards.
 */

let db: AdminDb
const stamp = Date.now()
const dealer = { id: `e2e_dealer_${stamp}`, name: `E2E Payment Dealer ${stamp}` }
const product = { id: `e2e_product_${stamp}`, name: `E2E Payment Product ${stamp}`, sku: `E2E-PAY-${stamp}` }
const employee = { id: `e2e_employee_${stamp}`, name: `E2E Payment Employee ${stamp}` }
const billNumber = `E2E-BILL-${stamp}`

type StoredRequest = { id: string; customerId: string; total: number; paid: number; due: number; discount?: number; status: string; orderId?: string; billNumber?: string }
type StoredOrder = { id: string; total: number; paid: number; due: number; discount?: number; billNumber: string; dueReference: string; paymentDueDate: string; createdAt: string }

async function requestsForDealer() {
  const all = (await db.read<Record<string, StoredRequest>>('erp/orderRequests')) ?? {}
  return Object.values(all).filter((request) => request.customerId === dealer.id)
}

/** Opens a Combobox by its current text, searches, and picks the option holding `optionText`. */
async function pick(page: Page, trigger: string, search: string, optionText: string) {
  await page.getByRole('combobox').filter({ hasText: trigger }).first().click()
  await page.keyboard.type(search)
  // Combobox entries are plain buttons; the first match is the option, before any "Use …" button.
  await page.locator('button:not([role="combobox"])').filter({ hasText: optionText }).first().click()
}

async function fillOrder(page: Page) {
  await navigate(page, '/admin/order-form')
  await pick(page, 'Select dealer', dealer.name, dealer.name)
  await pick(page, 'Select employee', employee.name, employee.name)
  await pick(page, 'Select product', product.sku, product.name)
  await pick(page, 'Choose a courier', 'Office Delivery', 'Office Delivery')
}

async function submitOrder(page: Page) {
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  // A phone number that cannot belong to anyone; the alert route is stubbed as well.
  // In the seeded Authorizer's depot, so they can authorize the dealer's orders.
  await db.set(`erp/customers/${dealer.id}`, { ...testDealer(dealer.id, dealer.name, '000-E2E-TEST', ''), ...(await authorizerDealerFields(db)), creditLimit: 0 })
  await db.set(`erp/products/${product.id}`, {
    id: product.id, name: product.name, category: 'E2E', brand: 'E2E', sku: product.sku, warehouseId: '', supplierId: '',
    purchasePrice: 6000, sellingPrice: 10_000, wholesalePrice: 10_000, stockQty: 10, minStock: 0, maxStock: 100,
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
  const orders = (await db.read<Record<string, { customerId?: string }>>('erp/orders')) ?? {}
  for (const [id, order] of Object.entries(orders)) {
    if (order.customerId === dealer.id) await db.remove(`erp/orders/${id}`)
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
    if (entry.party === dealer.name || orderIds.includes(entry.refId ?? '')) await db.remove(`erp/auditLog/${id}`)
  }
  await db.remove(`erp/customers/${dealer.id}`)
  await db.remove(`erp/products/${product.id}`)
  await db.remove(`erp/employees/${employee.id}`)
  await db.close()
})

test.beforeEach(async ({ page }) => {
  // Approving an order alerts the dealer by WhatsApp; never let a test send one.
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAsAdmin(page)
})

test('TC-10.1 Sales & Billing has no "New sale"', async ({ page }) => {
  await navigate(page, '/admin/sales')
  await expect(page.getByRole('button', { name: 'Export data' })).toBeVisible()
  await expect(page.getByRole('button', { name: /new sale/i })).toHaveCount(0)
  await expect(page.getByText('Create new sale')).toHaveCount(0)
})

test('TC-10.2 Print quotation uses the form values and saves nothing', async ({ page }) => {
  await fillOrder(page)
  await page.getByLabel('Payment').check()
  await page.locator('div.space-y-2', { has: page.getByText('Discount (') }).locator('input').fill('1000')
  const before = (await requestsForDealer()).length

  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print quotation' }).click()])
  await popup.waitForLoadState()
  const html = await popup.content()
  expect(html).toContain('Quotation')
  expect(html).toContain(dealer.name)
  expect(html).toContain(product.name)
  expect(html).toMatch(/Discount<\/span><strong>[^<]*1,000/)
  expect(html).toMatch(/Payable amount<\/span><strong>[^<]*9,000/)
  await popup.close()

  expect((await requestsForDealer()).length).toBe(before)
})

test('TC-10.3 Payment unchecked puts the whole total on due; checked 5,000 of 10,000 leaves 5,000 due', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000)
  test.skip(!hasApproverLogins(), 'Approvals need the Authorizer and Chairman logins seeded on the emulators.')
  // Order A: Payment left unticked, so its fields are hidden.
  await fillOrder(page)
  await expect(page.getByLabel('Payment')).not.toBeChecked()
  await expect(page.getByText('Paid now (')).toHaveCount(0)
  await submitOrder(page)

  // Order B: 5,000 paid now, bKash collects the rest, with a bill number.
  await fillOrder(page)
  await page.getByLabel('Payment').check()
  await page.locator('div.space-y-2', { has: page.getByText('Paid now (') }).locator('input').fill('5000')
  await page.getByRole('combobox', { name: 'Who collects the due' }).click()
  await page.getByRole('option', { name: 'bKash' }).click()
  await page.getByPlaceholder('Auto-generated if blank').fill(billNumber)
  await expect(page.getByTestId('payment-total')).toContainText('10,000')
  await expect(page.getByTestId('payment-payable')).toContainText('10,000')
  await expect(page.getByTestId('payment-due')).toContainText('5,000')

  // Phone width, dark mode: the Payment card fits without sideways scrolling.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByTestId('payment-due').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'order-form-payment-mobile-dark', testInfo)
  await page.setViewportSize({ width: 1280, height: 800 })
  await submitOrder(page)

  await expect.poll(async () => (await requestsForDealer()).length).toBe(2)
  const pending = await requestsForDealer()
  const requestA = pending.find((request) => request.paid === 0)!
  const requestB = pending.find((request) => request.paid === 5000)!
  expect(requestA).toMatchObject({ total: 10_000, due: 10_000 })
  expect(requestB).toMatchObject({ total: 10_000, due: 5000, billNumber })

  // The admin submitted both, so the Authorizer accepts them and the Chairman gives final approval.
  await approveAllThroughBothStages(browser, dealer.name, 2, page)
  await expect.poll(async () => (await requestsForDealer()).every((request) => request.status === 'approved' && request.orderId)).toBe(true)

  const approved = await requestsForDealer()
  const orderA = await db.read<StoredOrder>(`erp/orders/${approved.find((request) => request.id === requestA.id)!.orderId}`)
  const orderB = await db.read<StoredOrder>(`erp/orders/${approved.find((request) => request.id === requestB.id)!.orderId}`)
  expect(orderA).toMatchObject({ total: 10_000, paid: 0, due: 10_000, dueReference: 'owner' })
  expect(orderB).toMatchObject({ total: 10_000, paid: 5000, due: 5000, dueReference: 'bkash', billNumber })
  const dueDays = Math.round((Date.parse(orderB!.paymentDueDate) - Date.parse(orderB!.createdAt)) / 86_400_000)
  expect(dueDays).toBe(15)

  const storedDealer = await db.read<{ due: number }>(`erp/customers/${dealer.id}`)
  const storedProduct = await db.read<{ stockQty: number }>(`erp/products/${product.id}`)
  expect(storedDealer?.due).toBe(15_000)
  expect(storedProduct?.stockQty).toBe(8)
  note(testInfo, `Order A due ${orderA?.due}; order B paid ${orderB?.paid}, due ${orderB?.due}, ${orderB?.dueReference}, bill ${orderB?.billNumber}`)
})
