import { expect, type Page, test } from '@playwright/test'

import { gotoViaSidebar, loginAsAdmin } from './auth'

/**
 * These tests run against the real Firebase Realtime Database configured
 * in .env (there is no test/mock backend for this project). Every record
 * created here uses a run-unique product name and is deleted again before
 * the test ends, including on failure, so the production data set is left
 * clean either way.
 */

async function selectRadixOption(page: Page, triggerSelector: string, optionText: string) {
  await page.click(triggerSelector)
  const option = page.getByRole('option', { name: optionText, exact: true })
  await option.waitFor({ state: 'visible' })
  await option.click()
  // Radix's close animation briefly leaves a dismissable overlay in place;
  // give it a moment to unmount before the trigger is interacted with again.
  await page.waitForTimeout(300)
}

async function deleteAllMatching(page: Page, productName: string) {
  let remaining = await page.locator(`tr:has-text("${productName}")`).count()
  while (remaining > 0) {
    const target = page.locator(`tr:has-text("${productName}")`).first()
    await target.locator('button[aria-label="Delete damage report"]').click()
    await expect(page.getByText('removed.')).toBeVisible()
    remaining = await page.locator(`tr:has-text("${productName}")`).count()
  }
}

test.describe('Damage Products', () => {
  test('saving without a zone shows an error inside the dialog instead of silently failing', async ({ page }) => {
    const productName = `E2E No Zone Test ${Date.now()}`

    await loginAsAdmin(page)
    await gotoViaSidebar(page, 'Damage Products', '**/admin/damage-products')

    await page.click('button:has-text("Report damage")')
    await page.fill('input[placeholder="e.g. Two Post Service Lift"]', productName)
    // Intentionally leave the Zone select untouched (no default value).
    await page.click('button:has-text("Save report")')

    // The dialog must stay open and show a visible reason, not fail silently.
    await expect(page.getByText('Report damage product')).toBeVisible()
    await expect(page.getByText('Please select a zone before saving.')).toBeVisible()

    // No row should have been created.
    await expect(page.locator(`tr:has-text("${productName}")`)).toHaveCount(0)
  })

  test('report, track status, edit, and delete a damage product', async ({ page }) => {
    const productName = `E2E Damage Test ${Date.now()}`

    await loginAsAdmin(page)
    await gotoViaSidebar(page, 'Damage Products', '**/admin/damage-products')
    await expect(page.getByText('Damage products', { exact: true })).toBeVisible()

    try {
      await test.step('report a new damage product', async () => {
        await page.click('button:has-text("Report damage")')
        await expect(page.getByText('Report damage product')).toBeVisible()

        await page.fill('input[placeholder="e.g. Two Post Service Lift"]', productName)
        await page.fill('input[type="number"]', '3')
        await selectRadixOption(page, 'button:has-text("Select zone")', 'Rangpur')

        await page.fill(
          'input[placeholder="e.g. Hydraulic cylinder leak found during unboxing"]',
          'E2E test: crushed during forklift handling'
        )

        await page.click('button:has-text("Save report")')
        await expect(page.getByText('New damage product reported.')).toBeVisible()

        const row = page.locator(`tr:has-text("${productName}")`)
        await expect(row).toBeVisible()
        await expect(row).toContainText('3')
        await expect(row).toContainText('Rangpur')
        await expect(row).toContainText('Pending at zone')
      })

      await test.step('advance status to Sent to main office', async () => {
        const row = page.locator(`tr:has-text("${productName}")`)
        await row.locator('button:has-text("Pending at zone")').click()
        await page.click('div[role="menuitem"]:has-text("Sent to main office")')
        await expect(page.getByText('marked as Sent to main office')).toBeVisible()

        await expect(row).toContainText('Sent to main office')
        // The "Sent to office" date column should no longer show the placeholder dash.
        const cells = row.locator('td')
        await expect(cells.nth(4)).not.toHaveText('-')
      })

      await test.step('edit the record', async () => {
        const row = page.locator(`tr:has-text("${productName}")`)
        await row.locator('button[aria-label="Edit damage report"]').click()
        await expect(page.getByText('Edit damage report')).toBeVisible()

        const editedName = `${productName} EDITED`
        await page.fill(`input[value="${productName}"]`, editedName)
        await page.click('button:has-text("Update report")')
        await expect(page.getByText('Damage report updated.')).toBeVisible()
        await expect(page.locator(`tr:has-text("${editedName}")`)).toBeVisible()
      })
    } finally {
      await test.step('clean up: delete the test record(s)', async () => {
        await deleteAllMatching(page, productName)
      })
    }
  })

  test('zone filter narrows the table to matching records', async ({ page }) => {
    const productName = `E2E Zone Filter Test ${Date.now()}`

    await loginAsAdmin(page)
    await gotoViaSidebar(page, 'Damage Products', '**/admin/damage-products')

    try {
      await test.step('report a damage product in Khulna zone', async () => {
        await page.click('button:has-text("Report damage")')
        await page.fill('input[placeholder="e.g. Two Post Service Lift"]', productName)
        await selectRadixOption(page, 'button:has-text("Select zone")', 'Khulna')
        await page.click('button:has-text("Save report")')
        await expect(page.getByText('New damage product reported.')).toBeVisible()
      })

      await test.step('filtering to a different zone hides the record', async () => {
        await selectRadixOption(page, 'button:has-text("All zones")', 'Sylhet')
        await expect(page.locator(`tr:has-text("${productName}")`)).toHaveCount(0)
      })

      await test.step('resetting to all zones shows the record again', async () => {
        await selectRadixOption(page, 'button:has-text("Sylhet")', 'All zones')
        await expect(page.locator(`tr:has-text("${productName}")`)).toBeVisible()
      })
    } finally {
      await test.step('clean up: delete the test record', async () => {
        await deleteAllMatching(page, productName)
      })
    }
  })
})
