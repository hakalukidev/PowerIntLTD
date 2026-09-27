/**
 * Builds the client-facing test report (PDF) from a Playwright run.
 *
 *   EVIDENCE_DIR=test-reports/client-feedback-2026-09-27 node e2e/report/build-client-report.mjs
 *
 * Reads results.json and the screenshots the tests saved in EVIDENCE_DIR, and
 * writes client-test-report.pdf (and its .html) into the same folder.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from '@playwright/test'

const dir = path.resolve(process.env.EVIDENCE_DIR ?? 'test-reports/client-feedback')
const results = JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8'))
const runDate = new Date(results.stats?.startTime ?? Date.now())

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function image(name) {
  const file = path.join(dir, name)
  return existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null
}

// Every test with its outcome and the notes it recorded.
const tests = []
;(function walk(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const run of spec.tests ?? []) {
        const last = run.results?.[run.results.length - 1]
        tests.push({
          title: spec.title,
          id: spec.title.match(/^TC-[\w.]+/)?.[0] ?? '',
          status: run.status === 'expected' ? 'Passed' : run.status === 'skipped' ? 'Skipped' : 'Failed',
          ms: last?.duration ?? 0,
          notes: (run.annotations ?? []).filter((a) => a.type === 'note').map((a) => a.description),
        })
      }
    }
    walk(suite.suites)
  }
})(results.suites)

const passed = tests.filter((t) => t.status === 'Passed').length
const failed = tests.filter((t) => t.status === 'Failed').length

const ITEMS = [
  {
    key: 'L',
    no: 'Login',
    title: 'Sign-in needed two clicks',
    asked: 'Staff had to press “Enter dashboard” twice to sign in.',
    outcome: 'Fixed',
    done: [
      'Cause: after the first click the sign-in did succeed, but while the dashboard was loading the button changed back to “Enter dashboard” on the login page. On a slow connection it looked as if nothing had happened, so people clicked again.',
      'The button now stays on “Signing in…” / “Opening dashboard…” until the dashboard appears, and cannot be pressed twice.',
      'Email and password filled in by the browser’s autofill are now read correctly on the first click.',
      'The dashboard is pre-loaded while the login page is open, so it opens faster.',
    ],
    shots: [['login-dashboard-after-one-click.png', 'Dashboard reached with a single click']],
  },
  {
    key: 'TC-01',
    no: '1',
    title: 'Zone filter in Dealers (CRM)',
    asked: 'The CRM list should be filterable by Zone.',
    outcome: 'Done',
    done: [
      'Dealers (CRM) has a Zone filter listing every zone, plus a Sub-zone filter for the chosen zone.',
      'Dealers are saved with a zone and sub-zone, and the filters show exactly that zone’s dealers.',
    ],
    shots: [
      ['crm-zone-filter-open.png', 'Zone filter with every zone'],
      ['crm-filtered-by-zone.png', 'List filtered to one zone'],
    ],
  },
  {
    key: 'TC-02',
    no: '2',
    title: 'Credit Sheet PDF looked different from the sheet',
    asked: 'Exporting the Credit Sheet to PDF changed its design.',
    outcome: 'Fixed',
    done: [
      'Export PDF now draws the same layout as the printed sheet: logo and company name, “Credit Sheet” heading, a table per zone with zone totals, and a zone-wise summary with the grand total.',
      'The file is A4 and its text can be selected and searched. Totals in the PDF match the printed sheet exactly.',
    ],
    shots: [
      ['credit-sheet-screen.png', 'Credit Sheet in the ERP'],
      ['credit-sheet-export-page1.png', 'Exported credit-sheet.pdf (page 1)'],
    ],
  },
  {
    key: 'TC-03',
    no: '3',
    title: 'Extra text printed on top of downloaded PDFs',
    asked: 'Downloaded PDFs (the Credit Sheet and a dealer’s own PDF) showed extra text such as “All zones_Power Int.” at the top.',
    outcome: 'Fixed',
    done: [
      'Cause: that text was the web browser’s own print header and footer (page title, date and web address), added whenever a page is saved through the browser’s Print → Save as PDF.',
      'The Credit Sheet (Export PDF), a dealer’s ledger (new “Download PDF” button) and the dealer form (“PDF” button in Dealers) are now saved straight to a PDF file, without the print dialog, so the browser can no longer add anything to them.',
      'The “Print” buttons still open the print dialog, now with the page margin set to zero, which removes the header in Chrome and Edge. Some phone browsers ignore this setting, so the download buttons are the recommended way to save a PDF.',
    ],
    shots: [
      ['credit-sheet-print-browser-header.png', 'Before: browser header/footer on a printed page (cause)'],
      ['dealer-ledger-page1.png', 'After: dealer ledger PDF, nothing above the heading'],
      ['dealer-form-page1.png', 'After: dealer form PDF'],
    ],
  },
  {
    key: 'TC-04',
    no: '4',
    title: '“Customer” renamed to “Dealer” in the CRM',
    asked: 'The CRM should say “Dealer” instead of “Customer”, since the business works with dealers.',
    outcome: 'Done',
    done: ['The menu, page title, summary cards, table, buttons and the add/edit form all say “Dealer”. No “Customer” wording is left on the page.'],
    shots: [['crm-dealer-wording.png', 'Dealers (CRM) page']],
  },
  {
    key: 'TC-05',
    no: '5',
    title: 'Products a supplier supplies',
    asked: 'When adding a supplier, record which products they supply.',
    outcome: 'Done',
    done: [
      'The Add / Edit supplier form has a “Products supplied” section: pick an existing product or type a new name.',
      'The products are saved with the supplier and shown under the supplier’s name in the table.',
    ],
    shots: [['supplier-add-products.png', 'Products supplied on the supplier form']],
  },
  {
    key: 'TC-06',
    no: '6',
    title: 'Search suppliers by product name',
    asked: 'Typing a product name in the Suppliers & Imports search should show that product’s details.',
    outcome: 'Done',
    done: [
      'Searching a product shows a “Matching products” panel with stock, warehouse, warranty, purchase / selling / wholesale price, purchase history and who supplies it.',
      'The supplier table below is narrowed to the suppliers of that product.',
    ],
    shots: [
      ['supplier-search-catalog-product.png', 'Product details found by name'],
      ['supplier-search-typed-product.png', 'Supplier found by a product they supply'],
    ],
  },
  {
    key: 'TC-07',
    no: '7',
    title: 'Zone managers only see their own zone',
    asked: 'A person put in charge of a zone signs in with their own ID and only sees that zone’s dealers.',
    outcome: 'Verified',
    done: [
      'Tested with a real sign-in: a temporary Zone Manager account responsible for Dhaka Zone was created, used, and deleted again.',
      'In Dealers (CRM) and the Credit Sheet that person only saw Dhaka Zone dealers; dealers of other zones were not listed, and the zone filter only offered their own zone.',
      'They cannot open modules they were not given (Suppliers, Finance, User management). An admin still sees every zone.',
      'A zone is assigned under Credit Sheet → Manage zones (“Responsible”), with the “Zone Manager” role under User & Role Management.',
    ],
    shots: [
      ['zone-manager-dealers.png', 'Zone Manager’s dealer list (own zone only)'],
      ['zone-manager-credit-sheet.png', 'Zone Manager’s credit sheet'],
    ],
  },
  {
    key: 'TC-08',
    no: '8',
    title: 'Mobile-friendly, clean interface',
    asked: 'Most staff use the ERP on a phone; it must work well on mobile and look clean and easy to understand.',
    outcome: 'Verified',
    done: [
      'Checked on a common Android phone size (Pixel 7): all main screens fit the screen with no sideways scrolling.',
      'On phones the sidebar becomes a bottom tab bar (Home, Sales, Dealers, Credit, More) with large, easy-to-tap buttons; “More” opens every other module.',
      'Readable text sizes, and input boxes large enough that phones do not zoom in when typing. Forms fit the screen and scroll.',
    ],
    phones: [
      ['mobile-dashboard.png', 'Dashboard'],
      ['mobile-dealers.png', 'Dealers'],
      ['mobile-credit-sheet.png', 'Credit Sheet'],
      ['mobile-suppliers.png', 'Suppliers'],
      ['mobile-sales.png', 'Sales'],
      ['mobile-stock.png', 'Stock'],
      ['mobile-menu-open.png', 'More menu'],
      ['mobile-add-dealer-dialog.png', 'Add dealer form'],
    ],
  },
]

const testsFor = (item) => tests.filter((t) => (item.key === 'L' ? t.id.startsWith('TC-L') : t.id.startsWith(`${item.key}.`)))
const cleanTitle = (title) => title.replace(/^TC-[\w.]+\s*/, '')
const badge = (status) => `<span class="badge ${status.toLowerCase()}">${esc(status)}</span>`

function itemSection(item) {
  const itemTests = testsFor(item)
  const notes = itemTests.flatMap((t) => t.notes)
  const figures = (item.shots ?? [])
    .map(([file, caption]) => {
      const src = image(file)
      return src ? `<figure><img src="${src}" alt="" /><figcaption>${esc(caption)}</figcaption></figure>` : ''
    })
    .join('')
  const phones = (item.phones ?? [])
    .map(([file, caption]) => {
      const src = image(file)
      return src ? `<figure class="phone"><img src="${src}" alt="" /><figcaption>${esc(caption)}</figcaption></figure>` : ''
    })
    .join('')

  return `
  <section class="item">
    <div class="item-head">
      <span class="num">${esc(item.no)}</span>
      <h2>${esc(item.title)}</h2>
      <span class="outcome ${item.outcome.toLowerCase()}">${esc(item.outcome)}</span>
    </div>
    <p class="asked"><strong>Feedback:</strong> ${esc(item.asked)}</p>
    <ul class="done">${item.done.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    <table class="cases">
      <thead><tr><th>Test</th><th>What was checked</th><th>Result</th></tr></thead>
      <tbody>
        ${itemTests.map((t) => `<tr><td class="id">${esc(t.id)}</td><td>${esc(cleanTitle(t.title))}</td><td>${badge(t.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    ${notes.length ? `<div class="notes"><p class="label">Observed during the test run</p><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    ${figures ? `<div class="figures">${figures}</div>` : ''}
    ${phones ? `<div class="phones">${phones}</div>` : ''}
  </section>`
}

const regression = tests.filter((t) => !t.id)
const dateText = runDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const logo = existsSync('public/power-icon.png') ? `data:image/png;base64,${readFileSync('public/power-icon.png').toString('base64')}` : null

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>ERP feedback test report</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  .cover { border-bottom: 3px solid #1f8f5a; padding-bottom: 14px; margin-bottom: 16px; display: flex; gap: 16px; align-items: center; }
  .cover img { width: 54px; height: 54px; object-fit: contain; }
  .cover h1 { font-size: 21pt; margin: 0; color: #111827; }
  .cover p { margin: 2px 0 0; color: #4b5563; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0 16px; }
  .stat { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
  .stat b { display: block; font-size: 18pt; color: #111827; }
  .stat.ok b { color: #1f8f5a; }
  .stat.bad b { color: #b91c1c; }
  .stat span { color: #6b7280; font-size: 9pt; }
  h3 { font-size: 12pt; margin: 18px 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 7px; text-align: left; vertical-align: top; font-size: 9.5pt; }
  th { background: #f3f4f6; color: #374151; font-weight: 600; }
  .overview td:first-child { width: 48px; font-weight: 700; color: #1f8f5a; }
  .item { break-before: page; }
  .item-head { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  .item-head h2 { font-size: 14.5pt; margin: 0; flex: 1; color: #111827; }
  .num { background: #1f8f5a; color: #fff; border-radius: 8px; padding: 3px 9px; font-weight: 700; font-size: 10pt; white-space: nowrap; }
  .outcome, .badge { border-radius: 999px; padding: 2px 10px; font-size: 8.5pt; font-weight: 700; white-space: nowrap; }
  .outcome.fixed, .outcome.done, .badge.passed { background: #dcfce7; color: #166534; }
  .outcome.verified { background: #dbeafe; color: #1e40af; }
  .badge.failed { background: #fee2e2; color: #991b1b; }
  .badge.skipped { background: #f3f4f6; color: #4b5563; }
  .asked { background: #f9fafb; border-left: 3px solid #9ca3af; padding: 7px 10px; margin: 10px 0; }
  .done { margin: 6px 0 10px; padding-left: 18px; }
  .done li { margin-bottom: 3px; }
  .cases td.id { width: 62px; font-weight: 600; color: #374151; white-space: nowrap; }
  .cases td:last-child { width: 70px; }
  .notes { margin-top: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 10px; font-size: 9pt; }
  .notes .label { margin: 0 0 2px; font-weight: 700; color: #166534; }
  .notes ul { margin: 0; padding-left: 16px; }
  .figures { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .figures figure:only-child { grid-column: span 2; }
  figure { margin: 0; break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; display: block; }
  figcaption { font-size: 8.5pt; color: #6b7280; margin-top: 3px; }
  .phones { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
  .phone img { border-radius: 10px; }
  .appendix { break-before: page; }
  .muted { color: #6b7280; font-size: 9pt; }
</style></head>
<body>
  <div class="cover">
    ${logo ? `<img src="${logo}" alt="" />` : ''}
    <div>
      <h1>ERP feedback — test report</h1>
      <p>Power International BD · ERP system · ${esc(dateText)}</p>
    </div>
  </div>

  <p>This report covers the eight feedback points and the sign-in issue. Each point was fixed or checked, then tested automatically in a real browser against the live system. Screenshots were taken during the tests.</p>

  <div class="summary">
    <div class="stat ok"><b>${passed} / ${tests.length}</b><span>tests passed</span></div>
    <div class="stat ${failed ? 'bad' : 'ok'}"><b>${failed}</b><span>tests failed</span></div>
    <div class="stat"><b>9</b><span>feedback points covered (8 + sign-in)</span></div>
  </div>

  <h3>Overview</h3>
  <table class="overview">
    <thead><tr><th>#</th><th>Feedback</th><th>Result</th><th>Tests</th></tr></thead>
    <tbody>
      ${ITEMS.map((item) => {
        const t = testsFor(item)
        const ok = t.filter((x) => x.status === 'Passed').length
        return `<tr><td>${esc(item.no)}</td><td>${esc(item.title)}</td><td><span class="outcome ${item.outcome.toLowerCase()}">${esc(item.outcome)}</span></td><td>${ok} / ${t.length} passed</td></tr>`
      }).join('')}
    </tbody>
  </table>

  ${ITEMS.map(itemSection).join('')}

  <section class="appendix">
    <div class="item-head"><h2>How the tests were run</h2></div>
    <ul class="done">
      <li>Automated browser tests (Playwright, Chromium) on ${esc(dateText)}, against a production build of the ERP connected to the live database.</li>
      <li>Desktop checks at 1280×720; phone checks on a Pixel 7 screen (412×839).</li>
      <li>Records created for testing (dealers, a supplier, a temporary Zone Manager account) were given “E2E” names, visible in some screenshots, and removed again after the run. A final check confirmed nothing was left behind.</li>
      <li>Downloaded PDFs were checked for page size (A4), content, and that nothing is printed above the company heading.</li>
    </ul>
    ${regression.length ? `<h3>Existing features re-checked</h3>
    <table class="cases"><thead><tr><th>Area</th><th>What was checked</th><th>Result</th></tr></thead><tbody>
      ${regression.map((t) => `<tr><td class="id">Damage Products</td><td>${esc(t.title)}</td><td>${badge(t.status)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <p class="muted">Total run time ${Math.round((results.stats?.duration ?? 0) / 1000)} seconds.</p>
  </section>
</body></html>`

const htmlPath = path.join(dir, 'client-test-report.html')
const pdfPath = path.join(dir, 'client-test-report.pdf')
writeFileSync(htmlPath, html)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="font-size:8px;color:#9ca3af;width:100%;padding:0 13mm;display:flex;justify-content:space-between;font-family:Arial"><span>Power International BD · ERP feedback test report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
})
await browser.close()
console.log(`${passed}/${tests.length} passed → ${pdfPath}`)
