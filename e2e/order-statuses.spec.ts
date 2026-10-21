import { devices, expect, test, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 14: order statuses come from settings. The test adds its own status,
 * moves one seeded order onto it, renames it and deletes it again, so the real
 * statuses and real orders are never touched. Everything it writes (the order,
 * the status, and the activity / notification rows they cause) is removed afterwards.
 */

const stamp = Date.now()
const firstLabel = `E2E Packed ${stamp}`
const renamedLabel = `E2E Dispatched ${stamp}`
const order = {
  id: `e2e-order-status-${stamp}`,
  billNumber: `E2E-OS-${stamp}`,
  customerId: `e2e-customer-${stamp}`,
  customerName: `E2E Status Dealer ${stamp}`,
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

type StatusMap = Record<string, { label: string }>

let db: AdminDb
let statusesBefore: StatusMap

test.beforeAll(async () => {
  db = await connectAsAdmin()
  statusesBefore = (await db.read<StatusMap>('erp/settings/orderStatuses')) ?? {}
  await db.set(`erp/orders/${order.id}`, order)
})

test.afterAll(async () => {
  if (!db) return
  await db.remove(`erp/orders/${order.id}`)
  // Only statuses this run added; the ones that existed before are left alone.
  const statuses = (await db.read<StatusMap>('erp/settings/orderStatuses')) ?? {}
  for (const [id, status] of Object.entries(statuses)) {
    if (!statusesBefore[id] && status.label.includes(String(stamp))) await db.remove(`erp/settings/orderStatuses/${id}`)
  }
  const activities = (await db.read<Record<string, { message?: string }>>('erp/activities')) ?? {}
  for (const [id, activity] of Object.entries(activities)) {
    if (activity.message?.includes(String(stamp))) await db.remove(`erp/activities/${id}`)
  }
  const notifications = (await db.read<Record<string, { body?: string }>>('erp/notifications')) ?? {}
  for (const [id, item] of Object.entries(notifications)) {
    if (item.body?.includes(String(stamp))) await db.remove(`erp/notifications/${id}`)
  }
  const audit = (await db.read<Record<string, { refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (entry.refId === order.id) await db.remove(`erp/auditLog/${id}`)
  }

  expect(await db.read(`erp/orders/${order.id}`)).toBeNull()
  expect(Object.keys((await db.read<StatusMap>('erp/settings/orderStatuses')) ?? {}).sort()).toEqual(Object.keys(statusesBefore).sort())
  await db.close()
})

async function openSales(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/sales')
  await page.getByPlaceholder('Search bill, customer, product, sales person').fill(order.billNumber)
  const row = page.getByRole('row', { name: `View invoice ${order.billNumber}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

async function filterOptions(page: Page) {
  await page.getByRole('combobox', { name: 'Status filter' }).click()
  const options = await page.getByRole('option').allTextContents()
  await page.keyboard.press('Escape')
  return options
}

test.describe('Configurable order statuses', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-14.1 add, use, rename and delete a status without a deploy', async ({ page }, testInfo) => {
    const row = await openSales(page)

    // The table shows a read-only badge, not a select.
    await expect(row.getByRole('combobox')).toHaveCount(0)
    await expect(row).toContainText('Pending')

    // Add a status from the admin dialog.
    await page.getByRole('button', { name: 'Manage statuses' }).click()
    const manager = page.getByRole('dialog', { name: 'Order statuses' })
    await expect(manager.getByRole('button', { name: /^Delete Pending$/ })).toBeDisabled()
    await manager.getByRole('button', { name: 'Add status' }).click()
    await manager.getByLabel('Status name').fill(firstLabel)
    await manager.getByRole('radio', { name: 'Teal' }).click()
    await manager.getByRole('button', { name: 'Add status' }).click()
    await expect(manager).toContainText(firstLabel)
    await screenshot(page, 'order-statuses-manager', testInfo)
    await page.keyboard.press('Escape')

    expect(await filterOptions(page)).toContain(firstLabel)

    // Move the order onto it from the order dialog.
    await row.click()
    const details = page.getByRole('dialog', { name: `Invoice ${order.billNumber}` })
    await details.getByRole('combobox', { name: 'Order status' }).click()
    await page.getByRole('option', { name: firstLabel }).click()
    await expect(details.getByRole('combobox', { name: 'Order status' })).toHaveText(firstLabel)
    await page.keyboard.press('Escape')
    await expect(row).toContainText(firstLabel)
    await expect.poll(async () => (await db.read<{ status: string }>(`erp/orders/${order.id}`))?.status).not.toBe('pending')

    // Status changes need no approval, but each one is on the Daily Audit: order, old → new, who and when.
    await expect
      .poll(async () =>
        Object.values((await db.read<Record<string, { kind: string; refId: string; summary: string; decision: string; reviewedByName: string }>>('erp/auditLog')) ?? {}).find(
          (entry) => entry.kind === 'order_status' && entry.refId === order.id
        )
      )
      .toMatchObject({ decision: 'changed', summary: expect.stringContaining(`→ ${firstLabel}`), reviewedByName: expect.any(String) })

    // Rename it: the table, filter and dialog all follow.
    await page.getByRole('button', { name: 'Manage statuses' }).click()
    await manager.getByRole('button', { name: `Edit ${firstLabel}` }).click()
    await manager.getByLabel('Status name').fill(renamedLabel)
    await manager.getByRole('button', { name: 'Save status' }).click()
    await expect(manager).toContainText(renamedLabel)
    await page.keyboard.press('Escape')

    await expect(row).toContainText(renamedLabel)
    const options = await filterOptions(page)
    expect(options).toContain(renamedLabel)
    expect(options).not.toContain(firstLabel)
    await page.getByRole('combobox', { name: 'Status filter' }).click()
    await page.getByRole('option', { name: renamedLabel }).click()
    await expect(row).toBeVisible()
    await row.click()
    await expect(details.getByRole('combobox', { name: 'Order status' })).toHaveText(renamedLabel)
    await screenshot(page, 'order-statuses-renamed-in-dialog', testInfo)
    await page.keyboard.press('Escape')

    // Delete it: the order in use must be moved to a replacement first.
    await page.getByRole('button', { name: 'Manage statuses' }).click()
    await manager.getByRole('button', { name: `Delete ${renamedLabel}` }).click()
    await expect(manager).toContainText('1 order uses it')
    await manager.getByRole('combobox', { name: 'Replacement status' }).click()
    await page.getByRole('option', { name: 'Pending', exact: true }).click()
    await manager.getByRole('button', { name: 'Delete status' }).click()
    await expect(manager).not.toContainText(renamedLabel)
    await page.keyboard.press('Escape')

    // The filter on the deleted status falls back to every status, and the order is back on Pending.
    await expect(row).toContainText('Pending')
    await expect.poll(async () => (await db.read<{ status: string }>(`erp/orders/${order.id}`))?.status).toBe('pending')
    note(testInfo, `Status "${firstLabel}" was renamed to "${renamedLabel}" and deleted; order ${order.billNumber} moved back to Pending.`)
  })
})

test.describe('Order statuses on a phone', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-14.2 badge in the table and status select in the dialog fit a phone', async ({ page }, testInfo) => {
    const row = await openSales(page)
    await expect(row.getByRole('combobox')).toHaveCount(0)

    await page.getByRole('button', { name: 'Manage statuses' }).click()
    const manager = page.getByRole('dialog', { name: 'Order statuses' })
    const box = await manager.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(360)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-order-statuses-manager', testInfo)
    await page.keyboard.press('Escape')

    await row.locator('td').nth(1).click()
    const details = page.getByRole('dialog', { name: `Invoice ${order.billNumber}` })
    await expect(details.getByRole('combobox', { name: 'Order status' })).toHaveText('Pending')
    await screenshot(page, 'mobile-order-status-in-dialog', testInfo)
  })
})
