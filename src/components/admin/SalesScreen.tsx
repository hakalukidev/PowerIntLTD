"use client"

import { useEffect, useMemo, useState } from 'react'
import {
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
import { useERP } from '@/lib/erp/provider'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import type { OrderRecord } from '@/lib/erp/types'
import { cn } from '@/lib/utils'
import {
  exportXlsx,
  formatCurrency,
  formatDate,
  formatDealerBalance,
  getOrderStatus,
  getOrderStatuses,
  getReadableOrderState,
  toArray,
  userRoleIds,
} from '@/lib/erp/utils'
import { brandedDocument, downloadDocumentJpg, downloadDocumentPdf } from './credit-sheet/printSheet'

type PaymentFilter = 'all' | 'paid' | 'partial' | 'unpaid'
// One list drives the table, the Excel export and the Full PDF, so hiding a column hides it everywhere.
const SALES_COLUMNS = [
  { key: 'bill', label: 'Bill' },
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'salesPerson', label: 'Sales person' },
  { key: 'total', label: 'Total' },
  { key: 'paid', label: 'Paid' },
  { key: 'due', label: 'Total due' },
  { key: 'status', label: 'Status' },
  { key: 'saleDate', label: 'Sale date' },
  { key: 'delivery', label: 'Delivery' },
] as const

type SalesColumnKey = (typeof SALES_COLUMNS)[number]['key']

function hiddenColumnsStorageKey(userId: string) {
  return `sales-table-hidden-columns:${userId}`
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
  const { customers } = useZoneAccess()
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
  const detailsOrder = useMemo(() => orders.find((order) => order.id === detailsOrderId) ?? null, [orders, detailsOrderId])
  const detailsCustomer = useMemo(
    () => (detailsOrder ? customers.find((customer) => customer.id === detailsOrder.customerId) : undefined),
    [customers, detailsOrder]
  )
  const [query, setQuery] = useState('')
  const orderStatuses = useMemo(() => getOrderStatuses(data?.settings), [data?.settings])
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [statusFilterChoice, setStatusFilter] = useState<OrderRecord['status'] | 'all'>('all')
  // A filter on a status that was just deleted falls back to every status.
  const statusFilter = orderStatuses.some((status) => status.id === statusFilterChoice) ? statusFilterChoice : 'all'
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [hiddenColumns, setHiddenColumns] = useState<Set<SalesColumnKey>>(new Set())
  const userId = currentUser?.id ?? null

  // Each user keeps their own column choice on this device.
  useEffect(() => {
    if (!userId) return
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(hiddenColumnsStorageKey(userId)) ?? '[]')
      const known = new Set<string>(SALES_COLUMNS.map((column) => column.key))
      const keys = Array.isArray(saved) ? saved.filter((key): key is SalesColumnKey => known.has(key)) : []
      setHiddenColumns(keys.length < SALES_COLUMNS.length ? new Set(keys) : new Set())
    } catch {
      setHiddenColumns(new Set())
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
      window.localStorage.setItem(hiddenColumnsStorageKey(userId), JSON.stringify([...next]))
    } catch {
      // the choice just isn't remembered after a reload
    }
  }

  const openOrders = orders.filter((order) => !getOrderStatus(data?.settings, order.status).isFinal).length
  const readyStatus = orderStatuses.find((status) => status.id === 'ready')
  const readyOrders = orders.filter((order) => order.status === 'ready').length
  const receivableTotal = orders.reduce((sum, order) => sum + order.due, 0)
  const supplierPayableEstimate = toArray(data?.purchases).reduce((sum, purchase) => sum + purchase.total, 0)
  const overdueOrders = orders.filter((order) => {
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
      const matchesSearch =
        !normalizedQuery ||
        [order.billNumber, order.customerName, order.salesPersonName, ...order.items.map((item) => item.productName)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter
      const matchesPayment = paymentFilter === 'all' || paymentStatusOf(order) === paymentFilter
      const matchesSalesPerson = salesPersonFilter === 'all' || order.salesPersonId === salesPersonFilter
      const matchesDue = !dueOnly || order.due > 0
      const orderDate = new Date(order.createdAt)
      const matchesFrom = !from || orderDate >= from
      const matchesTo = !to || orderDate <= to

      return matchesSearch && matchesStatus && matchesPayment && matchesSalesPerson && matchesDue && matchesFrom && matchesTo
    })
  }, [orders, query, statusFilter, paymentFilter, salesPersonFilter, dueOnly, fromDate, toDate])

  const dueReminderRows = orders
    .filter((order) => order.due > 0)
    .sort((left, right) => left.deliveryDate.localeCompare(right.deliveryDate))
    .slice(0, 5)

  function openInvoiceDetails(orderId: string) {
    setDetailsError(null)
    setDetailsOrderId(orderId)
  }

  function documentContext(document: SalesDocument) {
    return { customer: customers.find((entry) => entry.id === document.customerId), settings: data?.settings, zones: toArray(data?.zones) }
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
    setSalesPersonFilter('all')
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
        case 'total': return formatCurrency(order.total, currency)
        case 'paid': return formatCurrency(order.paid, currency)
        case 'due': return formatDealerBalance(totalDueOf(order), currency)
        case 'status': return getReadableOrderState(order, data?.settings)
        case 'saleDate': return formatDate(order.createdAt)
        case 'delivery': return formatDate(order.deliveryDate)
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
    const totals = filteredOrders.reduce(
      (sum, order) => ({ total: sum.total + order.total, paid: sum.paid + order.paid, due: sum.due + order.due }),
      { total: 0, paid: 0, due: 0 }
    )
    const units = filteredOrders.reduce((sum, order) => sum + order.items.reduce((count, item) => count + item.quantity, 0), 0)
    const salesPersonName = salesPeople.find((person) => person.id === salesPersonFilter)?.name
    const filters = [
      query.trim() ? `Search: "${query.trim()}"` : '',
      statusFilter !== 'all' ? `Status: ${getOrderStatus(data?.settings, statusFilter).label}` : '',
      paymentFilter !== 'all' ? `Payment: ${paymentFilter}` : '',
      salesPersonName ? `Sales person: ${salesPersonName}` : '',
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
        case 'total': return `<td class="numeric">${money(order.total)}</td>`
        case 'paid': return `<td class="numeric">${money(order.paid)}</td>`
        case 'due': return `<td class="numeric">${formatDealerBalance(totalDueOf(order), currency, money)}</td>`
        case 'status': return `<td>${escapeHtml(getReadableOrderState(order, data?.settings))}</td>`
        case 'saleDate': return `<td>${formatDate(order.createdAt)}</td>`
        case 'delivery': return `<td>${formatDate(order.deliveryDate)}</td>`
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
          <tr>
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
            <td class="label">Orders</td><td>${filteredOrders.length} (${units} units)</td>
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
        <table>
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
      await downloadDocumentPdf(buildSalesReportHtml(), `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`)
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
              <Progress value={orders.length ? (openOrders / orders.length) * 100 : 0} className="mt-4" />
            </CardContent>
          </Card>
          {readyStatus ? (
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{readyStatus.label}</p>
                <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{readyOrders}</p>
                <Progress value={orders.length ? (readyOrders / orders.length) * 100 : 0} className="mt-4" />
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">Customer receivable</p>
              <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{formatCurrency(receivableTotal, data?.settings.currency)}</p>
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
                  placeholder="Search bill, customer, product, sales person"
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

            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {isVisible('bill') ? <TableHead className="hidden md:table-cell">Bill</TableHead> : null}
                    {isVisible('customer') ? <TableHead sticky>Customer</TableHead> : null}
                    {isVisible('product') ? <TableHead>Product</TableHead> : null}
                    {isVisible('salesPerson') ? <TableHead>Sales person</TableHead> : null}
                    {isVisible('total') ? <TableHead>Total</TableHead> : null}
                    {isVisible('paid') ? <TableHead>Paid</TableHead> : null}
                    {isVisible('due') ? <TableHead>Total due</TableHead> : null}
                    {isVisible('status') ? <TableHead>Status</TableHead> : null}
                    {isVisible('saleDate') ? <TableHead>Sale date</TableHead> : null}
                    {isVisible('delivery') ? <TableHead>Delivery</TableHead> : null}
                    <TableHead className="text-right">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow
                      key={order.id}
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
                        order.due > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : ''
                      )}
                    >
                      {isVisible('bill') ? <TableCell className="hidden font-medium md:table-cell">{order.billNumber}</TableCell> : null}
                      {isVisible('customer') ? (
                        <TableCell
                          sticky
                          className={cn(order.due > 0 && '[--sticky-tint:rgb(244_63_94/0.05)] dark:[--sticky-tint:rgb(244_63_94/0.1)]')}
                        >
                          <p className="font-semibold">{order.customerName}</p>
                          {/* The Bill column is hidden on phones, so the bill number rides under the name. */}
                          {isVisible('bill') ? (
                            <p className="whitespace-nowrap font-mono text-[10px] text-muted-foreground md:hidden">{order.billNumber}</p>
                          ) : null}
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
                      {isVisible('total') ? <TableCell>{formatCurrency(order.total, data?.settings.currency)}</TableCell> : null}
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
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                      ) : null}
                      {isVisible('saleDate') ? <TableCell className="whitespace-nowrap">{formatDate(order.createdAt)}</TableCell> : null}
                      {isVisible('delivery') ? <TableCell className="whitespace-nowrap">{formatDate(order.deliveryDate)}</TableCell> : null}
                      <TableCell onKeyDown={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1 md:gap-2">
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
                  <dt className="text-muted-foreground">Sale date</dt>
                  <dd className="text-right">{formatDate(detailsOrder.createdAt)}</dd>
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="text-right">{detailsOrder.deliveryDate ? formatDate(detailsOrder.deliveryDate) : 'N/A'}</dd>
                  <dt className="text-muted-foreground">Payment due</dt>
                  <dd className="text-right">{detailsOrder.paymentDueDate ? formatDate(detailsOrder.paymentDueDate) : 'N/A'}</dd>
                  <dt className="self-center text-muted-foreground">Status</dt>
                  <dd className="flex justify-end">
                    {hasPermission('sales.edit') ? (
                      <Select
                        value={detailsOrder.status}
                        onValueChange={(value) => {
                          setDetailsError(null)
                          updateOrderStatus(detailsOrder.id, value).catch((reason: unknown) =>
                            setDetailsError(reason instanceof Error ? reason.message : 'Unable to change the status.')
                          )
                        }}
                      >
                        <SelectTrigger className="h-8 w-40" aria-label="Order status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* An order on a status that was removed elsewhere still shows it until moved. */}
                          {orderStatuses.some((status) => status.id === detailsOrder.status) ? null : (
                            <SelectItem value={detailsOrder.status}>{getReadableOrderState(detailsOrder, data?.settings)}</SelectItem>
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
