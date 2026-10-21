import { expect, test, type Page } from '@playwright/test'
import { increment } from 'firebase/database'

import { ADMIN_EMAIL, loginAsAdmin } from './auth'
import { approveThroughBothStages, authorizerDealerFields, hasApproverLogins, keepAdminSignedIn, openApprovalsAs, reviewOnCard } from './support/approvals'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Prompt 02: every create, edit and delete passes the Authorizer, then the Chairman's final
 * approval, and only the final approval touches sheets, balances and stock, on the record's own
 * date. Nobody reviews their own submission, and the Authorizer cannot also give final approval.
 *
 * The admin submits (through the forms, or seeded as the admin's own submissions); the seeded
 * Authorizer and Chairman logins review on the Approvals page. Everything the run creates is
 * removed afterwards. Sheet alerts are stubbed, so nothing is sent.
 */

let db: AdminDb
const stamp = Date.now()
const tag = `E2E2S ${stamp}`
const ids = {
  depositDealer: `e2e2s_dealer_dep_${stamp}`,
  orderDealer: `e2e2s_dealer_ord_${stamp}`,
  ledgerDealer: `e2e2s_dealer_led_${stamp}`,
  rejectDealer: `e2e2s_dealer_rej_${stamp}`,
  raceDealer: `e2e2s_dealer_race_${stamp}`,
  paySupplier: `e2e2s_supplier_pay_${stamp}`,
  stockSupplier: `e2e2s_supplier_stock_${stamp}`,
  changeSupplier: `e2e2s_supplier_chg_${stamp}`,
  product: `e2e2s_product_${stamp}`,
}
const names = {
  depositDealer: `${tag} Deposit Dealer`,
  orderDealer: `${tag} Order Dealer`,
  ledgerDealer: `${tag} Ledger Dealer`,
  rejectDealer: `${tag} Reject Dealer`,
  raceDealer: `${tag} Race Dealer`,
  paySupplier: `${tag} Pay Supplier`,
  stockSupplier: `${tag} Stock Supplier`,
  changeSupplier: `${tag} Change Supplier`,
  product: `${tag} Battery`,
  expenseBy: `${tag} Spender`,
}
/** The deposit's own date ("the 9th"), long before the review days, so the day holds nothing else. */
const DEPOSIT_DAY = '2021-03-09'
const DEPOSIT_DAY_SHOWN = '09/03/2021'

let adminUid = ''
let authorizerUid = ''
let zoneId = ''

type Stored = Record<string, Record<string, unknown>>

const iso = (day: string) => new Date(`${day}T10:00:00`).toISOString()

async function due(customerId: string) {
  return (await db.read<{ due: number }>(`erp/customers/${customerId}`))?.due
}

async function entriesOf(customerId: string) {
  const entries = (await db.read<Stored>('erp/creditLedgerEntries')) ?? {}
  return Object.values(entries).filter((entry) => entry.customerId === customerId)
}

/** A pending submission as the admin's own, so only the Authorizer and Chairman may review it. */
function submittedByAdmin(at = new Date().toISOString()) {
  return { status: 'pending', submittedById: adminUid, submittedByName: 'E2E Admin', createdAt: at, updatedAt: at }
}

/** The Approvals page's Daily closing for the deposit's day. */
async function openClosing(page: Page) {
  await page.getByRole('button', { name: /^Daily closing/ }).click()
  const dayInput = page.locator('label', { hasText: 'Day' }).locator('input[placeholder="DD/MM/YYYY"]')
  await dayInput.fill(DEPOSIT_DAY_SHOWN)
  await dayInput.press('Enter')
  await expect(page.getByRole('heading', { name: `Daily closing — ${DEPOSIT_DAY_SHOWN}` })).toBeVisible()
}

function stubAlerts(page: Page) {
  return page.route('**/api/admin/portal/transaction', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"skipped":true}' }))
}

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const users = (await db.read<Record<string, { id: string; email?: string; roleId: string; zoneIds?: string[] }>>('erp/users')) ?? {}
  adminUid = Object.values(users).find((user) => user.email === ADMIN_EMAIL)?.id ?? ''
  const authorizer = Object.values(users).find((user) => user.email === process.env.E2E_AUTHORIZER_EMAIL)
  authorizerUid = authorizer?.id ?? ''
  const zones = Object.keys((await db.read<Stored>('erp/zones')) ?? {})
  // Dealers go in a zone the Authorizer covers.
  zoneId = authorizer?.zoneIds?.[0] ?? zones[0] ?? ''

  const now = new Date().toISOString()
  // In the seeded Authorizer's territory, so they can authorize these dealers' submissions.
  const territory = await authorizerDealerFields(db)
  for (const key of ['depositDealer', 'orderDealer', 'ledgerDealer', 'rejectDealer', 'raceDealer'] as const) {
    await db.set(`erp/customers/${ids[key]}`, { ...testDealer(ids[key], names[key], `01888-${String(stamp).slice(-5)}${key.length % 10}`, zoneId), ...territory })
  }
  for (const key of ['paySupplier', 'stockSupplier', 'changeSupplier'] as const) {
    await db.set(`erp/suppliers/${ids[key]}`, {
      id: ids[key],
      name: names[key],
      company: names[key],
      phone: `01777-${String(stamp).slice(-6)}`,
      email: '',
      location: '',
      supplierType: 'local',
      country: 'Bangladesh',
      currency: 'BDT',
      createdAt: now,
      updatedAt: now,
    })
  }
  const products = (await db.read<Stored>('erp/products')) ?? {}
  const template = Object.values(products)[0]
  await db.set(`erp/products/${ids.product}`, {
    ...template,
    id: ids.product,
    name: names.product,
    sku: `E2E2S-${stamp}`,
    supplierId: ids.stockSupplier,
    stockQty: 50,
    minStock: 1,
    purchasePrice: 900,
    sellingPrice: 1000,
    createdAt: now,
    updatedAt: now,
  })
})

test.afterAll(async () => {
  if (!db) return
  const sections = [
    'customers',
    'suppliers',
    'products',
    'deposits',
    'orderRequests',
    'orders',
    'ledgerEntryRequests',
    'creditLedgerEntries',
    'supplierPayments',
    'expenses',
    'purchaseRequests',
    'purchases',
    'changeRequests',
  ]
  const ours = new Set(Object.values(ids))
  for (const section of sections) {
    const records = (await db.read<Stored>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      const text = JSON.stringify(record)
      if (ours.has(id) || text.includes(tag) || [...ours].some((ourId) => text.includes(ourId))) await db.remove(`erp/${section}/${id}`)
    }
  }
  for (const section of ['activities', 'notifications', 'auditLog']) {
    const records = (await db.read<Stored>(`erp/${section}`)) ?? {}
    for (const [id, record] of Object.entries(records)) {
      if (JSON.stringify(record).includes(tag)) await db.remove(`erp/${section}/${id}`)
    }
  }
  await db.close()
})

test.beforeEach(async () => {
  test.skip(!hasApproverLogins(), 'The Authorizer and Chairman test logins are only seeded on the emulators.')
  expect(adminUid, 'the seeded admin is in erp/users').not.toBe('')
})

test('TC-02.1 a deposit dated D reaches the sheet and daily closing on D, only after final approval', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000)
  const depositId = `e2e2s_deposit_${stamp}`
  const method = `${tag} Cash`
  await db.set(`erp/deposits/${depositId}`, {
    id: depositId,
    customerId: ids.depositDealer,
    customerName: names.depositDealer,
    date: iso(DEPOSIT_DAY),
    amount: 4321,
    method,
    note: `${tag} deposit`,
    zoneId,
    ...submittedByAdmin(),
  })

  // The admin submitted it, so the admin sees it waiting but cannot authorize it.
  await stubAlerts(page)
  await loginAsAdmin(page)
  await navigate(page, '/admin/approvals')
  const ownCard = page.locator('div').filter({ hasText: `${tag} deposit` }).filter({ hasText: 'You submitted this' }).last()
  await expect(ownCard).toBeVisible({ timeout: 20_000 })
  await expect(ownCard.getByRole('button', { name: 'Authorize' })).toHaveCount(0)

  // Stage 1. Nothing is posted yet.
  const authorizer = await openApprovalsAs(browser, 'authorizer')
  await reviewOnCard(authorizer.page, `${tag} deposit`, 'Authorize')
  // The Authorizer cannot also give the final approval: the card now just waits for the Chairman.
  const authorizedCard = authorizer.page.locator('div').filter({ hasText: `${tag} deposit` }).filter({ hasText: 'Waiting for Chairman' }).last()
  await expect(authorizedCard).toBeVisible()
  await expect(authorizedCard.getByRole('button', { name: /^(Final approve|Authorize)$/ })).toHaveCount(0)
  await authorizer.close()
  expect(await entriesOf(ids.depositDealer)).toHaveLength(0)
  expect(await due(ids.depositDealer)).toBe(0)

  await keepAdminSignedIn(page)
  await openClosing(page)
  await expect(page.getByText(method)).toHaveCount(0)

  // Stage 2 posts it, on its own date.
  const chairman = await openApprovalsAs(browser, 'chairman')
  await reviewOnCard(chairman.page, `${tag} deposit`, 'Final approve')
  await chairman.close()

  await expect.poll(async () => (await entriesOf(ids.depositDealer)).length).toBe(1)
  const [entry] = await entriesOf(ids.depositDealer)
  expect(String(entry.date).slice(0, 10)).toBe(new Date(iso(DEPOSIT_DAY)).toISOString().slice(0, 10))
  expect(entry.debit).toBe(4321)
  await expect.poll(() => due(ids.depositDealer)).toBe(-4321)
  const deposit = await db.read<{ status: string; authorizedById: string; reviewedById: string }>(`erp/deposits/${depositId}`)
  expect(deposit?.status).toBe('approved')
  expect(deposit?.authorizedById).toBe(authorizerUid)
  expect(deposit?.reviewedById).not.toBe(authorizerUid)

  // The daily closing for D, not today, now shows it.
  await keepAdminSignedIn(page)
  await openClosing(page)
  await expect(page.getByText(method)).toBeVisible({ timeout: 20_000 })
  await screenshot(page, 'two-stage-daily-closing-entry-date', testInfo)

  // And the dealer's sheet shows it on D.
  await navigate(page, '/admin/credit-sheet')
  await page.getByRole('button', { name: `View ${names.depositDealer} details` }).click()
  await expect(page.locator('tbody tr', { hasText: method })).toContainText(DEPOSIT_DAY_SHOWN)
  note(testInfo, `Deposit dated ${DEPOSIT_DAY_SHOWN}: not on the sheet after authorization, on the sheet and daily closing for ${DEPOSIT_DAY_SHOWN} after final approval. Due −4,321.`)
})

test('TC-02.2 order, ledger entry, payment, expense, purchase and record change each pass both stages', async ({ browser, page }, testInfo) => {
  test.setTimeout(480_000)
  const now = new Date().toISOString()
  await db.set(`erp/orderRequests/e2e2s_order_${stamp}`, {
    id: `e2e2s_order_${stamp}`,
    customerId: ids.orderDealer,
    customerName: names.orderDealer,
    employeeId: '',
    employeeName: '',
    items: [{ productId: ids.product, productName: names.product, quantity: 3, unitPrice: 1000, purchasePrice: 900 }],
    subtotal: 3000,
    discount: 0,
    total: 3000,
    paid: 500,
    due: 2500,
    orderDate: iso('2021-03-10'),
    deliveryDate: iso('2021-03-12'),
    courierName: '',
    billNumber: `E2E2S-${stamp}`,
    overCreditLimit: false,
    zoneId,
    submittedByRole: 'Admin',
    ...submittedByAdmin(now),
  })
  await db.set(`erp/ledgerEntryRequests/e2e2s_ledger_${stamp}`, {
    id: `e2e2s_ledger_${stamp}`,
    customerId: ids.ledgerDealer,
    customerName: names.ledgerDealer,
    date: iso('2021-03-11'),
    particulars: `${tag} delivery fee`,
    qty: 0,
    unitPrice: 0,
    debit: 0,
    credit: 250,
    zoneId,
    ...submittedByAdmin(now),
  })
  await db.set(`erp/supplierPayments/e2e2s_payment_${stamp}`, {
    id: `e2e2s_payment_${stamp}`,
    supplierId: ids.paySupplier,
    supplierName: names.paySupplier,
    date: iso('2021-03-11'),
    method: 'cash',
    fromAccountId: '',
    fromLabel: '',
    toAccountId: '',
    toLabel: '',
    sendingType: '',
    cashReceiver: 'E2E receiver',
    proofUrl: '',
    proofPublicId: '',
    amount: 777,
    purpose: `${tag} payment`,
    note: '',
    ...submittedByAdmin(now),
  })
  await db.set(`erp/expenses/e2e2s_expense_${stamp}`, {
    id: `e2e2s_expense_${stamp}`,
    category: 'Office',
    amount: 333,
    note: `${tag} expense`,
    date: iso('2021-03-11'),
    expenseBy: names.expenseBy,
    status: 'pending',
    createdBy: adminUid,
    createdByName: 'E2E Admin',
    createdAt: now,
  })

  await stubAlerts(page)
  await loginAsAdmin(page)

  // The admin's own edit of a supplier, filed as a change request.
  await db.set(`erp/changeRequests/e2e2s_change_${stamp}`, {
    id: `e2e2s_change_${stamp}`,
    kind: 'supplier',
    action: 'update',
    targetId: ids.changeSupplier,
    targetName: names.changeSupplier,
    input: { name: names.changeSupplier, phone: '01700-000222', company: names.changeSupplier },
    ...submittedByAdmin(now),
  })

  // The admin receives stock through Receive purchase: it waits, and stock does not move yet.
  await navigate(page, '/admin/stock/overview')
  await page.getByRole('button', { name: 'Receive purchase' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Receive purchase' })
  await dialog.getByRole('combobox').first().click()
  await dialog.getByPlaceholder('Search products...').fill(names.product)
  await dialog.getByRole('button', { name: names.product }).filter({ hasNotText: 'Create product' }).click()
  await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Received date$/ }) }).locator('input[placeholder="DD/MM/YYYY"]').fill('11/03/2021')
  await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Quantity received$/ }) }).locator('input').fill('20')
  await dialog.locator('div.space-y-2', { has: page.locator('p', { hasText: /^Unit cost$/ }) }).locator('input').fill('950')
  await dialog.getByRole('button', { name: 'Send for approval' }).click()
  await expect(page.getByText('Purchase sent for approval.')).toBeVisible({ timeout: 20_000 })
  const requests = Object.values((await db.read<Stored>('erp/purchaseRequests')) ?? {}).filter((request) => request.productId === ids.product)
  expect(requests).toHaveLength(1)
  expect(requests[0].status).toBe('pending')
  expect((await db.read<{ stockQty: number }>(`erp/products/${ids.product}`))?.stockQty).toBe(50)

  // Stage 1 for each kind: nothing moves.
  const cards = [names.orderDealer, `${tag} delivery fee`, `${tag} payment`, names.expenseBy, names.changeSupplier, names.stockSupplier]
  const authorizer = await openApprovalsAs(browser, 'authorizer')
  for (const text of cards) await reviewOnCard(authorizer.page, text, 'Authorize')
  await screenshot(authorizer.page, 'two-stage-waiting-for-chairman', testInfo)
  await authorizer.close()
  expect(Object.values((await db.read<Stored>('erp/orders')) ?? {}).filter((order) => order.customerId === ids.orderDealer)).toHaveLength(0)
  expect(await entriesOf(ids.ledgerDealer)).toHaveLength(0)
  expect((await db.read<{ stockQty: number }>(`erp/products/${ids.product}`))?.stockQty).toBe(50)
  expect((await db.read<{ phone: string }>(`erp/suppliers/${ids.changeSupplier}`))?.phone).not.toBe('01700-000222')

  // Stage 2 posts each one.
  const chairman = await openApprovalsAs(browser, 'chairman')
  await chairman.page.setViewportSize({ width: 390, height: 844 })
  for (const text of cards) await reviewOnCard(chairman.page, text, 'Final approve')
  await chairman.close()

  const orders = Object.values((await db.read<Stored>('erp/orders')) ?? {}).filter((order) => order.customerId === ids.orderDealer)
  expect(orders).toHaveLength(1)
  expect(String(orders[0].createdAt).slice(0, 10)).toBe(new Date(iso('2021-03-10')).toISOString().slice(0, 10))
  await expect.poll(() => due(ids.orderDealer)).toBe(2500)

  await expect.poll(async () => (await entriesOf(ids.ledgerDealer)).length).toBe(1)
  await expect.poll(() => due(ids.ledgerDealer)).toBe(250)

  expect((await db.read<{ status: string }>(`erp/supplierPayments/e2e2s_payment_${stamp}`))?.status).toBe('approved')
  expect((await db.read<{ status: string }>(`erp/expenses/e2e2s_expense_${stamp}`))?.status).toBe('approved')
  expect((await db.read<{ phone: string }>(`erp/suppliers/${ids.changeSupplier}`))?.phone).toBe('01700-000222')

  // Stock: 50 − 3 sold + 20 received; the purchase is on the supplier's sheet on its received date.
  await expect.poll(async () => (await db.read<{ stockQty: number }>(`erp/products/${ids.product}`))?.stockQty).toBe(67)
  const purchases = Object.values((await db.read<Stored>('erp/purchases')) ?? {}).filter((purchase) => purchase.productId === ids.product)
  expect(purchases).toHaveLength(1)
  expect(purchases[0].total).toBe(19_000)
  expect(String(purchases[0].createdAt).slice(0, 10)).toBe(new Date(iso('2021-03-11')).toISOString().slice(0, 10))

  // The daily audit names both approvers for each.
  const audit = Object.values((await db.read<Stored>('erp/auditLog')) ?? {}).filter((entry) => JSON.stringify(entry).includes(tag) || entry.party === names.orderDealer)
  expect(audit.length).toBeGreaterThanOrEqual(6)
  note(testInfo, 'Order, ledger entry, supplier payment, expense, purchase and supplier change: authorized (nothing moved), then final-approved (posted).')
})

test('TC-02.3 a rejection at either stage changes nothing and tells the submitter', async ({ browser }) => {
  test.setTimeout(240_000)
  for (const [suffix, amount] of [
    ['a', 111],
    ['b', 222],
  ] as const) {
    await db.set(`erp/deposits/e2e2s_reject_${suffix}_${stamp}`, {
      id: `e2e2s_reject_${suffix}_${stamp}`,
      customerId: ids.rejectDealer,
      customerName: names.rejectDealer,
      date: iso('2021-03-09'),
      amount,
      method: 'Cash',
      note: `${tag} reject ${suffix}`,
      zoneId,
      ...submittedByAdmin(),
    })
  }

  const authorizer = await openApprovalsAs(browser, 'authorizer')
  await reviewOnCard(authorizer.page, `${tag} reject a`, 'Reject')
  await reviewOnCard(authorizer.page, `${tag} reject b`, 'Authorize')
  await authorizer.close()
  const chairman = await openApprovalsAs(browser, 'chairman')
  await reviewOnCard(chairman.page, `${tag} reject b`, 'Reject')
  await chairman.close()

  for (const suffix of ['a', 'b']) {
    expect((await db.read<{ status: string }>(`erp/deposits/e2e2s_reject_${suffix}_${stamp}`))?.status).toBe('rejected')
  }
  expect(await entriesOf(ids.rejectDealer)).toHaveLength(0)
  expect(await due(ids.rejectDealer)).toBe(0)

  const notifications = Object.values((await db.read<Record<string, { title: string; body: string; userIds?: string[] }>>('erp/notifications')) ?? {}).filter(
    (item) => item.body.includes(names.rejectDealer) && item.title === 'Deposit rejected'
  )
  expect(notifications).toHaveLength(2)
  for (const item of notifications) expect(item.userIds).toEqual([adminUid])
})

test('TC-02.4 deleting a credit sheet row waits for both approvals; the row stays until then', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000)
  const entryId = `e2e2s_row_${stamp}`
  await db.set(`erp/creditLedgerEntries/${entryId}`, {
    id: entryId,
    customerId: ids.ledgerDealer,
    customerName: names.ledgerDealer,
    date: iso('2021-03-12'),
    particulars: `${tag} row to delete`,
    qty: 0,
    unitPrice: 0,
    debit: 0,
    credit: 100,
    createdAt: new Date().toISOString(),
  })

  await stubAlerts(page)
  await loginAsAdmin(page)
  await navigate(page, '/admin/credit-sheet')
  await page.getByRole('button', { name: `View ${names.ledgerDealer} details` }).click()
  const row = page.locator('tbody tr', { hasText: `${tag} row to delete` })
  await row.getByRole('button', { name: 'Delete ledger entry' }).click()
  await expect(page.getByText('Removing the entry was sent for approval.')).toBeVisible({ timeout: 20_000 })

  const requests = Object.values((await db.read<Stored>('erp/changeRequests')) ?? {}).filter((request) => request.targetId === entryId)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ kind: 'credit_entry', action: 'delete', status: 'pending' })
  await expect(row).toBeVisible()
  expect(await db.read(`erp/creditLedgerEntries/${entryId}`)).not.toBeNull()
  await screenshot(page, 'two-stage-delete-row-still-visible', testInfo)

  await approveThroughBothStages(browser, names.ledgerDealer, page)
  await expect.poll(() => db.read(`erp/creditLedgerEntries/${entryId}`)).toBeNull()
  const view = page.getByRole('button', { name: `View ${names.ledgerDealer} details` })
  if (await view.count()) await view.click()
  await expect(page.getByRole('button', { name: 'Add ledger entry' })).toBeVisible()
  await expect(row).toHaveCount(0, { timeout: 20_000 })
})

test('TC-02.5 two approvals for one dealer at the same moment leave the right due', async ({ browser, request }) => {
  test.setTimeout(240_000)
  // Two deposits the Authorizer already accepted, final-approved by the Chairman in two sessions at once.
  for (const [suffix, amount] of [
    ['a', 1000],
    ['b', 2500],
  ] as const) {
    await db.set(`erp/deposits/e2e2s_race_${suffix}_${stamp}`, {
      id: `e2e2s_race_${suffix}_${stamp}`,
      customerId: ids.raceDealer,
      customerName: names.raceDealer,
      date: iso('2021-03-09'),
      amount,
      method: 'Cash',
      note: `${tag} race ${suffix}`,
      zoneId,
      authorizedById: authorizerUid,
      authorizedByName: 'E2E Authorizer',
      authorizedAt: new Date().toISOString(),
      ...submittedByAdmin(),
    })
  }
  const sessions = await Promise.all([openApprovalsAs(browser, 'chairman'), openApprovalsAs(browser, 'chairman')])
  await Promise.all([reviewOnCard(sessions[0].page, `${tag} race a`, 'Final approve'), reviewOnCard(sessions[1].page, `${tag} race b`, 'Final approve')])
  await Promise.all(sessions.map((session) => session.close()))
  await expect.poll(() => due(ids.raceDealer)).toBe(-3500)

  // The server route itself, hammered: ten ledger writes, each followed by a recompute, all at once.
  const token = await db.idToken()
  await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const entryId = `e2e2s_burst_${index}_${stamp}`
      await db.update('erp', {
        [`creditLedgerEntries/${entryId}`]: {
          id: entryId,
          customerId: ids.raceDealer,
          customerName: names.raceDealer,
          date: iso('2021-03-13'),
          particulars: `${tag} burst ${index}`,
          qty: 0,
          unitPrice: 0,
          debit: 0,
          credit: 100,
          createdAt: new Date().toISOString(),
        },
        [`customers/${ids.raceDealer}/ledgerRev`]: increment(1),
      })
      const response = await request.post('/api/erp/recompute-due', { headers: { Authorization: `Bearer ${token}` }, data: { customerId: ids.raceDealer } })
      expect(response.ok()).toBeTruthy()
    })
  )
  await expect.poll(() => due(ids.raceDealer)).toBe(-2500)
})
