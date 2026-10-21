import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 04: the team reads dates day first, so every displayed date is
 * DD/MM/YYYY — never "Oct 9, 2026" or month-first 10/09/2026.
 *
 * TC-04.1 seeds its own order (sold 9 March, delivered 12 March, so day and month cannot be
 * mixed up) and removes it afterwards, so it does not depend on whatever orders the database holds.
 */

const DAY_FIRST = /^\d{2}\/\d{2}\/\d{4}$/
// "Oct 9, 2026" — the old `dateStyle: 'medium'` output.
const MONTH_NAME_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/

const stamp = Date.now()
const order = {
  id: `e2e-order-dates-${stamp}`,
  billNumber: `E2E-DT-${stamp}`,
  customerId: `e2e-customer-dates-${stamp}`,
  customerName: `E2E Dates Dealer ${stamp}`,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'pending',
  paymentStatus: 'paid',
  subtotal: 1_000,
  discount: 0,
  total: 1_000,
  // Fully paid with a future due date, so the app never raises an overdue notification for it.
  paid: 1_000,
  due: 0,
  deliveryDate: '2026-03-12T10:00:00.000Z',
  paymentDueDate: '2099-01-03',
  dueReference: 'owner',
  createdAt: '2026-03-09T10:00:00.000Z',
  items: [{ productId: 'e2e-product-dates', productName: 'E2E Dates Battery', quantity: 1, unitPrice: 1_000, purchasePrice: 0 }],
}

let db: AdminDb

test.beforeAll(async () => {
  db = await connectAsAdmin()
  await db.set(`erp/orders/${order.id}`, order)
})

test.afterAll(async () => {
  if (!db) return
  await db.remove(`erp/orders/${order.id}`)
  await db.close()
})

test.describe('Date display', () => {
  test('TC-04.1 sales table and Excel export show DD/MM/YYYY', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Search bill, customer, product, sales person').fill(order.billNumber)

    const table = page.locator('table').first()
    const row = page.getByRole('row', { name: `View invoice ${order.billNumber}` })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row).toContainText('09/03/2026')
    await expect(row).toContainText('12/03/2026')
    await expect(table).not.toContainText(MONTH_NAME_DATE)

    const cells = (await table.locator('tbody td').allInnerTexts()).map((text) => text.trim())
    const dates = cells.filter((text) => /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(text) && !text.startsWith('INV'))
    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) expect(date).toMatch(DAY_FIRST)
    note(testInfo, `Sales table dates: ${dates.slice(0, 5).join(', ')}`)
    await screenshot(page, 'dates-sales-table', testInfo)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export data' }).click()
    const workbook = XLSX.readFile((await (await download).path())!)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.Sales)
    // The export follows the search, so it holds just the seeded order.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ Bill: order.billNumber, 'Sale date': '09/03/2026', Delivery: '12/03/2026' })
    for (const exported of rows) {
      expect(exported['Sale date']).toMatch(DAY_FIRST)
      if (exported.Delivery) expect(exported.Delivery).toMatch(DAY_FIRST)
    }
  })

  test('TC-04.2 dashboard shows no month-name dates', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).not.toContainText(MONTH_NAME_DATE)
  })
})
