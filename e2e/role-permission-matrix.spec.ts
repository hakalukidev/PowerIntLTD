import { expect, type Page, test } from '@playwright/test'

import { loginAs, loginAsAdmin } from './auth'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Prompt 01: roles are built with a Module × View / Create / Edit / Delete matrix, and Create is
 * its own permission. A role with View + Edit but no Create on dealers cannot add a dealer but can
 * still edit one. Existing roles keep the access they had (stored ones through
 * scripts/split-edit-permission.mjs, which `npm run test:e2e:local` runs like a deploy would).
 *
 * Creates a temporary role, user and dealer, and removes them again afterwards.
 */

type StoredRole = { id: string; name: string; permissions?: string[] }

let db: AdminDb
let baseURL: string
const stamp = Date.now()
const roleName = `E2E Dealer Editor ${stamp}`
const editor = {
  id: '',
  email: `e2e.matrix.${stamp}@powerinternationalbd.com`,
  password: `E2e-${stamp}-Matrix!`,
  name: `E2E Matrix User ${stamp}`,
}
const dealer = { id: `e2e_dealer_${stamp}_matrix`, name: `E2E Matrix Dealer ${stamp}` }
let roleId = ''

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

async function storedRoles() {
  return Object.values((await db.read<Record<string, StoredRole>>('erp/roles')) ?? {})
}

async function openRoles(page: Page) {
  await navigate(page, '/admin/users')
  await page.getByRole('button', { name: 'Roles', exact: true }).click()
}

async function openRoleEditor(page: Page, name: string) {
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('permission-matrix')).toBeVisible()
  return dialog
}

test.beforeAll(async ({}, testInfo) => {
  baseURL = String(testInfo.project.use.baseURL ?? 'http://localhost:3000')
  db = await connectAsAdmin()
  const zones = Object.keys((await db.read<Record<string, unknown>>('erp/zones')) ?? {})
  await db.set(`erp/customers/${dealer.id}`, testDealer(dealer.id, dealer.name, `0160${stamp % 10_000_000}`, zones[0] ?? ''))
})

test.afterAll(async () => {
  if (!db) return
  await db.remove(`erp/customers/${dealer.id}`)
  if (editor.id) await userApi('DELETE', { userId: editor.id })
  if (roleId) await db.remove(`erp/roles/${roleId}`)
  await db.close()
})

test.describe.serial('Role permission matrix', () => {
  test('TC-01.1 a role is built with the matrix and saved as the same permission list', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await openRoles(page)
    await page.getByRole('button', { name: 'Create role' }).click()
    const dialog = page.getByRole('dialog')
    const matrix = dialog.getByTestId('permission-matrix')
    await expect(matrix.locator('thead').getByRole('columnheader')).toHaveText(['Module', 'View', 'Create', 'Edit', 'Delete'])

    // Dashboard and Reports only have View; the approval stages are one checkbox each.
    await expect(matrix.getByLabel('No create for Dashboard')).toHaveText('—')
    await expect(matrix.getByLabel('No edit for Reports')).toHaveText('—')
    await expect(matrix.getByRole('checkbox', { name: 'Authorize submissions (stage 1)' })).toBeVisible()
    await expect(matrix.getByRole('checkbox', { name: 'Final approval (stage 2)' })).toBeVisible()

    await dialog.getByPlaceholder('e.g. Warehouse Supervisor').fill(roleName)
    // Ticking Edit ticks View too; unticking View clears Edit again.
    await matrix.getByRole('checkbox', { name: 'Edit customers (CRM)' }).check()
    await expect(matrix.getByRole('checkbox', { name: 'View customers (CRM)' })).toBeChecked()
    await matrix.getByRole('checkbox', { name: 'View customers (CRM)' }).uncheck()
    await expect(matrix.getByRole('checkbox', { name: 'Edit customers (CRM)' })).not.toBeChecked()

    await matrix.getByRole('checkbox', { name: 'Edit customers (CRM)' }).check()
    await matrix.getByRole('checkbox', { name: 'View the dashboard' }).check()
    await expect(matrix.getByRole('checkbox', { name: 'Create customers (CRM)' })).not.toBeChecked()
    await expect(dialog.getByText('3 of')).toBeVisible()
    await screenshot(page, 'role-matrix-new-role', testInfo)

    await dialog.getByRole('button', { name: 'Create role' }).click()
    await expect(dialog).toBeHidden()

    await expect.poll(async () => (await storedRoles()).find((role) => role.name === roleName)?.permissions?.slice().sort()).toEqual([
      'customers.edit',
      'customers.view',
      'dashboard.view',
    ])
    roleId = (await storedRoles()).find((role) => role.name === roleName)!.id
    note(testInfo, 'Saved as erp/roles/<id>/permissions = ["customers.edit", "customers.view", "dashboard.view"], the same string[] shape as before.')
  })

  test('TC-01.2 View + Edit without Create: no "Add dealer", but existing dealers can be edited', async ({ page }, testInfo) => {
    const created = await userApi('POST', {
      name: editor.name,
      loginId: `e2e-matrix-${stamp}`,
      email: editor.email,
      phone: '',
      password: editor.password,
      roleId,
      title: 'E2E test account',
    })
    editor.id = created!.user!.id

    await loginAs(page, editor.email, editor.password)
    await navigate(page, '/admin/customers')
    await expect(page.locator('tbody tr', { hasText: dealer.name })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add dealer' })).toHaveCount(0)

    await page.getByRole('button', { name: `Edit ${dealer.name}`, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    note(testInfo, `"${roleName}" (View + Edit on dealers, no Create): Add dealer is hidden, the Edit dialog opens for ${dealer.name}.`)
    await screenshot(page, 'role-matrix-edit-without-create', testInfo)
  })

  test('TC-01.3 existing roles keep their access: Owner, Manager and Head of Sales', async ({ page }, testInfo) => {
    // Every stored role that could add records before (".edit") still can (".create").
    const createModules = ['sales', 'inventory', 'suppliers', 'customers', 'credit_sheet', 'zones', 'sellers', 'couriers', 'damage_products', 'leads', 'finance', 'employees', 'users', 'roles']
    for (const role of await storedRoles()) {
      if (role.id === roleId) continue
      const permissions = role.permissions ?? []
      for (const module of createModules) {
        if (permissions.includes(`${module}.edit`)) expect(permissions, `${role.name} has ${module}.edit`).toContain(`${module}.create`)
      }
    }

    await loginAsAdmin(page)
    await openRoles(page)

    let dialog = await openRoleEditor(page, 'Head of Sales')
    for (const label of ['Create sales orders and billing', 'Edit sales orders and billing', 'Create customers (CRM)', 'Create the credit sheet', 'Create leads (sales pipeline)']) {
      await expect(dialog.getByRole('checkbox', { name: label })).toBeChecked()
    }
    await screenshot(page, 'role-matrix-head-of-sales', testInfo)
    await page.keyboard.press('Escape')

    dialog = await openRoleEditor(page, 'Manager')
    await expect(dialog.getByRole('checkbox', { name: 'Create sales orders and billing' })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Edit sales orders and billing' })).toBeChecked()
    await page.keyboard.press('Escape')

    dialog = await openRoleEditor(page, 'Owner')
    await expect(dialog.getByRole('checkbox', { name: 'View sales orders and billing' })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Create sales orders and billing' })).not.toBeChecked()
    await page.keyboard.press('Escape')
    note(testInfo, 'Head of Sales and Manager keep Create next to Edit; Owner stays view-only.')
  })

  test('TC-01.4 the matrix scrolls inside its own box on a phone, with the Module column pinned', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsAdmin(page)
    await openRoles(page)
    await page.getByRole('button', { name: 'Create role' }).click()
    const matrix = page.getByRole('dialog').getByTestId('permission-matrix')
    await expect(matrix).toBeVisible()

    const box = await matrix.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
    expect(box.scrollWidth).toBeGreaterThan(box.clientWidth)
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(pageOverflow).toBeLessThanOrEqual(0)

    const moduleCell = matrix.getByRole('rowheader').first()
    expect(await moduleCell.evaluate((element) => getComputedStyle(element).position)).toBe('sticky')
    // Measured against the matrix box, so the dialog's open animation does not matter.
    const offset = () =>
      moduleCell.evaluate((cell) => {
        const container = cell.closest('[data-testid="permission-matrix"]')!
        return Math.round(cell.getBoundingClientRect().left - container.getBoundingClientRect().left)
      })
    const before = await offset()
    await matrix.evaluate((element) => element.scrollBy({ left: 200 }))
    await expect.poll(() => matrix.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    expect(await offset()).toBe(before)
    await screenshot(page, 'role-matrix-mobile', testInfo)
  })
})
