import { expect, type Page } from '@playwright/test'

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'robin@powerinternationalbd.com'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456'

/** Signs in through Firebase Auth (work email + password) and waits for the dashboard. */
export async function loginAsAdmin(page: Page) {
  await page.goto('/admin/dashboard')
  await expect(page.getByText('Sign in')).toBeVisible()

  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/admin/dashboard')
  await expect(page.getByRole('heading', { name: "Today's sales" })).toBeVisible()
}

export async function gotoViaSidebar(page: Page, linkText: string, urlPattern: string) {
  await page.locator(`a:has-text("${linkText}")`).click()
  await page.waitForURL(urlPattern)
}
