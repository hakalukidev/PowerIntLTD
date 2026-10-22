import { devices, expect, test, type Page, type TestInfo } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin } from './support/firebase'

/**
 * Task 24: the Inventory value card states its basis (purchase cost), and its number is
 * units in stock × purchase cost summed over all products. The selling-price total is shown under it.
 *
 * Read-only: compares the card with the products in the database.
 */

type Product = { stockQty: number; purchasePrice: number; sellingPrice: number }

/** Digits of a rendered amount ("BDT 2,400" → 2400). */
const amount = (text: string) => Number(text.replace(/[^\d.-]/g, '')) || 0

const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']

async function expectInventoryCard(page: Page, testInfo: TestInfo, evidence: string) {
  const db = await connectAsAdmin()
  const products = Object.values((await db.read<Record<string, Product>>('erp/products')) ?? {})
  await db.close()
  const cost = products.reduce((sum, product) => sum + product.stockQty * product.purchasePrice, 0)
  const selling = products.reduce((sum, product) => sum + product.stockQty * product.sellingPrice, 0)

  await loginAsAdmin(page)
  await navigate(page, '/admin/stock/overview')
  const card = page.locator('[data-stat="inventory-value"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Inventory value (purchase cost)')
  await expect(card).toContainText('Units in stock × purchase cost')
  await expect(card.locator('[data-value="selling-price"]')).toContainText('At selling price:')
  await expect.poll(async () => amount(await card.locator('[data-value="purchase-cost"]').innerText())).toBe(cost)
  expect(amount(await card.locator('[data-value="selling-price"]').innerText())).toBe(selling)
  note(testInfo, `${products.length} product(s): purchase cost ${cost}, selling price ${selling}.`)

  await card.scrollIntoViewIfNeeded()
  await screenshot(page, evidence, testInfo)
  return card
}

test('TC-24.1 inventory value card is stock × purchase cost, with the selling-price total', async ({ page }, testInfo) => {
  await expectInventoryCard(page, testInfo, 'inventory-value-card')
})

test.describe('Inventory value card on a 360px phone', () => {
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-24.2 card text fits without widening the page', async ({ page }, testInfo) => {
    const card = await expectInventoryCard(page, testInfo, 'inventory-value-card-phone')
    const box = (await card.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    // The amount stays on one line instead of splitting mid-number.
    const lines = await card.locator('[data-value="purchase-cost"]').evaluate((element) => {
      const style = getComputedStyle(element)
      return Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight))
    })
    expect(lines).toBe(1)
  })
})
