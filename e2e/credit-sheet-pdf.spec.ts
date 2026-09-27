import { copyFileSync } from 'node:fs'

import { expect, type Browser, type Page, test } from '@playwright/test'

import { loginAsAdmin } from './auth'
import { evidencePath, navigate, note, pdfFirstPagePng, pdfInfo, pdfText, screenshot } from './support/evidence'
import { connectAsAdmin, testDealer, type AdminDb } from './support/firebase'

/**
 * Client feedback 2: the credit sheet's exported PDF did not look like the sheet.
 * Client feedback 3: downloaded PDFs (the credit sheet and a dealer's own ledger)
 * had extra text printed across the top, like "All zones_Power Int.".
 *
 * That extra text is the browser's own print header and footer (page title, URL,
 * date), which it adds in the page margin. The printable pages now have no page
 * margin, so the browser has nowhere to put it.
 */

let db: AdminDb
const stamp = Date.now()
const dealer = { id: `e2e_dealer_${stamp}_pdf`, name: `E2E PDF Dealer ${stamp}` }

test.beforeAll(async () => {
  db = await connectAsAdmin()
  const zones = Object.values((await db.read<Record<string, { id: string }>>('erp/zones')) ?? {})
  await db.set(`erp/customers/${dealer.id}`, testDealer(dealer.id, dealer.name, `0160${stamp % 10_000_000}`, zones[0]?.id ?? ''))
})

test.afterAll(async () => {
  await db?.remove(`erp/customers/${dealer.id}`)
  await db?.close()
})

// Text a browser prints in its header and footer, which must never appear in the documents.
const BROWSER_HEADER_TEXT = /about:blank|localhost|https?:\/\/|_Power Int|Power Int\./

/**
 * Prints a popup's page the way a browser's "Save as PDF" does, with the page
 * title, date and URL in the header and footer. `margin` is the page margin the
 * browser uses: 10mm is the usual default; a browser that follows the page's own
 * `@page { margin: 0 }` rule uses 0, which leaves no room for the header.
 */
async function printLikeBrowser(browser: Browser, html: string, file: string, title: string, margin = '10mm') {
  const context = await browser.newContext()
  const page = await context.newPage()
  // Drop the auto-print script; everything else is the page exactly as the app built it.
  await page.setContent(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { waitUntil: 'load' })
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    margin: { top: margin, bottom: margin, left: margin, right: margin },
    headerTemplate: `<div style="font-size:8px;width:100%;padding:0 10mm;display:flex;justify-content:space-between"><span class="date"></span><span class="title"></span></div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;padding:0 10mm;display:flex;justify-content:space-between"><span class="url"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
  })
  await context.close()
  return pdfText(file).replace(title, `[title:${title}]`)
}

async function openPopup(page: Page, button: string) {
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('button', { name: button }).click()])
  await popup.waitForLoadState('load')
  const html = await popup.content()
  const title = await popup.title()
  await popup.close()
  return { html, title }
}

async function openCreditSheet(page: Page) {
  await loginAsAdmin(page)
  await navigate(page, '/admin/credit-sheet')
  await expect(page.locator('tbody tr', { hasText: dealer.name })).toBeVisible()
}

test.describe('Credit sheet PDF', () => {
  test('TC-02.1 Export PDF saves an A4 PDF laid out like the printed sheet', async ({ page }, testInfo) => {
    await openCreditSheet(page)
    await screenshot(page, 'credit-sheet-screen', testInfo)

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()])
    expect(download.suggestedFilename()).toBe('credit-sheet.pdf')
    const exported = evidencePath('credit-sheet-export.pdf')
    await download.saveAs(exported)

    const info = pdfInfo(exported)
    expect(info).toMatch(/Page size:\s+595\.2\d x 841\.8\d pts \(A4\)/)
    const text = pdfText(exported)
    for (const expected of ['POWER INTERNATIONAL BD', 'CREDIT SHEET', 'Dealer', 'Owner', 'Mobile', 'Total purchase', 'Paid', 'Due (credit)', 'Grand total', dealer.name]) {
      expect(text, `missing "${expected}"`).toContain(expected)
    }
    const pages = info.match(/Pages:\s+(\d+)/)?.[1]
    note(testInfo, `Exported credit-sheet.pdf: A4 portrait, ${pages} page(s), with logo heading, zone tables, totals and grand total.`)
    pdfFirstPagePng(exported, 'credit-sheet-export-page1')

    // Same content and totals as the Print sheet page.
    const { html, title } = await openPopup(page, 'Print sheet')
    const printed = evidencePath('credit-sheet-print.pdf')
    const printedText = await printLikeBrowser(page.context().browser()!, html, printed, title)
    pdfFirstPagePng(printed, 'credit-sheet-print-page1')
    const grandTotal = (value: string) => value.match(/Grand total.*$/m)?.[0].replace(/\s+/g, ' ').trim()
    expect(grandTotal(text)).toBeTruthy()
    expect(grandTotal(text)).toBe(grandTotal(printedText))
    note(testInfo, `Grand total row is identical in Export PDF and Print sheet: "${grandTotal(text)}".`)
  })

  test('TC-03.1 the exported credit sheet PDF has no stray header text', async ({ page }, testInfo) => {
    await openCreditSheet(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()])
    const file = evidencePath('credit-sheet-export-check.pdf')
    await download.saveAs(file)

    const firstLines = pdfText(file).split('\n').filter((line) => line.trim()).slice(0, 2)
    expect(firstLines[0]).toContain('POWER INTERNATIONAL BD')
    expect(pdfText(file)).not.toMatch(BROWSER_HEADER_TEXT)
    note(testInfo, `First lines of the PDF: ${firstLines.map((line) => `"${line.trim()}"`).join(', ')} — nothing above the company heading.`)
  })

  test('TC-03.2 Print sheet asks the browser for no page margin, so it has no room for its title/URL', async ({ page, browser }, testInfo) => {
    await openCreditSheet(page)
    const { html, title } = await openPopup(page, 'Print sheet')
    expect(html).toMatch(/@page\s*{\s*margin:\s*0/)

    // Evidence of the cause: with the browser's usual page margin, its date, title and URL land on the sheet.
    const withMargin = await printLikeBrowser(browser, html, evidencePath('credit-sheet-print-browser-header.pdf'), title)
    expect(withMargin).toContain(`[title:${title}]`)
    pdfFirstPagePng(evidencePath('credit-sheet-print-browser-header.pdf'), 'credit-sheet-print-browser-header')
    note(
      testInfo,
      `The stray text is the browser's own print header ("${title}", date, about:blank). Print sheet now sets a zero page margin, which Chrome and Edge on desktop honour by leaving the header out. Some phone browsers and Firefox ignore it, so files should be saved with Export PDF / Download PDF, which never go through the print dialog.`
    )
  })

  test('TC-03.3 a dealer\'s own ledger downloads as a PDF with no stray header text', async ({ page }, testInfo) => {
    await openCreditSheet(page)
    await page.getByRole('button', { name: `View ${dealer.name} details` }).click()
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
    await screenshot(page, 'dealer-ledger-screen', testInfo)

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
    expect(download.suggestedFilename()).toMatch(/^ledger-.+\.pdf$/)
    const file = evidencePath('dealer-ledger.pdf')
    await download.saveAs(file)

    expect(pdfInfo(file)).toMatch(/\(A4\)/)
    const text = pdfText(file)
    expect(text.split('\n').find((line) => line.trim())).toContain('POWER INTERNATIONAL BD')
    expect(text).not.toMatch(BROWSER_HEADER_TEXT)
    expect(text).toMatch(/ledger/i)
    expect(text).toContain(dealer.name)
    pdfFirstPagePng(file, 'dealer-ledger-page1')
    note(testInfo, `Downloaded ${download.suggestedFilename()} directly (no print dialog): starts with the company heading, no title, date or URL.`)
  })

  test('TC-03.4 a dealer\'s form from the CRM downloads as a PDF with no stray header text', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await navigate(page, '/admin/customers')
    await page.getByRole('button', { name: `View ${dealer.name}` }).click()

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()])
    expect(download.suggestedFilename()).toMatch(/^dealer-form-.+\.pdf$/)
    const file = evidencePath('dealer-form.pdf')
    await download.saveAs(file)

    const text = pdfText(file)
    expect(text).not.toMatch(BROWSER_HEADER_TEXT)
    expect(text).toMatch(/dealer information form/i)
    expect(text).toContain(dealer.name)
    pdfFirstPagePng(file, 'dealer-form-page1')
    note(testInfo, `Downloaded ${download.suggestedFilename()} directly (no print dialog), with no title, date or URL on it.`)
  })
})

// Keep a copy of the exported sheet under a friendly name for the report.
test.afterAll(() => {
  try {
    copyFileSync(evidencePath('credit-sheet-export.pdf'), evidencePath('sample-credit-sheet.pdf'))
  } catch {
    // Export test did not run.
  }
})
