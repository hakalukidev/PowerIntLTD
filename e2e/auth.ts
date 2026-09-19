import { expect, type Page } from '@playwright/test'

<<<<<<< HEAD
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'robin@powerinternationalbd.com'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456'

/** Signs in through Firebase Auth (work email + password) and waits for the dashboard. */
=======
export const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '01844902338'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456'

/**
 * Logs into the demo admin account and waits out the LoginScreen's
 * unconditional `router.replace('/admin/dashboard')` (see LoginScreen.tsx)
 * so callers land on a stable, fully-authenticated dashboard before
 * navigating anywhere else via the sidebar.
 */
>>>>>>> 64d31e6 (update)
export async function loginAsAdmin(page: Page) {
  await page.goto('/admin/dashboard')
  await expect(page.getByText('Sign in')).toBeVisible()

<<<<<<< HEAD
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
=======
  await page.getByPlaceholder('01844902338').fill(ADMIN_PHONE)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
>>>>>>> 64d31e6 (update)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/admin/dashboard')
  await expect(page.getByRole('heading', { name: "Today's sales" })).toBeVisible()
}

export async function gotoViaSidebar(page: Page, linkText: string, urlPattern: string) {
  await page.locator(`a:has-text("${linkText}")`).click()
  await page.waitForURL(urlPattern)
}
