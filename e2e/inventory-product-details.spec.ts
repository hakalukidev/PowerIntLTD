import { devices, expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Prompt 26: a product row in the inventory list opens a dialog with all its details and its stock
 * per warehouse (units on the shelves, valued at purchase cost). The row's buttons keep their own
 * action. An image that fails to load (the image host answering 401) shows the "No image" placeholder.
 *
 * Seeds two run-unique warehouses, a supplier and two products straight into the database and removes
 * them afterwards. The image URLs are answered by the test itself, so no image host is contacted.
 */

const stamp = Date.now()
const tag = `E2E26 ${stamp}`
const ids = {
  dhaka: `e2e26_wh_dhaka_${stamp}`,
  ctg: `e2e26_wh_ctg_${stamp}`,
  supplier: `e2e26_supplier_${stamp}`,
  broken: `e2e26_product_broken_${stamp}`,
  pictured: `e2e26_product_pictured_${stamp}`,
  low: `e2e26_product_low_${stamp}`,
}
const names = {
  dhaka: `${tag} Dhaka`,
  ctg: `${tag} Chattogram`,
  supplier: `${tag} Supplier`,
  broken: `${tag} Inverter`,
  pictured: `${tag} Battery`,
  low: `${tag} Charger`,
}
const imageHost = `https://res.cloudinary.com/e2e26-${stamp}`
const brokenImage = `${imageHost}/image/upload/disabled.png`
const workingImage = `${imageHost}/image/upload/working.png`
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

/** Digits of a rendered number or amount ("BDT 2,400" → 2400). */
const amount = (text: string) => Number(text.replace(/[^\d.-]/g, '')) || 0

let db: AdminDb

function seededProduct(id: string, name: string, imageUrl: string, now: string) {
  return {
    id, name, category: 'E2E Power', brand: 'E2E', sku: `E2E26-${id.slice(-6)}`, serialNumber: `SN-${stamp}`, warrantyMonths: 6,
    warehouseId: ids.dhaka, supplierId: ids.supplier, purchasePrice: 1000, sellingPrice: 1500, wholesalePrice: 1500,
    // 17 on the shelves, 2 of them held for an approved order: 15 can still be sold.
    stockQty: 15, reservedQty: 2, stockByWarehouse: { [ids.dhaka]: 12, [ids.ctg]: 5 },
    minStock: 4, maxStock: 0, status: 'active', description: '', imageUrl, createdAt: now, updatedAt: now,
  }
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = new Date().toISOString()
  await db.update('erp', {
    [`warehouses/${ids.dhaka}`]: { id: ids.dhaka, name: names.dhaka, location: 'E2E' },
    [`warehouses/${ids.ctg}`]: { id: ids.ctg, name: names.ctg, location: 'E2E' },
    [`suppliers/${ids.supplier}`]: {
      id: ids.supplier, name: names.supplier, company: names.supplier, phone: '', email: '', location: '', supplierType: 'local',
      country: 'Bangladesh', currency: 'BDT', createdAt: now, updatedAt: now,
    },
    [`products/${ids.broken}`]: seededProduct(ids.broken, names.broken, brokenImage, now),
    [`products/${ids.pictured}`]: seededProduct(ids.pictured, names.pictured, workingImage, now),
    // 3 left against a low-stock level of 4.
    [`products/${ids.low}`]: { ...seededProduct(ids.low, names.low, '', now), stockQty: 3, reservedQty: 0, stockByWarehouse: { [ids.ctg]: 3 }, status: 'low-stock' },
  })
})

test.afterAll(async () => {
  if (!db) return
  for (const [section, id] of [['products', ids.broken], ['products', ids.pictured], ['products', ids.low], ['suppliers', ids.supplier], ['warehouses', ids.dhaka], ['warehouses', ids.ctg]]) {
    await db.remove(`erp/${section}/${id}`)
    expect(await db.read(`erp/${section}/${id}`)).toBeNull()
  }
  await db.close()
})

/** Answers the image URLs: 401 for the "disabled" one, a PNG for the other. Returns the 401 count. */
async function serveImages(page: Page) {
  const refused = { count: 0 }
  await page.route(`${imageHost}/**`, (route) => {
    if (route.request().url() === brokenImage) {
      refused.count += 1
      return route.fulfill({ status: 401, contentType: 'text/plain', body: 'Unauthorized' })
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  return refused
}

async function productRow(page: Page, name: string) {
  await page.getByPlaceholder('Search inventory...').fill(tag)
  const row = page.getByRole('row', { name: `View details ${name}` })
  await expect(row).toBeVisible({ timeout: 20_000 })
  return row
}

async function expectPlaceholder(scope: Locator) {
  await expect(scope.locator('[data-product-image="none"]')).toHaveText('No image')
  await expect(scope.locator('img[data-product-image]')).toHaveCount(0)
}

async function expectDetails(dialog: Locator) {
  await expect(dialog.getByRole('heading', { name: names.broken })).toBeVisible()
  for (const text of [`E2E26-${ids.broken.slice(-6)}`, 'E2E Power', `SN-${stamp}`, names.supplier, '6 months', '15 available · 2 held for orders']) {
    await expect(dialog).toContainText(text)
  }
  expect(amount(await dialog.locator('[data-detail="purchase-cost"]').innerText())).toBe(1000)
  expect(amount(await dialog.locator('[data-detail="selling-price"]').innerText())).toBe(1500)
  await expect(dialog.locator('[data-detail="total-units"]')).toHaveText('17 units')
  expect(amount(await dialog.locator('[data-detail="stock-value"]').innerText())).toBe(17_000)
  await expect(dialog.locator('[data-detail="min-stock"]')).toHaveText('4 units')

  const table = dialog.locator('table[data-product-warehouses]')
  await expect(table.locator('thead th')).toHaveText(['Warehouse', 'Units', 'Value'])
  for (const [id, name, units] of [[ids.dhaka, names.dhaka, 12], [ids.ctg, names.ctg, 5]] as const) {
    const cells = table.locator(`tr[data-warehouse-id="${id}"] td`)
    await expect(cells.nth(0)).toContainText(name)
    expect(amount(await cells.nth(1).innerText())).toBe(units)
    expect(amount(await cells.nth(2).innerText())).toBe(units * 1000)
  }
  await expect(table.locator(`tr[data-warehouse-id="${ids.dhaka}"]`)).toContainText('(main)')
  const total = table.locator('tr[data-total] td')
  expect(amount(await total.nth(1).innerText())).toBe(17)
  expect(amount(await total.nth(2).innerText())).toBe(17_000)
}

test.describe('Product details on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-26.1 a row opens all details and stock per warehouse; a 401 image shows "No image"', async ({ page }, testInfo) => {
    const refused = await serveImages(page)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    const row = await productRow(page, names.broken)
    await expect.poll(() => refused.count).toBeGreaterThan(0)
    await expectPlaceholder(row)

    await row.locator('td').first().click()
    const dialog = page.getByRole('dialog')
    await expectDetails(dialog)
    await expectPlaceholder(dialog)
    await screenshot(page, 'inventory-product-details', testInfo)
    note(testInfo, `The image URL answered 401 ${refused.count} time(s); list and dialog showed "No image".`)

    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
    await expect(dialog).toBeHidden()

    // Keyboard: Enter on the focused row.
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').getByRole('heading', { name: names.broken })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()

    // The row's own Edit button opens the editor, not the details.
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edit product' })).toBeVisible()
    await expect(page.locator('[data-product-details]')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // The details dialog's Edit button hands over to the same editor.
    await row.locator('td').first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edit product' })).toBeVisible()
    await expect(page.locator('[data-product-details]')).toHaveCount(0)
  })

  test('TC-26.2 an image that loads is shown in the list and the dialog', async ({ page }) => {
    await serveImages(page)
    await loginAsAdmin(page)
    await navigate(page, '/admin/stock/overview')
    const row = await productRow(page, names.pictured)
    const thumbnail = row.locator('img[data-product-image="loaded"]')
    await expect(thumbnail).toHaveAttribute('src', workingImage)
    await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

    await row.locator('td').first().click()
    const image = page.getByRole('dialog').locator('img[data-product-image="loaded"]')
    await expect(image).toHaveAttribute('src', workingImage)
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  })
})

test('TC-26.4 a row in Low stock focus opens the same details', async ({ page }) => {
  await loginAsAdmin(page)
  await navigate(page, '/admin/stock/overview')
  await page.getByRole('button', { name: 'Low stock focus', exact: true }).click()
  const row = page.getByRole('row', { name: `View details ${names.low}` })
  await expect(row).toBeVisible({ timeout: 20_000 })

  await row.locator('td').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: names.low })).toBeVisible()
  await expect(dialog.locator('[data-detail="total-units"]')).toHaveText('3 units')
  await expect(dialog.locator('[data-detail="min-stock"]')).toHaveText('4 units')
  await expect(dialog).toContainText('low stock')
  const cells = dialog.locator(`table[data-product-warehouses] tr[data-warehouse-id="${ids.ctg}"] td`)
  expect(amount(await cells.nth(1).innerText())).toBe(3)
  expect(amount(await cells.nth(2).innerText())).toBe(3000)
  await expectPlaceholder(dialog)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('heading', { name: names.low })).toBeVisible()
})

const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']

test.describe('Product details on a 360px phone in dark mode', () => {
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-26.3 the dialog fits the screen and reads in dark mode', async ({ page }, testInfo) => {
    await serveImages(page)
    await loginAsAdmin(page)
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await navigate(page, '/admin/stock/overview')

    const row = await productRow(page, names.broken)
    await row.locator('td').first().click()
    const dialog = page.getByRole('dialog')
    await expectDetails(dialog)
    await expectPlaceholder(dialog)

    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

    // Dark surface, light text.
    const colours = await dialog.evaluate((element) => {
      // Through a canvas, so any colour syntax (rgb, oklch…) comes back as RGB.
      const context = document.createElement('canvas').getContext('2d')!
      const luminance = (value: string) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      }
      const heading = element.querySelector('h2') ?? element
      return { background: luminance(getComputedStyle(element).backgroundColor), text: luminance(getComputedStyle(heading).color) }
    })
    expect(colours.background).toBeLessThan(0.3)
    expect(colours.text).toBeGreaterThan(0.7)
    await screenshot(page, 'inventory-product-details-phone-dark', testInfo)
  })
})
