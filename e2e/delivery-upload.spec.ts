import { devices, expect, test, type Page, type Request } from '@playwright/test'

import { loginAs, loginAsAdmin } from './auth'
import { APPROVERS, authorizerDealerFields, hasApproverLogins } from './support/approvals'
import { navigate, note, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Prompt 23: the delivery document upload. Cloudinary is always answered locally by `page.route`,
 * so no test file reaches the real Cloudinary folder. One posted test order (with its dealer and
 * approved request) is seeded and removed afterwards. The three orders that were stuck in "Posted"
 * on the live site come from the emulator's copy of the backup and are completed here; the emulator
 * is reloaded from the backup on every `npm run test:e2e:local`, so nothing live changes.
 */

const stamp = Date.now()
const STUCK_ORDERS = ['INV-58124357', 'INV-12857914', 'INV-97709152']
const dealer = { id: `e2e-delivery-dealer-${stamp}`, name: `E2E Delivery Dealer ${stamp}` }
const order = {
  id: `e2e-delivery-upload-${stamp}`,
  billNumber: `E2E-UPL-${stamp}`,
  customerId: dealer.id,
  customerName: dealer.name,
  salesPersonId: 'e2e',
  salesPersonName: 'E2E Tester',
  status: 'shipped',
  paymentStatus: 'paid',
  subtotal: 1_000,
  discount: 0,
  total: 1_000,
  paid: 1_000,
  due: 0,
  deliveryDate: '2099-01-02',
  paymentDueDate: '2099-01-03',
  dueReference: 'owner',
  createdAt: '2026-10-20T09:00:00.000Z',
  items: [{ productId: 'e2e-product-a', productName: 'E2E Battery', quantity: 1, unitPrice: 1_000, purchasePrice: 0 }],
  delivery: {
    status: 'posted',
    warehouseId: 'e2e-warehouse',
    warehouseName: 'E2E Warehouse',
    deliveryManId: 'e2e-delivery-man',
    deliveryManName: 'E2E Delivery Man',
    courierName: '',
    trackingNumber: '',
    vehicle: '',
    deliveryCharge: 0,
    note: '',
    documentUrl: '',
    documentPublicId: '',
    postedById: 'e2e',
    postedByName: 'E2E Tester',
    postedAt: '2026-10-20T09:30:00.000Z',
    submittedById: '',
    submittedByName: '',
    submittedAt: '',
    updatedAt: '2026-10-20T09:30:00.000Z',
  },
}
const requestId = `e2e-delivery-upload-request-${stamp}`

type StoredOrder = { id: string; billNumber: string; status: string; deliveredAt?: string; delivery?: { status: string; submittedAt: string; documentUrl: string } }

let db: AdminDb

test.beforeAll(async () => {
  db = await connectAsAdmin()
  await db.set(`erp/customers/${dealer.id}`, { ...testDealer(dealer.id, dealer.name, '000-E2E-TEST', ''), ...(await authorizerDealerFields(db)) })
  await db.set(`erp/orders/${order.id}`, order)
  await db.set(`erp/orderRequests/${requestId}`, {
    ...order,
    id: requestId,
    orderId: order.id,
    status: 'approved',
    reviewedByName: 'E2E Approver',
    reviewedAt: '2026-10-20T09:00:00.000Z',
  })
})

test.afterAll(async () => {
  await db.remove(`erp/orders/${order.id}`)
  await db.remove(`erp/orderRequests/${requestId}`)
  await db.remove(`erp/customers/${dealer.id}`)
  for (const path of ['erp/activities', 'erp/notifications']) {
    const rows = (await db.read<Record<string, { message?: string; body?: string }>>(path)) ?? {}
    for (const [id, row] of Object.entries(rows)) {
      if ((row.message ?? row.body ?? '').includes(String(stamp))) await db.remove(`${path}/${id}`)
    }
  }
  const audit = (await db.read<Record<string, { refId?: string }>>('erp/auditLog')) ?? {}
  for (const [id, entry] of Object.entries(audit)) {
    if (entry.refId === order.id) await db.remove(`erp/auditLog/${id}`)
  }
  await db.close()
})

async function storedOrder(billNumber: string) {
  const orders = (await db.read<Record<string, StoredOrder>>('erp/orders')) ?? {}
  return Object.values(orders).find((item) => item.billNumber === billNumber)
}

/** Answers every Cloudinary upload locally and records what was sent. */
function fakeCloudinary(page: Page, answer: { status: number; body: unknown }, delayMs = 0) {
  const uploads: Request[] = []
  void page.route('https://api.cloudinary.com/**', async (route) => {
    uploads.push(route.request())
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    await route.fulfill({ status: answer.status, json: answer.body })
  })
  return uploads
}

const uploaded = { status: 200, body: { secure_url: `https://example.invalid/e2e-${stamp}.jpg`, public_id: `e2e-${stamp}` } }

async function openPosted(page: Page, billNumber: string) {
  await navigate(page, '/admin/delivery')
  await page.getByRole('button', { name: /^Posted/ }).click()
  await page.getByPlaceholder('Search dealer, bill, delivery man…').fill(billNumber)
  // The innermost block holding both the bill and the file input is that order's card.
  const card = page.locator('div').filter({ hasText: billNumber }).filter({ has: page.locator('input[type="file"]') }).last()
  await expect(card).toBeVisible({ timeout: 20_000 })
  return card
}

/** A real phone-sized JPEG (about 3000×2250, several MB), drawn in the browser. */
async function phonePhoto(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 2250
    const context = canvas.getContext('2d')!
    const image = context.createImageData(canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = Math.random() * 255
      image.data[index + 1] = Math.random() * 255
      image.data[index + 2] = Math.random() * 255
      image.data[index + 3] = 255
    }
    context.putImageData(image, 0, 0)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/jpeg', 0.95))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    return btoa(text)
  })
  return Buffer.from(base64, 'base64')
}

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
// HEIC that the browser cannot read: it must go up unchanged rather than fail.
const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(2_000_000, 7)])

test.describe('Delivery document upload', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  test.describe.configure({ mode: 'serial' })

  test('TC-23.1 a disabled Cloudinary account says uploads are unavailable, in the card, and nothing is submitted', async ({ page }, testInfo) => {
    const uploads = fakeCloudinary(page, { status: 401, body: { error: { message: 'cloud_name is disabled' } } })
    await loginAsAdmin(page)
    const card = await openPosted(page, order.billNumber)

    // PDF and HEIC can be chosen now, not only image/*.
    const accept = await card.locator('input[type="file"]').getAttribute('accept')
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('.heic')

    await card.locator('input[type="file"]').setInputFiles({ name: 'delivery.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('e2e') })
    await expect(card).toContainText('delivery.jpg')
    await card.getByRole('button', { name: 'Submit to audit' }).click()
    await expect(card.getByRole('alert')).toContainText('Document uploads are unavailable right now')
    expect(uploads).toHaveLength(1)
    expect((await storedOrder(order.billNumber))?.delivery?.status).toBe('posted')
    // The file stays chosen, so the person can retry once uploads work again.
    await expect(card.getByRole('button', { name: 'Submit to audit' })).toBeEnabled()
    await screenshot(page, 'delivery-upload-unavailable', testInfo)

    // A file that is not a photo or PDF is refused before any upload.
    await card.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('e2e') })
    await expect(card.getByRole('alert')).toContainText('Use a JPG, PNG or HEIC photo, or a PDF.')
    await expect(card.getByRole('button', { name: 'Submit to audit' })).toBeDisabled()
    expect(uploads).toHaveLength(1)
    note(testInfo, '401 "cloud_name is disabled" is shown in the card as "uploads are unavailable"; the order stays Posted.')
  })

  test('TC-23.2 a phone photo is shrunk, shows progress and submits', async ({ page }, testInfo) => {
    const uploads = fakeCloudinary(page, uploaded, 1_500)
    await loginAsAdmin(page)
    const card = await openPosted(page, order.billNumber)
    const photo = await phonePhoto(page)
    expect(photo.length).toBeGreaterThan(2 * 1024 * 1024)

    await card.locator('input[type="file"]').setInputFiles({ name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: photo })
    await card.getByRole('button', { name: 'Submit to audit' }).click()
    await expect(card.getByRole('status')).toBeVisible()
    await expect(card.getByRole('status')).toContainText(/Uploading \d+%|Preparing the photo/)
    await expect(page.getByText(`${order.billNumber} submitted to the audit.`)).toBeVisible({ timeout: 20_000 })

    expect(uploads).toHaveLength(1)
    expect(uploads[0].url()).toMatch(/\/auto\/upload$/)
    const sent = uploads[0].postDataBuffer()!
    expect(sent.length).toBeLessThan(photo.length)
    expect(sent.toString('latin1')).toContain('Content-Type: image/jpeg')

    const saved = await storedOrder(order.billNumber)
    expect(saved?.status).toBe('completed')
    expect(saved?.delivery?.status).toBe('submitted')
    expect(saved?.deliveredAt).toBe(saved?.delivery?.submittedAt)
    note(testInfo, `A ${(photo.length / 1024 / 1024).toFixed(1)} MB photo went up as ${(sent.length / 1024 / 1024).toFixed(1)} MB; the order is Completed.`)
  })

  test('TC-23.3 the three orders stuck in "Posted" can be completed (photo, PDF, HEIC)', async ({ page }, testInfo) => {
    const present = (await Promise.all(STUCK_ORDERS.map(storedOrder))).filter((item) => item?.delivery?.status === 'posted')
    test.skip(present.length !== STUCK_ORDERS.length, 'The emulator backup does not hold the three posted orders.')

    const uploads = fakeCloudinary(page, uploaded)
    await loginAsAdmin(page)
    const photo = await phonePhoto(page)
    const files = [
      { name: 'IMG_2042.jpg', mimeType: 'image/jpeg', buffer: photo },
      { name: 'challan.pdf', mimeType: 'application/pdf', buffer: pdf },
      // Windows and Android often leave a HEIC file's type empty.
      { name: 'IMG_2043.HEIC', mimeType: '', buffer: heic },
    ]
    for (const [index, billNumber] of STUCK_ORDERS.entries()) {
      const card = await openPosted(page, billNumber)
      await card.locator('input[type="file"]').setInputFiles(files[index])
      await card.getByRole('button', { name: 'Submit to audit' }).click()
      await expect(page.getByText(`${billNumber} submitted to the audit.`)).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await storedOrder(billNumber))?.delivery?.status).toBe('submitted')
      const saved = await storedOrder(billNumber)
      expect(saved?.status).toBe('completed')
      expect(saved?.deliveredAt).toBeTruthy()
    }
    expect(uploads).toHaveLength(3)
    // The PDF and the HEIC go up as they are.
    expect(uploads[1].postDataBuffer()!.toString('latin1')).toContain('%PDF-1.4')
    expect(uploads[2].postDataBuffer()!.length).toBeGreaterThan(heic.length)

    await page.getByRole('button', { name: /^Submitted/ }).click()
    await page.getByPlaceholder('Search dealer, bill, delivery man…').fill('')
    for (const billNumber of STUCK_ORDERS) await expect(page.getByText(billNumber).first()).toBeVisible()
    await screenshot(page, 'delivery-stuck-orders-submitted', testInfo)
    note(testInfo, `${STUCK_ORDERS.join(', ')} submitted with a photo, a PDF and a HEIC; all Completed in the emulator.`)
  })
})

test.describe('Delivery without "Sales — edit"', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('TC-23.4 the Authorizer (sales.view only) sees deliveries but cannot post or submit', async ({ page }, testInfo) => {
    test.skip(!hasApproverLogins(), 'No seeded Authorizer login.')
    const permissions = await db.read<string[] | Record<string, string>>('erp/roles/authorizer/permissions')
    const list = Array.isArray(permissions) ? permissions : Object.values(permissions ?? {})
    test.skip(!list.includes('sales.view') || list.includes('sales.edit'), 'The seeded Authorizer role does not have sales.view without sales.edit.')

    // Put the test order back in "Posted" (TC-23.2 submitted it).
    await db.update(`erp/orders/${order.id}`, { status: 'shipped', delivery: order.delivery })
    await loginAs(page, APPROVERS.authorizer.email, APPROVERS.authorizer.password)
    await navigate(page, '/admin/delivery')
    await page.getByRole('button', { name: /^Posted/ }).click()
    await page.getByPlaceholder('Search dealer, bill, delivery man…').fill(order.billNumber)
    await expect(page.getByText(order.billNumber).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/View only: posting and submitting deliveries needs/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit to audit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save details' })).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    // The details are shown but every field is read-only.
    const card = page.locator('div').filter({ hasText: order.billNumber }).filter({ hasText: 'Tracking / CN number' }).last()
    const fields = card.locator('input, textarea, [role="combobox"]')
    expect(await fields.count()).toBeGreaterThanOrEqual(7)
    for (const field of await fields.all()) await expect(field).toBeDisabled()

    await page.getByRole('button', { name: /^To post/ }).click()
    await expect(page.getByRole('button', { name: 'Post', exact: true })).toHaveCount(0)
    await screenshot(page, 'delivery-view-only', testInfo)
    note(testInfo, 'Without sales.edit the Post, Save details and Submit to audit controls are hidden; the provider refuses them too.')
  })
})

test.describe('Delivery upload on a phone in dark mode', () => {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7']
  test.use({ ...phone, viewport: { width: 360, height: 780 } })

  test('TC-23.5 the document picker, progress and error fit 360px in dark mode', async ({ page }, testInfo) => {
    await db.update(`erp/orders/${order.id}`, { status: 'shipped', delivery: order.delivery })
    fakeCloudinary(page, { status: 401, body: { error: { message: 'cloud_name is disabled' } } })
    await loginAsAdmin(page)
    const card = await openPosted(page, order.billNumber)
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)

    await card.locator('input[type="file"]').setInputFiles({ name: 'IMG_20261022_0915_delivery_challan_scan.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('e2e') })
    await card.getByRole('button', { name: 'Submit to audit' }).click()
    await expect(card.getByRole('alert')).toContainText('Document uploads are unavailable right now')
    await card.getByRole('alert').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await screenshot(page, 'mobile-dark-delivery-upload-error', testInfo)

    // Leave the theme as it was.
    await page.getByRole('button', { name: 'Toggle color mode' }).first().click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  })
})
