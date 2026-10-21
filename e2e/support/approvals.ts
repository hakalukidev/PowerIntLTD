import { expect, type Browser, type Locator, type Page } from '@playwright/test'

import { loginAs, loginAsAdmin } from '../auth'
import { navigate } from './evidence'
import type { AdminDb } from './firebase'

/** The seeded Authorizer and Chairman logins (scripts/seed-emulator.mjs). */
export const APPROVERS = {
  authorizer: { email: process.env.E2E_AUTHORIZER_EMAIL ?? '', password: process.env.E2E_AUTHORIZER_PASSWORD ?? '' },
  chairman: { email: process.env.E2E_CHAIRMAN_EMAIL ?? '', password: process.env.E2E_CHAIRMAN_PASSWORD ?? '' },
}

/**
 * Where a test dealer has to be for the seeded Authorizer to review its submissions. The seeded
 * Authorizer owns a depot, which limits them to that depot's dealers (their zone check), so test
 * dealers join it; `{}` when the Authorizer has no such limit.
 */
export async function authorizerDealerFields(db: AdminDb): Promise<{ depotId?: string }> {
  const users = (await db.read<Record<string, { id: string; email?: string }>>('erp/users')) ?? {}
  const authorizer = Object.values(users).find((user) => user.email === APPROVERS.authorizer.email)
  const depots = (await db.read<Record<string, { id: string; ownerUserId?: string }>>('erp/depots')) ?? {}
  const depot = Object.values(depots).find((item) => authorizer && item.ownerUserId === authorizer.id)
  return depot ? { depotId: depot.id } : {}
}

/**
 * Next's dev server can fully reload the tabs already open when another session makes it compile
 * a page. The session lives in memory, so a reload signs the admin out; this signs them back in on
 * the page they were on. A production build never reloads like this.
 */
export async function keepAdminSignedIn(page: Page) {
  if (!(await page.getByRole('heading', { name: 'Sign in' }).count())) return
  const path = new URL(page.url()).pathname
  await loginAsAdmin(page)
  if (path !== '/admin/dashboard') await navigate(page, path)
}

export function hasApproverLogins() {
  return Boolean(APPROVERS.authorizer.email && APPROVERS.authorizer.password && APPROVERS.chairman.email && APPROVERS.chairman.password)
}

/**
 * The approval card holding `text`: the innermost block with that text and a review button. The
 * All tab lists every kind, so one helper finds any submission.
 */
export function approvalCard(page: Page, text: string | RegExp): Locator {
  return page
    .locator('div')
    .filter({ hasText: text })
    .filter({ has: page.getByRole('button', { name: /^(Authorize|Final approve|Reject)$/ }) })
    .last()
}

/** Signs in as one approver in a fresh browser context, with sheet alerts stubbed, on the Approvals page. */
export async function openApprovalsAs(browser: Browser, who: keyof typeof APPROVERS) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAs(page, APPROVERS[who].email, APPROVERS[who].password)
  // The session lives in memory, so move within the app rather than reloading the page.
  await navigate(page, '/admin/approvals')
  await expect(page.getByRole('button', { name: /^All/ })).toBeVisible({ timeout: 20_000 })
  return { page, close: () => context.close() }
}

/**
 * Clicks one review button on the submission's card and waits for the result banner, which only
 * appears once the whole review (posting, due recompute, audit) has finished. A red banner's text
 * becomes the error.
 */
export async function reviewOnCard(page: Page, text: string | RegExp, button: 'Authorize' | 'Final approve' | 'Reject') {
  const target = approvalCard(page, text).getByRole('button', { name: button, exact: true })
  await expect(target).toHaveCount(1, { timeout: 20_000 })
  const banner = page.locator('p.rounded-lg.border[class*="emerald"], p.rounded-lg.border[class*="rose"]').first()
  // Each review clears the previous banner first, so wait for that one to go before reading the new one.
  const previous = (await banner.count()) ? await banner.elementHandle() : null
  await target.click()
  if (previous) await expect.poll(() => previous.isVisible(), { timeout: 30_000 }).toBe(false)
  await expect(banner).toBeVisible({ timeout: 30_000 })
  const className = (await banner.getAttribute('class')) ?? ''
  if (!className.includes('emerald')) throw new Error(`${button} failed: ${await banner.innerText()}`)
}

/**
 * Every pending submission holding `text` (`count` of them) through both stages, one approver
 * session per stage. With `adminPage`, the admin's own tab is kept signed in (see keepAdminSignedIn).
 */
export async function approveAllThroughBothStages(browser: Browser, text: string | RegExp, count: number, adminPage?: Page) {
  for (const [who, button] of [
    ['authorizer', 'Authorize'],
    ['chairman', 'Final approve'],
  ] as const) {
    const session = await openApprovalsAs(browser, who)
    try {
      for (let index = 0; index < count; index += 1) await reviewOnCard(session.page, text, button)
    } finally {
      await session.close()
    }
  }
  if (adminPage) await keepAdminSignedIn(adminPage)
}

/**
 * Takes one pending submission through both stages the way the client works: the Authorizer
 * accepts it, then the Chairman gives final approval, each in their own session.
 */
export async function approveThroughBothStages(browser: Browser, text: string | RegExp, adminPage?: Page) {
  await approveAllThroughBothStages(browser, text, 1, adminPage)
}
