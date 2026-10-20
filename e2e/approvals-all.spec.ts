import { expect, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * Task 03: the Approvals page opens on an "All" tab listing every pending item with a type badge.
 *
 * Seeds two pending expenses, approves one and rejects the other from the All tab, and checks the
 * stored result. The expenses, and the activity and daily audit entries the review writes, are
 * removed again afterwards.
 */

let db: AdminDb
const stamp = Date.now()
const category = `E2E All Tab ${stamp}`
const expenses = [
  { id: `e2e_expense_${stamp}_a`, expenseBy: `E2E All Tab Spender A ${stamp}`, amount: 111 },
  { id: `e2e_expense_${stamp}_b`, expenseBy: `E2E All Tab Spender B ${stamp}`, amount: 222 },
]

const APPROVAL_TABS = ['Orders', 'Deposits', 'Ledger entries', 'Payments', 'Expenses', 'Record changes']

function tabButton(page: Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^${label}\\s*\\d*$`) })
}

async function tabCount(page: Page, label: string) {
  const text = (await tabButton(page, label).innerText()).replace(label, '').trim()
  return Number(text) || 0
}

/** A seeded expense's card title ("<spender> · <amount>"); the feedback banner names the spender too. */
function titleOf(page: Page, expenseBy: string) {
  return page.getByText(new RegExp(`^${expenseBy} ·`))
}

/** The card for one seeded expense: the innermost block holding its title and its review buttons. */
function cardFor(page: Page, expenseBy: string) {
  return page.locator('div').filter({ has: titleOf(page, expenseBy) }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last()
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const now = Date.now()
  for (const [index, expense] of expenses.entries()) {
    const at = new Date(now - index * 60_000).toISOString()
    await db.set(`erp/expenses/${expense.id}`, {
      id: expense.id,
      category,
      amount: expense.amount,
      note: 'Created by the e2e test; removed automatically.',
      date: at,
      expenseBy: expense.expenseBy,
      createdBy: 'e2e',
      createdByName: 'E2E Test',
      createdAt: at,
      status: 'pending',
    })
  }
})

test.afterAll(async () => {
  if (!db) return
  for (const expense of expenses) await db.remove(`erp/expenses/${expense.id}`)
  const audit = (await db.read<Record<string, { refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (expenses.some((expense) => expense.id === entry.refId)) await db.remove(`erp/auditLog/${id}`)
  }
  const activities = (await db.read<Record<string, { message?: string }>>('erp/activities')) ?? {}
  for (const [id, activity] of Object.entries(activities)) {
    if (activity.message?.includes(category)) await db.remove(`erp/activities/${id}`)
  }
  await db.close()
})

test('TC-03.1 All tab is the default, counts every pending item and reviews like the specific tab', async ({ page }, testInfo) => {
  await loginAsAdmin(page)
  await navigate(page, '/admin/approvals')

  // All is first and selected by default; report tabs stay separate.
  const tabs = page.locator('button').filter({ hasText: /^(All|Orders|Deposits|Ledger entries|Payments|Expenses|Record changes|Stock & warehouse|Daily closing|Delivery)/ })
  await expect(tabs.first()).toHaveText(/^All/)
  await expect(cardFor(page, expenses[0].expenseBy)).toBeVisible({ timeout: 20_000 })
  await expect(cardFor(page, expenses[1].expenseBy)).toBeVisible()

  // Each item carries its type badge, newest first.
  await expect(cardFor(page, expenses[0].expenseBy).locator('[data-approval-type="expenses"]')).toHaveText('Expense')
  const order = await page.getByText(new RegExp(`^E2E All Tab Spender [AB] ${stamp} ·`)).allInnerTexts()
  expect(order[0]).toContain('Spender A')

  // The All badge is the sum of the six approval tab badges.
  const counts = await Promise.all(APPROVAL_TABS.map((label) => tabCount(page, label)))
  const all = await tabCount(page, 'All')
  note(testInfo, `All = ${all}; ${APPROVAL_TABS.map((label, index) => `${label} ${counts[index]}`).join(', ')}`)
  expect(all).toBe(counts.reduce((sum, count) => sum + count, 0))
  expect(all).toBeGreaterThanOrEqual(2)
  await screenshot(page, 'approvals-all-tab', testInfo)

  // Approve one and reject the other from All.
  await cardFor(page, expenses[0].expenseBy).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(`Expense of`).filter({ hasText: expenses[0].expenseBy })).toContainText('approved and added to the daily audit')
  await cardFor(page, expenses[1].expenseBy).getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByText(`Expense of`).filter({ hasText: expenses[1].expenseBy })).toContainText('rejected and added to the daily audit')
  await expect(titleOf(page, expenses[0].expenseBy)).toHaveCount(0)
  await expect(titleOf(page, expenses[1].expenseBy)).toHaveCount(0)
  await expect.poll(() => tabCount(page, 'All')).toBe(all - 2)

  // Same stored result as reviewing from the Expenses tab: status, reviewer and a daily audit entry.
  const [approved, rejected] = await Promise.all(expenses.map((expense) => db.read<{ status: string; reviewedByName?: string }>(`erp/expenses/${expense.id}`)))
  expect(approved?.status).toBe('approved')
  expect(rejected?.status).toBe('rejected')
  expect(approved?.reviewedByName).toBeTruthy()
  const audit = Object.values((await db.read<Record<string, { refId?: string; decision?: string }>>('erp/auditLog')) ?? {})
  expect(audit.find((entry) => entry.refId === expenses[0].id)?.decision).toBe('approved')
  expect(audit.find((entry) => entry.refId === expenses[1].id)?.decision).toBe('rejected')

  // Reviewed items show up under the Expenses tab's "Reviewed today", like a review made there.
  await tabButton(page, 'Expenses').click()
  await expect(page.getByText('Reviewed today')).toBeVisible()
  await expect(page.getByText(expenses[0].expenseBy)).toBeVisible()
})
