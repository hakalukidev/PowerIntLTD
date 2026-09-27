import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Client feedback 1: the Dealers (CRM) list needs a Zone filter.
 * Client feedback 4: the CRM should say "Dealer" rather than "Customer".
 *
 * Runs against the live Firebase project. Test dealers get run-unique names and
 * are removed again at the end, also when a test fails.
 */

type Zone = { id: string; name: string; thanas?: { thana: string }[] }

let db: AdminDb
let zones: Zone[]

test.beforeAll(async () => {
  db = await connectAsAdmin()
  zones = Object.values((await db.read<Record<string, Zone>>('erp/zones')) ?? {}).sort((a, b) => a.name.localeCompare(b.name))
})

test.afterAll(async () => {
  await db?.close()
})

/** The select under a filter label such as "Zone" or "Sub-zone". */
function filterSelect(page: Page, label: string): Locator {
  return page
    .locator('div.space-y-1\\.5')
    .filter({ has: page.locator('p', { hasText: new RegExp(`^${label}$`) }) })
    .first()
    .getByRole('combobox')
}

async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

const dealerRow = (page: Page, name: string) => page.locator('tbody tr', { hasText: name })

test.describe('Dealers (CRM)', () => {
  test('TC-01.1 the dealer list has Zone and Sub-zone filters listing every zone', async ({ page }, testInfo) => {
    test.skip(zones.length === 0, 'No zones are set up yet.')
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')

    const zoneFilter = filterSelect(page, 'Zone')
    await expect(zoneFilter).toBeVisible()
    await expect(zoneFilter).toHaveText(/All zones/)
    await expect(filterSelect(page, 'Sub-zone')).toBeVisible()

    await zoneFilter.click()
    const options = await page.getByRole('option').allInnerTexts()
    for (const zone of zones) expect(options).toContain(zone.name)
    note(testInfo, `Zone filter options: ${options.join(', ')}.`)
    await screenshot(page, 'crm-zone-filter-open', testInfo)
    await page.keyboard.press('Escape')
  })

  test('TC-01.2 filtering by zone and sub-zone shows only that zone\'s dealers', async ({ page }, testInfo) => {
    const [first, second] = zones
    test.skip(!second, 'Needs at least two zones.')
    const firstSub = first.thanas?.[0]?.thana ?? ''
    const stamp = Date.now()
    const inFirst = { id: `e2e_dealer_${stamp}_a`, name: `E2E Zone A Dealer ${stamp}` }
    const inSecond = { id: `e2e_dealer_${stamp}_b`, name: `E2E Zone B Dealer ${stamp}` }

    try {
      await db.set(`erp/customers/${inFirst.id}`, testDealer(inFirst.id, inFirst.name, `0170${stamp % 10_000_000}`, first.id, firstSub))
      await db.set(`erp/customers/${inSecond.id}`, testDealer(inSecond.id, inSecond.name, `0180${stamp % 10_000_000}`, second.id))

      await loginAsAdmin(page)
      await navigate(page, '/admin/customers')
      await expect(dealerRow(page, inFirst.name)).toBeVisible()
      await expect(dealerRow(page, inSecond.name)).toBeVisible()

      await choose(page, filterSelect(page, 'Zone'), first.name)
      await expect(dealerRow(page, inFirst.name)).toBeVisible()
      await expect(dealerRow(page, inSecond.name)).toHaveCount(0)
      await screenshot(page, 'crm-filtered-by-zone', testInfo)

      await choose(page, filterSelect(page, 'Zone'), second.name)
      await expect(dealerRow(page, inSecond.name)).toBeVisible()
      await expect(dealerRow(page, inFirst.name)).toHaveCount(0)

      if (firstSub) {
        await choose(page, filterSelect(page, 'Zone'), first.name)
        await choose(page, filterSelect(page, 'Sub-zone'), firstSub)
        await expect(dealerRow(page, inFirst.name)).toBeVisible()
        note(testInfo, `Sub-zone filter "${firstSub}" kept the dealer in that sub-zone.`)
      }

      await choose(page, filterSelect(page, 'Zone'), 'All zones')
      await expect(dealerRow(page, inFirst.name)).toBeVisible()
      await expect(dealerRow(page, inSecond.name)).toBeVisible()
    } finally {
      await db.remove(`erp/customers/${inFirst.id}`)
      await db.remove(`erp/customers/${inSecond.id}`)
    }
  })

  test('TC-01.3 a dealer added with a zone and sub-zone appears under that zone', async ({ page }, testInfo) => {
    const zone = zones.find((candidate) => candidate.thanas?.length) ?? zones[0]
    test.skip(!zone, 'No zones are set up yet.')
    const subZone = zone.thanas?.[0]?.thana
    const name = `E2E UI Dealer ${Date.now()}`

    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')

    try {
      await page.getByRole('button', { name: 'Add dealer' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Add new dealer' })).toBeVisible()
      await dialog.getByPlaceholder('e.g. Karim Traders').fill(name)
      await dialog.getByPlaceholder('e.g. 01711-000000').fill('01999-000111')

      const zoneSelect = dialog.locator('div.space-y-2').filter({ has: page.locator('p', { hasText: /^Zone/ }) }).first().getByRole('combobox')
      await choose(page, zoneSelect, zone.name)
      if (subZone) {
        const subZoneSelect = dialog.locator('div.space-y-2').filter({ has: page.locator('p', { hasText: /^Sub-zone/ }) }).first().getByRole('combobox')
        await choose(page, subZoneSelect, subZone)
      }
      await screenshot(page, 'crm-add-dealer-form', testInfo)
      await dialog.getByRole('button', { name: 'Save dealer' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await choose(page, filterSelect(page, 'Zone'), zone.name)
      await expect(dealerRow(page, name)).toBeVisible()
      note(testInfo, `Dealer saved in ${zone.name}${subZone ? ` / ${subZone}` : ''} and listed under that zone filter.`)
    } finally {
      // Remove through the app, and directly as a fallback if the UI step failed part-way.
      const row = dealerRow(page, name)
      if (await row.count()) {
        await row.getByRole('button', { name: `Delete ${name}` }).click()
        await expect(row).toHaveCount(0)
      }
      const customers = (await db.read<Record<string, { name: string }>>('erp/customers')) ?? {}
      for (const [id, customer] of Object.entries(customers)) {
        if (customer.name === name) await db.remove(`erp/customers/${id}`)
      }
    }
  })

  test('TC-04.1 the CRM speaks of dealers, not customers', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')

    await expect(page.getByRole('heading', { name: 'Dealers (CRM)' })).toBeVisible()
    await expect(page.getByText('Dealers', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Dealer data table')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add dealer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reminder dealers' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Dealer' })).toBeVisible()

    const mainText = await page.locator('main').innerText()
    const mentions = mainText.match(/\bcustomers?\b/gi) ?? []
    expect(mentions, `"Customer" still shown on the page: ${mentions.join(', ')}`).toHaveLength(0)

    await page.getByRole('button', { name: 'Add dealer' }).click()
    const dialogText = await page.getByRole('dialog').innerText()
    expect(dialogText.match(/\bcustomers?\b/gi) ?? []).toHaveLength(0)
    note(testInfo, 'No "Customer" wording found on the dealer list or the Add dealer form.')
    await page.keyboard.press('Escape')
    await screenshot(page, 'crm-dealer-wording', testInfo)
  })
})
