import { expect, type Page, test } from '@playwright/test'

import { sanitizeNumberInput, stepAllowsDecimal } from '../src/lib/utils/number-input'
import { loginAsAdmin } from './auth'
import { navigate } from './support/evidence'

/**
 * Prompt 06: number fields have no spinner arrows, ignore the mouse wheel, replace a shown "0"
 * when typed into, and bring up the number keyboard on phones.
 * Nothing here submits a form; the only write is the admin login record.
 */

test.describe('sanitizeNumberInput', () => {
  test('strips leading zeros', () => {
    expect(sanitizeNumberInput('02000')).toBe('2000')
    expect(sanitizeNumberInput('0200')).toBe('200')
    expect(sanitizeNumberInput('00')).toBe('0')
    expect(sanitizeNumberInput('0')).toBe('0')
    expect(sanitizeNumberInput('')).toBe('')
    expect(sanitizeNumberInput('20018')).toBe('20018')
  })

  test('keeps "0." and decimals only when allowed', () => {
    expect(sanitizeNumberInput('0.', { decimal: true })).toBe('0.')
    expect(sanitizeNumberInput('00.50', { decimal: true })).toBe('0.50')
    expect(sanitizeNumberInput('.5', { decimal: true })).toBe('0.5')
    expect(sanitizeNumberInput('1.2.3', { decimal: true })).toBe('1.23')
    expect(sanitizeNumberInput('12.5')).toBe('125')
  })

  test('drops letters and only keeps a leading minus when allowed', () => {
    expect(sanitizeNumberInput('1e5')).toBe('15')
    expect(sanitizeNumberInput('1,000')).toBe('1000')
    expect(sanitizeNumberInput('-0200')).toBe('200')
    expect(sanitizeNumberInput('-0200', { negative: true })).toBe('-200')
    expect(sanitizeNumberInput('-', { negative: true })).toBe('-')
    expect(sanitizeNumberInput('5-', { negative: true })).toBe('5')
  })

  test('reads decimal steps', () => {
    expect(stepAllowsDecimal(undefined)).toBe(false)
    expect(stepAllowsDecimal('1')).toBe(false)
    expect(stepAllowsDecimal('any')).toBe(true)
    expect(stepAllowsDecimal('0.01')).toBe(true)
  })
})

function paidNow(page: Page) {
  return page.locator('div.space-y-2', { has: page.getByText('Paid now') }).locator('input[data-number-input]')
}

function quantity(page: Page) {
  return page.locator('div.space-y-1', { has: page.getByText('Quantity', { exact: true }) }).locator('input[data-number-input]').first()
}

test.describe('Order Form number fields', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/order-form')
    // "Paid now" sits in the Payment section, shown once its box is ticked.
    await page.getByLabel('Payment').check()
    await expect(paidNow(page)).toHaveValue('0')
  })

  test('typing 2000 into a field showing 0 gives 2000', async ({ page }) => {
    const paid = paidNow(page)
    await paid.click()
    await page.keyboard.type('2000')
    await expect(paid).toHaveValue('2000')

    // Even with the cursor placed after the 0, the 0 does not stay in front.
    await paid.fill('0')
    await paid.press('End')
    await page.keyboard.type('2000')
    await expect(paid).toHaveValue('2000')
  })

  test('focusing selects the value so typing replaces it', async ({ page }) => {
    const qty = quantity(page)
    await expect(qty).toHaveValue('1')
    await qty.click()
    await page.keyboard.type('25')
    await expect(qty).toHaveValue('25')
  })

  test('no spinner, number keyboard, mouse wheel does nothing', async ({ page }) => {
    const paid = paidNow(page)
    await expect(paid).toHaveAttribute('type', 'text')
    await expect(paid).toHaveAttribute('inputmode', 'numeric')
    await expect(page.locator('input[type="number"]')).toHaveCount(0)

    await paid.fill('500')
    await paid.focus()
    await paid.hover()
    await page.mouse.wheel(0, 300)
    await page.mouse.wheel(0, -600)
    await expect(paid).toHaveValue('500')
    await expect(paid).toBeFocused()
  })

  test('min is still enforced', async ({ page }) => {
    const qty = quantity(page)
    await qty.fill('0')
    expect(await qty.evaluate((node: HTMLInputElement) => node.validationMessage)).toContain('greater than or equal to 1')
    await qty.fill('3')
    expect(await qty.evaluate((node: HTMLInputElement) => node.validity.valid)).toBe(true)
  })
})

/** The number box right after a field label such as "Unit cost" or "Amount*". */
function fieldAfter(scope: Page | ReturnType<Page['getByRole']>, label: RegExp) {
  return scope.locator('p', { hasText: label }).first().locator('xpath=following-sibling::input[1]')
}

async function expectDecimal(input: ReturnType<typeof fieldAfter>) {
  await expect(input).toHaveAttribute('inputmode', 'decimal')
  await input.click()
  await input.pressSequentially('12.75')
  await expect(input).toHaveValue('12.75')
}

test.describe('supplier and cost fields take decimals', () => {
  // Only types into the forms and closes them; nothing is saved.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Suppliers & Imports: opening due and cost estimate', async ({ page }) => {
    await navigate(page, '/admin/suppliers')
    await page.getByRole('button', { name: 'Add supplier' }).click()
    const dialog = page.getByRole('dialog')
    await expectDecimal(fieldAfter(dialog, /^Opening due/))
    await dialog.getByText('+ Initial cost estimate').click()
    for (const label of [/^Typical product cost$/, /^Shipping cost$/, /^Customs duty$/, /^Other cost$/]) {
      await expectDecimal(fieldAfter(dialog, label))
    }
    await page.keyboard.press('Escape')
  })

  test('Supplier payment: amount', async ({ page }) => {
    await navigate(page, '/admin/supplier-payment')
    await expectDecimal(fieldAfter(page, /^Amount\*?$/))
  })

  test('Stock: receive purchase unit cost and product purchase cost', async ({ page }) => {
    await navigate(page, '/admin/stock/overview')
    await page.getByRole('button', { name: 'Receive purchase' }).click()
    await expectDecimal(fieldAfter(page.getByRole('dialog'), /^Unit cost$/))
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Add product' }).click()
    await expectDecimal(fieldAfter(page.getByRole('dialog'), /^Purchase cost/))
    await page.keyboard.press('Escape')
  })
})
