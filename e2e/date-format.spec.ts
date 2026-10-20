import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'

/**
 * Prompt 04: the team reads dates day first, so every displayed date is
 * DD/MM/YYYY — never "Oct 9, 2026" or month-first 10/09/2026.
 */

const DAY_FIRST = /^\d{2}\/\d{2}\/\d{4}$/
// "Oct 9, 2026" — the old `dateStyle: 'medium'` output.
const MONTH_NAME_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/

test.describe('Date display', () => {
  test('TC-04.1 sales table and Excel export show DD/MM/YYYY', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/sales')
    await page.waitForLoadState('networkidle')

    const table = page.locator('table').first()
    await expect(table.locator('tbody tr').first()).toBeVisible()
    await expect(table).not.toContainText(MONTH_NAME_DATE)

    const cells = (await table.locator('tbody td').allInnerTexts()).map((text) => text.trim())
    const dates = cells.filter((text) => /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(text) && !text.startsWith('INV'))
    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) expect(date).toMatch(DAY_FIRST)
    note(testInfo, `Sales table dates: ${dates.slice(0, 5).join(', ')}`)
    await screenshot(page, 'dates-sales-table', testInfo)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export data' }).click()
    const workbook = XLSX.readFile((await (await download).path())!)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.Sales)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.Created).toMatch(DAY_FIRST)
      if (row.Delivery) expect(row.Delivery).toMatch(DAY_FIRST)
    }
  })

  test('TC-04.2 dashboard shows no month-name dates', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).not.toContainText(MONTH_NAME_DATE)
  })
})
