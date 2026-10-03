import { brandedDocument } from '@/components/admin/credit-sheet/printSheet'
import { balanceSide, type LedgerRowWithBalance, type LedgerTotals, type ReplacementHistoryRow } from '@/lib/erp/ledger'
import type { CustomerRecord, SupplierRecord } from '@/lib/erp/types'
import { escapeHtml, formatAmount, formatDate, partyCode } from '@/lib/erp/utils'

export type LedgerDocumentParty = {
  /** The client's or supplier's system code. */
  code?: string
  name: string
  ownerName: string
  address: string
  zoneName: string
  /** The dealer's sub-zone (thana). Suppliers have none. */
  subZoneName?: string
  serial?: number
  phone: string
  email: string
  nid: string
  tradeLicenseNo: string
  bank: string
}

/** A dealer's details for the ledger header. */
export function customerDocumentParty(
  customer: Pick<CustomerRecord, 'id' | 'code' | 'name' | 'company' | 'location' | 'thana' | 'district' | 'phone' | 'email' | 'nid' | 'tradeLicenseNo' | 'bankName' | 'branchName'>,
  zoneName: string,
  serial?: number
): LedgerDocumentParty {
  return {
    code: partyCode(customer),
    name: customer.name,
    ownerName: customer.company,
    address: [customer.location, customer.thana, customer.district].filter(Boolean).join(', '),
    zoneName,
    subZoneName: customer.thana?.trim() ?? '',
    serial,
    phone: customer.phone,
    email: customer.email,
    nid: customer.nid,
    tradeLicenseNo: customer.tradeLicenseNo,
    bank: customer.bankName ? `${customer.bankName}${customer.branchName ? ` (${customer.branchName})` : ''}` : '',
  }
}

/** A supplier's details for the ledger header. Suppliers have no zone, so it shows their country. */
export function supplierDocumentParty(
  supplier: Pick<SupplierRecord, 'id' | 'code' | 'name' | 'company' | 'location' | 'country' | 'phone' | 'email' | 'nid' | 'tradeLicenseNo' | 'bankName' | 'bankBranch'>
): LedgerDocumentParty {
  return {
    code: partyCode(supplier),
    name: supplier.name,
    ownerName: supplier.company,
    address: supplier.location,
    zoneName: supplier.country,
    phone: supplier.phone,
    email: supplier.email,
    nid: supplier.nid,
    tradeLicenseNo: supplier.tradeLicenseNo,
    bank: supplier.bankName ? `${supplier.bankName}${supplier.bankBranch ? ` (${supplier.bankBranch})` : ''}` : '',
  }
}

type LedgerDocumentOptions = {
  party: LedgerDocumentParty
  rows: LedgerRowWithBalance[]
  totals: LedgerTotals
  currency?: string
  /** Extra sections after the ledger table, already as HTML (commitment notes and the like). */
  extraHtml?: string
  replacementHistory?: ReplacementHistoryRow[]
  autoPrint: boolean
}

/**
 * The printable ledger of one dealer or supplier, laid out like the paper ledger. The credit
 * sheet, the statement image sent to a dealer, and the dealer's own portal all use it, so the
 * dealer always sees the same sheet the office does.
 */
export function buildLedgerDocument({ party, rows, extraHtml = '', replacementHistory, autoPrint }: LedgerDocumentOptions) {
  const money = (amount: number) => escapeHtml(formatAmount(amount))
  const orNA = (value: string | undefined) => escapeHtml(value || 'N/A')

  const rowsHtml = rows
    .map(
      (row) => `
          <tr>
            <td>${escapeHtml(row.billNumber ?? '')}</td>
            <td>${escapeHtml(formatDate(row.date))}</td>
            <td>${escapeHtml(row.particulars)}</td>
            <td class="numeric">${row.qty ?? ''}</td>
            <td class="numeric">${row.unitPrice ? money(row.unitPrice) : ''}</td>
            <td class="numeric">${row.debit ? money(row.debit) : ''}</td>
            <td class="numeric">${row.credit ? money(row.credit) : ''}</td>
            <td>${balanceSide(row.balance)}</td>
            <td class="numeric">${money(Math.abs(row.balance))}</td>
          </tr>
        `
    )
    .join('')

  const replacementHtml = replacementHistory
    ? `
      <p class="section-title">Replacement history</p>
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Dealer</th><th>Product</th><th>Serial</th><th>Details</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${
            replacementHistory.length
              ? replacementHistory
                  .map(
                    (row) => `
                <tr>
                  <td>${escapeHtml(formatDate(row.date))}</td>
                  <td>${row.type === 'replacement' ? 'Replacement' : 'Return'}</td>
                  <td>${escapeHtml(row.customerName)}</td>
                  <td>${escapeHtml(row.productName)}</td>
                  <td>${escapeHtml(row.serialNumber || '-')}</td>
                  <td>${escapeHtml(row.details || '-')}</td>
                  <td>${escapeHtml(row.status)}</td>
                </tr>
              `
                  )
                  .join('')
              : '<tr><td colspan="7">No replacements yet.</td></tr>'
          }
        </tbody>
      </table>
    `
    : ''

  const body = `
      <table class="info">
        <tr>
          <td class="label">Account of</td>
          <td class="center">${orNA(party.name)}</td>
          <td class="label">Owner Name</td>
          <td class="center">${orNA(party.ownerName)}</td>
          <td class="label">SL. No.</td>
          <td class="center">${party.serial ? party.serial : ''}</td>
        </tr>
        <tr>
          <td class="label">Add</td>
          <td>${orNA(party.address)}</td>
          <td class="label">Zone</td>
          ${
            party.subZoneName === undefined
              ? `<td colspan="3">${orNA(party.zoneName)}</td>`
              : `<td>${orNA(party.zoneName)}</td>
          <td class="label">Sub-zone</td>
          <td>${orNA(party.subZoneName)}</td>`
          }
        </tr>
        <tr>
          <td class="label">Contact No.</td>
          <td>${orNA(party.phone)}</td>
          <td class="label">Email</td>
          <td>${orNA(party.email)}</td>
          <td class="label">ID</td>
          <td class="center">${orNA(party.code)}</td>
        </tr>
      </table>

      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Date</th>
            <th>Particulars</th>
            <th class="numeric">Qty</th>
            <th class="numeric">Unit Price</th>
            <th class="numeric">Debit</th>
            <th class="numeric">Credit</th>
            <th>Dr/Cr</th>
            <th class="numeric">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      ${extraHtml}
      ${replacementHtml}
    `

  return brandedDocument({
    title: `Ledger - ${party.name}`,
    heading: 'Ledger',
    body,
    autoPrint,
  })
}

/** A file name for a party's ledger, keeping Bangla letters. */
export function ledgerFileSlug(name: string) {
  return name.trim().replace(/[^\wঀ-৿]+/g, '-').replace(/^-+|-+$/g, '') || 'ledger'
}
