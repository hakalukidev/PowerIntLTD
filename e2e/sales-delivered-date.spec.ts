import { devices, expect, test, type Locator, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAsAdmin } from './auth'
import { navigate, note, pdfText, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 19: the Sales table shows the date an order was actually delivered, not
 * the planned date. It is stamped when the delivery document is submitted or the
 * order moves to a status that counts as delivered, and cleared when it moves to
 * one that does not. Two fully paid orders are seeded straight into the database
 * (no stock or dealer due changes); they, the statuses the test adds, and the rows
 * they cause are removed afterwards. The document upload never reaches Cloudinary.
 */

const stamp = Date.now()
const handedOverLabel = `E2E Handed over ${stamp}`
const cancelledLabel = `E2E Cancelled ${stamp}`

function seededOrder(id: string, billNumber: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    billNumber,
    customerId: `e2e-customer-${stamp}`,
    customerName: `E2E Delivered Dealer ${stamp}`,
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
    ...extra,
  }
}

const statusOrder = seededOrder(`e2e-delivered-status-${stamp}`, `E2E-DLV-${stamp}`)
// Approved and already posted for delivery, waiting for the delivery document.
const deliveryOrder = seededOrder(`e2e-delivered-doc-${stamp}`, `E2E-DOC-${stamp}`, {
  status: 'shipped',
  delivery: {
    status: 'posted',
    warehouseId: 'e2e-warehouse',
    warehouseName: 'E2E Warehouse',
    deliveryManId: 'e2e-delivery-man',
    deliveryManName: 'E2E Delivery Man',
    courierName: '',
    trackingNumber: '',
    vehicle: '',
    deliveryCharge: 0,
    note: '',
    documentUrl: '',
    documentPublicId: '',
    postedById: 'e2e',
    postedByName: 'E2E Tester',
    postedAt: '2026-10-16T09:00:00.000Z',
    submittedById: '',
    submittedByName: '',
    submittedAt: '',
    updatedAt: '2026-10-16T09:00:00.000Z',
  },
})
const deliveryRequestId = `e2e-delivered-request-${stamp}`
const orderIds = [statusOrder.id, deliveryOrder.id]

type StatusMap = Record<string, { label: string }>

let db: AdminDb
let statusesBefore: StatusMap

function today() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

async function deliveredAtOf(orderId: string) {
  return (await db.read<{ deliveredAt?: string }>(`erp/orders/${orderId}`))?.deliveredAt ?? null
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  statusesBefore = (await db.read<StatusMap>('erp/settings/orderStatuses')) ?? {}
  await db.set(`erp/orders/${statusOrder.id}`, statusOrder)
  await db.set(`erp/orders/${deliveryOrder.id}`, deliveryOrder)
  await db.set(`erp/orderRequests/${deliveryRequestId}`, {
    ...deliveryOrder,
    id: deliveryRequestId,
    orderId: deliveryOrder.id,
    status: 'approved',
    reviewedByName: 'E2E Approver',
    reviewedAt: '2026-10-16T08:00:00.000Z',
    delivery: null,
  })
})

test.afterAll(async () => {
  if (!db) return
  for (const id of orderIds) await db.remove(`erp/orders/${id}`)
  await db.remove(`erp/orderRequests/${deliveryRequestId}`)
  // Only statuses this run added; the ones that existed before are left alone.
  const statuses = (await db.read<StatusMap>('erp/settings/orderStatuses')) ?? {}
  for (const [id, status] of Object.entries(statuses)) {
    if (!statusesBefore[id] && status.label.includes(String(stamp))) await db.remove(`erp/settings/orderStatuses/${id}`)
  }
  for (const path of ['erp/activities', 'erp/notifications']) {
    const rows = (await db.read<Record<string, { message?: string; body?: string }>>(path)) ?? {}
    for (const [id, row] of Object.entries(rows)) {
      if ((row.message ?? row.body ?? '').includes(String(stamp))) await db.remove(`${path}/${id}`)
    }
  }
  const audit = (await db.read<Record<string, { refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (orderIds.includes(entry.refId ?? '')) await db.remove(`erp/auditLog/${id}`)
  }

  for (const id of orderIds) expect(await db.read(`erp/orders/${id}`)).toBeNull()
  await db.close()
})

async function openSales(page: Page, billNumber: string) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  return findRow(page, billNumber)
}

async function findRow(page: Page, billNumber: string) {
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(billNumber)
  const row = page.getByRole('row', { name: `View invoice ${billNumber}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

/** The row's cell under the "Delivered date" header. */
async function deliveredCell(page: Page, row: Locator) {
  // Headers are hidden from the accessibility tree while a dialog is still closing.
  await expect(page.getByRole('columnheader', { name: 'Delivered date', exact: true })).toBeVisible()
  const headers = await page.getByRole('columnheader').allTextContents()
  const index = headers.findIndex((text) => text.trim() === 'Delivered date')
  expect(index).toBeGreaterThan(-1)
  return row.getByRole('cell').nth(index)
}

async function setStatus(page: Page, billNumber: string, label: string) {
  const details = page.getByRole('dialog', { name: `Invoice ${billNumber}` })
  await details.getByRole('combobox', { name: 'Order status' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await expect(details.getByRole('combobox', { name: 'Order status' })).toHaveText(label)
  return details
}

async function addStatus(page: Page, label: string, flags: { final?: boolean; delivered?: boolean }) {
  const manager = page.getByRole('dialog', { name: 'Order statuses' })
  await manager.getByRole('button', { name: 'Add status' }).click()
  await manager.getByLabel('Status name').fill(label)
  if (flags.final) await manager.getByRole('checkbox', { name: /Final step/ }).check()
  if (flags.delivered) await manager.getByRole('checkbox', { name: /Counts as delivered/ }).check()
  await manager.getByRole('button', { name: 'Add status' }).click()
  await expect(manager).toContainText(label)
}

test.describe('Delivered date on the sales table', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  test.describe.configure({ mode: 'serial' })

  test('TC-19.1 empty until delivered, stamped on Completed, cleared on a non-delivered status, in the exports too', async ({ page }, testInfo) => {
    const row = await openSales(page, statusOrder.billNumber)
    await expect(page.getByRole('columnheader', { name: 'Delivered date', exact: true })).toBeVisible()
    await expect(await deliveredCell(page, row)).toHaveText('')

    // The planned date stays in the order dialog as "Planned delivery".
    await row.click()
    const details = page.getByRole('dialog', { name: `Invoice ${statusOrder.billNumber}` })
    await expect(details).toContainText('Planned delivery02/01/2099')
    await expect(details).toContainText('DeliveredNot delivered')

    await setStatus(page, statusOrder.billNumber, 'Completed')
    await expect.poll(() => deliveredAtOf(statusOrder.id)).not.toBeNull()
    await expect(details).toContainText(`Delivered${today()}`)
    await page.keyboard.press('Escape')
    await expect(await deliveredCell(page, row)).toHaveText(today())
    await screenshot(page, 'sales-delivered-date-stamped', testInfo)

    const [xlsxDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export data' }).click()])
    const xlsxPath = testInfo.outputPath(xlsxDownload.suggestedFilename())
    await xlsxDownload.saveAs(xlsxPath)
    const [headers, values] = XLSX.utils.sheet_to_json<string[]>(XLSX.readFile(xlsxPath).Sheets.Sales, { header: 1 })
    expect(headers.at(-1)).toBe('Delivered date')
    expect(values[0]).toBe(statusOrder.billNumber)
    expect(values.at(-1)).toBe(today())

    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full PDF' }).click()])
    const pdfPath = testInfo.outputPath(pdfDownload.suggestedFilename())
    await pdfDownload.saveAs(pdfPath)
    const text = pdfText(pdfPath).replace(/\s+/g, ' ')
    // The header wraps to two lines in the PDF, so its words come out apart.
    expect(text).toContain('Delivered')
    expect(text).toContain(today())
    expect(text).not.toContain('02/01/2099')

    // Back to a status that does not count as delivered: the date is cleared.
    await row.click()
    await setStatus(page, statusOrder.billNumber, 'Shipped')
    await expect.poll(() => deliveredAtOf(statusOrder.id)).toBeNull()
    await page.keyboard.press('Escape')
    await expect(await deliveredCell(page, row)).toHaveText('')
    note(testInfo, `Completed stamped ${today()} on ${statusOrder.billNumber}; Shipped cleared it. Excel and PDF carry "Delivered date".`)
  })

  test('TC-19.2 "Counts as delivered" is separate from "Final step"', async ({ page }, testInfo) => {
    // Already delivered on an earlier day.
    await db.update(`erp/orders/${statusOrder.id}`, { status: 'completed', deliveredAt: '2026-10-01T10:00:00.000Z' })
    const row = await openSales(page, statusOrder.billNumber)
    await expect(await deliveredCell(page, row)).toHaveText('01/10/2026')

    await page.getByRole('button', { name: 'Manage statuses' }).click()
    const manager = page.getByRole('dialog', { name: 'Order statuses' })
    await expect(manager.getByTestId('order-status-completed')).toContainText('Delivered')
    await expect(manager.getByTestId('order-status-shipped')).not.toContainText('Delivered')
    await addStatus(page, handedOverLabel, { delivered: true })
    await addStatus(page, cancelledLabel, { final: true })
    await screenshot(page, 'order-statuses-delivered-flag', testInfo)
    await page.keyboard.press('Escape')

    // Delivered → delivered keeps the original day.
    await row.click()
    await setStatus(page, statusOrder.billNumber, handedOverLabel)
    await expect.poll(async () => (await db.read<{ status: string }>(`erp/orders/${statusOrder.id}`))?.status).not.toBe('completed')
    expect(await deliveredAtOf(statusOrder.id)).toBe('2026-10-01T10:00:00.000Z')

    // Final but not delivered clears it.
    await setStatus(page, statusOrder.billNumber, cancelledLabel)
    await expect.poll(() => deliveredAtOf(statusOrder.id)).toBeNull()
    await page.keyboard.press('Escape')
    await expect(await deliveredCell(page, row)).toHaveText('')
    note(testInfo, `"${handedOverLabel}" (delivered) kept 01/10/2026; "${cancelledLabel}" (final, not delivered) cleared it.`)
  })

  test('TC-19.3 submitting the delivery document stamps the delivered date', async ({ page }, testInfo) => {
    // Answer the upload locally; nothing is sent to Cloudinary.
    await page.route('https://api.cloudinary.com/**', (route) =>
      route.fulfill({ json: { secure_url: `https://example.invalid/e2e-${stamp}.png`, public_id: `e2e-${stamp}` } })
    )
    await loginAsAdmin(page)
    await navigate(page, '/admin/delivery')
    await page.getByRole('button', { name: /^Posted/ }).click()
    await page.getByPlaceholder('Search dealer, bill, delivery man…').fill(deliveryOrder.billNumber)
    // The innermost block holding both the bill and its submit button is that order's card.
    const card = page
      .locator('div')
      .filter({ hasText: deliveryOrder.billNumber })
      .filter({ has: page.getByRole('button', { name: 'Submit to audit' }) })
      .last()
    await card.locator('input[type="file"]').setInputFiles({ name: 'delivery.png', mimeType: 'image/png', buffer: Buffer.from('e2e') })
    await card.getByRole('button', { name: 'Submit to audit' }).click()
    await expect(page.getByText(`${deliveryOrder.billNumber} submitted to the audit.`)).toBeVisible({ timeout: 20_000 })

    const saved = await db.read<{ status: string; deliveredAt?: string; delivery: { submittedAt: string } }>(`erp/orders/${deliveryOrder.id}`)
    expect(saved?.status).toBe('completed')
    expect(saved?.deliveredAt).toBe(saved?.delivery.submittedAt)

    await navigate(page, '/admin/sales')
    const row = await findRow(page, deliveryOrder.billNumber)
    await expect(await deliveredCell(page, row)).toHaveText(today())
    note(testInfo, `Submitting the document for ${deliveryOrder.billNumber} set Completed and Delivered date ${today()}.`)
  })
})

test.describe('Delivered date on a phone in dark mode', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-19.4 the order dialog and the status form fit 360px in dark mode', async ({ page }, testInfo) => {
    await db.update(`erp/orders/${statusOrder.id}`, { status: 'completed', deliveredAt: '2026-10-01T10:00:00.000Z' })
    const row = await openSales(page, statusOrder.billNumber)
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    await row.locator('td').nth(1).click()
    const details = page.getByRole('dialog', { name: `Invoice ${statusOrder.billNumber}` })
    await expect(details).toContainText('Planned delivery02/01/2099')
    await expect(details).toContainText('Delivered01/10/2026')
    expect((await details.boundingBox())!.width).toBeLessThanOrEqual(360)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-dark-sales-delivered-date', testInfo)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Manage statuses' }).click()
    const manager = page.getByRole('dialog', { name: 'Order statuses' })
    await manager.getByRole('button', { name: 'Edit Completed' }).click()
    await expect(manager.getByRole('checkbox', { name: /Counts as delivered/ })).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-dark-order-status-delivered-flag', testInfo)
    await manager.getByRole('button', { name: 'Cancel' }).click()

    // Leave the theme as it was.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })
})
