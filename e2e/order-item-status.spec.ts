import { devices, expect, test, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 20: each product of an order has its own status and delivered date. The sales row
 * opens a list of its products; the order's status follows them, shows "1/2 delivered" while
 * only some are delivered, and is delivered (with its Delivered date) once all are. One fully
 * paid, already posted two-product order is seeded straight into the database (no stock or
 * dealer due changes); it and the rows it causes are removed afterwards.
 */

const stamp = Date.now()
const billNumber = `E2E-ITEM-${stamp}`
const orderId = `e2e-item-status-${stamp}`
const first = `E2E Ak Power ${stamp}`
const second = `E2E Ak Power Plus ${stamp}`

const order = {
  id: orderId,
  billNumber,
  customerId: `e2e-customer-${stamp}`,
  customerName: `E2E Item Dealer ${stamp}`,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'shipped',
  paymentStatus: 'paid',
  subtotal: 26_900,
  discount: 0,
  total: 26_900,
  // Fully paid with a future due date, so the app never raises an overdue notification for it.
  paid: 26_900,
  due: 0,
  deliveryDate: '2099-01-02',
  paymentDueDate: '2099-01-03',
  dueReference: 'owner',
  createdAt: '2026-10-19T09:00:00.000Z',
  items: [
    { productId: 'e2e-product-a', productName: first, quantity: 1, unitPrice: 13_400, purchasePrice: 0 },
    { productId: 'e2e-product-b', productName: second, quantity: 1, unitPrice: 13_500, purchasePrice: 0 },
  ],
  // Posted for delivery, so its products may be marked delivered.
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
    postedAt: '2026-10-20T09:00:00.000Z',
    submittedById: '',
    submittedByName: '',
    submittedAt: '',
    updatedAt: '2026-10-20T09:00:00.000Z',
  },
}

type SavedOrder = { status: string; deliveredAt?: string | null; items: Array<{ status?: string; deliveredAt?: string | null }> }

let db: AdminDb

function today() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

const saved = () => db.read<SavedOrder>(`erp/orders/${orderId}`)

test.beforeAll(async () => {
  db = await connectAsAdmin()
  await db.set(`erp/orders/${orderId}`, order)
})

test.afterAll(async () => {
  if (!db) return
  await db.remove(`erp/orders/${orderId}`)
  for (const path of ['erp/activities', 'erp/notifications']) {
    const rows = (await db.read<Record<string, { message?: string; body?: string }>>(path)) ?? {}
    for (const [id, row] of Object.entries(rows)) {
      if ((row.message ?? row.body ?? '').includes(String(stamp))) await db.remove(`${path}/${id}`)
    }
  }
  const audit = (await db.read<Record<string, { refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (entry.refId === orderId) await db.remove(`erp/auditLog/${id}`)
  }
  expect(await db.read(`erp/orders/${orderId}`)).toBeNull()
  await db.close()
})

async function openRow(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(billNumber)
  const row = page.getByRole('row', { name: `View invoice ${billNumber}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

async function expand(page: Page) {
  await page.getByRole('button', { name: `Show products of ${billNumber}` }).click()
  const panel = page.getByTestId(`order-items-${orderId}`)
  await expect(panel).toBeVisible()
  return panel
}

async function setLine(page: Page, product: string, label: string) {
  const select = page.getByRole('combobox', { name: `Status of ${product}` })
  await select.click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await expect(select).toHaveText(label)
}

test.describe('Per-product status on the sales table', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  test.describe.configure({ mode: 'serial' })

  test('TC-20.1 one of two products delivered: the order is partly delivered and the open row shows which', async ({ page }, testInfo) => {
    const row = await openRow(page)
    // Expanding does not open the invoice.
    const panel = await expand(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(panel.getByRole('columnheader')).toHaveText(['Product', 'Qty', 'Status', 'Delivered date'])

    await setLine(page, first, 'Completed')
    await expect.poll(async () => (await saved())?.items[0].status).toBe('completed')
    const partial = await saved()
    expect(partial?.status).toBe('shipped')
    expect(partial?.deliveredAt ?? null).toBeNull()
    expect(partial?.items[1].status).toBe('shipped')

    await expect(row.getByTestId('order-progress')).toHaveText('1/2 delivered')
    const lines = panel.getByTestId('order-item-row')
    await expect(lines.nth(0)).toContainText(first)
    await expect(lines.nth(0)).toContainText(today())
    await expect(lines.nth(1)).toContainText(second)
    await expect(lines.nth(1)).toContainText('Not delivered')
    await screenshot(page, 'order-item-status-partial', testInfo)

    // Logged on the Daily Audit like an order status change.
    await expect
      .poll(async () => Object.values((await db.read<Record<string, { refId?: string; kind?: string; summary?: string }>>('erp/auditLog')) ?? {}).find((entry) => entry.refId === orderId)?.summary)
      .toContain(`${first}: Shipped → Completed`)
    note(testInfo, `${first} Completed, ${second} Shipped: order stays Shipped with "1/2 delivered" and no Delivered date.`)
  })

  test('TC-20.2 both products delivered: the order is delivered and gets its Delivered date', async ({ page }, testInfo) => {
    const row = await openRow(page)
    const panel = await expand(page)
    await setLine(page, second, 'Completed')
    await expect.poll(async () => (await saved())?.status).toBe('completed')
    const done = await saved()
    expect(done?.deliveredAt).toBeTruthy()
    expect(done?.deliveredAt).toBe([done?.items[0].deliveredAt, done?.items[1].deliveredAt].sort().at(-1))

    await expect(row.getByTestId('order-progress')).toHaveCount(0)
    await expect(row).toContainText('Completed')
    await expect(row).toContainText(today())
    await expect(panel.getByTestId('order-item-row').nth(1)).toContainText(today())
    await screenshot(page, 'order-item-status-delivered', testInfo)

    // Changing the whole order from the invoice moves every product with it.
    await row.getByRole('cell').nth(1).click()
    const details = page.getByRole('dialog', { name: `Invoice ${billNumber}` })
    await expect(details).toContainText('Applies to every product')
    await details.getByRole('combobox', { name: 'Order status' }).click()
    await page.getByRole('option', { name: 'Shipped', exact: true }).click()
    await expect.poll(async () => (await saved())?.items.map((item) => item.status)).toEqual(['shipped', 'shipped'])
    const back = await saved()
    expect(back?.deliveredAt ?? null).toBeNull()
    expect(back?.items.every((item) => !item.deliveredAt)).toBe(true)
    note(testInfo, `Both Completed: order Completed, Delivered ${today()}. Whole order back to Shipped cleared every product.`)
  })
})

test.describe('Per-product status on a phone in dark mode', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-20.3 the products open as a stacked list that fits 360px', async ({ page }, testInfo) => {
    await db.update(`erp/orders/${orderId}`, {
      status: 'shipped',
      deliveredAt: null,
      'items/0/status': 'completed',
      'items/0/deliveredAt': '2026-10-21T10:00:00.000Z',
      'items/1/status': 'shipped',
      'items/1/deliveredAt': null,
    })
    const row = await openRow(page)
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    const panel = await expand(page)
    await expect(row.getByTestId('order-progress')).toHaveText('1/2 delivered')
    const cards = panel.getByTestId('order-item-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Delivered: 21/10/2026')
    await expect(cards.nth(1)).toContainText('Delivered: Not delivered')
    await expect(panel.getByTestId('order-item-row').first()).toBeHidden()
    for (const card of await cards.all()) {
      const box = (await card.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await cards.nth(1).scrollIntoViewIfNeeded()
    await screenshot(page, 'mobile-dark-order-item-status', testInfo)

    // Leave the theme as it was.
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })
})
