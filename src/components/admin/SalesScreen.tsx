"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  ImageDown,
  ListFilter,
  Printer,
  ReceiptText,
  Search,
  Settings2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { OrderItemsPanel, OrderProgressChip } from './sales/OrderItemsPanel'
import { OrderStatusBadge, OrderStatusesDialog } from './sales/OrderStatusesDialog'
import { buildSalesDocumentHtml, escapeHtml, printSalesDocument, type SalesDocument } from './sales/salesDocument'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SALE_TYPE_LABELS, saleTypeOf } from '@/lib/erp/pricing'
import { useERP } from '@/lib/erp/provider'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import type { CustomerRecord, OrderRecord, SaleType, ZoneRecord } from '@/lib/erp/types'
import { cn } from '@/lib/utils'
import {
  exportXlsx,
  formatCurrency,
  formatDate,
  formatDealerBalance,
  getOrderStatus,
  getOrderStatuses,
  getReadableOrderState,
  isOrderCancelled,
  toArray,
  userRoleIds,
} from '@/lib/erp/utils'
import { resolveCustomerZone, subZoneKey, UNASSIGNED_ZONE_ID, UNASSIGNED_ZONE_NAME } from '@/lib/erp/zones'
import { brandedDocument, downloadDocumentJpg, downloadDocumentPdf } from './credit-sheet/printSheet'

type PaymentFilter = 'all' | 'paid' | 'partial' | 'unpaid'
// One list drives the table, the Excel export and the Full PDF, so hiding a column hides it everywhere.
const SALES_COLUMNS = [
  { key: 'bill', label: 'Bill' },
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'salesPerson', label: 'Sales person' },
  { key: 'zone', label: 'Zone' },
  { key: 'subZone', label: 'Sub-zone' },
  { key: 'total', label: 'Total' },
  { key: 'paid', label: 'Paid' },
  { key: 'due', label: 'Total due' },
  { key: 'status', label: 'Status' },
  // The table marks only cash sales; the Excel and PDF exports write Credit or Cash on every row.
  { key: 'saleType', label: 'Sale type' },
  { key: 'saleDate', label: 'Sale date' },
  // Keyed `delivery` from when it showed the planned date, so saved column choices still apply.
  { key: 'delivery', label: 'Delivered date' },
] as const

type SalesColumnKey = (typeof SALES_COLUMNS)[number]['key']

// More columns than this turn the Full PDF to landscape.
const PORTRAIT_PDF_MAX_COLUMNS = 8

/** Shown only once the user turns them on. */
const DEFAULT_HIDDEN_COLUMNS: SalesColumnKey[] = ['zone', 'subZone']

function hiddenColumnsStorageKey(userId: string) {
  return `sales-table-hidden-columns:${userId}`
}

/**
 * The saved column choice: `{ hidden, seen }`, where `seen` lists the columns that existed when it
 * was saved, so a column added later starts at its default. Older saves are just the hidden list,
 * from before any column was hidden by default.
 */
function loadHiddenColumns(raw: string | null): Set<SalesColumnKey> {
  const saved: unknown = raw ? JSON.parse(raw) : null
  const { hidden, seen } = Array.isArray(saved)
    ? { hidden: saved as unknown[], seen: SALES_COLUMNS.map((column) => column.key).filter((key) => !DEFAULT_HIDDEN_COLUMNS.includes(key)) }
    : { hidden: (saved as { hidden?: unknown } | null)?.hidden, seen: (saved as { seen?: unknown } | null)?.seen }
  const hiddenKeys = new Set(Array.isArray(hidden) ? hidden : [])
  const seenKeys = new Set(Array.isArray(seen) ? seen : [])
  const keys = SALES_COLUMNS.map((column) => column.key).filter((key) =>
    seenKeys.has(key) ? hiddenKeys.has(key) : DEFAULT_HIDDEN_COLUMNS.includes(key)
  )
  // At least one column stays on.
  return new Set(keys.length < SALES_COLUMNS.length ? keys : DEFAULT_HIDDEN_COLUMNS)
}

type OrderZone = { zoneId: string; zoneName: string; subZoneKey: string; subZoneName: string }

const NO_SUB_ZONE_FILTER = 'none'

/**
 * The zone an order counts under: the one stored on it when it was approved, otherwise (older
 * orders, dealers without a zone then) its dealer's current zone.
 */
function orderZoneOf(order: OrderRecord, customer: CustomerRecord | undefined, zones: ZoneRecord[]): OrderZone {
  if (order.zoneId) {
    return {
      zoneId: order.zoneId,
      // A renamed zone shows its current name; a deleted one the name it had.
      zoneName: zones.find((zone) => zone.id === order.zoneId)?.name ?? order.zoneName ?? UNASSIGNED_ZONE_NAME,
      subZoneKey: order.subZoneKey ?? '',
      subZoneName: order.subZoneName ?? '',
    }
  }
  const zone = customer ? resolveCustomerZone(customer, zones) : null
  return {
    zoneId: zone?.id ?? UNASSIGNED_ZONE_ID,
    zoneName: zone?.name ?? UNASSIGNED_ZONE_NAME,
    subZoneKey: customer ? subZoneKey(customer, zones) : '',
    subZoneName: customer?.thana?.trim() ?? '',
  }
}

/** The dealer's total due as it stood when the order was approved; older orders only have their own due. */
function totalDueOf(order: OrderRecord) {
  return order.totalDueAfter ?? order.due
}

function paymentStatusOf(order: OrderRecord): PaymentFilter {
  if (order.due <= 0) return 'paid'
  if (order.paid > 0) return 'partial'
  return 'unpaid'
}

export function SalesScreen() {
  const { data, currentUser, hasPermission, updateOrderStatus } = useERP()
  const orders = useMemo(
    () => toArray(data?.orders).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.orders]
  )
  const { customers, zones, zoneOptions, visibleZoneIds } = useZoneAccess()
  const orderZones = useMemo(
    () => new Map(orders.map((order) => [order.id, orderZoneOf(order, data?.customers?.[order.customerId], zones)])),
    [orders, data?.customers, zones]
  )
  const zoneOf = (order: OrderRecord) => orderZones.get(order.id) ?? orderZoneOf(order, undefined, zones)
  const salesPeople = useMemo(() => {
    const map = new Map<string, string>()
    orders.forEach((order) => {
      if (order.salesPersonId) {
        map.set(order.salesPersonId, order.salesPersonName)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [orders])

  const [feedback, setFeedback] = useState<string | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  // Kept as an id so the open invoice follows live updates to the order.
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null)
  // Errors from the dialog's buttons; the page message box sits behind the open dialog.
  const [detailsError, setDetailsError] = useState<string | null>(null)
  // A cancellation sent for approval from the dialog.
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null)
  const detailsOrder = useMemo(() => orders.find((order) => order.id === detailsOrderId) ?? null, [orders, detailsOrderId])
  const detailsCustomer = useMemo(
    () => (detailsOrder ? customers.find((customer) => customer.id === detailsOrder.customerId) : undefined),
    [customers, detailsOrder]
  )
  const [query, setQuery] = useState('')
  // Orders whose products are open under their row.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  // The table's visible width, so an open product list stays in view while the table scrolls sideways.
  const tableBoxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = tableBoxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => box.style.setProperty('--sales-view-width', `${box.clientWidth}px`))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  function toggleExpanded(orderId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  function expandButton(order: OrderRecord) {
    const open = expandedIds.has(order.id)
    const Icon = open ? ChevronDown : ChevronRight
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-expanded={open}
        aria-controls={`order-products-${order.id}`}
        aria-label={`${open ? 'Hide' : 'Show'} products of ${order.billNumber || order.id}`}
        onClick={(event) => {
          event.stopPropagation()
          toggleExpanded(order.id)
        }}
      >
        <Icon className="h-4 w-4" />
      </Button>
    )
  }
  const orderStatuses = useMemo(() => getOrderStatuses(data?.settings), [data?.settings])
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [statusFilterChoice, setStatusFilter] = useState<OrderRecord['status'] | 'all'>('all')
  // A filter on a status that was just deleted falls back to every status.
  const statusFilter = orderStatuses.some((status) => status.id === statusFilterChoice) ? statusFilterChoice : 'all'
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleType | 'all'>('all')
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [subZoneFilter, setSubZoneFilter] = useState('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [hiddenColumns, setHiddenColumns] = useState<Set<SalesColumnKey>>(() => new Set(DEFAULT_HIDDEN_COLUMNS))
  const userId = currentUser?.id ?? null

  // Each user keeps their own column choice on this device.
  useEffect(() => {
    if (!userId) return
    try {
      setHiddenColumns(loadHiddenColumns(window.localStorage.getItem(hiddenColumnsStorageKey(userId))))
    } catch {
      setHiddenColumns(new Set(DEFAULT_HIDDEN_COLUMNS))
    }
  }, [userId])

  const visibleColumns = SALES_COLUMNS.filter((column) => !hiddenColumns.has(column.key))
  const isVisible = (key: SalesColumnKey) => !hiddenColumns.has(key)

  function toggleColumn(key: SalesColumnKey) {
    const next = new Set(hiddenColumns)
    if (next.has(key)) next.delete(key)
    else if (visibleColumns.length > 1) next.add(key)
    else return
    setHiddenColumns(next)
    if (!userId) return
    try {
      window.localStorage.setItem(
        hiddenColumnsStorageKey(userId),
        JSON.stringify({ hidden: [...next], seen: SALES_COLUMNS.map((column) => column.key) })
      )
    } catch {
      // the choice just isn't remembered after a reload
    }
  }

  const isCancelled = (order: OrderRecord) => isOrderCancelled(data?.settings, order)
  // Cancelled orders are no sale: they count in no card or total.
  const liveOrders = orders.filter((order) => !isCancelled(order))
  const pendingCancellations = useMemo(
    () => new Set(toArray(data?.orderCancellationRequests).filter((request) => request.status === 'pending').map((request) => request.orderId)),
    [data?.orderCancellationRequests]
  )
  const openOrders = liveOrders.filter((order) => !getOrderStatus(data?.settings, order.status).isFinal).length
  const readyStatus = orderStatuses.find((status) => status.id === 'ready')
  const readyOrders = liveOrders.filter((order) => order.status === 'ready').length
  const receivableTotal = liveOrders.reduce((sum, order) => sum + order.due, 0)
  const supplierPayableEstimate = toArray(data?.purchases).reduce((sum, purchase) => sum + purchase.total, 0)
  const overdueOrders = liveOrders.filter((order) => {
    if (order.due <= 0) {
      return false
    }

    const deliveryDate = new Date(order.deliveryDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return deliveryDate < today
  })

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const from = fromDate ? new Date(fromDate) : null
    const to = toDate ? new Date(toDate) : null
    if (to) to.setHours(23, 59, 59, 999)

    return orders.filter((order) => {
      const zone = orderZones.get(order.id)
      const matchesSearch =
        !normalizedQuery ||
        [
          order.billNumber,
          order.customerName,
          order.salesPersonName,
          zone?.zoneName,
          zone?.subZoneName,
          ...order.items.map((item) => item.productName),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesZone = zoneFilter === 'all' || zone?.zoneId === zoneFilter
      const matchesSubZone =
        subZoneFilter === 'all' || (zone?.subZoneKey ?? '') === (subZoneFilter === NO_SUB_ZONE_FILTER ? '' : subZoneFilter)
      // Cancelled orders show only when their status is picked.
      const matchesStatus = statusFilter === 'all' ? !isOrderCancelled(data?.settings, order) : order.status === statusFilter
      const matchesPayment = paymentFilter === 'all' || paymentStatusOf(order) === paymentFilter
      const matchesSaleType = saleTypeFilter === 'all' || saleTypeOf(order) === saleTypeFilter
      const matchesSalesPerson = salesPersonFilter === 'all' || order.salesPersonId === salesPersonFilter
      const matchesDue = !dueOnly || order.due > 0
      const orderDate = new Date(order.createdAt)
      const matchesFrom = !from || orderDate >= from
      const matchesTo = !to || orderDate <= to

      return (
        matchesSearch &&
        matchesZone &&
        matchesSubZone &&
        matchesStatus &&
        matchesPayment &&
        matchesSaleType &&
        matchesSalesPerson &&
        matchesDue &&
        matchesFrom &&
        matchesTo
      )
    })
  }, [orders, orderZones, query, zoneFilter, subZoneFilter, statusFilter, paymentFilter, saleTypeFilter, salesPersonFilter, dueOnly, fromDate, toDate, data?.settings])

  // Sub-zones that have orders in the chosen zone (or in any zone the user sees).
  const subZoneOptions = useMemo(() => {
    const options = new Map<string, string>()
    let hasNone = false
    for (const zone of orderZones.values()) {
      if (zoneFilter === 'all' ? visibleZoneIds && !visibleZoneIds.has(zone.zoneId) : zone.zoneId !== zoneFilter) continue
      if (zone.subZoneKey) options.set(zone.subZoneKey, zoneFilter === 'all' ? `${zone.subZoneName} (${zone.zoneName})` : zone.subZoneName)
      else hasNone = true
    }
    const sorted = Array.from(options.entries()).sort((left, right) => left[1].localeCompare(right[1]))
    return { options: sorted, hasNone }
  }, [orderZones, zoneFilter, visibleZoneIds])

  const zoneFilterName =
    zoneFilter === 'all' ? '' : zoneFilter === UNASSIGNED_ZONE_ID ? UNASSIGNED_ZONE_NAME : zones.find((zone) => zone.id === zoneFilter)?.name ?? ''
  const subZoneFilterName =
    subZoneFilter === 'all'
      ? ''
      : subZoneFilter === NO_SUB_ZONE_FILTER
        ? 'No sub-zone'
        : subZoneOptions.options.find(([key]) => key === subZoneFilter)?.[1] ?? ''

  const dueReminderRows = liveOrders
    .filter((order) => order.due > 0)
    .sort((left, right) => left.deliveryDate.localeCompare(right.deliveryDate))
    .slice(0, 5)

  function openInvoiceDetails(orderId: string) {
    setDetailsError(null)
    setDetailsNotice(null)
    setDetailsOrderId(orderId)
  }

  function documentContext(document: SalesDocument) {
    const order = data?.orders[document.id]
    const cancelled = Boolean(order && isCancelled(order))
    // The day its cancellation got final approval; orders cancelled before that needed approval have none.
    const cancelledOn = cancelled
      ? toArray(data?.orderCancellationRequests)
          .filter((request) => request.orderId === document.id && request.action === 'cancel' && request.status === 'approved')
          .map((request) => request.reviewedAt ?? '')
          .sort()
          .at(-1)
      : undefined
    return {
      customer: customers.find((entry) => entry.id === document.customerId),
      settings: data?.settings,
      zones: toArray(data?.zones),
      cancelled,
      cancelledOn,
    }
  }

  function printInvoice(document: SalesDocument, reportError: (message: string) => void = setFeedback) {
    const error = printSalesDocument(buildSalesDocumentHtml('Invoice', document, documentContext(document)))
    if (error) reportError(error)
  }

  async function downloadInvoicePdf(order: OrderRecord, reportError: (message: string | null) => void = setFeedback) {
    reportError(null)
    try {
      await downloadDocumentPdf(buildSalesDocumentHtml('Invoice', order, documentContext(order), false), `invoice-${order.billNumber || order.id}.pdf`)
    } catch (reason) {
      reportError(reason instanceof Error ? reason.message : 'Unable to create the invoice PDF.')
    }
  }

  async function downloadInvoiceJpg(order: OrderRecord, reportError: (message: string | null) => void = setFeedback) {
    reportError(null)
    try {
      await downloadDocumentJpg(buildSalesDocumentHtml('Invoice', order, documentContext(order), false), `invoice-${order.billNumber || order.id}.jpg`)
    } catch (reason) {
      reportError(reason instanceof Error ? reason.message : 'Unable to create the invoice JPG.')
    }
  }

  function resetFilters() {
    setQuery('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setSaleTypeFilter('all')
    setSalesPersonFilter('all')
    setZoneFilter('all')
    setSubZoneFilter('all')
    setDueOnly(false)
    setFromDate('')
    setToDate('')
  }

  function handleExport() {
    const currency = data?.settings.currency
    const cell = (order: OrderRecord, key: SalesColumnKey): string => {
      switch (key) {
        case 'bill': return order.billNumber
        case 'customer': return order.customerName
        case 'product': return order.items.map((item) => `${item.productName} x${item.quantity}`).join('; ')
        case 'salesPerson': return order.salesPersonName
        case 'zone': return zoneOf(order).zoneName
        case 'subZone': return zoneOf(order).subZoneName || '-'
        case 'total': return formatCurrency(order.total, currency)
        case 'paid': return formatCurrency(order.paid, currency)
        case 'due': return formatDealerBalance(totalDueOf(order), currency)
        case 'status': return getReadableOrderState(order, data?.settings)
        case 'saleType': return SALE_TYPE_LABELS[saleTypeOf(order)]
        case 'saleDate': return formatDate(order.createdAt)
        case 'delivery': return order.deliveredAt ? formatDate(order.deliveredAt) : ''
      }
    }

    void exportXlsx(
      `ims-sales-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      'Sales',
      visibleColumns.map((column) => column.label),
      filteredOrders.map((order) => visibleColumns.map((column) => cell(order, column.key)))
    )
  }

  function buildSalesReportHtml() {
    const currency = data?.settings.currency
    const money = (value: number) => formatCurrency(value, currency)
    // Cancelled orders are listed when their status is picked, but count in no total.
    const counted = filteredOrders.filter((order) => !isCancelled(order))
    const totals = counted.reduce(
      (sum, order) => ({ total: sum.total + order.total, paid: sum.paid + order.paid, due: sum.due + order.due }),
      { total: 0, paid: 0, due: 0 }
    )
    const units = counted.reduce((sum, order) => sum + order.items.reduce((count, item) => count + item.quantity, 0), 0)
    const cancelledCount = filteredOrders.length - counted.length
    const salesPersonName = salesPeople.find((person) => person.id === salesPersonFilter)?.name
    const filters = [
      query.trim() ? `Search: "${query.trim()}"` : '',
      statusFilter !== 'all' ? `Status: ${getOrderStatus(data?.settings, statusFilter).label}` : '',
      paymentFilter !== 'all' ? `Payment: ${paymentFilter}` : '',
      saleTypeFilter !== 'all' ? `Sale type: ${SALE_TYPE_LABELS[saleTypeFilter]}` : '',
      salesPersonName ? `Sales person: ${salesPersonName}` : '',
      zoneFilterName ? `Zone: ${zoneFilterName}` : '',
      subZoneFilterName ? `Sub-zone: ${subZoneFilterName}` : '',
      dueOnly ? 'Due only' : '',
    ].filter(Boolean)
    const period = fromDate || toDate ? `${fromDate ? formatDate(fromDate) : 'Start'} – ${toDate ? formatDate(toDate) : 'Today'}` : 'All dates'

    const moneyColumns = new Set<SalesColumnKey>(['total', 'paid', 'due'])
    const cell = (order: OrderRecord, key: SalesColumnKey) => {
      switch (key) {
        case 'bill': return `<td>${escapeHtml(order.billNumber || order.id)}</td>`
        case 'customer': return `<td>${escapeHtml(order.customerName)}</td>`
        case 'product':
          return `<td>${order.items
            .map((item) => `${escapeHtml(item.productName)} × ${item.quantity} @ ${money(item.unitPrice)}`)
            .join('<br />')}</td>`
        case 'salesPerson': return `<td>${escapeHtml(order.salesPersonName)}</td>`
        case 'zone': return `<td>${escapeHtml(zoneOf(order).zoneName)}</td>`
        case 'subZone': return `<td>${escapeHtml(zoneOf(order).subZoneName || '-')}</td>`
        case 'total': return `<td class="numeric">${money(order.total)}</td>`
        case 'paid': return `<td class="numeric">${money(order.paid)}</td>`
        case 'due': return `<td class="numeric">${formatDealerBalance(totalDueOf(order), currency, money)}</td>`
        case 'status': return `<td class="nowrap">${escapeHtml(getReadableOrderState(order, data?.settings))}</td>`
        case 'saleType': return `<td class="nowrap">${SALE_TYPE_LABELS[saleTypeOf(order)]}</td>`
        case 'saleDate': return `<td class="nowrap">${formatDate(order.createdAt)}</td>`
        case 'delivery': return `<td class="nowrap">${order.deliveredAt ? formatDate(order.deliveredAt) : ''}</td>`
      }
    }
    const headCells = visibleColumns
      .map((column) => `<th${moneyColumns.has(column.key) ? ' class="numeric"' : ''}>${column.label}</th>`)
      .join('')
    const totalCells = visibleColumns
      .map((column) =>
        moneyColumns.has(column.key) ? `<td class="numeric">${money(totals[column.key as keyof typeof totals])}</td>` : '<td></td>'
      )
      .join('')

    const rows = filteredOrders
      .map((order, index) => `
          <tr${isCancelled(order) ? ' style="color:#9ca3af;text-decoration:line-through"' : ''}>
            <td class="numeric">${index + 1}</td>
            ${visibleColumns.map((column) => cell(order, column.key)).join('')}
          </tr>
        `)
      .join('')

    return brandedDocument({
      title: 'Sales & Billing Report',
      heading: 'Sales & Billing Report',
      autoPrint: false,
      body: `
        <table class="info">
          <tr>
            <td class="label">Period</td><td>${escapeHtml(period)}</td>
            <td class="label">Filters</td><td>${escapeHtml(filters.join(' · ') || 'None')}</td>
          </tr>
          <tr>
            <td class="label">Orders</td><td>${counted.length} (${units} units)${cancelledCount ? ` · ${cancelledCount} cancelled, not counted` : ''}</td>
            <td class="label">Address</td><td>92, Wise Market, Nawabpur Road, Dhaka-1100 · +88 01897914480-83</td>
          </tr>
        </table>
        <table class="info">
          <tr>
            <td class="label">Total sales</td><td class="numeric">${money(totals.total)}</td>
            <td class="label">Collected</td><td class="numeric">${money(totals.paid)}</td>
            <td class="label">Due</td><td class="numeric">${money(totals.due)}</td>
          </tr>
        </table>
        <style>
          /* Long names and bill numbers wrap inside their cell so the table keeps to the page width; status and dates stay whole. */
          table.sales td { overflow-wrap: anywhere; }
          table.sales td.nowrap { white-space: nowrap; }
          ${visibleColumns.length > 10 ? 'table.sales td, table.sales th { font-size: 10px; padding: 3px 5px; }' : ''}
        </style>
        <table class="sales">
          <thead>
            <tr>
              <th>#</th>
              ${headCells}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${visibleColumns.length + 1}" style="text-align:center">No sales orders match the current filters.</td></tr>`}
            <tr class="grand">
              <td style="white-space:nowrap">Grand total</td>
              ${totalCells}
            </tr>
          </tbody>
        </table>
      `,
    })
  }

  async function handleExportPdf() {
    setFeedback(null)
    setIsExportingPdf(true)
    try {
      await downloadDocumentPdf(
        buildSalesReportHtml(),
        `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        visibleColumns.length > PORTRAIT_PDF_MAX_COLUMNS ? 'landscape' : 'portrait'
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create the PDF.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  return (
    <AdminShell active="Sales & Billing">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Open</p>
              <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{openOrders}</p>
              <Progress value={liveOrders.length ? (openOrders / liveOrders.length) * 100 : 0} className="mt-4" />
            </CardContent>
          </Card>
          {readyStatus ? (
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{readyStatus.label}</p>
                <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{readyOrders}</p>
                <Progress value={liveOrders.length ? (readyOrders / liveOrders.length) * 100 : 0} className="mt-4" />
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Customer receivable</p>
              <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl" data-testid="sales-receivable">{formatCurrency(receivableTotal, data?.settings.currency)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{overdueOrders.length} overdue reminders</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Supplier payable estimate</p>
              <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{formatCurrency(supplierPayableEstimate, data?.settings.currency)}</p>
              <p className="mt-2 text-xs text-muted-foreground">From recorded purchases</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Sales & billing data table</CardTitle>
              <CardDescription>Filter the full order trail and export data. New orders come from the Order Form.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl">
                    <ListFilter className="mr-2 h-4 w-4" />
                    Columns ({visibleColumns.length}/{SALES_COLUMNS.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SALES_COLUMNS.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={isVisible(column.key)}
                      // The last visible column stays on.
                      disabled={isVisible(column.key) && visibleColumns.length === 1}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() => toggleColumn(column.key)}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" className="rounded-xl" onClick={handleExport}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export data
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => void handleExportPdf()} disabled={isExportingPdf}>
                <FileDown className="mr-2 h-4 w-4" />
                {isExportingPdf ? 'Preparing PDF...' : 'Full PDF'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
              <div className="relative col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search bill, customer, product, sales person, zone"
                />
              </div>
              <div className="flex min-w-0 gap-2">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Status filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    {orderStatuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setStatusesOpen(true)}
                    aria-label="Manage statuses"
                    title="Manage statuses"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Sales person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sales history</SelectItem>
                  {salesPeople.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={dueOnly ? 'default' : 'outline'}
                className="h-10 rounded-xl"
                onClick={() => setDueOnly((current) => !current)}
              >
                Due only
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Zone</p>
                <Select
                  value={zoneFilter}
                  onValueChange={(value) => {
                    setZoneFilter(value)
                    setSubZoneFilter('all')
                  }}
                >
                  <SelectTrigger aria-label="Zone filter">
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
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Sub-zone</p>
                <Select value={subZoneFilter} onValueChange={setSubZoneFilter}>
                  <SelectTrigger aria-label="Sub-zone filter">
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
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Sale type</p>
                <Select value={saleTypeFilter} onValueChange={(value) => setSaleTypeFilter(value as SaleType | 'all')}>
                  <SelectTrigger aria-label="Sale type filter">
                    <SelectValue placeholder="All sale types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sale types</SelectItem>
                    <SelectItem value="credit">{SALE_TYPE_LABELS.credit}</SelectItem>
                    <SelectItem value="cash">{SALE_TYPE_LABELS.cash}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <DateInput value={fromDate} onChange={(value) => setFromDate(value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <DateInput value={toDate} onChange={(value) => setToDate(value)} />
              </div>
              <div className="flex items-end">
                <Button variant="ghost" className="h-10 rounded-xl" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            </div>

            <div ref={tableBoxRef} className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {isVisible('bill') ? <TableHead className="hidden md:table-cell">Bill</TableHead> : null}
                    {isVisible('customer') ? <TableHead sticky>Customer</TableHead> : null}
                    {isVisible('product') ? <TableHead>Product</TableHead> : null}
                    {isVisible('salesPerson') ? <TableHead>Sales person</TableHead> : null}
                    {isVisible('zone') ? <TableHead>Zone</TableHead> : null}
                    {isVisible('subZone') ? <TableHead>Sub-zone</TableHead> : null}
                    {isVisible('total') ? <TableHead>Total</TableHead> : null}
                    {isVisible('paid') ? <TableHead>Paid</TableHead> : null}
                    {isVisible('due') ? <TableHead>Total due</TableHead> : null}
                    {isVisible('status') ? <TableHead>Status</TableHead> : null}
                    {isVisible('saleType') ? <TableHead>Sale type</TableHead> : null}
                    {isVisible('saleDate') ? <TableHead>Sale date</TableHead> : null}
                    {isVisible('delivery') ? <TableHead>Delivered date</TableHead> : null}
                    <TableHead className="text-right">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <Fragment key={order.id}>
                      <TableRow
                        tabIndex={0}
                        aria-label={`View invoice ${order.billNumber || order.id}`}
                        onClick={() => openInvoiceDetails(order.id)}
                        onKeyDown={(event) => {
                          // Only the focused row itself; keys inside its controls keep their own meaning.
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault()
                            openInvoiceDetails(order.id)
                          }
                        }}
                        className={cn(
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                          isCancelled(order) ? 'text-muted-foreground' : order.due > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : ''
                        )}
                        data-cancelled={isCancelled(order) ? 'true' : undefined}
                      >
                        {isVisible('bill') ? <TableCell className="hidden font-medium md:table-cell">{order.billNumber}</TableCell> : null}
                        {isVisible('customer') ? (
                          <TableCell
                            sticky
                            className={cn(order.due > 0 && !isCancelled(order) && '[--sticky-tint:rgb(244_63_94/0.05)] dark:[--sticky-tint:rgb(244_63_94/0.1)]')}
                          >
                            <div className="flex items-start gap-1">
                              {expandButton(order)}
                              <div className="min-w-0 pt-0.5">
                                <p className="font-semibold">{order.customerName}</p>
                                {/* The Bill column is hidden on phones, so the bill number rides under the name. */}
                                {isVisible('bill') ? (
                                  <p className="whitespace-nowrap font-mono text-[10px] text-muted-foreground md:hidden">{order.billNumber}</p>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                        ) : null}
                        {isVisible('product') ? (
                          <TableCell>
                            <span>{order.items[0]?.productName ?? 'N/A'}</span>
                            {order.items.length > 1 ? (
                              <Badge variant="secondary" className="ml-1.5 whitespace-nowrap px-1.5 py-0 text-[10px] font-medium">
                                +{order.items.length - 1} more
                              </Badge>
                            ) : null}
                          </TableCell>
                        ) : null}
                        {isVisible('salesPerson') ? <TableCell className="text-sm text-muted-foreground">{order.salesPersonName}</TableCell> : null}
                        {isVisible('zone') ? <TableCell className="whitespace-nowrap text-sm">{zoneOf(order).zoneName}</TableCell> : null}
                        {isVisible('subZone') ? <TableCell className="whitespace-nowrap text-sm">{zoneOf(order).subZoneName || '-'}</TableCell> : null}
                        {isVisible('total') ? (
                          <TableCell className={cn(isCancelled(order) && 'line-through')}>{formatCurrency(order.total, data?.settings.currency)}</TableCell>
                        ) : null}
                        {isVisible('paid') ? <TableCell>{formatCurrency(order.paid, data?.settings.currency)}</TableCell> : null}
                        {isVisible('due') ? (
                          <TableCell className={cn(totalDueOf(order) > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                            {formatDealerBalance(totalDueOf(order), data?.settings.currency)}
                            {order.totalDueAfter !== undefined ? (
                              <p className="text-xs font-normal text-muted-foreground">This order: {formatCurrency(order.due, data?.settings.currency)}</p>
                            ) : null}
                            {order.due > 0 && order.dueReference ? (
                              <p className="text-xs font-normal text-muted-foreground">Held by: {order.dueReference}</p>
                            ) : null}
                          </TableCell>
                        ) : null}
                        {isVisible('status') ? (
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <OrderStatusBadge status={order.status} />
                              <OrderProgressChip order={order} />
                              {pendingCancellations.has(order.id) ? (
                                <Badge
                                  variant="outline"
                                  className="whitespace-nowrap rounded-full border-dashed border-rose-400/60 px-1.5 py-0 text-[10px] font-medium text-rose-700 dark:text-rose-300"
                                  data-testid="cancellation-pending"
                                >
                                  {isCancelled(order) ? 'Reopening waits for approval' : 'Cancellation waits for approval'}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                        {isVisible('saleType') ? (
                          <TableCell>
                            {saleTypeOf(order) === 'cash' ? (
                              <Badge
                                variant="outline"
                                className="whitespace-nowrap border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                                data-testid="sale-type-cash"
                              >
                                {SALE_TYPE_LABELS.cash}
                              </Badge>
                            ) : null}
                          </TableCell>
                        ) : null}
                        {isVisible('saleDate') ? <TableCell className="whitespace-nowrap">{formatDate(order.createdAt)}</TableCell> : null}
                        {isVisible('delivery') ? (
                          <TableCell className="whitespace-nowrap">{order.deliveredAt ? formatDate(order.deliveredAt) : ''}</TableCell>
                        ) : null}
                        <TableCell onKeyDown={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-1 md:gap-2">
                            {/* With the Customer column hidden, the products open from here. */}
                            {isVisible('customer') ? null : expandButton(order)}
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={(event) => {
                                event.stopPropagation()
                                printInvoice(order)
                              }}
                              aria-label={`Print invoice ${order.id}`}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={(event) => {
                                event.stopPropagation()
                                void downloadInvoicePdf(order)
                              }}
                              aria-label={`Download invoice ${order.id} as PDF`}
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={(event) => {
                                event.stopPropagation()
                                void downloadInvoiceJpg(order)
                              }}
                              aria-label={`Download invoice ${order.id} as JPG`}
                            >
                              <ImageDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedIds.has(order.id) ? (
                        <TableRow id={`order-products-${order.id}`} className="bg-muted/20 hover:!bg-muted/20">
                          <TableCell colSpan={visibleColumns.length + 1} className="p-0">
                            {/* Pinned to the visible part of the table, so it fits a phone while the row scrolls sideways. */}
                            <div className="sticky left-0 w-[var(--sales-view-width,100%)] max-w-full p-2 md:max-w-3xl md:p-3">
                              <OrderItemsPanel order={order} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length + 1} className="h-28 text-center text-muted-foreground">
                        No sales orders match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

       
      </div>

      {isAdmin ? <OrderStatusesDialog open={statusesOpen} onOpenChange={setStatusesOpen} /> : null}

      <Dialog open={detailsOrder !== null} onOpenChange={(open) => !open && setDetailsOrderId(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          {detailsOrder ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-primary" />
                  Invoice {detailsOrder.billNumber || detailsOrder.id}
                </DialogTitle>
                <DialogDescription>
                  {detailsOrder.items.length} {detailsOrder.items.length === 1 ? 'product' : 'products'} · {getReadableOrderState(detailsOrder, data?.settings)}
                </DialogDescription>
              </DialogHeader>

              {isCancelled(detailsOrder) ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300" data-testid="order-cancelled-banner">
                  Cancelled. This bill counts in no sales total and is off the dealer&apos;s due
                  {detailsOrder.paid > 0 ? `; the ${formatCurrency(detailsOrder.paid, data?.settings.currency)} paid stays as their advance` : ''}.
                </p>
              ) : null}
              {pendingCancellations.has(detailsOrder.id) && !detailsNotice ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  {isCancelled(detailsOrder) ? 'Bringing this order back' : 'Cancelling this order'} is waiting for approval on the Approvals page.
                </p>
              ) : null}
              {detailsNotice ? (
                <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  {detailsNotice}
                </p>
              ) : null}

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-1 rounded-xl border border-border/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
                  <p className="font-semibold">{detailsOrder.customerName}</p>
                  {detailsCustomer?.phone ? <p className="text-muted-foreground">{detailsCustomer.phone}</p> : null}
                  {detailsCustomer?.location ? <p className="text-muted-foreground">{detailsCustomer.location}</p> : null}
                  <p className="text-muted-foreground">Sales person: {detailsOrder.salesPersonName || 'N/A'}</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-border/70 p-3">
                  <dt className="text-muted-foreground">Bill no.</dt>
                  <dd className="text-right font-medium">{detailsOrder.billNumber || detailsOrder.id}</dd>
                  <dt className="text-muted-foreground">Sale type</dt>
                  <dd className="text-right">{SALE_TYPE_LABELS[saleTypeOf(detailsOrder)]}</dd>
                  <dt className="text-muted-foreground">Sale date</dt>
                  <dd className="text-right">{formatDate(detailsOrder.createdAt)}</dd>
                  <dt className="text-muted-foreground">Planned delivery</dt>
                  <dd className="text-right">{detailsOrder.deliveryDate ? formatDate(detailsOrder.deliveryDate) : 'N/A'}</dd>
                  <dt className="text-muted-foreground">Delivered</dt>
                  <dd className="text-right">{detailsOrder.deliveredAt ? formatDate(detailsOrder.deliveredAt) : 'Not delivered'}</dd>
                  <dt className="text-muted-foreground">Payment due</dt>
                  <dd className="text-right">{detailsOrder.paymentDueDate ? formatDate(detailsOrder.paymentDueDate) : 'N/A'}</dd>
                  <dt className="self-center text-muted-foreground">Status</dt>
                  <dd className="flex flex-col items-end gap-1">
                    {hasPermission('sales.edit') ? (
                      <Select
                        value={detailsOrder.status}
                        onValueChange={(value) => {
                          setDetailsError(null)
                          setDetailsNotice(null)
                          const bill = detailsOrder.billNumber || detailsOrder.id
                          const reopening = isCancelled(detailsOrder)
                          updateOrderStatus(detailsOrder.id, value)
                            .then((result) => {
                              if (result === 'requested') {
                                setDetailsNotice(`${reopening ? 'Bringing back' : 'Cancelling'} ${bill} was sent for approval. The order stays as it is until the Chairman's final approval.`)
                              }
                            })
                            .catch((reason: unknown) => setDetailsError(reason instanceof Error ? reason.message : 'Unable to change the status.'))
                        }}
                      >
                        <SelectTrigger className="h-8 w-40" aria-label="Order status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* An order on a status that was removed elsewhere still shows it until moved. */}
                          {orderStatuses.some((status) => status.id === detailsOrder.status) ? null : (
                            <SelectItem value={detailsOrder.status}>{getOrderStatus(data?.settings, detailsOrder.status).label}</SelectItem>
                          )}
                          {orderStatuses.map((status) => (
                            <SelectItem key={status.id} value={status.id}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <OrderStatusBadge status={detailsOrder.status} />
                    )}
                    {hasPermission('sales.edit') && detailsOrder.items.length > 1 ? (
                      <span className="text-[11px] text-muted-foreground">Applies to every product</span>
                    ) : null}
                  </dd>
                </dl>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsOrder.items.map((item, index) => (
                      <TableRow key={`${item.productId}-${index}`}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatCurrency(item.unitPrice, data?.settings.currency)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatCurrency(item.quantity * item.unitPrice, data?.settings.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Total amount</dt>
                <dd className="text-right">{formatCurrency(detailsOrder.subtotal ?? detailsOrder.total, data?.settings.currency)}</dd>
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="text-right">{formatCurrency(detailsOrder.discount ?? 0, data?.settings.currency)}</dd>
                <dt className="text-muted-foreground">Payable</dt>
                <dd className="text-right font-medium">{formatCurrency(detailsOrder.total, data?.settings.currency)}</dd>
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="text-right">{formatCurrency(detailsOrder.paid, data?.settings.currency)}</dd>
                <div className="col-span-2 flex justify-between gap-4 border-t border-border/70 pt-1.5 font-semibold">
                  <dt>Due</dt>
                  <dd className={cn('text-right', detailsOrder.due > 0 && 'text-rose-600 dark:text-rose-400')}>
                    {formatCurrency(detailsOrder.due, data?.settings.currency)}
                  </dd>
                </div>
              </dl>

              {detailsError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
                >
                  {detailsError}
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setDetailsError(null)
                    printInvoice(detailsOrder, setDetailsError)
                  }}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => void downloadInvoicePdf(detailsOrder, setDetailsError)}>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => void downloadInvoiceJpg(detailsOrder, setDetailsError)}>
                  <ImageDown className="mr-2 h-4 w-4" />
                  JPG
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </AdminShell>
  )
}
