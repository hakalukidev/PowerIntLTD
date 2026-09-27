import { expect, type Page, test } from '@playwright/test'

import { loginAs, loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Client feedback 7: someone put in charge of a zone signs in with their own ID
 * and only sees that zone's dealers.
 *
 * Creates a temporary Zone Manager account through the app's user API, makes it
 * responsible for one zone, and seeds one dealer in that zone and one in another.
 * The account, dealers and zone assignment are all removed again afterwards.
 */

type Zone = { id: string; name: string; managerIds?: string[] }

let db: AdminDb
let baseURL: string
let zoneA: Zone
let zoneB: Zone
let otherZoneDealers: string[] = []
const stamp = Date.now()
const manager = {
  id: '',
  email: `e2e.zone.${stamp}@powerinternationalbd.com`,
  password: `E2e-${stamp}-Zone!`,
  name: `E2E Zone Manager ${stamp}`,
}
const dealerA = { id: `e2e_dealer_${stamp}_za`, name: `E2E Own Zone Dealer ${stamp}` }
const dealerB = { id: `e2e_dealer_${stamp}_zb`, name: `E2E Other Zone Dealer ${stamp}` }

async function userApi(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
  const response = await fetch(`${baseURL}/api/admin/users`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await db.idToken()}` },
    body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => null)) as { user?: { id: string }; error?: string } | null
  if (!response.ok) throw new Error(`User API ${method} failed: ${result?.error ?? response.status}`)
  return result
}

test.beforeAll(async ({}, testInfo) => {
  baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:3000')
  db = await connectAsAdmin()
  const zones = Object.values((await db.read<Record<string, Zone>>('erp/zones')) ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  test.skip(zones.length < 2, 'Needs at least two zones.')
  ;[zoneA, zoneB] = zones

  const customers = (await db.read<Record<string, { name: string; zoneId?: string }>>('erp/customers')) ?? {}
  otherZoneDealers = Object.values(customers)
    .filter((customer) => customer.zoneId === zoneB.id)
    .map((customer) => customer.name)

  const created = await userApi('POST', {
    name: manager.name,
    loginId: `e2e-zone-${stamp}`,
    email: manager.email,
    phone: '',
    password: manager.password,
    roleId: 'zone_manager',
    title: 'E2E test account',
  })
  manager.id = created!.user!.id

  await db.update(`erp/zones/${zoneA.id}`, { managerIds: [...(zoneA.managerIds ?? []), manager.id] })
  await db.set(`erp/customers/${dealerA.id}`, testDealer(dealerA.id, dealerA.name, `0150${stamp % 10_000_000}`, zoneA.id))
  await db.set(`erp/customers/${dealerB.id}`, testDealer(dealerB.id, dealerB.name, `0140${stamp % 10_000_000}`, zoneB.id))
})

test.afterAll(async () => {
  if (!db) return
  if (zoneA) await db.update(`erp/zones/${zoneA.id}`, { managerIds: zoneA.managerIds ?? [] })
  await db.remove(`erp/customers/${dealerA.id}`)
  await db.remove(`erp/customers/${dealerB.id}`)
  if (manager.id) await userApi('DELETE', { userId: manager.id })
  await db.close()
})

const row = (page: Page, name: string) => page.locator('tbody tr', { hasText: name })

test.describe.serial('Zone access', () => {
  test('TC-07.1 a zone manager sees only their own zone\'s dealers in the CRM', async ({ page }, testInfo) => {
    await loginAs(page, manager.email, manager.password)
    await navigate(page, '/admin/customers')

    await expect(row(page, dealerA.name)).toBeVisible()
    await expect(row(page, dealerB.name)).toHaveCount(0)
    for (const name of otherZoneDealers) await expect(row(page, name)).toHaveCount(0)

    const zoneFilter = page
      .locator('div.space-y-1\\.5')
      .filter({ has: page.locator('p', { hasText: /^Zone$/ }) })
      .first()
      .getByRole('combobox')
    await zoneFilter.click()
    const options = await page.getByRole('option').allInnerTexts()
    await page.keyboard.press('Escape')
    expect(options).toEqual(['All zones', zoneA.name])

    note(testInfo, `Signed in as a Zone Manager for ${zoneA.name}: saw the ${zoneA.name} dealer; none of the ${otherZoneDealers.length + 1} ${zoneB.name} dealers were listed.`)
    note(testInfo, `Zone filter only offers: ${options.join(', ')}.`)
    await screenshot(page, 'zone-manager-dealers', testInfo)
  })

  test('TC-07.2 the zone manager\'s credit sheet only has their zone', async ({ page }, testInfo) => {
    await loginAs(page, manager.email, manager.password)
    await navigate(page, '/admin/credit-sheet')

    await expect(page.getByText(`You are responsible for ${zoneA.name}`)).toBeVisible()
    await expect(row(page, dealerA.name)).toBeVisible()
    await expect(row(page, dealerB.name)).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(zoneB.name)
    await screenshot(page, 'zone-manager-credit-sheet', testInfo)
  })

  test('TC-07.3 the zone manager cannot open other modules they were not given', async ({ page }) => {
    await loginAs(page, manager.email, manager.password)
    await expect(page.locator('a[href="/admin/suppliers"]')).toHaveCount(0)
    await expect(page.locator('a[href="/admin/users"]')).toHaveCount(0)
    await expect(page.locator('a[href="/admin/finance"]')).toHaveCount(0)
  })

  test('TC-07.4 an admin still sees the dealers of every zone', async ({ page }) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')
    await expect(row(page, dealerA.name)).toBeVisible()
    await expect(row(page, dealerB.name)).toBeVisible()
  })
})
