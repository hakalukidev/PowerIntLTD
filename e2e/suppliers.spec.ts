import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Client feedback 5: when adding a supplier, record which products they supply.
 * Client feedback 6: typing a product name in the Suppliers search shows that
 * product's details (and who supplies it).
 *
 * Test suppliers get run-unique names and are removed again at the end.
 */

type Product = { id: string; name: string; supplierId?: string }

let db: AdminDb
const stamp = Date.now()
const supplierName = `E2E Supplier ${stamp}`
const addedProduct = `E2E Gel Battery ${stamp}`
const typedProduct = `E2E Solar Charger ${stamp}`

test.beforeAll(async () => {
  db = await connectAsAdmin()
})

test.afterAll(async () => {
  const suppliers = (await db.read<Record<string, { name: string }>>('erp/suppliers')) ?? {}
  for (const [id, supplier] of Object.entries(suppliers)) {
    if (supplier.name.startsWith('E2E Supplier ')) await db.remove(`erp/suppliers/${id}`)
  }
  await db?.close()
})

const search = (page: Page) => page.getByPlaceholder('Search suppliers or products')
const supplierRow = (page: Page, name: string) => page.locator('tbody tr', { hasText: name })

test.describe.serial('Suppliers & Imports', () => {
  test('TC-05.1 a new supplier can be saved with the products they supply', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/suppliers')

    await page.getByRole('button', { name: 'Add supplier' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Add new supplier' })).toBeVisible()
    await expect(dialog.getByText('Products supplied', { exact: false })).toBeVisible()

    await dialog.getByPlaceholder('e.g. Shenzhen Auto Parts Co.').fill(supplierName)
    await dialog.getByPlaceholder('e.g. 01711-000000').fill('01888-000222')
    await dialog.getByPlaceholder('Name on the bank account').fill(supplierName)
    await dialog.getByPlaceholder('e.g. 1234 5678 9012').fill('1234567890')
    await dialog.getByPlaceholder('e.g. Dutch-Bangla Bank').fill('Dutch-Bangla Bank')
    await dialog.getByPlaceholder('e.g. Motijheel').fill('Motijheel')

    // One product added with the Add button, one left typed in the box when saving.
    const productBox = dialog.getByPlaceholder('e.g. 12V Car Battery')
    await productBox.fill(addedProduct)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByRole('button', { name: `Remove ${addedProduct}` })).toBeVisible()
    await productBox.fill(typedProduct)
    await dialog.getByText('Products supplied', { exact: false }).scrollIntoViewIfNeeded()
    await screenshot(page, 'supplier-add-products', testInfo)

    await dialog.getByRole('button', { name: 'Save supplier' }).click()
    await expect(page.getByText('New supplier added.')).toBeVisible()

    const row = supplierRow(page, supplierName)
    await expect(row).toContainText(`Supplies: ${addedProduct}, ${typedProduct}`)

    // Saved in the database, and shown again when the supplier is edited.
    const saved = Object.values((await db.read<Record<string, { name: string; suppliedProducts?: string[] }>>('erp/suppliers')) ?? {}).find(
      (supplier) => supplier.name === supplierName
    )
    expect(saved?.suppliedProducts).toEqual([addedProduct, typedProduct])
    await row.getByRole('button', { name: `Edit ${supplierName}` }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: `Remove ${typedProduct}` })).toBeVisible()
    await page.keyboard.press('Escape')
    note(testInfo, `Supplier saved with products: ${saved?.suppliedProducts?.join(', ')}.`)
  })

  test('TC-06.1 searching a product the supplier supplies shows the product and its supplier', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/suppliers')

    await search(page).fill(addedProduct)
    await expect(page.getByText('Matching products', { exact: true })).toBeVisible()
    const card = page.locator('div.rounded-2xl', { hasText: addedProduct }).filter({ hasText: 'Supplied by' }).first()
    await expect(card).toContainText('Not in product list')
    await expect(card).toContainText(supplierName)
    await expect(supplierRow(page, supplierName)).toBeVisible()
    expect(await page.locator('tbody tr').count()).toBe(1)
    await screenshot(page, 'supplier-search-typed-product', testInfo)
  })

  test('TC-06.2 searching a catalog product shows its full details', async ({ page }, testInfo) => {
    const products = Object.values((await db.read<Record<string, Product>>('erp/products')) ?? {})
    const product = products.find((candidate) => candidate.name && !candidate.name.startsWith('E2E')) ?? null
    test.skip(!product, 'No products in the catalog.')

    await loginAsAdmin(page)
    await navigate(page, '/admin/suppliers')
    await search(page).fill(product!.name)

    await expect(page.getByText('Matching products', { exact: true })).toBeVisible()
    const card = page.locator('div.rounded-2xl', { hasText: product!.name }).filter({ hasText: 'Supplied by' }).first()
    for (const label of ['Stock', 'Warehouse', 'Purchase price', 'Selling price', 'Wholesale price', 'Purchases', 'Last purchase', 'Supplied by']) {
      await expect(card.getByText(label, { exact: true })).toBeVisible()
    }
    note(testInfo, `Searching "${product!.name}" shows stock, warehouse, prices, purchase history and suppliers.`)
    await screenshot(page, 'supplier-search-catalog-product', testInfo)
  })

  test('TC-06.3 a search with no match shows neither product details nor suppliers', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/suppliers')
    await search(page).fill(`zz-no-such-product-${stamp}`)
    await expect(page.getByText('Matching products', { exact: true })).toHaveCount(0)
    await expect(page.getByText('No suppliers found.')).toBeVisible()
  })

  test('TC-05.2 the test supplier can be deleted again', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/suppliers')
    const row = supplierRow(page, supplierName)
    await row.getByRole('button', { name: `Delete ${supplierName}` }).click()
    await expect(page.getByText(`${supplierName} removed from supplier list.`)).toBeVisible()
    await expect(row).toHaveCount(0)
  })
})
