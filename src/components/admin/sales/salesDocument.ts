import type { CustomerRecord, OrderRecord, SettingsRecord, ZoneRecord } from '@/lib/erp/types'
import { SALE_TYPE_LABELS, saleTypeOf } from '@/lib/erp/pricing'
import { formatCurrency, formatDate, formatDealerBalance } from '@/lib/erp/utils'
import { resolveCustomerZone } from '@/lib/erp/zones'

/** Who collects an order's due; shared by the Order Form and the order approval summary. */
export const DUE_REFERENCE_OPTIONS: { value: Exclude<OrderRecord['dueReference'], ''>; label: string }[] = [
  { value: 'owner', label: 'Owner (collected directly)' },
  { value: 'courier', label: 'Courier (COD on delivery)' },
  { value: 'bank', label: 'Bank account' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'dbbl', label: 'DBBL' },
]

export type SalesDocument = Pick<
  OrderRecord,
  'id' | 'billNumber' | 'customerId' | 'customerName' | 'salesPersonName' | 'total' | 'paid' | 'due' | 'deliveryDate' | 'createdAt' | 'items' | 'saleType'
> & { subtotal?: number; discount?: number; previousDue?: number; totalDueAfter?: number }

export type SalesDocumentContext = {
  customer?: CustomerRecord | null
  settings?: SettingsRecord
  zones: ZoneRecord[]
  /** The order is cancelled: a CANCELLED stamp and status line, with `cancelledOn` when known. */
  cancelled?: boolean
  cancelledOn?: string
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/** The printable quotation or invoice page. */
export function buildSalesDocumentHtml(
  type: 'Quotation' | 'Invoice',
  document: SalesDocument,
  context: SalesDocumentContext,
  autoPrint = true
) {
  const { customer, settings, zones, cancelled, cancelledOn } = context
  const issueDate = formatDate(document.createdAt)
  const deliveryDate = formatDate(document.deliveryDate)
  const currency = settings?.currency
  const invoiceNumber = (document.billNumber || document.id).replace(/\D/g, '').slice(-8).padStart(8, '0')
  const companyName = settings?.companyName ?? 'Power International BD'
  const iconUrl = `${window.location.origin}/power-icon.png`
  const zone = customer ? resolveCustomerZone(customer, zones) : null
  const zoneName = zone ? zone.name.replace(/\s*zone\s*$/i, '') : ''
  const zoneLabel = zoneName ? `${zoneName} Zone_Power Int.` : 'Power Int.'

  const rows = document.items
    .map((item, index) => {
      const lineTotal = item.quantity * item.unitPrice

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.productName)}</td>
          <td class="numeric">${item.quantity}</td>
          <td class="numeric">${formatCurrency(item.unitPrice, currency)}</td>
          <td class="numeric">${formatCurrency(lineTotal, currency)}</td>
        </tr>
      `
    })
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${type} ${escapeHtml(document.id)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; position: relative; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .zone-label { color: #111827; font-size: 13px; margin: 0 0 10px; }
          .header { align-items: center; border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 16px; }
          .brand { align-items: center; display: flex; gap: 14px; }
          .brand img { height: 58px; object-fit: contain; width: 58px; }
          .brand h1 { color: #111827; font-family: 'Times New Roman', Times, serif; font-size: 30px; font-weight: 400; letter-spacing: .01em; margin: 0; text-transform: uppercase; }
          .brand p, .meta p, .party p { color: #4b5563; font-size: 13px; margin: 5px 0 0; }
          .brand .contact { font-size: 11px; margin-top: 4px; }
          .title { font-size: 28px; font-weight: 700; margin: 0; text-align: right; text-transform: uppercase; }
          .section { margin-top: 26px; }
          .party-grid { display: grid; gap: 20px; grid-template-columns: 1fr 1fr; }
          .party { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; }
          .party h2 { font-size: 13px; letter-spacing: .08em; margin: 0 0 8px; text-transform: uppercase; }
          table { border-collapse: collapse; margin-top: 18px; width: 100%; }
          th { background: #f3f4f6; color: #374151; font-size: 12px; text-align: left; text-transform: uppercase; }
          th, td { border: 1px solid #d1d5db; padding: 10px; }
          td { font-size: 13px; }
          .numeric { text-align: right; }
          .totals { margin-left: auto; margin-top: 18px; width: 320px; }
          .totals div { display: flex; justify-content: space-between; padding: 7px 0; }
          .totals .grand { border-top: 2px solid #111827; font-size: 18px; font-weight: 700; }
          .print-date { bottom: 8mm; color: #4b5563; font-size: 11px; position: fixed; right: 12mm; }
          .cancelled-stamp { border: 6px solid rgba(220, 38, 38, .55); border-radius: 12px; color: rgba(220, 38, 38, .55); font-size: 84px; font-weight: 800; left: 50%; letter-spacing: .12em; padding: 6px 28px; pointer-events: none; position: absolute; top: 330px; transform: translateX(-50%) rotate(-18deg); white-space: nowrap; z-index: 10; }
          .cancelled-line { color: #b91c1c !important; font-weight: 700; }
          @media screen { body { padding: 32px; } .print-date { bottom: 20px; right: 32px; } }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        ${cancelled ? '<div class="cancelled-stamp" data-cancelled-stamp>CANCELLED</div>' : ''}
        <p class="zone-label">${escapeHtml(zoneLabel)}</p>
        <div class="header">
          <div class="brand">
            <img src="${iconUrl}" alt="" />
            <div>
              <h1>${escapeHtml(companyName)}</h1>
              <p class="contact">92, Wise Market, Nawabpur Road, Dhaka-1100 · +88 01897914480-83</p>
            </div>
          </div>
          <div class="meta">
            <p class="title">${type}</p>
            <p><strong>No:</strong> ${invoiceNumber}</p>
            <p><strong>Issue:</strong> ${issueDate}</p>
            <p><strong>Planned delivery:</strong> ${deliveryDate}</p>
            ${cancelled ? `<p class="cancelled-line">Status: CANCELLED${cancelledOn ? ` on ${formatDate(cancelledOn)}` : ''}</p>` : ''}
          </div>
        </div>

        <div class="section party-grid">
          <div class="party">
            <h2>Bill To</h2>
            <p><strong>${escapeHtml(document.customerName)}</strong></p>
            <p>${escapeHtml(customer?.company ?? 'Retail')}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(customer?.phone || 'N/A')}</p>
            <p><strong>Location:</strong> ${escapeHtml(customer?.location || 'N/A')}</p>
          </div>
          <div class="party">
            <h2>Prepared By</h2>
            <p><strong>${escapeHtml(document.salesPersonName)}</strong></p>
            <p class="sale-type">Sale type: <strong>${SALE_TYPE_LABELS[saleTypeOf(document)]}</strong></p>
            <p>Payment status: ${cancelled ? (document.paid > 0 ? 'Cancelled, paid amount held as advance' : 'Cancelled, nothing due') : document.due > 0 ? 'Due' : 'Paid'}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="numeric">Qty</th>
              <th class="numeric">Unit Price</th>
              <th class="numeric">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">
          <div><span>Total amount</span><strong>${formatCurrency(document.subtotal ?? document.total, currency)}</strong></div>
          <div><span>Discount</span><strong>${formatCurrency(document.discount ?? 0, currency)}</strong></div>
          <div><span>Payable amount</span><strong>${formatCurrency(document.total, currency)}</strong></div>
          <div><span>Paid</span><strong>${formatCurrency(document.paid, currency)}</strong></div>
          <div class="grand"><span>Due amount</span><strong>${cancelled ? 'Cancelled' : formatCurrency(document.due, currency)}</strong></div>
          ${
            // The dealer's due at approval no longer holds once the bill is off their sheet.
            document.totalDueAfter !== undefined && !cancelled
              ? `<div><span>Previous due</span><strong>${formatDealerBalance(document.previousDue ?? 0, currency)}</strong></div>
          <div class="grand"><span>Total due</span><strong>${formatDealerBalance(document.totalDueAfter, currency)}</strong></div>`
              : ''
          }
        </div>

        <p class="print-date">${issueDate}</p>
        ${
          autoPrint
            ? `<script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>`
            : ''
        }
      </body>
    </html>
  `
}

/** Opens the document in a new window, which prints itself; returns an error message if popups are blocked. */
export function printSalesDocument(html: string): string | null {
  const popup = window.open('', '_blank', 'width=920,height=720')
  if (!popup) {
    return 'Allow popups to print or save the document as PDF.'
  }
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return null
}
