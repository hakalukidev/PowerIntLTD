import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, type AdminDb } from './support/firebase'

/**
 * The ledger is the only source of a dealer's due. The opening due from the dealer form is the
 * sheet's first line, a hand-entered Credit Sheet entry changes the due once it gets both
 * approvals, and a dealer who has paid ahead shows "Advance". Every change here is submitted by the
 * admin and approved by the seeded Authorizer and Chairman.
 *
 * One test dealer is added through the form and removed afterwards with its ledger lines,
 * activities and notifications. The dealer alert route is stubbed, so nothing is sent.
 */

let db: AdminDb
const stamp = Date.now()
const name = `E2E Balance Dealer ${stamp}`
const phone = `01999-${String(stamp).slice(-6)}`

type StoredCustomer = { id: string; name: string; due: number }
type StoredEntry = { id: string; customerId: string; debit: number; credit: number; kind?: string; particulars: string }

async function dealer() {
  const customers = (await db.read<Record<string, StoredCustomer>>('erp/customers')) ?? {}
  return Object.values(customers).find((customer) => customer.name === name)
}

async function entriesOf(customerId: string) {
  const entries = (await db.read<Record<string, StoredEntry>>('erp/creditLedgerEntries')) ?? {}
  return Object.values(entries).filter((entry) => entry.customerId === customerId)
}

async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

const openingDueInput = (page: Page) => page.getByRole('dialog').getByLabel(/^Opening due \(/)

/** Opens the test dealer's sheet on the Credit Sheet page, unless it is already open. */
async function openSheet(page: Page) {
  const view = page.getByRole('button', { name: `View ${name} details` })
  if (await view.count()) await view.click()
  await expect(page.getByRole('button', { name: 'Add ledger entry' })).toBeVisible()
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
})

test.afterAll(async () => {
  if (!db) return
  const customers = (await db.read<Record<string, StoredCustomer>>('erp/customers')) ?? {}
  for (const customer of Object.values(customers).filter((entry) => entry.name === name)) {
    for (const entry of await entriesOf(customer.id)) await db.remove(`erp/creditLedgerEntries/${entry.id}`)
    await db.remove(`erp/customers/${customer.id}`)
  }
  for (const section of ['activities', 'notifications', 'changeRequests', 'ledgerEntryRequests', 'auditLog']) {
    const records = (await db.read<Record<string, unknown>>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      if (JSON.stringify(record).includes(name)) await db.remove(`erp/${section}/${id}`)
    }
  }
  await db.close()
})

test.beforeEach(async ({ page }) => {
  // A new ledger line alerts the dealer by WhatsApp; never let a test send one.
  await page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
  await loginAsAdmin(page)
})

test('TC-A.1 opening due, a hand entry and an advance all come from the ledger', async ({ browser, page }, testInfo) => {
  test.setTimeout(420_000)
  test.skip(!hasApproverLogins(), 'Changes need the Authorizer and Chairman logins seeded on the emulators.')
  const zones = Object.values((await db.read<Record<string, { name: string }>>('erp/zones')) ?? {})
  test.skip(zones.length === 0, 'No zones are set up yet.')

  // Add the dealer with an opening due of 1,000: it becomes the first line of the sheet.
  await navigate(page, '/admin/customers')
  await page.getByRole('button', { name: 'Add dealer' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('e.g. Karim Traders').fill(name)
  await dialog.getByPlaceholder('e.g. 01711-000000').fill(phone)
  await choose(page, dialog.locator('div.space-y-2').filter({ has: page.locator('p', { hasText: /^Zone/ }) }).first().getByRole('combobox'), zones[0].name)
  await openingDueInput(page).fill('1000')
  await dialog.getByRole('button', { name: 'Save dealer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await dealer()).toBeUndefined()
  await approveThroughBothStages(browser, name, page)

  await expect.poll(async () => (await dealer())?.due).toBe(1000)
  const { id } = (await dealer())!
  // Into the seeded Authorizer's depot, so they can authorize the dealer's later changes.
  await db.update(`erp/customers/${id}`, await authorizerDealerFields(db))
  expect(await entriesOf(id)).toEqual([expect.objectContaining({ particulars: 'Opening due', credit: 1000, debit: 0, kind: 'opening' })])

  // Editing the opening due changes that line, and the due with it.
  const row = page.locator('tbody tr', { hasText: name })
  await row.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(openingDueInput(page)).toHaveValue('1000')
  await openingDueInput(page).fill('1500')
  await page.getByRole('dialog').getByRole('button', { name: 'Update dealer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await dealer())?.due).toBe(1000)
  await approveThroughBothStages(browser, name, page)
  await expect.poll(async () => (await dealer())?.due).toBe(1500)
  expect((await entriesOf(id)).map((entry) => entry.credit)).toEqual([1500])

  // A 2,000 payment entered on the Credit Sheet takes the dealer 500 into advance.
  await navigate(page, '/admin/credit-sheet')
  await page.getByRole('button', { name: `View ${name} details` }).click()
  await page.getByRole('button', { name: 'Add ledger entry' }).click()
  const entryDialog = page.getByRole('dialog')
  await entryDialog.getByPlaceholder('e.g. Deposit (DBBL), Delivery Fee, Return').fill('E2E payment')
  await entryDialog.locator('div.space-y-2').filter({ hasText: /Debit amount/ }).locator('input').fill('2000')
  await entryDialog.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await dealer())?.due).toBe(1500)
  await approveThroughBothStages(browser, name, page)
  await expect.poll(async () => (await dealer())?.due).toBe(-500)
  await openSheet(page)

  // The sheet closes on "Advance 500"; only the hand entry can be deleted, not the opening due.
  const footer = page.locator('tfoot')
  await expect(footer).toContainText('Advance')
  await expect(footer).toContainText('500')
  await expect(page.getByRole('button', { name: 'Delete ledger entry' })).toHaveCount(1)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: 'Toggle color mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await footer.scrollIntoViewIfNeeded()
  await screenshot(page, 'credit-sheet-advance-mobile-dark', testInfo)
  await page.setViewportSize({ width: 1280, height: 800 })

  // The dealer list shows the same advance.
  await navigate(page, '/admin/customers')
  await expect(page.locator('tbody tr', { hasText: name })).toContainText('Advance 500')

  // Deleting the payment puts the due back to the opening 1,500.
  await navigate(page, '/admin/credit-sheet')
  await openSheet(page)
  await page.getByRole('button', { name: 'Delete ledger entry' }).click()
  await expect(page.getByText('Removing the entry was sent for approval.')).toBeVisible()
  await approveThroughBothStages(browser, name, page)
  await expect.poll(async () => (await dealer())?.due).toBe(1500)
  note(testInfo, `${name}: opening 1,000 → 1,500, a 2,000 payment → Advance 500, payment deleted → 1,500.`)
})
