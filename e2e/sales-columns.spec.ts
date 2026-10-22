import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAsAdmin } from './auth'
import { navigate, note, pdfText, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 15: the Sales & Billing table has a Columns picker. A hidden column is
 * gone from the table, the Excel export and the Full PDF, and the choice is
 * remembered for the signed-in user. One fully paid order is seeded straight
 * into the database (no stock or dealer due changes) and removed afterwards.
 */

const stamp = Date.now()
const order = {
  id: `e2e-sales-columns-${stamp}`,
  billNumber: `E2E-COL-${stamp}`,
  customerId: `e2e-customer-${stamp}`,
  customerName: `E2E Columns Dealer ${stamp}`,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'pending',
  paymentStatus: 'paid',
  subtotal: 2_450,
  discount: 0,
  total: 2_450,
  // Fully paid with a future due date, so the app never raises an overdue notification for it.
  paid: 2_450,
  due: 0,
  deliveryDate: '2099-01-02',
  paymentDueDate: '2099-01-03',
  dueReference: 'owner',
  createdAt: '2026-10-15T09:00:00.000Z',
  items: [{ productId: 'e2e-product-a', productName: "Men's Jacket", quantity: 1, unitPrice: 2_450, purchasePrice: 0 }],
}

const ALL_COLUMNS = ['Bill', 'Customer', 'Product', 'Sales person', 'Total', 'Paid', 'Total due', 'Status', 'Sale date', 'Delivery']

let db: AdminDb

test.beforeAll(async () => {
  db = await connectAsAdmin()
  await db.set(`erp/orders/${order.id}`, order)
})

test.afterAll(async () => {
  await db?.remove(`erp/orders/${order.id}`)
  expect(await db?.read(`erp/orders/${order.id}`)).toBeNull()
  await db?.close()
})

async function openSalesTable(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(order.billNumber)
  await expect(page.getByRole('row', { name: `View invoice ${order.billNumber}` })).toBeVisible({ timeout: 20_000 })
}

async function setColumn(page: Page, name: string, visible: boolean) {
  const item = page.getByRole('menuitemcheckbox', { name, exact: true })
  if ((await item.getAttribute('aria-checked')) !== String(visible)) await item.click()
  await expect(item).toHaveAttribute('aria-checked', String(visible))
}

function columnsButton(page: Page) {
  return page.getByRole('button', { name: /^Columns \(\d+\/\d+\)$/ })
}

test.describe('Sales table column picker', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test.afterEach(async ({ page }) => {
    // Leave the admin's saved choice as it was before the run.
    await page.evaluate(() => {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('sales-table-hidden-columns:'))
        .forEach((key) => window.localStorage.removeItem(key))
    })
  })

  test('TC-15.1 hiding Status removes it from the table, the Excel export and the PDF', async ({ page }, testInfo) => {
    await openSalesTable(page)
    await expect(columnsButton(page)).toHaveText('Columns (10/12)')
    await expect(page.getByRole('columnheader', { name: 'Paid', exact: true })).toBeVisible()

    await columnsButton(page).click()
    await setColumn(page, 'Status', false)
    await page.keyboard.press('Escape')
    await expect(columnsButton(page)).toHaveText('Columns (9/12)')
    await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toHaveCount(0)
    await expect(page.getByRole('row', { name: `View invoice ${order.billNumber}` }).getByRole('combobox')).toHaveCount(0)
    await screenshot(page, 'sales-columns-status-hidden', testInfo)

    const [xlsxDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export data' }).click()])
    const xlsxPath = testInfo.outputPath(xlsxDownload.suggestedFilename())
    await xlsxDownload.saveAs(xlsxPath)
    const sheet = XLSX.readFile(xlsxPath).Sheets.Sales
    const [headers, row] = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    expect(headers).toEqual(ALL_COLUMNS.filter((name) => name !== 'Status'))
    expect(row[0]).toBe(order.billNumber)

    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full PDF' }).click()])
    const pdfPath = testInfo.outputPath(pdfDownload.suggestedFilename())
    await pdfDownload.saveAs(pdfPath)
    const text = pdfText(pdfPath)
    expect(text).toContain(order.billNumber)
    expect(text).toContain('Paid')
    expect(text).not.toContain('Status')
    note(testInfo, `With Status hidden the Excel headers are: ${(headers as string[]).join(', ')}.`)
  })

  test('TC-15.2 the choice is remembered and the last column cannot be hidden', async ({ page }) => {
    await openSalesTable(page)
    await columnsButton(page).click()
    for (const name of ALL_COLUMNS.slice(1)) await setColumn(page, name, false)

    // Bill is the only one left, so it stays on.
    const bill = page.getByRole('menuitemcheckbox', { name: 'Bill', exact: true })
    await expect(bill).toHaveAttribute('aria-disabled', 'true')
    await bill.click({ force: true })
    await expect(bill).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(columnsButton(page)).toHaveText('Columns (1/12)')

    // A full reload ends the in-memory session; signing in again must bring the same columns back.
    await page.reload()
    await openSalesTable(page)
    await expect(columnsButton(page)).toHaveText('Columns (1/12)')
    await expect(page.getByRole('columnheader', { name: 'Bill', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Customer', exact: true })).toHaveCount(0)
  })
})
