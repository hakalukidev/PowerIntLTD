import { devices, expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'

/**
 * Client feedback 9: tables on phones need less sideways scrolling. Below `md` the
 * shared table uses smaller text and padding and pins the name column; desktop is unchanged.
 */

const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']

function tableWithHeader(page: Page, header: string) {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: header, exact: true }) }).first()
}

function cellStyle(cell: Locator) {
  return cell.evaluate((element) => {
    const style = getComputedStyle(element)
    return { fontSize: style.fontSize, paddingLeft: style.paddingLeft, position: style.position }
  })
}

test.describe('Compact tables on a 360px phone', () => {
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-09.1 Dealers shows the name and two more columns without scrolling', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')
    const table = tableWithHeader(page, 'Dealer')
    await expect(table).toBeVisible({ timeout: 20_000 })

    // The scroll box is the wrapper the shared Table renders around the <table>.
    const layout = await table.evaluate((element) => {
      const box = element.parentElement!
      const right = box.getBoundingClientRect().right
      const headers = Array.from(element.querySelectorAll('thead th')).map((th) => ({
        text: th.textContent?.trim(),
        right: th.getBoundingClientRect().right,
      }))
      return { scrollLeft: box.scrollLeft, right, headers }
    })
    expect(layout.scrollLeft).toBe(0)
    const fullyVisible = layout.headers.filter((header) => header.right <= layout.right + 1).map((header) => header.text)
    expect(fullyVisible).toEqual(expect.arrayContaining(['Dealer', 'Contact', 'Location']))
    note(testInfo, `Columns visible without scrolling at 360px: ${fullyVisible.join(', ')}.`)

    const head = await cellStyle(table.getByRole('columnheader', { name: 'Dealer', exact: true }))
    expect(head.fontSize).toBe('11px')
    expect(head.position).toBe('sticky')
    const cell = await cellStyle(table.locator('tbody td').first())
    expect(cell.fontSize).toBe('12px')
    expect(cell.paddingLeft).toBe('8px')

    await screenshot(page, 'mobile-tables-dealers', testInfo)
  })

  test('TC-09.2 Sales pins Customer and shows the bill number under it', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    const table = tableWithHeader(page, 'Customer')
    await expect(table).toBeVisible({ timeout: 20_000 })

    await expect(table.locator('thead th', { hasText: /^Bill$/ })).toBeHidden()
    const customerHead = await cellStyle(table.getByRole('columnheader', { name: 'Customer', exact: true }))
    expect(customerHead.position).toBe('sticky')

    const firstRow = table.locator('tbody tr').first()
    if ((await firstRow.locator('td').count()) > 1) {
      const billCell = firstRow.locator('td').first()
      const bill = (await billCell.textContent())?.trim() ?? ''
      await expect(billCell).toBeHidden()
      await expect(firstRow.locator('td').nth(1)).toContainText(bill)
      note(testInfo, `Bill ${bill} shown under the customer name.`)
    }

    await screenshot(page, 'mobile-tables-sales', testInfo)
  })
})

test.describe('Tables on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-09.3 desktop tables keep their size and do not pin columns', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')
    const dealers = tableWithHeader(page, 'Dealer')
    await expect(dealers).toBeVisible({ timeout: 20_000 })

    const head = await cellStyle(dealers.getByRole('columnheader', { name: 'Dealer', exact: true }))
    expect(head).toEqual({ fontSize: '12px', paddingLeft: '12px', position: 'static' })
    const cell = await cellStyle(dealers.locator('tbody td').first())
    expect(cell).toEqual({ fontSize: '14px', paddingLeft: '12px', position: 'static' })

    await navigate(page, '/admin/sales')
    const sales = tableWithHeader(page, 'Customer')
    await expect(sales).toBeVisible({ timeout: 20_000 })
    await expect(sales.getByRole('columnheader', { name: 'Bill', exact: true })).toBeVisible()
  })
})
