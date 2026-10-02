import { expect, test } from '@playwright/test'

import { ADMIN_EMAIL, ADMIN_PASSWORD } from './auth'
import { note, screenshot } from './support/evidence'

/**
 * Staff reported that signing in needed two clicks. After the first click the
 * sign-in went through, but the button flipped back to "Enter dashboard" on the
 * login page while the dashboard loaded, so it looked like nothing happened.
 */
test.describe('Login', () => {
  test('TC-L.1 one click on "Enter dashboard" signs in and opens the dashboard', async ({ page }, testInfo) => {
    await page.goto('/')
    // The sign-in button, whatever it currently says.
    const submit = page.getByRole('button', { name: /Enter dashboard|Signing in|Loading users|Opening dashboard/ })
    await expect(submit).toHaveText(/Enter dashboard/)

    await page.locator('input[name="identifier"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)

    const started = Date.now()
    await submit.click()

    // Until the dashboard replaces the login screen, the button must never look ready for another click.
    const labelsSeen = new Set<string>()
    while (!page.url().includes('/admin/dashboard') || (await submit.count()) > 0) {
      if (Date.now() - started > 30_000) break
      if (await submit.count()) {
        const label = (await submit.innerText({ timeout: 200 }).catch(() => '')).trim()
        const enabled = await submit.isEnabled({ timeout: 200 }).catch(() => false)
        if (label) labelsSeen.add(`${label}${enabled ? ' (enabled)' : ''}`)
        expect(enabled && /Enter dashboard/.test(label), 'button offered a second click after signing in').toBe(false)
      }
      await page.waitForTimeout(50)
    }

    await page.waitForURL('**/admin/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    note(testInfo, `Dashboard opened ${Date.now() - started} ms after a single click.`)
    note(testInfo, `Button states seen after the click: ${Array.from(labelsSeen).join(' → ') || 'none (screen changed at once)'}.`)
    await screenshot(page, 'login-dashboard-after-one-click', testInfo)
  })

  test('TC-L.2 browser-autofilled email and password still sign in on the first click', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('button[type="submit"]')).toHaveText(/Enter dashboard/)

    // Chrome autofill puts values in the fields without the input events React listens to.
    await page.evaluate(
      ([email, password]) => {
        ;(document.querySelector('input[name="identifier"]') as HTMLInputElement).value = email
        ;(document.querySelector('input[type="password"]') as HTMLInputElement).value = password
      },
      [ADMIN_EMAIL, ADMIN_PASSWORD]
    )
    await page.locator('button[type="submit"]').click()

    await page.waitForURL('**/admin/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  })

  test('TC-L.3 a wrong password shows an error and the button can be used again', async ({ page }, testInfo) => {
    await page.goto('/')
    await page.locator('input[name="identifier"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill('definitely-wrong-password')
    await page.locator('button[type="submit"]').click()

    await expect(page.getByText('Invalid email, phone number, or password.')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Enter dashboard/)
    await screenshot(page, 'login-wrong-password', testInfo)
  })
})
