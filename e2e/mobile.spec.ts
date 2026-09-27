import { devices, expect, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'

/**
 * Client feedback 8: most staff use the ERP on a phone, so every screen must fit
 * a phone and be easy to read. Checked on a common Android phone size.
 */

const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
test.use(phone)

const PAGES = [
  { href: '/admin/dashboard', name: 'dashboard' },
  { href: '/admin/sales', name: 'sales' },
  { href: '/admin/customers', name: 'dealers' },
  { href: '/admin/credit-sheet', name: 'credit-sheet' },
  { href: '/admin/stock/overview', name: 'stock' },
  { href: '/admin/suppliers', name: 'suppliers' },
  { href: '/admin/damage-products', name: 'damage-products' },
]

test.describe('Mobile layout', () => {
  test('TC-08.1 every main screen fits the phone width without sideways scrolling', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    const viewport = page.viewportSize()!
    note(testInfo, `Phone viewport: ${viewport.width}×${viewport.height} (Pixel 7).`)

    const overflowing: string[] = []
    for (const target of PAGES) {
      if (target.href !== '/admin/dashboard') await navigate(page, target.href)
      await page.waitForLoadState('networkidle')
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      if (scrollWidth > clientWidth + 1) overflowing.push(`${target.name} (${scrollWidth}px wide)`)
      await screenshot(page, `mobile-${target.name}`, testInfo)
    }

    expect(overflowing, `pages wider than the phone: ${overflowing.join(', ')}`).toEqual([])
    note(testInfo, `${PAGES.length} screens checked, none wider than the ${viewport.width}px screen.`)
  })

  test('TC-08.2 phone navigation: bottom tab bar and a slide-out menu instead of the sidebar', async ({ page }, testInfo) => {
    await loginAsAdmin(page)

    await expect(page.locator('aside').first()).toBeHidden()
    const tabBar = page.getByRole('navigation', { name: 'Main' })
    await expect(tabBar).toBeVisible()
    for (const label of ['Home', 'Sales', 'Dealers', 'Credit', 'More']) {
      await expect(tabBar.getByText(label, { exact: true })).toBeVisible()
    }

    // Tab buttons are large enough to tap comfortably (at least 44px high).
    const heights = await tabBar.locator('a, button').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)

    await tabBar.getByText('More', { exact: true }).click()
    const menu = page.getByRole('dialog')
    await expect(menu.locator('a[href="/admin/suppliers"]')).toBeVisible()
    await screenshot(page, 'mobile-menu-open', testInfo)
    await menu.locator('a[href="/admin/suppliers"]').click()
    await page.waitForURL('**/admin/suppliers')
    await expect(page.getByRole('heading', { name: 'Suppliers & Imports' })).toBeVisible()
    note(testInfo, `Bottom tab bar buttons are ${Math.round(Math.min(...heights))}px high; the More menu opens every other module.`)
  })

  test('TC-08.3 text is readable: body text at least 14px and inputs at least 16px (no zoom-in on focus)', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')

    const sizes = await page.evaluate(() => {
      const px = (element: Element | null) => (element ? parseFloat(getComputedStyle(element).fontSize) : 0)
      return {
        body: px(document.body),
        input: px(document.querySelector('main input')),
        font: getComputedStyle(document.body).fontFamily,
      }
    })
    expect(sizes.body).toBeGreaterThanOrEqual(14)
    // Phones zoom the page when an input under 16px is focused.
    expect(sizes.input).toBeGreaterThanOrEqual(16)
    note(testInfo, `Body text ${sizes.body}px, inputs ${sizes.input}px, font: ${sizes.font.split(',')[0]}.`)
  })

  test('TC-08.4 dialogs fit on the phone screen and can be scrolled', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')
    await page.getByRole('button', { name: 'Add dealer' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Measure once the open animation has finished and the dialog stops moving.
    let box = (await dialog.boundingBox())!
    await expect
      .poll(async () => {
        const previous = box
        await page.waitForTimeout(100)
        box = (await dialog.boundingBox())!
        return previous.x === box.x && previous.width === box.width
      })
      .toBe(true)
    const viewport = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box.height).toBeLessThanOrEqual(viewport.height)
    await screenshot(page, 'mobile-add-dealer-dialog', testInfo)
    note(testInfo, `Add dealer form is ${Math.round(box.width)}×${Math.round(box.height)}px on a ${viewport.width}×${viewport.height} screen.`)
  })
})
