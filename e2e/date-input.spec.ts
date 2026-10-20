import { devices, expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'

/**
 * Prompt 05: date fields show and accept DD/MM/YYYY, the whole box opens the
 * calendar, and the calendar sits neatly under the box on desktop and phone.
 * Nothing here submits a form; the only write is the admin login record.
 */

const pad2 = (value: number) => String(value).padStart(2, '0')
const ddmmyyyy = (date: Date) => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
const calendar = (page: Page) => page.locator('[data-date-input-calendar]')

/** The date box under a small label like "From date". */
function dateField(page: Page, label: string) {
  return page.locator('div.space-y-1', { has: page.getByText(label, { exact: true }) }).locator('input[placeholder="DD/MM/YYYY"]')
}

/** The calendar is fully on screen, at least as wide as the box, and (unless the screen is too short) beside it. */
async function expectCalendarOnScreen(page: Page, input: Locator, { mayCoverBox = false } = {}) {
  const box = (await input.boundingBox())!
  const popover = (await calendar(page).boundingBox())!
  const viewport = page.viewportSize()!
  // Below the box, or flipped above it when there is no room underneath. On a short phone screen
  // where neither side fits, it slides over the box instead of running off the screen.
  const below = popover.y >= box.y + box.height - 1
  const above = popover.y + popover.height <= box.y + 1
  if (!mayCoverBox) expect(below || above, `calendar ${JSON.stringify(popover)} overlaps box ${JSON.stringify(box)}`).toBe(true)
  expect(popover.y).toBeGreaterThanOrEqual(0)
  expect(popover.y + popover.height).toBeLessThanOrEqual(viewport.height)
  expect(popover.width).toBeGreaterThanOrEqual(Math.min(box.width, viewport.width - 16) - 1)
  expect(popover.x).toBeGreaterThanOrEqual(0)
  expect(popover.x + popover.width).toBeLessThanOrEqual(viewport.width)
  return { box, popover }
}

test.describe('Date input', () => {
  test('TC-05.1 Sales from/to filters: DD/MM/YYYY, whole box opens the calendar, typing filters', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    await page.waitForLoadState('networkidle')

    const from = dateField(page, 'From date')
    const to = dateField(page, 'To date')
    await expect(page.locator('input[type="date"]')).toHaveCount(0)

    // Click the left part of the box, far from the calendar icon.
    await from.click({ position: { x: 12, y: 10 } })
    await expect(calendar(page)).toBeVisible()
    const { box, popover } = await expectCalendarOnScreen(page, from)
    expect(Math.abs(popover.x - box.x)).toBeLessThanOrEqual(1)
    await screenshot(page, 'date-input-sales-calendar', testInfo)

    await calendar(page).getByRole('button', { name: 'Today', exact: true }).click()
    await expect(calendar(page)).toBeHidden()
    await expect(from).toHaveValue(ddmmyyyy(new Date()))

    // A typed date far in the future leaves no matching sales.
    await from.fill('01/01/2099')
    await to.fill('31/12/2099')
    await expect(page.getByText('No sales orders match the current filters.')).toBeVisible()

    // An impossible date is flagged and does not change the filter.
    await to.fill('31/02/2099')
    await expect(to).toHaveAttribute('aria-invalid', 'true')
    expect(await to.evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('Enter a date as DD/MM/YYYY.')

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(from).toHaveValue('')
    await expect(to).toHaveValue('')
    await expect(to).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('No sales orders match the current filters.')).toBeHidden()
    note(testInfo, 'From/To show DD/MM/YYYY, open from anywhere on the box, and filter on typed dates.')
  })

  test('TC-05.2 Approvals Day selector works with the keyboard and changes the report day', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/approvals')
    await page.getByRole('button', { name: /Stock & warehouse/ }).click()

    const day = page.locator('label', { hasText: 'Day' }).locator('input[placeholder="DD/MM/YYYY"]')
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    await expect(day).toHaveValue(ddmmyyyy(today))
    await expect(page.getByText(`Purchases received on ${ddmmyyyy(today)}.`)).toBeVisible()

    await day.focus()
    await page.keyboard.press('ArrowDown')
    await expect(calendar(page)).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await expect(calendar(page)).toBeHidden()
    await expect(day).toHaveValue(ddmmyyyy(yesterday))
    await expect(day).toBeFocused()
    await expect(page.getByText(`Purchases received on ${ddmmyyyy(yesterday)}.`)).toBeVisible()

    await day.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(calendar(page)).toBeHidden()
    await expect(day).toBeFocused()
  })

  test('TC-05.3 inside a dialog: calendar opens, Escape closes only the calendar, required is enforced', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    await page.getByRole('button', { name: 'New sale' }).click()
    const dialog = page.getByRole('dialog').first()
    const delivery = dialog.locator('div.space-y-2', { hasText: 'Delivery date' }).locator('input[placeholder="DD/MM/YYYY"]')

    await expect(delivery).toHaveValue('')
    expect(await delivery.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)

    await delivery.click()
    await expect(calendar(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar(page)).toBeHidden()
    await expect(dialog).toBeVisible()

    await delivery.click()
    await calendar(page).getByRole('button', { name: 'Today', exact: true }).click()
    await expect(delivery).toHaveValue(ddmmyyyy(new Date()))
    expect(await delivery.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true)
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('Date input on a phone', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 740 } })

  test('TC-05.4 at 360px the calendar opens on tap and stays on screen', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    await page.waitForLoadState('networkidle')

    const to = dateField(page, 'To date')
    await to.scrollIntoViewIfNeeded()
    await to.tap()
    await expect(calendar(page)).toBeVisible()
    await expect(to).toHaveAttribute('inputmode', 'none')
    await expectCalendarOnScreen(page, to, { mayCoverBox: true })
    await screenshot(page, 'date-input-phone-calendar', testInfo)

    await calendar(page).getByRole('button', { name: 'Today', exact: true }).tap()
    await expect(to).toHaveValue(ddmmyyyy(new Date()))
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})
