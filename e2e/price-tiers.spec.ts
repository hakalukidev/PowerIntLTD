import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Task 21: quantity prices (tiers) in the Price List, picked by quantity on the Order Form.
 * Ak Power Plus example: 1+ = 13,400, 5+ = 13,200, 10+ = 13,000.
 *
 * Runs on a seeded test dealer, product and employee; the dealer alert route is stubbed. Every
 * record the run creates (requests, orders, activities, notifications, audit entries) is removed afterwards.
 */

let db: AdminDb
const stamp = Date.now()
const dealer = { id: `e2e_dealer_${stamp}`, name: `E2E Tier Dealer ${stamp}` }
const product = { id: `e2e_product_${stamp}`, name: `E2E Tier Product ${stamp}`, sku: `E2E-TIER-${stamp}` }
const employee = { id: `e2e_employee_${stamp}`, name: `E2E Tier Employee ${stamp}` }

type StoredItem = { productId: string; quantity: number; unitPrice: number; quantityPrice?: boolean; tierMinQty?: number }
type StoredRequest = { id: string; customerId: string; total: number; status: string; orderId?: string; items: StoredItem[] }
type StoredProduct = { wholesalePrice: number; priceTiers?: Array<{ minQty: number; price: number }>; priceTiersUpdatedAt?: string }

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

/** The product's row on the Price List's General tab. */
function generalRow(page: Page) {
  return page.getByRole('row').filter({ hasText: product.sku })
}

/** Opens the General tab's quantity price editor for the test product and saves these steps. */
async function saveTiers(page: Page, tiers: Array<[number, number]>) {
  await navigate(page, '/admin/price-list')
  await generalRow(page).getByRole('button', { name: `Quantity prices for ${product.name}` }).click()
  const editor = page.getByTestId(`tiers-${product.id}`)
  await expect(editor).toBeVisible()
  // Start from the two default rows and add the rest.
  while ((await editor.getByLabel(/^Price \d+$/).count()) < tiers.length) await editor.getByRole('button', { name: 'Add step' }).click()
  for (const [index, [minQty, price]] of tiers.entries()) {
    if (index > 0) await editor.getByLabel(`Minimum quantity ${index + 1}`, { exact: true }).fill(String(minQty))
    await editor.getByLabel(`Price ${index + 1}`, { exact: true }).fill(String(price))
  }
  await editor.getByRole('button', { name: 'Save quantity prices' }).click()
  await expect(editor).toHaveCount(0)
}

async function fillOrder(page: Page, quantity: number) {
  await navigate(page, '/admin/order-form')
  await pick(page, 'Select dealer', dealer.name, dealer.name)
  await pick(page, 'Select employee', employee.name, employee.name)
  await pick(page, 'Select product', product.sku, product.name)
  await pick(page, 'Choose a courier', 'Office Delivery', 'Office Delivery')
  await setQuantity(page, quantity)
}

async function setQuantity(page: Page, quantity: number) {
  await page.locator('div.space-y-1', { has: page.getByText('Quantity', { exact: true }) }).locator('input').fill(String(quantity))
}

const linePrice = (page: Page) => page.getByTestId('line-price')

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  await db.set(`erp/customers/${dealer.id}`, { ...testDealer(dealer.id, dealer.name, '000-E2E-TEST', ''), ...(await authorizerDealerFields(db)), creditLimit: 0 })
  await db.set(`erp/products/${product.id}`, {
    id: product.id, name: product.name, category: 'E2E', brand: 'E2E', sku: product.sku, warehouseId: '', supplierId: '',
    purchasePrice: 9000, sellingPrice: 13_400, wholesalePrice: 13_400, stockQty: 100, minStock: 0, maxStock: 1000,
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
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAsAdmin(page)
})

test('TC-21.1 Price List saves quantity prices and rejects bad minimums', async ({ page }, testInfo) => {
  await navigate(page, '/admin/price-list')
  await generalRow(page).getByRole('button', { name: `Quantity prices for ${product.name}` }).click()
  const editor = page.getByTestId(`tiers-${product.id}`)
  // Minimums must go up: 5 then 5 is refused and nothing is saved.
  await editor.getByRole('button', { name: 'Add step' }).click()
  await editor.getByLabel('Minimum quantity 2', { exact: true }).fill('5')
  await editor.getByLabel('Minimum quantity 3', { exact: true }).fill('5')
  await editor.getByRole('button', { name: 'Save quantity prices' }).click()
  await expect(editor.getByText('Minimum quantities must be different and go up row by row.')).toBeVisible()
  expect((await db.read<StoredProduct>(`erp/products/${product.id}`))?.priceTiers).toBeUndefined()
  await editor.getByRole('button', { name: 'Close quantity prices' }).click()

  await saveTiers(page, [[1, 13_400], [5, 13_200], [10, 13_000]])
  const stored = await db.read<StoredProduct>(`erp/products/${product.id}`)
  expect(stored?.priceTiers).toEqual([{ minQty: 1, price: 13_400 }, { minQty: 5, price: 13_200 }, { minQty: 10, price: 13_000 }])
  expect(stored?.wholesalePrice).toBe(13_400)
  expect(stored?.priceTiersUpdatedAt).toBeTruthy()
  await expect(generalRow(page)).toContainText('1+ 13,400 · 5+ 13,200 · 10+ 13,000')
  await expect(generalRow(page)).toContainText('Quantity price')

  // Phone width, dark mode: the editor fits the screen.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await generalRow(page).getByRole('button', { name: `Quantity prices for ${product.name}` }).click()
  await expect(editor).toBeVisible()
  const box = await editor.boundingBox()
  expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'price-list-tiers-mobile-dark', testInfo)
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
})

test('TC-21.2 Order Form picks the price by quantity; the switch turns it off', async ({ page }, testInfo) => {
  await fillOrder(page, 1)
  await expect(linePrice(page)).toContainText('13,400')
  // Below the second step it is the normal price: no label.
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)
  await setQuantity(page, 4)
  await expect(linePrice(page)).toContainText('13,400')
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)
  await setQuantity(page, 5)
  await expect(linePrice(page)).toContainText('13,200')
  await expect(page.getByTestId('qty-price-label')).toHaveText('Qty price · 5+ pcs')
  await setQuantity(page, 12)
  await expect(linePrice(page)).toContainText('13,000')
  await expect(page.getByTestId('qty-price-label')).toHaveText('Qty price · 10+ pcs')

  await page.getByRole('switch', { name: 'Use quantity prices' }).click()
  await expect(linePrice(page)).toContainText('13,400')
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)
  await page.getByRole('switch', { name: 'Use quantity prices' }).click()
  await expect(linePrice(page)).toContainText('13,000')

  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await linePrice(page).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await screenshot(page, 'order-form-qty-price-mobile-dark', testInfo)
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
})

test('TC-21.3 A dealer price saved after the tiers wins; saving the tiers again makes them win', async ({ page }) => {
  await navigate(page, '/admin/price-list')
  await page.getByRole('button', { name: 'One dealer' }).click()
  await pick(page, 'Select dealer', dealer.name, dealer.name)
  const dealerRow = page.getByRole('row').filter({ hasText: product.sku })
  await expect(dealerRow).toContainText('Quantity price')
  await dealerRow.getByPlaceholder('Not set').fill('12500')
  await page.getByRole('button', { name: 'Save dealer prices' }).click()
  await expect(page.getByText(`Prices for ${dealer.name} saved.`)).toBeVisible()
  await expect(dealerRow).toContainText('Dealer price')
  const stamped = await db.read<string>(`erp/customers/${dealer.id}/pricesUpdatedAt/${product.id}`)
  expect(stamped).toBeTruthy()

  await fillOrder(page, 5)
  await expect(linePrice(page)).toContainText('12,500')
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)

  await saveTiers(page, [[1, 13_400], [5, 13_200], [10, 13_000]])
  await fillOrder(page, 5)
  await expect(linePrice(page)).toContainText('13,200')
  await expect(page.getByTestId('qty-price-label')).toBeVisible()
})

test('TC-21.4 Saving the general price keeps the minimum-1 quantity price in step', async ({ page }) => {
  await navigate(page, '/admin/price-list')
  await generalRow(page).getByPlaceholder('Unchanged').fill('13500')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('General prices saved.', { exact: false })).toBeVisible()
  const stored = await db.read<StoredProduct>(`erp/products/${product.id}`)
  expect(stored?.wholesalePrice).toBe(13_500)
  expect(stored?.priceTiers?.[0]).toEqual({ minQty: 1, price: 13_500 })
  expect(stored?.priceTiers?.slice(1)).toEqual([{ minQty: 5, price: 13_200 }, { minQty: 10, price: 13_000 }])
  await expect(generalRow(page)).toContainText('1+ 13,500 · 5+ 13,200 · 10+ 13,000')
})

test('TC-21.5 The order stores the price used; the approval edit re-prices by quantity; later changes leave it alone', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000)
  await fillOrder(page, 5)
  await expect(linePrice(page)).toContainText('13,200')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })

  await expect.poll(async () => (await requestsForDealer()).length).toBe(1)
  const [request] = await requestsForDealer()
  expect(request.items[0]).toMatchObject({ quantity: 5, unitPrice: 13_200, quantityPrice: true, tierMinQty: 5 })
  expect(request.total).toBe(66_000)

  // The approval card shows the quantity price; the admin edits the quantity and the line is priced again.
  await navigate(page, '/admin/approvals')
  const card = page.locator('div').filter({ hasText: dealer.name }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).filter({ has: page.getByRole('table') }).last()
  await expect(card.getByTestId('approval-qty-price')).toHaveText('Qty price · 5+', { timeout: 20_000 })
  await card.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  // Below the second step the line is a normal price, but it still follows the steps back up.
  // TC-21.4 moved the general (minimum-1) price to 13,500.
  await dialog.getByLabel('Quantity', { exact: true }).fill('3')
  await expect(dialog.getByLabel('Unit price', { exact: true })).toHaveValue('13500')
  await expect(dialog.getByText(/Qty price/)).toHaveCount(0)
  await dialog.getByLabel('Quantity', { exact: true }).fill('10')
  await expect(dialog.getByLabel('Unit price', { exact: true })).toHaveValue('13000')
  await expect(dialog.getByText('Qty price · 10+')).toBeVisible()
  await dialog.getByRole('button', { name: /^Save/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await requestsForDealer())[0].items[0]).toMatchObject({ quantity: 10, unitPrice: 13_000, quantityPrice: true, tierMinQty: 10 })

  await screenshot(page, 'approval-card-qty-price', testInfo)

  // Changing the tiers afterwards never changes the stored price.
  await saveTiers(page, [[1, 13_500], [5, 13_100], [10, 12_800]])
  expect((await requestsForDealer())[0].items[0].unitPrice).toBe(13_000)

  if (!hasApproverLogins()) {
    note(testInfo, 'Approver logins not seeded: the approved-order check was skipped.')
    return
  }
  await approveThroughBothStages(browser, dealer.name, page)
  await expect.poll(async () => (await requestsForDealer())[0].orderId).toBeTruthy()
  const order = await db.read<{ items: StoredItem[]; total: number }>(`erp/orders/${(await requestsForDealer())[0].orderId}`)
  expect(order?.items[0]).toMatchObject({ quantity: 10, unitPrice: 13_000, quantityPrice: true, tierMinQty: 10 })
  expect(order?.total).toBe(130_000)
  note(testInfo, `Approved order line: ${JSON.stringify(order?.items[0])}`)
})

test('TC-21.6 A unit price typed by hand in the approval edit stays manual', async ({ page }) => {
  const pending = async () => (await requestsForDealer()).find((request) => request.status === 'pending')
  // Its own quantity prices, saved after any dealer price, so it does not depend on the tests before it.
  await db.update(`erp/products/${product.id}`, {
    priceTiers: [{ minQty: 1, price: 13_400 }, { minQty: 5, price: 13_200 }, { minQty: 10, price: 13_000 }],
    priceTiersUpdatedAt: new Date().toISOString(),
  })
  for (const request of await requestsForDealer()) if (request.status === 'pending') await db.remove(`erp/orderRequests/${request.id}`)
  await fillOrder(page, 5)
  await expect(linePrice(page)).toContainText('13,200')
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => (await pending())?.items[0].quantityPrice).toBe(true)

  await navigate(page, '/admin/approvals')
  const card = page.locator('div').filter({ hasText: dealer.name }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).filter({ has: page.getByRole('table') }).last()
  await card.getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Unit price', { exact: true }).fill('12900')
  await expect(dialog.getByText(/Qty price/)).toHaveCount(0)
  await dialog.getByLabel('Quantity', { exact: true }).fill('12')
  await expect(dialog.getByLabel('Unit price', { exact: true })).toHaveValue('12900')
  await dialog.getByRole('button', { name: /^Save/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await pending())?.items[0]).toMatchObject({ quantity: 12, unitPrice: 12_900 })
  expect((await pending())?.items[0].quantityPrice).toBeUndefined()
  await expect(card.getByTestId('approval-qty-price')).toHaveCount(0)
})

test('TC-21.7 An order below the second step is stored as a normal price', async ({ page }) => {
  for (const request of await requestsForDealer()) if (request.status === 'pending') await db.remove(`erp/orderRequests/${request.id}`)
  await fillOrder(page, 2)
  await expect(linePrice(page)).toContainText('13,400')
  await expect(page.getByTestId('qty-price-label')).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${dealer.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })
  const pending = async () => (await requestsForDealer()).find((request) => request.status === 'pending')
  await expect.poll(async () => (await pending())?.items[0]).toMatchObject({ quantity: 2, unitPrice: 13_400 })
  const item = (await pending())!.items[0]
  expect(item.quantityPrice).toBeUndefined()
  expect(item.tierMinQty).toBeUndefined()
})
