"use client"

import Image from 'next/image'
import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, BellRing, Eye, FileImage, FileText, MapPinned, Plus, Printer, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import {
  CommitmentsPanel,
  commitmentsForPdf,
  defaultCommitmentPdfOptions,
  type CommitmentPdfOptions,
  type CommitmentPdfStatus,
} from '@/components/admin/credit-sheet/CommitmentsPanel'
import { brandedDocument, downloadDocumentJpg, downloadDocumentPdf, downloadSheetPdf, openPrintWindow, type SheetPdfTable } from '@/components/admin/credit-sheet/printSheet'
import { buildLedgerDocument, customerDocumentParty, ledgerFileSlug } from '@/components/admin/credit-sheet/ledgerDocument'
import { PartyNotifyDialog } from '@/components/admin/portal/PartyNotifyDialog'
import { ZoneManagerDialog } from '@/components/admin/credit-sheet/ZoneManagerDialog'
import { LedgerEntryApprovals } from '@/components/admin/approvals/LedgerEntryApprovals'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { CreditLedgerEntryInput, CustomerRecord } from '@/lib/erp/types'
import { buildCustomerLedger, ledgerTotalsOf, withRunningBalance } from '@/lib/erp/ledger'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { escapeHtml, formatAmount, formatDate, isZoneInCharge, partyCode, toArray } from '@/lib/erp/utils'
import {
  customerZoneId,
  customerZoneName,
  subZoneKey,
  subZoneLabel,
  UNASSIGNED_ZONE_ID,
  UNASSIGNED_ZONE_NAME,
} from '@/lib/erp/zones'
import { cn } from '@/lib/utils/index'

type LedgerEntryFormState = {
  date: string
  particulars: string
  qty: string
  unitPrice: string
  entryType: LedgerEntryType
  amount: string
}

type LedgerEntryType = 'debit' | 'credit'

const LEDGER_ENTRY_TYPE_OPTIONS: Array<{ value: LedgerEntryType; label: string; hint: string }> = [
  { value: 'debit', label: 'Debit', hint: 'Payments, deposits, or returns that reduce the balance.' },
  { value: 'credit', label: 'Credit', hint: 'Goods taken or charges that increase the balance.' },
]

type GroupBy = 'zone' | 'subzone'

type SheetRow = {
  customer: CustomerRecord
  purchaseTotal: number
  quantity: number
  paid: number
  zoneId: string
  zoneName: string
  subZoneKey: string
  subZoneName: string
}

type Totals = { dealers: number; quantity: number; purchase: number; paid: number; due: number }

const GROUP_BY_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'zone', label: 'Zone' },
  { value: 'subzone', label: 'Sub-zone' },
]

function emptyLedgerEntryForm(): LedgerEntryFormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    particulars: '',
    qty: '',
    unitPrice: '',
    entryType: 'debit',
    amount: '0',
  }
}

// Qty × unit price fills the amount automatically; the amount stays editable for overrides.
function withAutoAmount(form: LedgerEntryFormState): LedgerEntryFormState {
  const qty = Number(form.qty)
  const unitPrice = Number(form.unitPrice)
  if (!form.qty || !form.unitPrice || !Number.isFinite(qty) || !Number.isFinite(unitPrice)) return form
  return { ...form, amount: String(Math.round(qty * unitPrice * 100) / 100) }
}

function totalsOf(rows: SheetRow[]): Totals {
  return {
    dealers: rows.length,
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    purchase: rows.reduce((sum, row) => sum + row.purchaseTotal, 0),
    paid: rows.reduce((sum, row) => sum + row.paid, 0),
    due: rows.reduce((sum, row) => sum + row.customer.due, 0),
  }
}

function groupKeyOf(row: SheetRow, groupBy: GroupBy) {
  if (groupBy === 'zone') return row.zoneName
  // The same sub-zone name can exist in two zones, so the zone is part of the group.
  return `${row.zoneName} - ${row.subZoneName}`
}

/** Zones A-Z with the unassigned ones last, then sub-zones A-Z with dealers lacking one last. */
function compareByZoneAndSubZone(left: SheetRow, right: SheetRow) {
  return (
    Number(left.zoneId === UNASSIGNED_ZONE_ID) - Number(right.zoneId === UNASSIGNED_ZONE_ID) ||
    left.zoneName.localeCompare(right.zoneName) ||
    Number(!left.subZoneKey) - Number(!right.subZoneKey) ||
    left.subZoneName.localeCompare(right.subZoneName)
  )
}

const NO_SUB_ZONE_FILTER = 'none'

/** "Borishal" -> "Borishal Zone", while "Borishal Zone" stays as it is. */
function zoneTitle(name: string) {
  return /zone$/i.test(name.trim()) ? name.trim() : `${name.trim()} Zone`
}

function SheetBrandHeader({ topLeft, topRight, heading, badge }: { topLeft: string; topRight: string; heading: string; badge?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span>{topLeft}</span>
        <span className="text-right">{topRight}</span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <Image src="/power-icon.png" alt="" width={52} height={52} className="h-11 w-11 object-contain" />
        <h2 className="font-serif text-xl tracking-wide sm:text-3xl">POWER INTERNATIONAL BD</h2>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span />
        <span className="border-b border-foreground px-6 pb-0.5 text-center text-sm font-bold uppercase tracking-[0.12em] sm:px-14">
          {heading}
        </span>
        {badge ? (
          <span className="justify-self-end bg-cyan-400 px-4 py-0.5 text-xs font-bold uppercase text-slate-900 sm:px-7">{badge}</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

export default function CreditSheetPage() {
  const { data, currentUser, hasPermission, recordCreditLedgerEntry, deleteCreditLedgerEntry, changesNeedApproval } = useERP()
  const currency = data?.settings.currency
  const canEdit = hasPermission('credit_sheet.edit')
  // A zone in charge cannot change the sheet but may add a commitment or a ledger entry for their zone's
  // clients; each goes to the Authorizer, then the Chairman.
  const zoneInCharge = isZoneInCharge(currentUser, toArray(data?.zones))
  const canAddCommitment = canEdit || zoneInCharge
  const canAddEntry = canEdit || zoneInCharge
  const canManageZones = hasPermission('zones.edit')
  // Zone managers and zone-limited roles are limited to their own zones; everyone else sees all zones.
  const { zones, zoneOptions, visibleZoneIds, customers } = useZoneAccess()
  const allCustomers = useMemo(() => toArray(data?.customers), [data?.customers])
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const creditLedgerEntries = useMemo(() => toArray(data?.creditLedgerEntries), [data?.creditLedgerEntries])


  const [query, setQuery] = useState('')
  const [filterZone, setFilterZone] = useState('all')
  const [filterSubZone, setFilterSubZone] = useState('all')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('zone')
  const [zonesOpen, setZonesOpen] = useState(false)
  const [zonesStartWithNew, setZonesStartWithNew] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [entryForm, setEntryForm] = useState<LedgerEntryFormState>(emptyLedgerEntryForm)
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [ledgerFeedback, setLedgerFeedback] = useState<string | null>(null)
  const [isSavingLedgerPdf, setIsSavingLedgerPdf] = useState(false)
  const [isSavingLedgerJpg, setIsSavingLedgerJpg] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [commitmentPdf, setCommitmentPdf] = useState<CommitmentPdfOptions>(defaultCommitmentPdfOptions)
  const [sheetFeedback, setSheetFeedback] = useState<string | null>(null)

  const customerRows = useMemo<SheetRow[]>(() => {
    // Same sources as the dealer ledger: bills and payments on orders, plus hand-written ledger entries
    // (credit = goods given, debit = payment received).
    const purchases = new Map<string, number>()
    const payments = new Map<string, number>()
    const quantities = new Map<string, number>()
    const add = (totals: Map<string, number>, customerId: string, amount: number) =>
      totals.set(customerId, (totals.get(customerId) ?? 0) + amount)
    for (const order of orders) {
      add(purchases, order.customerId, order.total)
      add(payments, order.customerId, order.paid)
      add(quantities, order.customerId, (order.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0))
    }
    for (const entry of creditLedgerEntries) {
      add(purchases, entry.customerId, entry.credit)
      add(payments, entry.customerId, entry.debit)
      add(quantities, entry.customerId, entry.qty || 0)
    }

    return customers.map((customer) => {
      const purchaseTotal = purchases.get(customer.id) ?? 0
      return {
        customer,
        purchaseTotal,
        quantity: quantities.get(customer.id) ?? 0,
        paid: payments.get(customer.id) ?? 0,
        zoneId: customerZoneId(customer, zones),
        zoneName: customerZoneName(customer, zones),
        subZoneKey: subZoneKey(customer, zones),
        subZoneName: subZoneLabel(customer),
      }
    })
  }, [creditLedgerEntries, customers, orders, zones])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const minPrice = priceMin.trim() ? Number(priceMin) : null
    const maxPrice = priceMax.trim() ? Number(priceMax) : null
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo) : null
    if (to) to.setHours(23, 59, 59, 999)

    return customerRows.filter((row) => {
      const { customer, purchaseTotal } = row
      const matchesSearch =
        !normalizedQuery ||
        [customer.name, customer.company, customer.phone, customer.location].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesZone = filterZone === 'all' || row.zoneId === filterZone
      const matchesSubZone =
        filterSubZone === 'all' || row.subZoneKey === (filterSubZone === NO_SUB_ZONE_FILTER ? '' : filterSubZone)
      const matchesMinPrice = minPrice === null || Number.isNaN(minPrice) || purchaseTotal >= minPrice
      const matchesMaxPrice = maxPrice === null || Number.isNaN(maxPrice) || purchaseTotal <= maxPrice
      const joinedDate = new Date(customer.createdAt)
      const matchesFrom = !from || joinedDate >= from
      const matchesTo = !to || joinedDate <= to

      return (
        matchesSearch &&
        matchesZone &&
        matchesSubZone &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesFrom &&
        matchesTo
      )
    })
  }, [customerRows, query, filterZone, filterSubZone, priceMin, priceMax, dateFrom, dateTo])

  // Sub-zones that actually have dealers within the chosen zone.
  const subZoneOptions = useMemo(() => {
    const options = new Map<string, string>()
    let hasNone = false
    for (const row of customerRows) {
      if (filterZone !== 'all' && row.zoneId !== filterZone) continue
      if (row.subZoneKey) options.set(row.subZoneKey, filterZone === 'all' ? `${row.subZoneName} (${row.zoneName})` : row.subZoneName)
      else hasNone = true
    }
    const sorted = Array.from(options.entries()).sort((left, right) => left[1].localeCompare(right[1]))
    return { options: sorted, hasNone }
  }, [customerRows, filterZone])

  const creditSheetGroups = useMemo(() => {
    const groups = new Map<string, SheetRow[]>()

    for (const row of filteredRows) {
      const key = groupKeyOf(row, groupBy)
      const rowsForGroup = groups.get(key) ?? []
      rowsForGroup.push(row)
      groups.set(key, rowsForGroup)
    }

    return Array.from(groups.entries())
      .map(([name, rows]) => ({
        name,
        rows: [...rows].sort(
          (left, right) => compareByZoneAndSubZone(left, right) || left.customer.name.localeCompare(right.customer.name)
        ),
        totals: totalsOf(rows),
      }))
      .sort((left, right) => compareByZoneAndSubZone(left.rows[0], right.rows[0]))
  }, [filteredRows, groupBy])

  const metrics = useMemo(() => totalsOf(filteredRows), [filteredRows])

  const groupLabel = GROUP_BY_OPTIONS.find((option) => option.value === groupBy)?.label ?? 'Zone'
  const showSubZoneColumn = groupBy !== 'subzone'

  const scopeName = useMemo(() => {
    if (filterZone !== 'all') {
      return filterZone === UNASSIGNED_ZONE_ID ? UNASSIGNED_ZONE_NAME : zones.find((zone) => zone.id === filterZone)?.name ?? 'Zone'
    }
    if (visibleZoneIds) return zoneOptions.map((zone) => zone.name).join(', ')
    return 'All zones'
  }, [filterZone, visibleZoneIds, zoneOptions, zones])
  const sheetTopLeft = scopeName === 'All zones' ? 'All zones_Power Int.' : `${zoneTitle(scopeName)}_Power Int.`

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId]
  )
  const selectedZoneName = selectedCustomer ? customerZoneName(selectedCustomer, zones) : ''

  // Serial number within the dealer's zone, stable regardless of the viewer's filters.
  const selectedCustomerSerial = useMemo(() => {
    if (!selectedCustomer) return 0
    const zoneId = customerZoneId(selectedCustomer, zones)
    const zoneCustomers = allCustomers
      .filter((customer) => customerZoneId(customer, zones) === zoneId)
      .sort((left, right) => left.name.localeCompare(right.name))
    return zoneCustomers.findIndex((customer) => customer.id === selectedCustomer.id) + 1
  }, [allCustomers, selectedCustomer, zones])

  const ledgerWithBalance = useMemo(
    () => (selectedCustomerId ? withRunningBalance(buildCustomerLedger(selectedCustomerId, orders, creditLedgerEntries)) : []),
    [orders, creditLedgerEntries, selectedCustomerId]
  )
  const ledgerTotals = useMemo(() => ledgerTotalsOf(ledgerWithBalance), [ledgerWithBalance])

  // Export PDF draws the same layout as Print sheet, with selectable text. Sheets with Bangla
  // text use an image of the printed page instead (jsPDF cannot join Bangla letters), with a
  // hidden text layer so the Bangla can still be searched.
  async function handleExportPdf() {
    setSheetFeedback(null)
    try {
      const saved = await downloadSheetPdf({ ...sheetHeader(), tables: sheetPdfTables() }, 'credit-sheet.pdf')
      if (!saved) await downloadDocumentPdf(buildSheetHtml(false), 'credit-sheet.pdf')
    } catch (reason) {
      setSheetFeedback(reason instanceof Error ? reason.message : 'Unable to create the PDF.')
    }
  }

  function handlePrintSheet() {
    setSheetFeedback(openPrintWindow(buildSheetHtml(true)) ? null : 'Allow popups to print or save the credit sheet as PDF.')
  }

  function sheetHeader() {
    return { heading: 'Credit Sheet' }
  }

  function sheetPdfTables(): SheetPdfTable[] {
    const money = (amount: number) => formatAmount(amount)
    const qty = (amount: number) => amount.toLocaleString('en-BD')
    const extraHeaders = [
      ...(showSubZoneColumn ? ['Sub-zone'] : []),
      'Quantity',
    ]
    const amountStart = 4 + extraHeaders.length

    const groupTables: SheetPdfTable[] = creditSheetGroups.map((group) => ({
      title: group.name,
      titleKind: 'group',
      head: ['SL', 'Dealer', 'Owner', 'Mobile', ...extraHeaders, 'Total purchase', 'Paid', 'Due (credit)'],
      numeric: [amountStart - 1, amountStart, amountStart + 1, amountStart + 2],
      rows: [
        ...group.rows.map((row, index) => ({
          cells: [
            String(index + 1),
            row.customer.name,
            row.customer.company,
            row.customer.phone,
            ...(showSubZoneColumn ? [row.customer.thana || '-'] : []),
            qty(row.quantity),
            money(row.purchaseTotal),
            money(row.paid),
            money(row.customer.due),
          ],
        })),
        {
          tone: 'subtotal' as const,
          cells: [
            { content: `${group.name} total (${group.totals.dealers} dealers)`, colSpan: amountStart - 1 },
            qty(group.totals.quantity),
            money(group.totals.purchase),
            money(group.totals.paid),
            money(group.totals.due),
          ],
        },
      ],
    }))

    const summaryTable: SheetPdfTable = {
      title: `${groupLabel}-wise summary`,
      titleKind: 'section',
      head: [groupLabel, 'Dealers', 'Quantity', 'Total purchase', 'Paid', 'Due (credit)'],
      numeric: [1, 2, 3, 4, 5],
      rows: [
        ...creditSheetGroups.map((group) => ({
          cells: [group.name, String(group.totals.dealers), qty(group.totals.quantity), money(group.totals.purchase), money(group.totals.paid), money(group.totals.due)],
        })),
        {
          tone: 'grand' as const,
          cells: ['Grand total', String(metrics.dealers), qty(metrics.quantity), money(metrics.purchase), money(metrics.paid), money(metrics.due)],
        },
      ],
    }

    return [...groupTables, summaryTable]
  }

  function buildSheetHtml(autoPrint: boolean) {
    const money = (amount: number) => escapeHtml(formatAmount(amount))
    const qty = (amount: number) => escapeHtml(amount.toLocaleString('en-BD'))
    const extraHeaders = showSubZoneColumn ? '<th>Sub-zone</th>' : ''
    const extraCount = Number(showSubZoneColumn)

    const groupsHtml = creditSheetGroups
      .map(
        (group) => `
          <p class="group-title">${escapeHtml(group.name)}</p>
          <table>
            <thead>
              <tr>
                <th>SL</th><th>Dealer</th><th>Owner</th><th>Mobile</th>${extraHeaders}<th class="numeric">Quantity</th>
                <th class="numeric">Total purchase</th><th class="numeric">Paid</th><th class="numeric">Due (credit)</th>
              </tr>
            </thead>
            <tbody>
              ${group.rows
                .map(
                  (row, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${escapeHtml(row.customer.name)}</td>
                      <td>${escapeHtml(row.customer.company)}</td>
                      <td>${escapeHtml(row.customer.phone)}</td>
                      ${showSubZoneColumn ? `<td>${escapeHtml(row.customer.thana || '-')}</td>` : ''}
                      <td class="numeric">${qty(row.quantity)}</td>
                      <td class="numeric">${money(row.purchaseTotal)}</td>
                      <td class="numeric">${money(row.paid)}</td>
                      <td class="numeric">${money(row.customer.due)}</td>
                    </tr>
                  `
                )
                .join('')}
              <tr class="subtotal">
                <td colspan="${4 + extraCount}">${escapeHtml(group.name)} total (${group.totals.dealers} dealers)</td>
                <td class="numeric">${qty(group.totals.quantity)}</td>
                <td class="numeric">${money(group.totals.purchase)}</td>
                <td class="numeric">${money(group.totals.paid)}</td>
                <td class="numeric">${money(group.totals.due)}</td>
              </tr>
            </tbody>
          </table>
        `
      )
      .join('')

    const summaryHtml = `
      <p class="section-title">${escapeHtml(groupLabel)}-wise summary</p>
      <table>
        <thead>
          <tr><th>${escapeHtml(groupLabel)}</th><th class="numeric">Dealers</th><th class="numeric">Quantity</th><th class="numeric">Total purchase</th><th class="numeric">Paid</th><th class="numeric">Due (credit)</th></tr>
        </thead>
        <tbody>
          ${creditSheetGroups
            .map(
              (group) => `
                <tr>
                  <td>${escapeHtml(group.name)}</td>
                  <td class="numeric">${group.totals.dealers}</td>
                  <td class="numeric">${qty(group.totals.quantity)}</td>
                  <td class="numeric">${money(group.totals.purchase)}</td>
                  <td class="numeric">${money(group.totals.paid)}</td>
                  <td class="numeric">${money(group.totals.due)}</td>
                </tr>
              `
            )
            .join('')}
          <tr class="grand">
            <td>Grand total</td>
            <td class="numeric">${metrics.dealers}</td>
            <td class="numeric">${qty(metrics.quantity)}</td>
            <td class="numeric">${money(metrics.purchase)}</td>
            <td class="numeric">${money(metrics.paid)}</td>
            <td class="numeric">${money(metrics.due)}</td>
          </tr>
        </tbody>
      </table>
    `

    return brandedDocument({
      title: 'Credit Sheet',
      ...sheetHeader(),
      body: groupsHtml + summaryHtml,
      autoPrint,
    })
  }

  function openEntryDialog() {
    setEntryForm(emptyLedgerEntryForm())
    setLedgerFeedback(null)
    setEntryDialogOpen(true)
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomerId) return
    setLedgerFeedback(null)
    setIsSavingEntry(true)

    try {
      const input: CreditLedgerEntryInput = {
        customerId: selectedCustomerId,
        date: entryForm.date,
        particulars: entryForm.particulars,
        qty: entryForm.qty ? Number(entryForm.qty) : undefined,
        unitPrice: entryForm.unitPrice ? Number(entryForm.unitPrice) : undefined,
        debit: entryForm.entryType === 'debit' ? Number(entryForm.amount || 0) : 0,
        credit: entryForm.entryType === 'credit' ? Number(entryForm.amount || 0) : 0,
      }
      await recordCreditLedgerEntry(input)
      setEntryDialogOpen(false)
      setEntryForm(emptyLedgerEntryForm())
      if (zoneInCharge) {
        setLedgerFeedback("The entry was sent to your zone's Authorizer, then goes to the Chairman. It shows on the sheet once approved.")
      } else if (changesNeedApproval) {
        setLedgerFeedback('The entry was sent to an admin for approval. It shows on the sheet once approved.')
      }
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to save ledger entry.')
    } finally {
      setIsSavingEntry(false)
    }
  }

  async function handleDeleteEntry(entryId: string) {
    setLedgerFeedback(null)
    try {
      await deleteCreditLedgerEntry(entryId)
      if (changesNeedApproval) setLedgerFeedback('Removing the entry was sent to an admin for approval.')
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to delete ledger entry.')
    }
  }

  function buildLedgerHtml(autoPrint: boolean) {
    if (!selectedCustomer) return null

    // Only approved commitments go on the printed ledger, narrowed by the PDF options and per-note toggles.
    const commitments = commitmentsForPdf(selectedCustomer, commitmentPdf)
    const commitmentsHtml = commitments.length
      ? `
        <p class="section-title">Commitment notes</p>
        <div class="notes">
          ${commitments
            .map(
              (commitment) => `
                <div class="note">
                  ${commitment.imageUrl ? `<img src="${escapeHtml(commitment.imageUrl)}" alt="" />` : ''}
                  <div>
                    <div>${escapeHtml(commitment.note)}</div>
                    <div class="meta">
                      ${commitment.status === 'fulfilled' ? 'Fulfilled' : 'Pending'}
                      ${commitment.dueDate ? ` · Due ${escapeHtml(formatDate(commitment.dueDate))}` : ''}
                      · Added ${escapeHtml(formatDate(commitment.createdAt))}${commitment.createdBy ? ` by ${escapeHtml(commitment.createdBy)}` : ''}
                    </div>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `
      : ''

    return buildLedgerDocument({
      party: customerDocumentParty(selectedCustomer, selectedZoneName, selectedCustomerSerial),
      rows: ledgerWithBalance,
      totals: ledgerTotals,
      currency,
      extraHtml: commitmentsHtml,
      autoPrint,
    })
  }

  function handlePrintLedger() {
    const html = buildLedgerHtml(true)
    if (html && !openPrintWindow(html)) {
      setLedgerFeedback('Allow popups to print the ledger.')
    }
  }

  // Saves the ledger as a PDF file directly, so no browser print header or footer ends up on it.
  async function handleDownloadLedgerPdf() {
    const html = buildLedgerHtml(false)
    if (!html || !selectedCustomer) return

    setLedgerFeedback(null)
    setIsSavingLedgerPdf(true)
    try {
      await downloadDocumentPdf(html, `ledger-${ledgerFileSlug(selectedCustomer.name)}.pdf`)
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to create the PDF.')
    } finally {
      setIsSavingLedgerPdf(false)
    }
  }

  async function handleDownloadLedgerJpg() {
    const html = buildLedgerHtml(false)
    if (!html || !selectedCustomer) return

    setLedgerFeedback(null)
    setIsSavingLedgerJpg(true)
    try {
      await downloadDocumentJpg(html, `ledger-${ledgerFileSlug(selectedCustomer.name)}.jpg`)
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to create the image.')
    } finally {
      setIsSavingLedgerJpg(false)
    }
  }

  if (selectedCustomer) {
    const address = [selectedCustomer.location, selectedCustomer.thana, selectedCustomer.district].filter(Boolean).join(', ')
    const infoLabel = 'border border-border px-3 py-2 font-semibold whitespace-nowrap'
    const infoValue = 'border border-border px-3 py-2'

    return (
      <AdminShell active="Credit Sheet">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setSelectedCustomerId(null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to credit sheet
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handlePrintLedger}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print ledger
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => void handleDownloadLedgerPdf()}
                disabled={isSavingLedgerPdf}
              >
                <FileText className="mr-1.5 h-4 w-4" />
                {isSavingLedgerPdf ? 'Preparing PDF...' : 'Download PDF'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => void handleDownloadLedgerJpg()}
                disabled={isSavingLedgerJpg}
              >
                <FileImage className="mr-1.5 h-4 w-4" />
                {isSavingLedgerJpg ? 'Preparing JPG...' : 'Download JPG'}
              </Button>
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setNotifyOpen(true)}>
                  <BellRing className="mr-1.5 h-4 w-4" />
                  Notify dealer
                </Button>
              ) : null}
              {canAddEntry ? (
                <Button type="button" size="sm" className="rounded-lg" onClick={openEntryDialog}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add ledger entry
                </Button>
              ) : null}
            </div>
          </div>

          {ledgerFeedback ? (
            <Card className="border-border/70 bg-primary/5 shadow-sm">
              <CardContent className="p-4 text-sm text-primary">{ledgerFeedback}</CardContent>
            </Card>
          ) : null}

          <LedgerEntryApprovals customerId={selectedCustomer.id} />

          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-5 p-4 sm:p-6">
              <SheetBrandHeader
                topLeft={`${zoneTitle(selectedZoneName)}_Power Int.`}
                topRight={selectedCustomer.name}
                heading="Ledger"
              />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className={infoLabel}>Account of</td>
                      <td className={cn(infoValue, 'text-center')}>{selectedCustomer.name}</td>
                      <td className={infoLabel}>Owner Name</td>
                      <td className={cn(infoValue, 'text-center')} colSpan={3}>
                        {selectedCustomer.company || 'N/A'}
                      </td>
                    </tr>
                    <tr>
                      <td className={infoLabel}>Add</td>
                      <td className={infoValue}>{address || 'N/A'}</td>
                      <td className={infoLabel}>Zone</td>
                      <td className={infoValue}>{selectedZoneName}</td>
                      <td className={infoLabel}>SL. No.</td>
                      <td className={cn(infoValue, 'text-center')}>{selectedCustomerSerial}</td>
                    </tr>
                    <tr>
                      <td className={infoLabel}>Contact No.</td>
                      <td className={infoValue}>{selectedCustomer.phone || 'N/A'}</td>
                      <td className={infoLabel}>Email</td>
                      <td className={infoValue}>{selectedCustomer.email || 'N/A'}</td>
                      <td className={infoLabel}>Client ID</td>
                      <td className={cn(infoValue, 'text-center')}>{partyCode(selectedCustomer)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 rounded-2xl border border-border/70 p-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">NID No</p>
                  <p className="font-medium">{selectedCustomer.nid || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trade License No</p>
                  <p className="font-medium">{selectedCustomer.tradeLicenseNo || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank</p>
                  <p className="font-medium">
                    {selectedCustomer.bankName || 'N/A'}
                    {selectedCustomer.branchName ? ` (${selectedCustomer.branchName})` : ''}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                      <TableHead>Bill No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Dr/Cr</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerWithBalance.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{row.billNumber}</TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>
                          {row.particulars}
                          {row.documentUrl ? (
                            <a
                              href={row.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden"
                            >
                              <FileText className="h-3 w-3" />
                              Delivery doc
                            </a>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">{row.qty ?? ''}</TableCell>
                        <TableCell className="text-right">{row.unitPrice ? formatAmount(row.unitPrice) : ''}</TableCell>
                        <TableCell className="text-right">{row.debit ? formatAmount(row.debit) : ''}</TableCell>
                        <TableCell className="text-right">{row.credit ? formatAmount(row.credit) : ''}</TableCell>
                        <TableCell>{row.balance >= 0 ? 'Cr' : 'Dr'}</TableCell>
                        <TableCell className="text-right font-medium">{formatAmount(Math.abs(row.balance))}</TableCell>
                        {canEdit ? (
                          <TableCell className="text-right">
                            {row.removable ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteEntry(row.id)}
                                aria-label="Delete ledger entry"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                    {ledgerWithBalance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canEdit ? 10 : 9} className="h-20 text-center text-muted-foreground">
                          No ledger entries yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                  {ledgerWithBalance.length > 0 ? (
                    <TableFooter>
                      <TableRow className="font-semibold">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-right">{ledgerTotals.qty}</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{formatAmount(ledgerTotals.debit)}</TableCell>
                        <TableCell className="text-right">{formatAmount(ledgerTotals.credit)}</TableCell>
                        <TableCell>{ledgerTotals.balance >= 0 ? 'Cr' : 'Dr'}</TableCell>
                        <TableCell className="text-right">{formatAmount(Math.abs(ledgerTotals.balance))}</TableCell>
                        {canEdit ? <TableCell /> : null}
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Commitment notes &amp; images</CardTitle>
              <CardDescription>
                Payment promises and other commitments from this dealer, with a photo of the cheque, memo or document if you have one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 p-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">On PDF / print</p>
                  <Select
                    value={commitmentPdf.status}
                    onValueChange={(value) => setCommitmentPdf((current) => ({ ...current, status: value as CommitmentPdfStatus }))}
                  >
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All commitments</SelectItem>
                      <SelectItem value="pending">Pending only</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled only</SelectItem>
                      <SelectItem value="none">No commitments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">From</p>
                  <Input
                    type="date"
                    value={commitmentPdf.from}
                    disabled={commitmentPdf.status === 'none'}
                    onChange={(event) => setCommitmentPdf((current) => ({ ...current, from: event.target.value }))}
                    className="h-9 w-40"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">To</p>
                  <Input
                    type="date"
                    value={commitmentPdf.to}
                    disabled={commitmentPdf.status === 'none'}
                    onChange={(event) => setCommitmentPdf((current) => ({ ...current, to: event.target.value }))}
                    className="h-9 w-40"
                  />
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  {commitmentsForPdf(selectedCustomer, commitmentPdf).length} on the PDF. Dates use the commitment date, or the day it was added.
                </p>
              </div>
              <CommitmentsPanel customer={selectedCustomer} canEdit={canEdit} canAdd={canAddCommitment} />
            </CardContent>
          </Card>
        </div>

        <PartyNotifyDialog open={notifyOpen} onOpenChange={setNotifyOpen} partyKind="customer" partyId={selectedCustomer.id} />

        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add ledger entry</DialogTitle>
              <DialogDescription>
                Record a deposit, delivery fee, return, or any other manual entry for {selectedCustomer.name}.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={handleEntrySubmit}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Entry type</p>
                <div className="inline-flex rounded-lg border border-border/70 p-0.5" role="radiogroup" aria-label="Ledger entry type">
                  {LEDGER_ENTRY_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={entryForm.entryType === option.value}
                      onClick={() => setEntryForm((current) => ({ ...current, entryType: option.value }))}
                      className={cn(
                        'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                        entryForm.entryType === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={entryForm.date}
                    onChange={(event) => setEntryForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Particulars<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={entryForm.particulars}
                    onChange={(event) => setEntryForm((current) => ({ ...current, particulars: event.target.value }))}
                    placeholder="e.g. Deposit (DBBL), Delivery Fee, Return"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Qty <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.qty}
                    onChange={(event) => setEntryForm((current) => withAutoAmount({ ...current, qty: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Unit price <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.unitPrice}
                    onChange={(event) => setEntryForm((current) => withAutoAmount({ ...current, unitPrice: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    {entryForm.entryType === 'debit' ? 'Debit' : 'Credit'} amount ({currency ?? 'BDT'})
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.amount}
                    onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {LEDGER_ENTRY_TYPE_OPTIONS.find((option) => option.value === entryForm.entryType)?.hint} Auto-filled from Qty × Unit price.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEntryDialogOpen(false)} disabled={isSavingEntry}>
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl" disabled={isSavingEntry}>
                  {isSavingEntry ? 'Saving...' : 'Save entry'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </AdminShell>
    )
  }

  const extraColumnCount = Number(showSubZoneColumn)

  function openZones(startWithNew: boolean) {
    setZonesStartWithNew(startWithNew)
    setZonesOpen(true)
  }

  return (
    <AdminShell active="Credit Sheet">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            // Paid reads green and due reads red so the two are told apart at a glance.
            ['Dealers', metrics.dealers.toLocaleString('en-BD'), 'Matching current filters', 'border-t-sky-500 from-sky-500/12', 'text-sky-700 dark:text-sky-300'],
            ['Total purchase', formatAmount(metrics.purchase), 'From sales history', 'border-t-violet-500 from-violet-500/12', 'text-violet-700 dark:text-violet-300'],
            ['Paid', formatAmount(metrics.paid), 'Payments received', 'border-t-emerald-500 from-emerald-500/12', 'text-emerald-700 dark:text-emerald-300'],
            ['Due (credit)', formatAmount(metrics.due), 'Outstanding across dealers', 'border-t-rose-500 from-rose-500/12', 'text-rose-700 dark:text-rose-300'],
          ].map(([label, value, note, tile, valueTone]) => (
            <Card key={label} className={`border-t-[3px] border-border/70 bg-gradient-to-br to-transparent shadow-sm ${tile}`}>
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className={`mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl ${valueTone}`}>{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {visibleZoneIds ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">
              You are responsible for {zoneOptions.map((zone) => zone.name).join(', ')}. Only dealers in your zone are shown.
            </CardContent>
          </Card>
        ) : null}

        {sheetFeedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{sheetFeedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Credit sheet</CardTitle>
              <CardDescription>Every dealer&apos;s running account, with totals by zone or sub-zone.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageZones ? (
                <>
                  <Button type="button" size="sm" className="rounded-lg" onClick={() => openZones(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add zone
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => openZones(false)}>
                    <MapPinned className="mr-1.5 h-4 w-4" />
                    Manage zones
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handlePrintSheet}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print sheet
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleExportPdf}>
                <FileText className="mr-1.5 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-border/70 p-3 sm:p-4 lg:grid-cols-4">
              <div className="col-span-2 space-y-1.5 lg:col-span-1">
                <p className="text-xs font-medium text-muted-foreground">Search</p>
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Zone</p>
                <Select
                  value={filterZone}
                  onValueChange={(value) => {
                    setFilterZone(value)
                    setFilterSubZone('all')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{visibleZoneIds ? 'All my zones' : 'All zones'}</SelectItem>
                    {zoneOptions.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                    {visibleZoneIds ? null : <SelectItem value={UNASSIGNED_ZONE_ID}>{UNASSIGNED_ZONE_NAME}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Sub-zone</p>
                <Select value={filterSubZone} onValueChange={setFilterSubZone}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sub-zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sub-zones</SelectItem>
                    {subZoneOptions.options.map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                    {subZoneOptions.hasNone ? <SelectItem value={NO_SUB_ZONE_FILTER}>No sub-zone</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Min purchase</p>
                <Input type="number" min="0" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Max purchase</p>
                <Input type="number" min="0" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="No limit" />
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">Totals by</p>
              <div className="inline-flex rounded-lg border border-border/70 p-0.5" role="radiogroup" aria-label="Group totals by">
                {GROUP_BY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={groupBy === option.value}
                    onClick={() => setGroupBy(option.value)}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                      groupBy === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6 rounded-2xl border border-border/70 p-4 sm:p-6">
              <SheetBrandHeader topLeft={sheetTopLeft} topRight={`${groupLabel}-wise`} heading="Credit Sheet" />

              {creditSheetGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No customers match the current filters.</p>
              ) : (
                <>
                  {creditSheetGroups.map((group) => (
                    <div key={group.name} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.name} · {group.totals.dealers} dealers
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-border/70">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                              <TableHead>SL</TableHead>
                              <TableHead>Dealer</TableHead>
                              <TableHead>Mobile</TableHead>
                              {showSubZoneColumn ? <TableHead>Sub-zone</TableHead> : null}
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Total purchase</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                              <TableHead className="text-right">Due (credit)</TableHead>
                              <TableHead className="text-right">Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.rows.map((row, index) => (
                              <TableRow key={row.customer.id}>
                                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                                <TableCell className="font-medium">
                                  {row.customer.name}
                                  {row.customer.commitments && Object.values(row.customer.commitments).some((item) => item.status === 'pending' && item.approvalStage !== 'rejected') ? (
                                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                      Commitment
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell>{row.customer.phone}</TableCell>
                                {showSubZoneColumn ? <TableCell>{row.customer.thana || '-'}</TableCell> : null}
                                <TableCell className="text-right">{row.quantity.toLocaleString('en-BD')}</TableCell>
                                <TableCell className="text-right">{formatAmount(row.purchaseTotal)}</TableCell>
                                <TableCell className="text-right">{formatAmount(row.paid)}</TableCell>
                                <TableCell className="text-right font-medium text-amber-700 dark:text-amber-400">
                                  {formatAmount(row.customer.due)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setSelectedCustomerId(row.customer.id)}
                                    aria-label={`View ${row.customer.name} details`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow className="font-semibold">
                              <TableCell colSpan={3 + extraColumnCount}>{group.name} total</TableCell>
                              <TableCell className="text-right">{group.totals.quantity.toLocaleString('en-BD')}</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.purchase)}</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.paid)}</TableCell>
                              <TableCell className="text-right text-amber-700 dark:text-amber-400">
                                {formatAmount(group.totals.due)}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupLabel}-wise summary</p>
                    <div className="overflow-x-auto rounded-xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                            <TableHead>{groupLabel}</TableHead>
                            <TableHead className="text-right">Dealers</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Total purchase</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Due (credit)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {creditSheetGroups.map((group) => (
                            <TableRow key={group.name}>
                              <TableCell className="font-medium">{group.name}</TableCell>
                              <TableCell className="text-right">{group.totals.dealers}</TableCell>
                              <TableCell className="text-right">{group.totals.quantity.toLocaleString('en-BD')}</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.purchase)}</TableCell>
                              <TableCell className="text-right">{formatAmount(group.totals.paid)}</TableCell>
                              <TableCell className="text-right text-amber-700 dark:text-amber-400">
                                {formatAmount(group.totals.due)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow className="font-semibold">
                            <TableCell>Grand total</TableCell>
                            <TableCell className="text-right">{metrics.dealers}</TableCell>
                            <TableCell className="text-right">{metrics.quantity.toLocaleString('en-BD')}</TableCell>
                            <TableCell className="text-right">{formatAmount(metrics.purchase)}</TableCell>
                            <TableCell className="text-right">{formatAmount(metrics.paid)}</TableCell>
                            <TableCell className="text-right text-amber-700 dark:text-amber-400">
                              {formatAmount(metrics.due)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {canManageZones ? (
        <ZoneManagerDialog open={zonesOpen} onOpenChange={setZonesOpen} startWithNewZone={zonesStartWithNew} />
      ) : null}
    </AdminShell>
  )
}
