import { escapeHtml } from '@/lib/erp/utils'

type BrandedDocumentOptions = {
  title: string
  topLeft: string
  topRight: string
  heading: string
  /** Small highlighted tag beside the heading, like the "INDEX" label on the paper ledger. */
  badge?: string
  body: string
}

/**
 * Builds the printable page used for the credit sheet and dealer ledgers, laid
 * out like the company's paper ledger: zone and dealer on the top line, the
 * logo and company name centred, then the sheet heading.
 */
export function brandedDocument({ title, topLeft, topRight, heading, badge, body }: BrandedDocumentOptions) {
  const logoUrl = `${window.location.origin}/power-icon.png`
  const generatedAt = new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111827; font-family: Arial, 'Noto Sans Bengali', sans-serif; margin: 0; padding: 12mm 12mm 16mm; }
          .top-row { display: flex; justify-content: space-between; font-size: 11px; color: #374151; }
          .brand { align-items: center; display: flex; gap: 18px; justify-content: center; margin-top: 10px; }
          .brand img { height: 58px; width: 58px; object-fit: contain; }
          .brand h1 { font-family: 'Times New Roman', Georgia, serif; font-size: 30px; font-weight: 400; letter-spacing: .02em; margin: 0; }
          .heading-row { align-items: center; display: grid; grid-template-columns: 1fr auto 1fr; margin: 6px 0 14px; }
          .heading { border-bottom: 1px solid #111827; font-size: 14px; font-weight: 700; letter-spacing: .08em; padding: 0 60px 3px; text-align: center; text-transform: uppercase; }
          .badge { background: #00e5ff; font-size: 12px; font-weight: 700; justify-self: end; padding: 2px 26px; text-transform: uppercase; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #111827; font-size: 11px; padding: 4px 7px; }
          th { background: #1e293b; color: #fff; font-weight: 700; text-align: left; }
          table.info { margin-bottom: 14px; }
          table.info td.label { font-weight: 700; white-space: nowrap; width: 1%; }
          table.info td.center { text-align: center; }
          .numeric { text-align: right; white-space: nowrap; }
          .group-title { font-size: 12px; font-weight: 700; margin: 14px 0 4px; text-transform: uppercase; }
          tr.subtotal td { background: #e2e8f0; font-weight: 700; }
          tr.grand td { background: #cbd5e1; font-weight: 700; }
          .section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; margin: 18px 0 6px; text-transform: uppercase; }
          .notes { display: grid; gap: 8px; }
          .note { border: 1px solid #9ca3af; display: flex; font-size: 11px; gap: 10px; padding: 6px 8px; page-break-inside: avoid; }
          .note img { height: 70px; object-fit: cover; width: 70px; }
          .note .meta { color: #4b5563; font-size: 10px; margin-top: 3px; }
          .print-date { color: #6b7280; font-size: 10px; margin-top: 16px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="top-row">
          <span>${escapeHtml(topLeft)}</span>
          <span>${escapeHtml(topRight)}</span>
        </div>
        <div class="brand">
          <img src="${logoUrl}" alt="" />
          <h1>POWER INTERNATIONAL BD</h1>
        </div>
        <div class="heading-row">
          <span></span>
          <span class="heading">${escapeHtml(heading)}</span>
          ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : '<span></span>'}
        </div>
        ${body}
        <p class="print-date">Printed ${escapeHtml(generatedAt)}</p>
        <script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `
}

/** Opens the document in a new window and triggers print. Returns false when popups are blocked. */
export function openPrintWindow(html: string) {
  const popup = window.open('', '_blank', 'width=1000,height=760')
  if (!popup) return false

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return true
}
