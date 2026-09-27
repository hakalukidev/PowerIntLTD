import { expect, type Page } from '@playwright/test'

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'robin@powerinternationalbd.com'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456'

/** Signs in through Firebase Auth (work email + password) and waits for the dashboard. */
export async function loginAsAdmin(page: Page) {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 })

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/admin/dashboard')
  // Firebase sign-in plus the first database load can take several seconds on a slow connection.
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 })
}

export async function gotoViaSidebar(page: Page, linkText: string, urlPattern: string) {
  await page.locator(`a:has-text("${linkText}")`).click()
  await page.waitForURL(urlPattern)
}
