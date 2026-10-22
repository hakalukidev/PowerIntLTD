import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { approveThroughBothStages, hasApproverLogins } from './support/approvals'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin } from './support/firebase'

/**
 * Task 08: Approvals → Stock & warehouse → New stock shows the stock before the purchase,
 * the quantity received, and the total after it.
 *
 * Runs against the real database: seeds a run-unique product (27 in stock) and supplier, receives
 * 15 units through the Receive purchase dialog (approved by the seeded Authorizer and Chairman),
 * then deletes the purchase, its request, product, supplier and the
 * activity and notification the receive wrote, including on failure. The supplier alert is stubbed
 * out: its portal records can only be removed server-side, and it is not what this test covers.
 */

type Purchase = { id: string; productId: string; quantity: number; unitCost: number; stockBefore?: number; stockAfter?: number }

const amount = (text: string) => Number(text.replace(/[^\d.-]/g, '')) || 0

test('TC-08.1 receiving 15 units of a product that had 27 shows 27 | 15 | … | 42', async ({ browser, page }, testInfo) => {
  // Workspace loads, both approvals and cleanup; the default 30s can cut off the cleanup.
  test.setTimeout(240_000)
  test.skip(!hasApproverLogins(), 'A purchase needs the Authorizer and Chairman logins seeded on the emulators.')
  const stamp = Date.now()
  const productId = `product_e2e_${stamp}`
  const supplierId = `supplier_e2e_${stamp}`
  const productName = `E2E Stock ${stamp}`
  const supplierName = `E2E Supplier ${stamp}`
  const unitCost = 1250
  const now = new Date().toISOString()

  const db = await connectAsAdmin()
  const warehouseId = Object.keys((await db.read<Record<string, unknown>>('erp/warehouses')) ?? {})[0] ?? ''
  let purchaseId = ''

  try {
    await db.update('erp', {
      [`suppliers/${supplierId}`]: {
        id: supplierId, name: supplierName, company: 'E2E Test', phone: '', email: '', location: '', supplierType: 'local',
        country: '', lcNumber: '', lcStatus: 'not-required', productCost: 0, shippingCost: 0, customsDuty: 0, otherCost: 0,
        currency: 'BDT', notes: 'E2E test supplier', suppliedProducts: [], openingDue: 0, bankAccountName: '',
        bankAccountNumber: '', bankName: '', bankBranch: '', bankRoutingNumber: '', bankSwiftCode: '', mobileBankingNumber: '',
        nid: '', tradeLicenseNo: '', nomineeName: '', nomineeNid: '', chequeNumber: '', supplierPhotoUrl: '',
        supplierPhotoPublicId: '', bankDocumentUrl: '', bankDocumentPublicId: '', nidCopyUrl: '', nidCopyPublicId: '',
        tradeLicenseCopyUrl: '', tradeLicenseCopyPublicId: '', createdAt: now, updatedAt: now,
      },
      [`products/${productId}`]: {
        id: productId, name: productName, category: 'E2E', brand: 'E2E', sku: `E2E-${stamp}`, warehouseId, supplierId,
        purchasePrice: unitCost, sellingPrice: 0, wholesalePrice: 0, stockQty: 27, minStock: 0, maxStock: 1000,
        status: 'active', description: 'E2E test product', createdAt: now, updatedAt: now,
      },
    })

    await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ json: { skipped: true } }))
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Receive purchase' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Receive purchase' })).toBeVisible()

    await dialog.getByRole('combobox').first().click()
    await dialog.getByPlaceholder('Search products...').fill(productName)
    await dialog.getByRole('button', { name: productName }).filter({ hasNotText: 'Create product' }).click()
    await expect(dialog.getByText('27 units')).toBeVisible()
    await expect(dialog.getByRole('combobox').nth(1)).toHaveText(supplierName)

    const quantity = dialog.locator('div.space-y-2').filter({ has: page.locator('p', { hasText: /^Quantity received$/ }) }).locator('input')
    await quantity.fill('15')
    const cost = dialog.locator('div.space-y-2').filter({ has: page.locator('p', { hasText: /^Unit cost$/ }) }).locator('input')
    await cost.fill(String(unitCost))
    await expect(dialog.getByText('Stock after approval: 42 units')).toBeVisible()
    await dialog.getByRole('button', { name: 'Send for approval' }).click()
    await expect(page.getByText('Purchase sent for approval.')).toBeVisible({ timeout: 15_000 })

    // Stock only comes in with the final approval.
    expect((await db.read<{ stockQty: number }>(`erp/products/${productId}`))?.stockQty).toBe(27)
    await approveThroughBothStages(browser, supplierName, page)
    await expect.poll(async () => (await db.read<{ stockQty: number }>(`erp/products/${productId}`))?.stockQty).toBe(42)

    // The purchase keeps the stock before and after it was received.
    const purchase = Object.values((await db.read<Record<string, Purchase>>('erp/purchases')) ?? {}).find((item) => item.productId === productId)
    expect(purchase).toBeTruthy()
    purchaseId = purchase!.id
    expect(purchase).toMatchObject({ quantity: 15, unitCost, stockBefore: 27, stockAfter: 42 })

    await navigate(page, '/admin/approvals')
    await page.getByRole('button', { name: /Stock & warehouse/ }).click()
    const table = page.locator('table[data-report="new-stock"]')
    await expect(table).toBeVisible()
    await expect(table.locator('thead th')).toHaveText([
      'Product', 'Supplier', 'Previous stock qty', 'New stock qty', 'Unit cost (new stock)', 'Total qty', 'Total value', 'Warehouses',
    ])

    const cells = table.locator(`tr[data-purchase-id="${purchaseId}"] td`)
    await expect(cells.nth(0)).toHaveText(productName)
    await expect(cells.nth(1)).toHaveText(supplierName)
    expect(amount(await cells.nth(2).innerText())).toBe(27)
    expect(amount(await cells.nth(3).innerText())).toBe(15)
    expect(amount(await cells.nth(4).innerText())).toBe(unitCost)
    expect(amount(await cells.nth(5).innerText())).toBe(42)
    expect(amount(await cells.nth(6).innerText())).toBe(42 * unitCost)
    // All 15 went to the product's main warehouse, the one the dialog suggests.
    await expect(cells.nth(7)).toContainText('15')
    note(testInfo, `Row: 27 | 15 | ${unitCost} | 42 | ${42 * unitCost}.`)

    await table.scrollIntoViewIfNeeded()
    await screenshot(page, 'new-stock-before-after', testInfo)

    // On a phone, in dark mode, the table scrolls sideways and every column can be reached.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    const lastCell = table.locator(`tr[data-purchase-id="${purchaseId}"] td`).last()
    await lastCell.scrollIntoViewIfNeeded()
    await expect(lastCell).toBeInViewport()
    await screenshot(page, 'mobile-new-stock-before-after-dark', testInfo)
    await page.getByRole('button', { name: 'Toggle color mode' }).click()
  } finally {
    const activities = (await db.read<Record<string, { message?: string }>>('erp/activities')) ?? {}
    const notifications = (await db.read<Record<string, { body?: string }>>('erp/notifications')) ?? {}
    const purchases = (await db.read<Record<string, Purchase>>('erp/purchases')) ?? {}
    const requests = (await db.read<Record<string, Purchase>>('erp/purchaseRequests')) ?? {}
    const audit = (await db.read<Record<string, { party?: string }>>('erp/auditLog')) ?? {}
    const paths = [`erp/products/${productId}`, `erp/suppliers/${supplierId}`]
    for (const [id, item] of Object.entries(purchases)) if (item.productId === productId) paths.push(`erp/purchases/${id}`)
    for (const [id, item] of Object.entries(requests)) if (item.productId === productId) paths.push(`erp/purchaseRequests/${id}`)
    for (const [id, item] of Object.entries(audit)) if (item.party === supplierName) paths.push(`erp/auditLog/${id}`)
    for (const [id, activity] of Object.entries(activities)) if (activity.message?.includes(productName)) paths.push(`erp/activities/${id}`)
    for (const [id, item] of Object.entries(notifications)) if (item.body?.includes(productName)) paths.push(`erp/notifications/${id}`)
    const failed: string[] = []
    for (const path of paths) await db.remove(path).catch(() => failed.push(path))
    note(testInfo, `Cleaned up: ${paths.join(', ')}${failed.length ? `; could not remove: ${failed.join(', ')}` : ''}`)
    await db.close()
  }
})
