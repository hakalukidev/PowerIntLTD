import { readFileSync } from 'node:fs'

import { devices, expect, test, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 11: the sales table shows the sale date and every product, and a row
 * opens the full invoice. One two-product order is seeded straight into the
 * database (no stock or dealer due changes) and removed afterwards.
 */

const stamp = Date.now()
const order = {
  id: `e2e-sales-details-${stamp}`,
  billNumber: `E2E-${stamp}`,
  customerId: `e2e-customer-${stamp}`,
  customerName: `E2E Sales Dealer ${stamp}`,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'pending',
  paymentStatus: 'paid',
  subtotal: 3_430,
  discount: 30,
  total: 3_400,
  // Fully paid with a future due date, so the app never raises an overdue notification for it.
  paid: 3_400,
  due: 0,
  deliveryDate: '2099-01-02',
  paymentDueDate: '2099-01-03',
  dueReference: 'owner',
  createdAt: '2026-10-15T09:00:00.000Z',
  items: [
    { productId: 'e2e-product-a', productName: "Men's Jacket", quantity: 1, unitPrice: 2_450, purchasePrice: 0 },
    { productId: 'e2e-product-b', productName: 'Classic Polo', quantity: 1, unitPrice: 980, purchasePrice: 0 },
  ],
}

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

async function openSalesRow(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(order.billNumber)
  const row = page.getByRole('row', { name: `View invoice ${order.billNumber}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

async function expectInvoiceDialog(page: Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: `Invoice ${order.billNumber}` })).toBeVisible()
  await expect(dialog).toContainText("Men's Jacket")
  await expect(dialog).toContainText('Classic Polo')
  await expect(dialog).toContainText('15/10/2026')
  await expect(dialog).toContainText('3,400')
  for (const name of ['Print', 'PDF', 'JPG']) await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible()
  return dialog
}

test.describe('Sales table details on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-11.1 sale date, "+1 more" and the invoice dialog', async ({ page }, testInfo) => {
    const row = await openSalesRow(page)
    await expect(page.getByRole('columnheader', { name: 'Sale date', exact: true })).toBeVisible()
    await expect(row).toContainText("Men's Jacket+1 more")
    await expect(row).toContainText('15/10/2026')

    // The row's own Print button must not open the dialog.
    const popupPromise = page.waitForEvent('popup')
    await row.getByRole('button', { name: `Print invoice ${order.id}` }).click()
    await (await popupPromise).close()
    await expect(page.getByRole('dialog')).toBeHidden()

    // The row's JPG button downloads the invoice image without opening the dialog.
    const rowDownload = page.waitForEvent('download')
    await row.getByRole('button', { name: `Download invoice ${order.id} as JPG` }).click()
    const jpg = await rowDownload
    expect(jpg.suggestedFilename()).toBe(`invoice-${order.billNumber}.jpg`)
    const jpgPath = testInfo.outputPath(jpg.suggestedFilename())
    await jpg.saveAs(jpgPath)
    const bytes = readFileSync(jpgPath)
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    await expect(page.getByRole('dialog')).toBeHidden()

    // Status is a read-only badge in the table; it is changed from the dialog (prompt 14).
    await expect(row.getByRole('combobox')).toHaveCount(0)

    await row.click()
    await expectInvoiceDialog(page)
    await screenshot(page, 'sales-invoice-dialog', testInfo)

    const download = page.waitForEvent('download')
    await page.getByRole('dialog').getByRole('button', { name: 'JPG', exact: true }).click()
    expect((await download).suggestedFilename()).toBe(`invoice-${order.billNumber}.jpg`)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await row.focus()
    await page.keyboard.press('Enter')
    await expectInvoiceDialog(page)
    note(testInfo, `Order ${order.billNumber} shows "Men's Jacket +1 more" and both items in the dialog.`)
  })

  test('TC-11.3 export errors show inside the invoice dialog', async ({ page }, testInfo) => {
    const row = await openSalesRow(page)
    await row.click()
    const dialog = await expectInvoiceDialog(page)

    // The PDF and JPG helpers render into an off-screen iframe; hiding its document makes both fail.
    await page.evaluate(() => {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', { get: () => null })
    })

    await dialog.getByRole('button', { name: 'PDF', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Unable to prepare the PDF.')

    await dialog.getByRole('button', { name: 'JPG', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Unable to prepare the image.')
    await screenshot(page, 'sales-invoice-dialog-error', testInfo)

    // Reopening the dialog starts without the old error.
    await page.keyboard.press('Escape')
    await row.click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0)
  })
})

test.describe('Sales table details on a phone', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-11.2 tapping a row opens the invoice', async ({ page }, testInfo) => {
    const row = await openSalesRow(page)
    await row.locator('td').nth(1).click()
    const dialog = await expectInvoiceDialog(page)
    const box = await dialog.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-sales-invoice-dialog', testInfo)
  })

  test('TC-13.1 the row keeps Print, PDF and JPG in one tight group', async ({ page }, testInfo) => {
    const row = await openSalesRow(page)
    const buttons = [
      row.getByRole('button', { name: `Print invoice ${order.id}` }),
      row.getByRole('button', { name: `Download invoice ${order.id} as PDF` }),
      row.getByRole('button', { name: `Download invoice ${order.id} as JPG` }),
    ]
    const boxes = await Promise.all(buttons.map(async (button) => (await button.boundingBox())!))
    // One line, 4px apart.
    for (const box of boxes) expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(1)
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index].x - (boxes[index - 1].x + boxes[index - 1].width)).toBeCloseTo(4, 0)
    }
    await buttons[2].scrollIntoViewIfNeeded()
    await screenshot(page, 'mobile-sales-invoice-jpg-button', testInfo)
    note(testInfo, `Invoice buttons span ${Math.round(boxes[2].x + boxes[2].width - boxes[0].x)}px at 360px.`)
  })
})
