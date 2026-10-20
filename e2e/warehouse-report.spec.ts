import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin } from './support/firebase'

/**
 * Task 07: Approvals → Stock & warehouse lists each product inside its warehouse, with the
 * warehouse name merged across its rows, a subtotal per warehouse and a grand total.
 *
 * Read-only: compares the rendered table with the products and warehouses in the database.
 */

type Product = { id: string; name: string; warehouseId?: string; stockQty: number; purchasePrice: number; minStock: number }
type Warehouse = { id: string; name: string }

/** Digits of a rendered number or amount ("BDT 2,400" → 2400). */
const amount = (text: string) => Number(text.replace(/[^\d.-]/g, '')) || 0

test('TC-07.1 warehouse report: one row per product, merged warehouse cell, subtotals and grand total', async ({ page }, testInfo) => {
  const db = await connectAsAdmin()
  const warehouses = (await db.read<Record<string, Warehouse>>('erp/warehouses')) ?? {}
  const products = Object.values((await db.read<Record<string, Product>>('erp/products')) ?? {})
  await db.close()

  // Same grouping as the report: an unknown warehouse id counts as "No warehouse".
  const groups = new Map<string, Product[]>()
  for (const id of Object.keys(warehouses)) groups.set(id, [])
  for (const product of products) {
    const key = product.warehouseId && warehouses[product.warehouseId] ? product.warehouseId : 'none'
    groups.set(key, [...(groups.get(key) ?? []), product])
  }

  await loginAsAdmin(page)
  await navigate(page, '/admin/approvals')
  await page.getByRole('button', { name: /Stock & warehouse/ }).click()
  const table = page.locator('table[data-report="warehouse"]')
  await expect(table).toBeVisible()
  await expect(table.locator('thead th')).toHaveText(['Warehouse', 'Product name', 'Quantity', 'Purchase price', 'Stock value', 'Low-stock qty'])

  for (const [warehouseId, items] of groups) {
    if (warehouseId === 'none' && !items.length) continue
    const cell = table.locator(`td[data-warehouse-id="${warehouseId}"]`)
    // The warehouse name appears once, spanning its products plus the subtotal row.
    await expect(cell).toHaveCount(1)
    await expect(cell).toHaveAttribute('rowspan', String(items.length ? items.length + 1 : 1))
    if (warehouseId !== 'none') await expect(cell).toContainText(warehouses[warehouseId].name)

    for (const product of items) {
      const row = table.locator(`tr[data-product-id="${product.id}"]`)
      const cells = row.locator('td:not([data-warehouse-id])')
      await expect(cells.nth(0)).toHaveText(product.name)
      expect(amount(await cells.nth(1).innerText())).toBe(product.stockQty)
      expect(amount(await cells.nth(2).innerText())).toBe(product.purchasePrice)
      expect(amount(await cells.nth(3).innerText())).toBe(product.stockQty * product.purchasePrice)
      expect(amount(await cells.nth(4).innerText())).toBe(product.minStock)
      const state = product.stockQty <= 0 ? 'out' : product.stockQty <= product.minStock ? 'low' : 'ok'
      await expect(row).toHaveAttribute('data-stock-state', state)
    }

    if (items.length) {
      // The subtotal row follows the warehouse's last product and matches the old Units / Stock value.
      const subtotal = cell.locator('xpath=..').locator(`xpath=following-sibling::tr[${items.length}]`)
      await expect(subtotal).toHaveAttribute('data-row', 'subtotal')
      const values = subtotal.locator('td')
      expect(amount(await values.nth(1).innerText())).toBe(items.reduce((sum, product) => sum + product.stockQty, 0))
      expect(amount(await values.nth(3).innerText())).toBe(items.reduce((sum, product) => sum + product.stockQty * product.purchasePrice, 0))
    }
  }

  const grand = table.locator('tr[data-row="grand-total"] td')
  const units = products.reduce((sum, product) => sum + product.stockQty, 0)
  const value = products.reduce((sum, product) => sum + product.stockQty * product.purchasePrice, 0)
  expect(amount(await grand.nth(1).innerText())).toBe(units)
  expect(amount(await grand.nth(3).innerText())).toBe(value)
  note(testInfo, `${groups.size} warehouse group(s), ${products.length} product(s), ${units} units, stock value ${value}.`)

  const shatha = Object.values(warehouses).find((warehouse) => warehouse.name === 'SHATHA')
  if (shatha) note(testInfo, `SHATHA spans ${(groups.get(shatha.id) ?? []).length} product row(s) plus its subtotal.`)

  await table.scrollIntoViewIfNeeded()
  await screenshot(page, 'warehouse-report-per-product', testInfo)
})
