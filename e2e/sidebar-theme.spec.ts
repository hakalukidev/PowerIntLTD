import { devices, expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { note, screenshot } from './support/evidence'

/**
 * Prompt 17: in light mode the sidebar is white like the rest of the page, in dark
 * mode it keeps its dark look, and it scrolls without drawing a scrollbar.
 */

const WHITE = 'rgb(255, 255, 255)'
// The dark-mode sidebar tokens (globals.css, .dark), which this change must leave alone.
const DARK_BACKGROUND = 'hsl(220 28% 6%)'
const DARK_FOREGROUND = 'hsl(210 20% 92%)'

/** What the browser computes for a CSS colour, so it can be compared with getComputedStyle. */
async function rgb(page: Page, color: string) {
  return page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }, color)
}

/** The sidebar's own panel (background and text colour) and its scrolling menu. */
function sidebarParts(root: Locator) {
  const panel = root.locator('div.bg-sidebar').first()
  return { panel, menu: panel.locator(':scope > div.overflow-y-auto') }
}

async function styleOf(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, color: style.color, scrollbarWidth: style.scrollbarWidth, overflowY: style.overflowY }
  })
}

async function toDarkMode(page: Page) {
  await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
}

test.describe('Sidebar theme on desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('TC-17.1 light mode: white sidebar, no scrollbar, still scrolls with the mouse wheel', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

    const aside = page.locator('aside').first()
    const { panel, menu } = sidebarParts(aside)
    expect((await styleOf(aside)).background).toBe(WHITE)
    expect((await styleOf(panel)).background).toBe(WHITE)

    const menuStyle = await styleOf(menu)
    expect(menuStyle.scrollbarWidth).toBe('none')
    expect(menuStyle.overflowY).toBe('auto')

    const { scrollHeight, clientHeight } = await menu.evaluate((node) => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }))
    expect(scrollHeight, 'the menu is taller than the sidebar, so it has to scroll').toBeGreaterThan(clientHeight)
    await menu.evaluate((node) => (node.scrollTop = 0))
    await menu.hover()
    await page.mouse.wheel(0, 400)
    await expect.poll(() => menu.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
    await menu.evaluate((node) => (node.scrollTop = 0))

    await screenshot(page, 'sidebar-desktop-light', testInfo)
    note(testInfo, `Sidebar background ${WHITE}; menu scrollbar-width none; wheel scrolled a ${scrollHeight}px menu in a ${clientHeight}px panel.`)
  })

  test('TC-17.2 dark mode: sidebar keeps its dark colours, collapsed sidebar too', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await toDarkMode(page)

    const aside = page.locator('aside').first()
    const { panel, menu } = sidebarParts(aside)
    const expectedBackground = await rgb(page, DARK_BACKGROUND)
    await expect.poll(async () => (await styleOf(panel)).background).toBe(expectedBackground)
    expect((await styleOf(panel)).color).toBe(await rgb(page, DARK_FOREGROUND))
    // The brand name stays white on the dark sidebar, as before.
    expect(await aside.getByText('Power International', { exact: true }).evaluate((node) => getComputedStyle(node).color)).toBe(WHITE)
    expect((await styleOf(menu)).scrollbarWidth).toBe('none')
    await screenshot(page, 'sidebar-desktop-dark', testInfo)

    await page.getByTitle('Collapse sidebar').click()
    await expect(page.getByTitle('Expand sidebar')).toBeVisible()
    expect((await styleOf(menu)).scrollbarWidth).toBe('none')
    await screenshot(page, 'sidebar-desktop-dark-collapsed', testInfo)

    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    await expect.poll(async () => (await styleOf(panel)).background).toBe(WHITE)
    await screenshot(page, 'sidebar-desktop-light-collapsed', testInfo)

    note(testInfo, `Dark sidebar background ${expectedBackground}, unchanged; collapsed sidebar follows both themes.`)
  })
})

test.describe('Sidebar theme on a 360px phone', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  for (const theme of ['light', 'dark'] as const) {
    test(`TC-17.3 ${theme} mode: menu drawer and All modules sheet follow the theme and hide the scrollbar`, async ({ page }, testInfo) => {
      await loginAsAdmin(page)
      if (theme === 'dark') await toDarkMode(page)
      const expectedBackground = theme === 'light' ? WHITE : await rgb(page, DARK_BACKGROUND)

      await page.getByRole('button', { name: 'Open menu' }).click()
      const drawer = page.getByRole('dialog')
      const { panel, menu } = sidebarParts(drawer)
      await expect(panel).toBeVisible()
      // Wait for the slide-in to finish, so the screenshot shows the whole drawer.
      await expect.poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1)).toBe(0)
      await expect.poll(async () => (await styleOf(panel)).background).toBe(expectedBackground)
      const menuStyle = await styleOf(menu)
      expect(menuStyle.scrollbarWidth).toBe('none')
      expect(menuStyle.overflowY).toBe('auto')
      // Still scrollable: the browser moves it, so touch scrolling works the same way.
      await menu.evaluate((node) => node.scrollBy(0, 300))
      await expect.poll(() => menu.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
      await menu.evaluate((node) => (node.scrollTop = 0))
      await screenshot(page, `sidebar-phone-${theme}-drawer`, testInfo)
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()

      await page.getByRole('navigation', { name: 'Main' }).getByText('More', { exact: true }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet.getByText('All modules')).toBeVisible()
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox()
          return box ? Math.round(box.y + box.height) : 0
        })
        .toBe(page.viewportSize()!.height)
      expect((await styleOf(sheet)).scrollbarWidth).toBe('none')
      await screenshot(page, `sidebar-phone-${theme}-all-modules`, testInfo)

      note(testInfo, `${theme}: drawer background ${expectedBackground}; drawer and All modules sheet draw no scrollbar.`)
    })
  }
})
