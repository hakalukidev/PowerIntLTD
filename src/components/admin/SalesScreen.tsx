"use client"

import { useMemo, useState, type FormEvent } from 'react'
import {
  CalendarClock,
  ClipboardPlus,
  FileDown,
  FileSpreadsheet,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Trash2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { QuickCreateCustomerDialog } from './quick-create/QuickCreateCustomerDialog'
import { QuickCreateProductDialog } from './quick-create/QuickCreateProductDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { OrderRecord } from '@/lib/erp/types'
import { cn } from '@/lib/utils'
import { exportXlsx, formatCurrency, formatDate, getReadableOrderState, toArray } from '@/lib/erp/utils'

function defaultPaymentDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 15)
  return date.toISOString().slice(0, 10)
}

const emptyOrder = {
  customerId: '',
  items: [{ productId: '', quantity: '1', unitPrice: '' }],
  discount: '0',
  paid: '0',
  billNumber: '',
  orderDate: new Date().toISOString().slice(0, 10),
  deliveryDate: '',
  paymentDueDate: defaultPaymentDueDate(),
  dueReference: 'owner' as OrderRecord['dueReference'],
}

type SalesDocument = Pick<
  OrderRecord,
  'id' | 'billNumber' | 'customerId' | 'customerName' | 'salesPersonName' | 'total' | 'paid' | 'due' | 'deliveryDate' | 'createdAt' | 'items'
> & { subtotal?: number; discount?: number }

type PaymentFilter = 'all' | 'paid' | 'partial' | 'unpaid'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function paymentStatusOf(order: OrderRecord): PaymentFilter {
  if (order.due <= 0) return 'paid'
  if (order.paid > 0) return 'partial'
  return 'unpaid'
}

export function SalesScreen() {
  const { data, hasPermission, createOrder, updateOrderStatus } = useERP()
  const orders = useMemo(
    () => toArray(data?.orders).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.orders]
  )
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const salesPeople = useMemo(() => {
    const map = new Map<string, string>()
    orders.forEach((order) => {
      if (order.salesPersonId) {
        map.set(order.salesPersonId, order.salesPersonName)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [orders])

  const [orderForm, setOrderForm] = useState(emptyOrder)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [quickCreateCustomerOpen, setQuickCreateCustomerOpen] = useState(false)
  const [quickCreateProductOpen, setQuickCreateProductOpen] = useState(false)
  const [pendingSearchText, setPendingSearchText] = useState('')
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === orderForm.customerId),
    [customers, orderForm.customerId]
  )
  const orderSubtotal = orderForm.items.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  )
  const orderDiscount = Math.min(Math.max(Number(orderForm.discount || 0), 0), orderSubtotal)
  const orderTotal = orderSubtotal - orderDiscount
  const orderDue = Math.max(orderTotal - Number(orderForm.paid || 0), 0)

  const customerOptions: ComboboxOption[] = useMemo(
    () =>
      customers.map((customer) => ({
        value: customer.id,
        label: customer.name,
        sublabel: `due ${formatCurrency(customer.due, data?.settings.currency)}`,
      })),
    [customers, data?.settings.currency]
  )

  const productOptions: ComboboxOption[] = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: `stock ${product.stockQty}`,
      })),
    [products]
  )

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderRecord['status'] | 'all'>('all')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const openOrders = orders.filter((order) => order.status !== 'completed').length
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

  async function handleOrderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      await createOrder({
        customerId: orderForm.customerId,
        items: orderForm.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
        discount: Number(orderForm.discount),
        paid: Number(orderForm.paid),
        billNumber: orderForm.billNumber,
        orderDate: orderForm.orderDate,
        deliveryDate: orderForm.deliveryDate,
        paymentDueDate: orderForm.paymentDueDate,
        dueReference: orderForm.dueReference,
      })
      setOrderForm({ ...emptyOrder, orderDate: new Date().toISOString().slice(0, 10), paymentDueDate: defaultPaymentDueDate() })
      setFeedback('Sales order created and inventory updated in realtime.')
      setNewSaleOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create order.')
    }
  }

  function buildSalesDocumentHtml(type: 'Quotation' | 'Invoice', document: SalesDocument) {
    const customer = customers.find((entry) => entry.id === document.customerId)
    const issueDate = formatDate(document.createdAt)
    const deliveryDate = formatDate(document.deliveryDate)
    const currency = data?.settings.currency
    const invoiceNumber = (document.billNumber || document.id).replace(/\D/g, '').slice(-8).padStart(8, '0')

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
            @page { margin: 0; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; }
            .header { align-items: flex-start; border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 18px; }
            .brand h1 { font-size: 24px; margin: 0; }
            .brand p, .meta p, .party p { color: #4b5563; font-size: 13px; margin: 5px 0 0; }
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
            @media screen { body { padding: 32px; } .print-date { bottom: 20px; right: 32px; } }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <h1>${escapeHtml(data?.settings.companyName ?? 'ERP')}</h1>
              <p>Sales & Billing</p>
              <p>92, Wise Market, Nawabpur Road, Dhaka-1100</p>
              <p>+88 01897914480-83</p>
            </div>
            <div class="meta">
              <p class="title">${type}</p>
              <p><strong>No:</strong> ${invoiceNumber}</p>
              <p><strong>Issue:</strong> ${issueDate}</p>
              <p><strong>Due/Delivery:</strong> ${deliveryDate}</p>
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
              <p>Payment status: ${document.due > 0 ? 'Due' : 'Paid'}</p>
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
            <div class="grand"><span>Due amount</span><strong>${formatCurrency(document.due, currency)}</strong></div>
          </div>

          <p class="print-date">${issueDate}</p>
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

  function printSalesDocument(type: 'Quotation' | 'Invoice', document: SalesDocument) {
    const popup = window.open('', '_blank', 'width=920,height=720')

    if (!popup) {
      setFeedback('Allow popups to print or save the document as PDF.')
      return
    }

    popup.document.open()
    popup.document.write(buildSalesDocumentHtml(type, document))
    popup.document.close()
  }

  function handleQuotationPrint() {
    setFeedback(null)

    const customer = customers.find((entry) => entry.id === orderForm.customerId)
    const quotationItems = orderForm.items.map((item) => {
      const product = products.find((entry) => entry.id === item.productId)
      return product ? { product, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) } : null
    })

    if (!customer || quotationItems.some((item) => !item || item.quantity <= 0 || item.unitPrice < 0) || !orderForm.deliveryDate) {
      setFeedback('Select customer, product, quantity, and due date before printing a quotation.')
      return
    }

    printSalesDocument('Quotation', {
      id: `QT-${Date.now()}`,
      billNumber: `QT-${Date.now().toString().slice(-8)}`,
      customerId: customer.id,
      customerName: customer.name,
      salesPersonName: 'Sales desk',
      subtotal: orderSubtotal,
      discount: orderDiscount,
      total: orderTotal,
      paid: Number(orderForm.paid || 0),
      due: orderDue,
      deliveryDate: orderForm.deliveryDate,
      createdAt: new Date().toISOString(),
      items: quotationItems.map((item) => ({
        productId: item!.product.id,
        productName: item!.product.name,
        quantity: item!.quantity,
        unitPrice: item!.unitPrice,
        purchasePrice: item!.product.purchasePrice,
      })),
    })
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
    const rows = filteredOrders.map((order) => [
      order.billNumber,
      order.customerName,
      order.salesPersonName,
      order.items.map((item) => `${item.productName} x${item.quantity}`).join('; '),
      formatCurrency(order.total, currency),
      formatCurrency(order.paid, currency),
      formatCurrency(order.due, currency),
      getReadableOrderState(order),
      formatDate(order.deliveryDate),
      formatDate(order.createdAt),
    ])

    void exportXlsx(
      `ims-sales-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      'Sales',
      ['Bill', 'Customer', 'Sales Person', 'Items', 'Total', 'Paid', 'Due', 'Status', 'Delivery', 'Created'],
      rows
    )
  }

  return (
    <AdminShell active="Sales & Billing">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Open</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{openOrders}</p>
              <Progress value={orders.length ? (openOrders / orders.length) * 100 : 0} className="mt-4" />
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Ready</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{readyOrders}</p>
              <Progress value={orders.length ? (readyOrders / orders.length) * 100 : 0} className="mt-4" />
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Customer receivable</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(receivableTotal, data?.settings.currency)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{overdueOrders.length} overdue reminders</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Supplier payable estimate</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(supplierPayableEstimate, data?.settings.currency)}</p>
              <p className="mt-2 text-xs text-muted-foreground">From recorded purchases</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Sales & billing data table</CardTitle>
              <CardDescription>Filter the full order trail, export data, or start a new sale.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={handleExport}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export data
              </Button>
              {hasPermission('manage_orders') ? (
                <Button className="rounded-xl" onClick={() => setNewSaleOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New sale
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="relative xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search bill, customer, product, sales person"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
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
                    <TableHead>Bill</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Sales person</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead className="text-right">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id} className={cn(order.due > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : '')}>
                      <TableCell className="font-medium">{order.billNumber}</TableCell>
                      <TableCell>
                        <p className="font-semibold">{order.customerName}</p>
                      </TableCell>
                      <TableCell>{order.items[0]?.productName ?? 'N/A'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{order.salesPersonName}</TableCell>
                      <TableCell>{formatCurrency(order.total, data?.settings.currency)}</TableCell>
                      <TableCell className={cn(order.due > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(order.due, data?.settings.currency)}
                        {order.due > 0 && order.dueReference ? (
                          <p className="text-xs font-normal text-muted-foreground">Held by: {order.dueReference}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {hasPermission('manage_orders') ? (
                          <Select value={order.status} onValueChange={(value) => void updateOrderStatus(order.id, value as typeof order.status)}>
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="ready">Ready</SelectItem>
                              <SelectItem value="shipped">Shipped</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="hold">Hold</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{getReadableOrderState(order)}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(order.deliveryDate)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => printSalesDocument('Invoice', order)} aria-label={`Print invoice ${order.id}`}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => printSalesDocument('Invoice', order)} aria-label={`Download invoice ${order.id} as PDF`}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
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

      <Dialog open={newSaleOpen} onOpenChange={setNewSaleOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>Create new sale</DialogTitle>
            <DialogDescription>Save a sales order from the live inventory set, or print a quotation first.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleOrderSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order details</p>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Customer<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Combobox
                  options={customerOptions}
                  value={orderForm.customerId}
                  onChange={(value) => setOrderForm((current) => ({ ...current, customerId: value }))}
                  placeholder="Select a customer"
                  searchPlaceholder="Search customers..."
                  onCreateNew={(typedText) => {
                    setPendingSearchText(typedText)
                    setQuickCreateCustomerOpen(true)
                  }}
                  createNewLabel="Create customer"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Mobile number</p>
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm">
                    {selectedCustomer?.phone || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Location</p>
                  <div className="flex min-h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {selectedCustomer?.location || 'N/A'}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Products<span className="ml-0.5 text-rose-500">*</span></p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderForm((current) => ({ ...current, items: [...current.items, { productId: '', quantity: '1', unitPrice: '' }] }))}
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add product
                  </Button>
                </div>
                {orderForm.items.map((item, index) => (
                  <div key={index} className="space-y-3 rounded-xl border border-border/70 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Combobox
                          options={productOptions}
                          value={item.productId}
                          onChange={(value) => setOrderForm((current) => ({
                            ...current,
                            items: current.items.map((entry, itemIndex) => itemIndex === index
                              ? { ...entry, productId: value, unitPrice: String(products.find((product) => product.id === value)?.sellingPrice ?? '') }
                              : entry),
                          }))}
                          placeholder="Select a product"
                          searchPlaceholder="Search products..."
                          onCreateNew={(typedText) => {
                            setPendingSearchText(typedText)
                            setQuickCreateProductOpen(true)
                          }}
                          createNewLabel="Create product"
                        />
                      </div>
                      {orderForm.items.length > 1 ? (
                        <Button type="button" variant="outline" size="icon" onClick={() => setOrderForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove product ${index + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Quantity<span className="ml-0.5 text-rose-500">*</span></p>
                        <Input type="number" min="1" value={item.quantity} onChange={(event) => setOrderForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} required />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Unit price<span className="ml-0.5 text-rose-500">*</span></p>
                        <Input type="number" min="0" value={item.unitPrice} onChange={(event) => setOrderForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry) }))} placeholder="0" required />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Delivery date<span className="ml-0.5 text-rose-500">*</span></p>
                <Input type="date" value={orderForm.deliveryDate} onChange={(event) => setOrderForm((current) => ({ ...current, deliveryDate: event.target.value }))} required />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Paid now ({data?.settings.currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input type="number" min="0" value={orderForm.paid} onChange={(event) => setOrderForm((current) => ({ ...current, paid: event.target.value }))} placeholder="0" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Bill / sale date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input type="date" value={orderForm.orderDate} onChange={(event) => setOrderForm((current) => ({ ...current, orderDate: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Payment due date <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input type="date" value={orderForm.paymentDueDate} onChange={(event) => setOrderForm((current) => ({ ...current, paymentDueDate: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Who collects the due amount</p>
                  <Select value={orderForm.dueReference || 'owner'} onValueChange={(value) => setOrderForm((current) => ({ ...current, dueReference: value as OrderRecord['dueReference'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner (collected directly)</SelectItem>
                      <SelectItem value="courier">Courier (COD on delivery)</SelectItem>
                      <SelectItem value="bank">Bank account</SelectItem>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="dbbl">DBBL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    Bill number <span className="font-normal text-muted-foreground">(optional — auto-generated if left blank)</span>
                  </p>
                  <Input value={orderForm.billNumber} onChange={(event) => setOrderForm((current) => ({ ...current, billNumber: event.target.value }))} placeholder="Auto-generated if blank" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Total amount</p>
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm">
                    {formatCurrency(orderSubtotal, data?.settings.currency)}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Discount amount</p>
                  <Input type="number" min="0" max={orderSubtotal} value={orderForm.discount} onChange={(event) => setOrderForm((current) => ({ ...current, discount: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Payable amount</p>
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm">
                    {formatCurrency(orderTotal, data?.settings.currency)}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Due amount</p>
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm">
                    {formatCurrency(orderDue, data?.settings.currency)}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={handleQuotationPrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print quotation
              </Button>
              <Button type="submit" className="rounded-xl">
                <ClipboardPlus className="mr-2 h-4 w-4" />
                Save order
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <QuickCreateCustomerDialog
        open={quickCreateCustomerOpen}
        onOpenChange={setQuickCreateCustomerOpen}
        initialName={pendingSearchText}
        onCreated={(customerId) => setOrderForm((current) => ({ ...current, customerId }))}
      />
      <QuickCreateProductDialog
        open={quickCreateProductOpen}
        onOpenChange={setQuickCreateProductOpen}
        initialName={pendingSearchText}
        onCreated={(productId) => setOrderForm((current) => ({
          ...current,
          items: current.items.map((item, index) => index === 0 && !item.productId
            ? { ...item, productId, unitPrice: String(products.find((product) => product.id === productId)?.sellingPrice ?? '') }
            : item),
        }))}
      />
    </AdminShell>
  )
}
