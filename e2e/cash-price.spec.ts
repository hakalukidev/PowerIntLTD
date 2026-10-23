import { expect, type Page, test } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAsAdmin } from './auth'
import { navigate, note, pdfText, screenshot } from './support/evidence'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Task 22: a cash price per product in the Price List, and a Credit / Cash sale type on the Order
 * Form. Cash lines take the cash price (no quantity prices); a product without one keeps the
 * normal price with a warning, and Paid now starts at the payable amount.
 *
 * Runs on a seeded test dealer, two products and an employee; the dealer alert route is stubbed.
 * Two finished orders (one cash, one from before the sale type existed) are seeded straight into
 * the database for the Sales & Billing checks. Everything the run creates is removed afterwards.
 */

let db: AdminDb
const stamp = Date.now()
const dealer = { id: `e2e_dealer_${stamp}`, name: `E2E Cash Dealer ${stamp}` }
// Quantity prices 1+ 13,400 · 5+ 13,200; the cash price is set through the Price List.
const tiered = { id: `e2e_product_cash_${stamp}`, name: `E2E Cash Product ${stamp}`, sku: `E2E-CASH-${stamp}` }
// No cash price: a cash sale keeps its 2,000 general price.
const plain = { id: `e2e_product_plain_${stamp}`, name: `E2E Plain Product ${stamp}`, sku: `E2E-PLAIN-${stamp}` }
const employee = { id: `e2e_employee_${stamp}`, name: `E2E Cash Employee ${stamp}` }

type StoredItem = { productId: string; quantity: number; unitPrice: number; quantityPrice?: boolean; cashPrice?: boolean }
type StoredRequest = { id: string; customerId: string; total: number; paid: number; due: number; status: string; saleType?: string; orderId?: string; items: StoredItem[] }

const seededOrder = (suffix: string, saleType: 'cash' | undefined) => ({
  id: `e2e-cash-order-${suffix}-${stamp}`,
  billNumber: `E2E-CASH-${suffix.toUpperCase()}-${stamp}`,
  customerId: dealer.id,
  customerName: dealer.name,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'pending',
  paymentStatus: 'paid',
  subtotal: 2_000,
  discount: 0,
  total: 2_000,
  // Fully paid with a future due date, so the app never raises an overdue notification for it.
  paid: 2_000,
  due: 0,
  deliveryDate: '2099-01-02',
  paymentDueDate: '2099-01-03',
  dueReference: '',
  createdAt: '2026-10-20T09:00:00.000Z',
  items: [{ productId: plain.id, productName: plain.name, quantity: 1, unitPrice: 2_000, purchasePrice: 0 }],
  ...(saleType ? { saleType } : {}),
})
const cashOrder = seededOrder('c', 'cash')
// From before the sale type existed: no `saleType`, read as credit.
const olderOrder = seededOrder('o', undefined)

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

const quantityInputs = (page: Page) => page.locator('div.space-y-1', { has: page.getByText('Quantity', { exact: true }) }).locator('input')
const linePrice = (page: Page, index: number) => page.getByTestId('line-price').nth(index)
const saleType = (page: Page, label: 'Credit' | 'Cash') => page.getByRole('radio', { name: label, exact: true })

/** Tiered product × 5 and plain product × 2 for the test dealer. */
async function fillOrder(page: Page) {
  await navigate(page, '/admin/order-form')
  await pick(page, 'Select dealer', dealer.name, dealer.name)
  await pick(page, 'Select employee', employee.name, employee.name)
  await pick(page, 'Select product', tiered.sku, tiered.name)
  await quantityInputs(page).nth(0).fill('5')
  await page.getByRole('button', { name: 'Add product' }).click()
  await pick(page, 'Select product', plain.sku, plain.name)
  await quantityInputs(page).nth(1).fill('2')
  await pick(page, 'Choose a courier', 'Office Delivery', 'Office Delivery')
}

function productRecord(product: { id: string; name: string; sku: string }, price: number, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    id: product.id, name: product.name, category: 'E2E', brand: 'E2E', sku: product.sku, warehouseId: '', supplierId: '',
    purchasePrice: 0, sellingPrice: price, wholesalePrice: price, stockQty: 100, minStock: 0, maxStock: 1000,
    status: 'active', description: 'Created by the e2e test; removed automatically.', createdAt: now, updatedAt: now, ...extra,
  }
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  await db.set(`erp/customers/${dealer.id}`, { ...testDealer(dealer.id, dealer.name, '000-E2E-TEST', ''), ...(await authorizerDealerFields(db)), creditLimit: 0 })
  await db.set(
    `erp/products/${tiered.id}`,
    productRecord(tiered, 13_400, { priceTiers: [{ minQty: 1, price: 13_400 }, { minQty: 5, price: 13_200 }], priceTiersUpdatedAt: now })
  )
  await db.set(`erp/products/${plain.id}`, productRecord(plain, 2_000))
  await db.set(`erp/employees/${employee.id}`, {
    id: employee.id, name: employee.name, address: '', phone: '000-E2E-TEST', designation: 'E2E', joiningDate: now, zoneId: '', area: '',
    fatherName: '', motherName: '', dateOfBirth: '', nid: '', experience: '', compensationType: 'salary', approvalStatus: 'approved',
    submittedBy: 'e2e', approvedBy: 'e2e', approvedAt: now, probationMonths: 0, employmentStatus: 'active', baseSalary: 0, taDa: 0,
    daPerDay: 0, houseRent: 0, mobileBill: 0, monthlyUnitTarget: 0, monthlyAmountTarget: 0, commissionPerUnit: 0,
    notes: 'Created by the e2e test; removed automatically.', createdAt: now, updatedAt: now,
  })
  await db.set(`erp/orders/${cashOrder.id}`, cashOrder)
  await db.set(`erp/orders/${olderOrder.id}`, olderOrder)
})

test.afterAll(async () => {
  if (!db) return
  const names = [dealer.name, tiered.name, plain.name, employee.name]
  const requests = await requestsForDealer()
  const orderIds = [cashOrder.id, olderOrder.id, ...requests.map((request) => request.orderId).filter((id): id is string => Boolean(id))]
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
  await db.remove(`erp/products/${tiered.id}`)
  await db.remove(`erp/products/${plain.id}`)
  await db.remove(`erp/employees/${employee.id}`)
  await db.close()
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAsAdmin(page)
})

test('TC-22.1 Price List saves a cash price; emptying it removes it', async ({ page }, testInfo) => {
  await navigate(page, '/admin/price-list')
  const cashBox = (product: { name: string }) => page.getByLabel(`Cash price for ${product.name}`, { exact: true })
  await expect(cashBox(tiered)).toHaveValue('')
  await expect(cashBox(tiered)).toHaveAttribute('placeholder', 'No cash price')

  await cashBox(tiered).fill('12900')
  await cashBox(plain).fill('1900')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Cash prices saved.', { exact: false })).toBeVisible()
  expect(await db.read<number>(`erp/products/${tiered.id}/cashPrice`)).toBe(12_900)
  expect(await db.read<number>(`erp/products/${plain.id}/cashPrice`)).toBe(1_900)
  // The general price and quantity prices are untouched.
  expect(await db.read<number>(`erp/products/${tiered.id}/wholesalePrice`)).toBe(13_400)
  await expect(cashBox(tiered)).toHaveValue('12900')

  await cashBox(plain).fill('')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Cash prices saved.', { exact: false })).toBeVisible()
  await expect.poll(() => db.read(`erp/products/${plain.id}/cashPrice`)).toBeNull()
  await expect(cashBox(plain)).toHaveValue('')

  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('row').filter({ hasText: tiered.sku }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'price-list-cash-price-mobile-dark', testInfo)
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
})

test('TC-22.2 Switching a filled order from Credit to Cash changes every line, and back again', async ({ page }, testInfo) => {
  await fillOrder(page)
  await expect(saleType(page, 'Credit')).toHaveAttribute('aria-checked', 'true')
  await expect(linePrice(page, 0)).toContainText('13,200')
  await expect(page.getByTestId('qty-price-label')).toHaveText('Qty price · 5+ pcs')
  await expect(linePrice(page, 1)).toContainText('2,000')
  await expect(page.getByRole('switch', { name: 'Use quantity prices' })).toBeVisible()
  await expect(page.getByLabel('Paid now', { exact: true })).toHaveCount(0)

  await saleType(page, 'Cash').click()
  await expect(saleType(page, 'Cash')).toHaveAttribute('aria-checked', 'true')
  await expect(linePrice(page, 0)).toContainText('12,900')
  await expect(page.getByTestId('cash-price-label')).toHaveText('Cash price')
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)
  // No cash price: the normal price stays, with a warning.
  await expect(linePrice(page, 1)).toContainText('2,000')
  await expect(page.getByTestId('no-cash-price')).toHaveText('No cash price — normal price')
  await expect(page.getByRole('switch', { name: 'Use quantity prices' })).toHaveCount(0)
  // 12,900 × 5 + 2,000 × 2: the Payment section is open, paid in full.
  await expect(page.getByLabel('Paid now', { exact: true })).toHaveValue('68500')
  // Changing a quantity keeps Paid now on the payable amount until it is typed.
  await quantityInputs(page).nth(1).fill('3')
  await expect(page.getByLabel('Paid now', { exact: true })).toHaveValue('70500')

  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await saleType(page, 'Cash').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'order-form-cash-mobile-dark', testInfo)
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await page.setViewportSize({ width: 1280, height: 900 })

  await saleType(page, 'Credit').click()
  await expect(linePrice(page, 0)).toContainText('13,200')
  await expect(page.getByTestId('qty-price-label')).toHaveText('Qty price · 5+ pcs')
  await expect(linePrice(page, 1)).toContainText('2,000')
  await expect(page.getByTestId('cash-price-label')).toHaveCount(0)
  await expect(page.getByTestId('no-cash-price')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Use quantity prices' })).toBeVisible()
  await expect(page.getByLabel('Paid now', { exact: true })).toHaveCount(0)

  // A Paid now typed on a cash sale is kept when the sale goes back to credit.
  await saleType(page, 'Cash').click()
  await page.getByLabel('Paid now', { exact: true }).fill('50000')
  await saleType(page, 'Credit').click()
  await expect(page.getByLabel('Paid now', { exact: true })).toHaveValue('50000')
})

test('TC-22.3 A cash order is stored as cash on the request and the order, and shown in approvals', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000)
  await fillOrder(page)
  await saleType(page, 'Cash').click()
  // Paid now stays editable: the dealer pays a little less now.
  await page.getByLabel('Paid now', { exact: true }).fill('68000')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })
  // The form starts over on credit.
  await expect(saleType(page, 'Credit')).toHaveAttribute('aria-checked', 'true')

  await expect.poll(async () => (await requestsForDealer()).length).toBe(1)
  const [request] = await requestsForDealer()
  expect(request.saleType).toBe('cash')
  expect(request.items.find((item) => item.productId === tiered.id)).toMatchObject({ quantity: 5, unitPrice: 12_900, cashPrice: true })
  const plainItem = request.items.find((item) => item.productId === plain.id)
  expect(plainItem).toMatchObject({ quantity: 2, unitPrice: 2_000 })
  expect(plainItem?.cashPrice).toBeUndefined()
  expect(plainItem?.quantityPrice).toBeUndefined()
  expect(request).toMatchObject({ total: 68_500, paid: 68_000, due: 500 })

  await navigate(page, '/admin/approvals')
  const card = page.locator('div').filter({ hasText: dealer.name }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).filter({ has: page.getByRole('table') }).last()
  await expect(card.getByTestId('approval-sale-type')).toHaveText('Cash sale', { timeout: 20_000 })
  await expect(card.getByTestId('approval-cash-price')).toHaveText('Cash price')
  await expect(card.getByTestId('approval-no-cash-price')).toHaveText('No cash price')
  await expect(card.getByText('Sale type', { exact: true })).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await screenshot(page, 'approval-card-cash-sale', testInfo)

  if (!hasApproverLogins()) {
    note(testInfo, 'Approver logins not seeded: the approved-order check was skipped.')
    return
  }
  await approveThroughBothStages(browser, dealer.name, page)
  await expect.poll(async () => (await requestsForDealer())[0].orderId).toBeTruthy()
  const order = await db.read<{ saleType?: string; items: StoredItem[]; total: number; paid: number }>(`erp/orders/${(await requestsForDealer())[0].orderId}`)
  expect(order?.saleType).toBe('cash')
  expect(order?.items.find((item) => item.productId === tiered.id)).toMatchObject({ unitPrice: 12_900, cashPrice: true })
  expect(order).toMatchObject({ total: 68_500, paid: 68_000 })
  note(testInfo, `Approved cash order: saleType ${order?.saleType}, total ${order?.total}, paid ${order?.paid}.`)
})

test('TC-22.4 Sales & Billing marks cash sales, filters by sale type, and the invoice and exports show it', async ({ page }, testInfo) => {
  await navigate(page, '/admin/sales')
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(`-${stamp}`)
  const row = (order: { billNumber: string }) => page.getByRole('row', { name: `View invoice ${order.billNumber}` })
  await expect(row(cashOrder)).toBeVisible({ timeout: 20_000 })
  await expect(row(olderOrder)).toBeVisible()
  // Only cash rows carry the badge.
  await expect(row(cashOrder).getByTestId('sale-type-cash')).toHaveText('Cash')
  await expect(row(olderOrder).getByTestId('sale-type-cash')).toHaveCount(0)

  const filter = page.getByRole('combobox', { name: 'Sale type filter' })
  await filter.click()
  await page.getByRole('option', { name: 'Cash', exact: true }).click()
  await expect(row(cashOrder)).toBeVisible()
  await expect(row(olderOrder)).toHaveCount(0)
  await filter.click()
  await page.getByRole('option', { name: 'Credit', exact: true }).click()
  await expect(row(olderOrder)).toBeVisible()
  await expect(row(cashOrder)).toHaveCount(0)
  await filter.click()
  await page.getByRole('option', { name: 'All sale types', exact: true }).click()
  await expect(row(cashOrder)).toBeVisible()

  // Excel: Credit or Cash written on every row.
  const [xlsxDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export data' }).click()])
  const xlsxPath = testInfo.outputPath(xlsxDownload.suggestedFilename())
  await xlsxDownload.saveAs(xlsxPath)
  const [headers, ...rows] = XLSX.utils.sheet_to_json<string[]>(XLSX.readFile(xlsxPath).Sheets.Sales, { header: 1 })
  const column = headers.indexOf('Sale type')
  expect(column).toBeGreaterThanOrEqual(0)
  const exported = Object.fromEntries(rows.map((cells) => [cells[headers.indexOf('Bill')], cells[column]]))
  expect(exported[cashOrder.billNumber]).toBe('Cash')
  expect(exported[olderOrder.billNumber]).toBe('Credit')

  // Full PDF: the same words on each order's line (the header wraps "Sale" and "type" onto two lines).
  const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full PDF' }).click()])
  const pdfPath = testInfo.outputPath(pdfDownload.suggestedFilename())
  await pdfDownload.saveAs(pdfPath)
  const lines = pdfText(pdfPath).split('\n')
  expect(lines.find((line) => line.includes(cashOrder.billNumber))).toMatch(/\sCash\s/)
  expect(lines.find((line) => line.includes(olderOrder.billNumber))).toMatch(/\sCredit\s/)

  // The invoice details and the printed invoice.
  await row(cashOrder).locator('td').nth(1).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Sale type', { exact: true })).toBeVisible()
  await expect(dialog.locator('dd').filter({ hasText: /^Cash$/ })).toHaveCount(1)
  const [popup] = await Promise.all([page.waitForEvent('popup'), dialog.getByRole('button', { name: 'Print' }).click()])
  await popup.waitForLoadState('load')
  await expect(popup.locator('.sale-type')).toHaveText('Sale type: Cash')
  await popup.close()
  await page.keyboard.press('Escape')

  const [olderPopup] = await Promise.all([page.waitForEvent('popup'), row(olderOrder).getByRole('button', { name: `Print invoice ${olderOrder.id}` }).click()])
  await olderPopup.waitForLoadState('load')
  await expect(olderPopup.locator('.sale-type')).toHaveText('Sale type: Credit')
  await olderPopup.close()

  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await filter.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'sales-sale-type-mobile-dark', testInfo)
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
})
