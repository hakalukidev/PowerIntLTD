import { execFileSync } from 'node:child_process'

import { expect, test, type Page, type TestInfo } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAs, loginAsAdmin } from './auth'
import { navigate, note, pdfFirstPagePng, pdfText, screenshot } from './support/evidence'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Prompt 18: the Sales & Billing table filters by zone and sub-zone. An order counts under the zone
 * stored on it when it was approved, otherwise under its dealer's current zone.
 *
 * Seeds two test zones (named to sort after the real ones), three dealers with one fully paid order
 * each (no zone stored, so they follow the dealer), and for the approval test a fourth dealer,
 * product and employee. Every record the run creates is removed afterwards.
 */

const stamp = Date.now()
const prefix = `E2E-ZN-${stamp}`
const zoneA = { id: `e2e_zone_${stamp}_a`, name: `ZZ E2E Zone A ${stamp}`, subs: [`Sub A1 ${stamp}`, `Sub A2 ${stamp}`] }
const zoneB = { id: `e2e_zone_${stamp}_b`, name: `ZZ E2E Zone B ${stamp}`, subs: [`Sub B1 ${stamp}`] }
const dealers = [
  { id: `e2e_dealer_${stamp}_a1`, name: `E2E Zone Dealer A1 ${stamp}`, zone: zoneA, sub: zoneA.subs[0] },
  { id: `e2e_dealer_${stamp}_a2`, name: `E2E Zone Dealer A2 ${stamp}`, zone: zoneA, sub: zoneA.subs[1] },
  { id: `e2e_dealer_${stamp}_b1`, name: `E2E Zone Dealer B1 ${stamp}`, zone: zoneB, sub: zoneB.subs[0] },
]
const bills = dealers.map((_, index) => `${prefix}-${index + 1}`)
// The approval test's dealer, product and employee.
const mover = { id: `e2e_dealer_${stamp}_mv`, name: `E2E Zone Mover ${stamp}` }
const moverOldBill = `${prefix}-OLD`
const product = { id: `e2e_product_${stamp}`, name: `E2E Zone Product ${stamp}`, sku: `E2E-ZN-SKU-${stamp}` }
const employee = { id: `e2e_employee_${stamp}`, name: `E2E Zone Employee ${stamp}` }
const manager = {
  id: '',
  email: `e2e.saleszone.${stamp}@powerinternationalbd.com`,
  password: `E2e-${stamp}-Zone!`,
  name: `E2E Sales Zone Manager ${stamp}`,
}

let db: AdminDb
let baseURL: string

function zoneRecord(zone: typeof zoneA) {
  const now = new Date().toISOString()
  return {
    id: zone.id,
    name: zone.name,
    thanas: zone.subs.map((thana) => ({ district: '', thana })),
    districts: [],
    managerIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** A fully paid order with a future due date (no overdue alerts) and no zone of its own. */
function paidOrder(id: string, billNumber: string, customer: { id: string; name: string }) {
  return {
    id, billNumber, customerId: customer.id, customerName: customer.name, salesPersonId: 'e2e', salesPersonName: 'E2E Tester',
    status: 'pending', paymentStatus: 'paid', subtotal: 980, discount: 0, total: 980, paid: 980, due: 0,
    deliveryDate: '2099-01-02', paymentDueDate: '2099-01-03', dueReference: '', createdAt: '2026-10-15T09:00:00.000Z',
    items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 980, purchasePrice: 0 }],
  }
}

async function userApi(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
  const response = await fetch(`${baseURL}/api/admin/users`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await db.idToken()}` },
    body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => null)) as { user?: { id: string }; error?: string } | null
  if (!response.ok) throw new Error(`User API ${method} failed: ${result?.error ?? response.status}`)
  return result
}

const search = (page: Page) => page.getByPlaceholder('Search bill, customer, product, sales person, zone')
const testRows = (page: Page) => page.getByRole('row', { name: new RegExp(`^View invoice ${prefix}`) })
const row = (page: Page, bill: string) => page.getByRole('row', { name: `View invoice ${bill}` })

async function choose(page: Page, filter: 'Zone filter' | 'Sub-zone filter', option: string) {
  await page.getByRole('combobox', { name: filter, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function optionsOf(page: Page, filter: 'Zone filter' | 'Sub-zone filter') {
  await page.getByRole('combobox', { name: filter, exact: true }).click()
  const options = await page.getByRole('option').allInnerTexts()
  await page.keyboard.press('Escape')
  return options
}

async function expectBills(page: Page, expected: string[]) {
  await expect(testRows(page)).toHaveCount(expected.length)
  for (const bill of expected) await expect(row(page, bill)).toBeVisible()
}

async function openSales(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  await search(page).fill(prefix)
  await expectBills(page, bills)
}

async function download(page: Page, button: 'Export data' | 'Full PDF', testInfo: TestInfo) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()])
  const filePath = testInfo.outputPath(file.suggestedFilename())
  await file.saveAs(filePath)
  return filePath
}

/** Each page's orientation, and the words whose box reaches past the page's left or right edge. */
function pdfLayout(filePath: string) {
  const xml = execFileSync('pdftotext', ['-bbox', filePath, '-'], { encoding: 'utf8' })
  const pages = Array.from(xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)).map(([, width, height, words]) => ({
    orientation: Number(width) > Number(height) ? 'landscape' : 'portrait',
    outside: Array.from(words.matchAll(/xMin="([\d.-]+)"[^>]*xMax="([\d.-]+)"[^>]*>([^<]*)</g))
      .filter(([, xMin, xMax]) => Number(xMin) < 0 || Number(xMax) > Number(width) + 0.5)
      .map(([, , , word]) => word),
  }))
  return { orientations: [...new Set(pages.map((page) => page.orientation))], outside: pages.flatMap((page) => page.outside) }
}

function sheetRows(filePath: string) {
  return XLSX.utils.sheet_to_json<string[]>(XLSX.readFile(filePath).Sheets.Sales, { header: 1 })
}

test.beforeAll(async ({}, testInfo) => {
  baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:3000')
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  await db.set(`erp/zones/${zoneA.id}`, zoneRecord(zoneA))
  await db.set(`erp/zones/${zoneB.id}`, zoneRecord(zoneB))
  for (const [index, dealer] of dealers.entries()) {
    await db.set(`erp/customers/${dealer.id}`, testDealer(dealer.id, dealer.name, '000-E2E-TEST', dealer.zone.id, dealer.sub))
    await db.set(`erp/orders/e2e-zone-order-${stamp}-${index + 1}`, paidOrder(`e2e-zone-order-${stamp}-${index + 1}`, bills[index], dealer))
  }
  // In the seeded Authorizer's depot, so they can authorize the mover's order.
  await db.set(`erp/customers/${mover.id}`, {
    ...testDealer(mover.id, mover.name, '000-E2E-TEST', zoneA.id, zoneA.subs[0]),
    ...(await authorizerDealerFields(db)),
    creditLimit: 0,
  })
  await db.set(`erp/products/${product.id}`, {
    id: product.id, name: product.name, category: 'E2E', brand: 'E2E', sku: product.sku, warehouseId: '', supplierId: '',
    purchasePrice: 500, sellingPrice: 980, wholesalePrice: 980, stockQty: 10, minStock: 0, maxStock: 100,
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
  const customerIds = [...dealers.map((dealer) => dealer.id), mover.id]
  const names = [mover.name, product.name, employee.name]
  const requests = Object.values((await db.read<Record<string, { id: string; customerId: string; orderId?: string }>>('erp/orderRequests')) ?? {})
    .filter((request) => request.customerId === mover.id)
  const orderIds = requests.map((request) => request.orderId).filter((id): id is string => Boolean(id))
  for (const request of requests) await db.remove(`erp/orderRequests/${request.id}`)
  for (const section of ['orders', 'creditLedgerEntries']) {
    const records = (await db.read<Record<string, { customerId?: string }>>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      if (customerIds.includes(record.customerId ?? '')) await db.remove(`erp/${section}/${id}`)
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
    if (entry.party === mover.name || orderIds.includes(entry.refId ?? '')) await db.remove(`erp/auditLog/${id}`)
  }
  for (const id of customerIds) await db.remove(`erp/customers/${id}`)
  await db.remove(`erp/products/${product.id}`)
  await db.remove(`erp/employees/${employee.id}`)
  await db.remove(`erp/zones/${zoneA.id}`)
  await db.remove(`erp/zones/${zoneB.id}`)
  if (manager.id) await userApi('DELETE', { userId: manager.id })
  await db.close()
})

test.beforeEach(async ({ page }) => {
  // Approving an order alerts the dealer by WhatsApp; never let a test send one.
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
})

test.afterEach(async ({ page }) => {
  // Leave the admin's saved column choice as it was before the run.
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('sales-table-hidden-columns:'))
      .forEach((key) => window.localStorage.removeItem(key))
  }).catch(() => undefined)
})

test.describe('Sales zone and sub-zone filter', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-18.1 zone narrows the rows, sub-zone narrows further, and changing the zone resets the sub-zone', async ({ page }, testInfo) => {
    await openSales(page)

    await choose(page, 'Zone filter', zoneA.name)
    await expectBills(page, [bills[0], bills[1]])
    // Only the chosen zone's sub-zones are offered.
    expect(await optionsOf(page, 'Sub-zone filter')).toEqual(['All sub-zones', ...zoneA.subs])

    await choose(page, 'Sub-zone filter', zoneA.subs[0])
    await expectBills(page, [bills[0]])
    await screenshot(page, 'sales-zone-subzone-filter', testInfo)

    await choose(page, 'Zone filter', zoneB.name)
    await expect(page.getByRole('combobox', { name: 'Sub-zone filter' })).toHaveText('All sub-zones')
    await expectBills(page, [bills[2]])

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(search(page)).toHaveValue('')
    await expect(page.getByRole('combobox', { name: 'Zone filter', exact: true })).toHaveText('All zones')
    await expect(page.getByRole('combobox', { name: 'Sub-zone filter' })).toHaveText('All sub-zones')
  })

  test('TC-18.2 Excel and Full PDF hold only the filtered rows', async ({ page }, testInfo) => {
    await openSales(page)
    await choose(page, 'Zone filter', zoneA.name)
    await choose(page, 'Sub-zone filter', zoneA.subs[1])
    await expectBills(page, [bills[1]])

    const [headers, ...rows] = sheetRows(await download(page, 'Export data', testInfo))
    expect(headers[0]).toBe('Bill')
    expect(rows.map((cells) => cells[0])).toEqual([bills[1]])

    const text = pdfText(await download(page, 'Full PDF', testInfo))
    expect(text).toContain(bills[1])
    expect(text).not.toContain(bills[0])
    expect(text).not.toContain(bills[2])
    // Long names wrap in the PDF, so only the part before the test stamp is on one line.
    expect(text).toContain('Zone: ZZ E2E Zone A')
    expect(text).toContain('Sub-zone: Sub A2')
    note(testInfo, `Filtered to ${zoneA.name} / ${zoneA.subs[1]}: Excel and PDF both hold only ${bills[1]}.`)
  })

  test('TC-18.3 the search box matches zone and sub-zone names', async ({ page }) => {
    await openSales(page)
    await search(page).fill(zoneB.name)
    await expect(row(page, bills[2])).toBeVisible()
    await expect(row(page, bills[0])).toHaveCount(0)
    await search(page).fill(zoneA.subs[1])
    await expectBills(page, [bills[1]])
  })

  test('TC-18.4 Zone and Sub-zone columns are hidden by default and, once shown, appear in the table, Excel and PDF', async ({ page }, testInfo) => {
    await openSales(page)
    const columns = page.getByRole('button', { name: /^Columns \(\d+\/\d+\)$/ })
    await expect(columns).toHaveText('Columns (10/12)')
    await expect(page.getByRole('columnheader', { name: 'Zone', exact: true })).toHaveCount(0)

    await columns.click()
    for (const name of ['Zone', 'Sub-zone']) await page.getByRole('menuitemcheckbox', { name, exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(columns).toHaveText('Columns (12/12)')
    await expect(page.getByRole('columnheader', { name: 'Zone', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Sub-zone', exact: true })).toBeVisible()
    await expect(row(page, bills[2])).toContainText(zoneB.name)
    await expect(row(page, bills[2])).toContainText(zoneB.subs[0])

    await search(page).fill(bills[2])
    const [headers, first] = sheetRows(await download(page, 'Export data', testInfo))
    expect(first[headers.indexOf('Zone')]).toBe(zoneB.name)
    expect(first[headers.indexOf('Sub-zone')]).toBe(zoneB.subs[0])
    const text = pdfText(await download(page, 'Full PDF', testInfo))
    expect(text).toContain('Sub-zone')
    expect(text).toContain('ZZ E2E Zone B')
    expect(text).toContain('Sub B1')
  })
})

test.describe('Sales Full PDF page fit', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-18.8 more than 8 columns print landscape, 8 or fewer portrait, and no column is cut off', async ({ page }, testInfo) => {
    await openSales(page)
    const columns = page.getByRole('button', { name: /^Columns \(\d+\/\d+\)$/ })
    const toggle = async (names: string[]) => {
      await columns.click()
      for (const name of names) await page.getByRole('menuitemcheckbox', { name, exact: true }).click()
      await page.keyboard.press('Escape')
    }
    const check = async (expected: 'landscape' | 'portrait', label: string) => {
      const file = await download(page, 'Full PDF', testInfo)
      const layout = pdfLayout(file)
      expect(layout.orientations, label).toEqual([expected])
      expect(layout.outside, `${label}: words past the page edge`).toEqual([])
      // The last column (Delivered date, empty for these undelivered orders) and every test bill are there in full.
      const text = pdfText(file).replace(/\s+/g, ' ')
      expect(text).toContain('Delivered')
      for (const bill of bills) expect(text).toContain(bill.slice(-4))
      pdfFirstPagePng(file, `sales-pdf-${label.replace(/\W+/g, '-').toLowerCase()}`)
      note(testInfo, `${label}: ${expected}, every word inside the page.`)
    }

    await check('landscape', 'Default 10 columns')
    await toggle(['Zone', 'Sub-zone'])
    await expect(columns).toHaveText('Columns (12/12)')
    await check('landscape', 'All 12 columns')
    await toggle(['Zone', 'Sub-zone', 'Status', 'Sale date'])
    await expect(columns).toHaveText('Columns (8/12)')
    await check('portrait', '8 columns')
  })
})

test.describe('Sales zone filter on a phone', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('TC-18.5 the filters work at 360px in dark mode without sideways scrolling', async ({ page }, testInfo) => {
    await openSales(page)
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await choose(page, 'Zone filter', zoneA.name)
    await choose(page, 'Sub-zone filter', zoneA.subs[0])
    await expectBills(page, [bills[0]])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await screenshot(page, 'sales-zone-filter-mobile-dark', testInfo)
  })
})

test('TC-18.6 an approved order keeps its zone when the dealer later moves zone', async ({ browser, page }, testInfo) => {
  test.skip(!hasApproverLogins(), 'Approvals need the Authorizer and Chairman logins seeded on the emulators.')
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  // An older order for the same dealer, without a zone of its own.
  await db.set(`erp/orders/e2e-zone-order-${stamp}-old`, paidOrder(`e2e-zone-order-${stamp}-old`, moverOldBill, mover))

  await loginAsAdmin(page)
  await navigate(page, '/admin/order-form')
  for (const [trigger, searchText, optionText] of [
    ['Select dealer', mover.name, mover.name],
    ['Select employee', employee.name, employee.name],
    ['Select product', product.sku, product.name],
    ['Choose a courier', 'Office Delivery', 'Office Delivery'],
  ]) {
    await page.getByRole('combobox').filter({ hasText: trigger }).first().click()
    await page.keyboard.type(searchText)
    await page.locator('button:not([role="combobox"])').filter({ hasText: optionText }).first().click()
  }
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByText(`Order for ${mover.name} sent for approval.`)).toBeVisible({ timeout: 15_000 })

  await approveThroughBothStages(browser, mover.name, page)
  const moverOrderId = async () =>
    Object.values((await db.read<Record<string, { customerId: string; orderId?: string }>>('erp/orderRequests')) ?? {}).find(
      (request) => request.customerId === mover.id
    )?.orderId ?? ''
  await expect.poll(moverOrderId, { timeout: 20_000 }).not.toBe('')
  const orderId = await moverOrderId()
  const order = (await db.read<{ billNumber: string }>(`erp/orders/${orderId}`))!
  expect(await db.read(`erp/orders/${orderId}`)).toMatchObject({
    zoneId: zoneA.id,
    zoneName: zoneA.name,
    subZoneKey: `${zoneA.id}|${zoneA.subs[0].toLowerCase()}`,
    subZoneName: zoneA.subs[0],
  })

  // The dealer moves to zone B: the new order stays in A, the older one follows the dealer.
  await db.update(`erp/customers/${mover.id}`, { zoneId: zoneB.id, thana: zoneB.subs[0] })
  await navigate(page, '/admin/sales')
  await search(page).fill(mover.name)
  await expect(row(page, order.billNumber)).toBeVisible({ timeout: 20_000 })
  await expect(row(page, moverOldBill)).toBeVisible()

  await choose(page, 'Zone filter', zoneA.name)
  await expect(row(page, order.billNumber)).toBeVisible()
  await expect(row(page, moverOldBill)).toHaveCount(0)
  await choose(page, 'Sub-zone filter', zoneA.subs[0])
  await expect(row(page, order.billNumber)).toBeVisible()

  await choose(page, 'Zone filter', zoneB.name)
  await expect(row(page, moverOldBill)).toBeVisible()
  await expect(row(page, order.billNumber)).toHaveCount(0)
  note(testInfo, `After ${mover.name} moved to ${zoneB.name}, approved order ${order.billNumber} stayed under ${zoneA.name}; the older order without a stored zone moved with the dealer.`)
})

test('TC-18.7 a zone-limited user only sees their zones in the Zone filter', async ({ page }, testInfo) => {
  const created = await userApi('POST', {
    name: manager.name,
    loginId: `e2e-saleszone-${stamp}`,
    email: manager.email,
    phone: '',
    password: manager.password,
    roleId: 'zone_manager',
    title: 'E2E test account',
  })
  manager.id = created!.user!.id
  await db.update(`erp/zones/${zoneA.id}`, { managerIds: [manager.id] })

  await page.setViewportSize({ width: 1280, height: 900 })
  await loginAs(page, manager.email, manager.password)
  test.skip(!(await page.locator('a[href="/admin/sales"]').count()), 'The seeded Zone Manager role cannot open Sales & Billing.')
  await navigate(page, '/admin/sales')
  await search(page).fill(prefix)
  await expectBills(page, [bills[0], bills[1]])

  const options = await optionsOf(page, 'Zone filter')
  expect(options[0]).toBe('All my zones')
  expect(options).toContain(zoneA.name)
  expect(options).not.toContain(zoneB.name)
  expect(options).not.toContain('Unassigned zone')
  note(testInfo, `The ${zoneA.name} Zone Manager's Zone filter offers: ${options.join(', ')}.`)
})
