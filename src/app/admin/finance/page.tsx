"use client"

import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  FileDown,
  LayoutGrid,
  ListChecks,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ExpenseInput, OrderRecord } from '@/lib/erp/types'
import { useERP } from '@/lib/erp/provider'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function monthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function isSameDate(value: string, target: string) {
  return value.slice(0, 10) === target
}

function isSameMonth(value: string, target: string) {
  return value.slice(0, 7) === target
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getOrderCost(order: OrderRecord) {
  return order.items.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0)
}

const emptyExpenseForm = { category: '', amount: '0', note: '', date: dateInputValue() }

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ArrowUpRight
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default function FinancePage() {
  const { data, saveExpense, deleteExpense } = useERP()
  const [mode, setMode] = useState<'daily' | 'monthly'>('daily')
  const [selectedDate, setSelectedDate] = useState(dateInputValue())
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)

  const orders = useMemo(
    () => toArray(data?.orders).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.orders]
  )
  const purchases = useMemo(
    () => toArray(data?.purchases).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchases]
  )
  const expenses = useMemo(
    () => toArray(data?.expenses).sort((left, right) => right.date.localeCompare(left.date)),
    [data?.expenses]
  )
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const currency = data?.settings.currency
  const expenseCategories = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.category).filter(Boolean))).sort(),
    [expenses]
  )

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) =>
      mode === 'daily' ? isSameDate(expense.date, selectedDate) : isSameMonth(expense.date, selectedMonth)
    )
  }, [mode, expenses, selectedDate, selectedMonth])

  const expenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses]
  )

  async function handleExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      const input: ExpenseInput = {
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        note: expenseForm.note,
        date: expenseForm.date,
      }
      await saveExpense(input)
      setExpenseForm({ ...emptyExpenseForm, date: expenseForm.date })
      setFeedback('Expense recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record expense.')
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    setFeedback(null)

    try {
      await deleteExpense(expenseId)
      setFeedback('Expense removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete expense.')
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) =>
      mode === 'daily' ? isSameDate(order.createdAt, selectedDate) : isSameMonth(order.createdAt, selectedMonth)
    )
  }, [mode, orders, selectedDate, selectedMonth])

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) =>
      mode === 'daily' ? isSameDate(purchase.createdAt, selectedDate) : isSameMonth(purchase.createdAt, selectedMonth)
    )
  }, [mode, purchases, selectedDate, selectedMonth])

  const finance = useMemo(() => {
    const revenue = filteredOrders.reduce((sum, order) => sum + order.total, 0)
    const cashIn = filteredOrders.reduce((sum, order) => sum + order.paid, 0)
    const receivable = filteredOrders.reduce((sum, order) => sum + order.due, 0)
    const cogs = filteredOrders.reduce((sum, order) => sum + getOrderCost(order), 0)
    const purchaseExpense = filteredPurchases.reduce((sum, purchase) => sum + purchase.total, 0)
    const importCharges = suppliers.reduce(
      (sum, supplier) => sum + supplier.shippingCost + supplier.customsDuty + supplier.otherCost,
      0
    )
    const grossProfit = revenue - cogs
    const netCashFlow = cashIn - purchaseExpense - expenseTotal

    return {
      revenue,
      cashIn,
      receivable,
      cogs,
      purchaseExpense,
      importCharges,
      grossProfit,
      netCashFlow,
      invoices: filteredOrders.length,
      unitsSold: filteredOrders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0
      ),
    }
  }, [filteredOrders, filteredPurchases, suppliers, expenseTotal])

  const monthlyRows = useMemo(() => {
    const year = Number(selectedMonth.slice(0, 4)) || new Date().getFullYear()

    return Array.from({ length: 12 }).map((_, index) => {
      const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`
      const monthOrders = orders.filter((order) => isSameMonth(order.createdAt, monthKey))
      const monthPurchases = purchases.filter((purchase) => isSameMonth(purchase.createdAt, monthKey))
      const revenue = monthOrders.reduce((sum, order) => sum + order.total, 0)
      const cash = monthOrders.reduce((sum, order) => sum + order.paid, 0)
      const due = monthOrders.reduce((sum, order) => sum + order.due, 0)
      const cogs = monthOrders.reduce((sum, order) => sum + getOrderCost(order), 0)
      const expense = monthPurchases.reduce((sum, purchase) => sum + purchase.total, 0)

      return {
        key: monthKey,
        month: new Date(`${monthKey}-01`).toLocaleDateString('en-BD', { month: 'long' }),
        invoices: monthOrders.length,
        revenue,
        cash,
        due,
        cogs,
        expense,
        profit: revenue - cogs,
      }
    })
  }, [orders, purchases, selectedMonth])

  function buildInvoiceHtml(order: OrderRecord) {
    const customer = customers.find((entry) => entry.id === order.customerId)
    const invoiceNumber = (order.billNumber || order.id).replace(/\D/g, '').slice(-8).padStart(8, '0')
    const rows = order.items
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.productName)}</td>
            <td class="numeric">${item.quantity}</td>
            <td class="numeric">${formatCurrency(item.unitPrice, currency)}</td>
            <td class="numeric">${formatCurrency(item.unitPrice * item.quantity, currency)}</td>
          </tr>
        `
      )
      .join('')

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${escapeHtml(order.id)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { margin: 0; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; }
            .header { border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 18px; }
            h1 { font-size: 24px; margin: 0; }
            p { color: #4b5563; font-size: 13px; margin: 5px 0 0; }
            .title { font-size: 28px; font-weight: 700; text-align: right; text-transform: uppercase; }
            .grid { display: grid; gap: 20px; grid-template-columns: 1fr 1fr; margin-top: 26px; }
            .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; }
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
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>${escapeHtml(data?.settings.companyName ?? 'ERP')}</h1>
              <p>Accounting & Finance</p>
              <p>92, Wise Market, Nawabpur Road, Dhaka-1100</p>
              <p>+88 01897914480-83</p>
            </div>
            <div>
              <p class="title">Invoice</p>
              <p><strong>No:</strong> ${invoiceNumber}</p>
              <p><strong>Date:</strong> ${formatDate(order.createdAt)}</p>
              <p><strong>Due date:</strong> ${formatDate(order.deliveryDate)}</p>
            </div>
          </div>
          <div class="grid">
            <div class="box">
              <strong>Bill To</strong>
              <p>${escapeHtml(order.customerName)}</p>
              <p><strong>Mobile:</strong> ${escapeHtml(customer?.phone || 'N/A')}</p>
              <p><strong>Location:</strong> ${escapeHtml(customer?.location || 'N/A')}</p>
            </div>
            <div class="box">
              <strong>Payment</strong>
              <p>Cash: ${formatCurrency(order.paid, currency)}</p>
              <p>Due: ${formatCurrency(order.due, currency)}</p>
            </div>
          </div>
          <table>
            <thead><tr><th>#</th><th>Item</th><th class="numeric">Qty</th><th class="numeric">Rate</th><th class="numeric">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="totals">
            <div><span>Total amount</span><strong>${formatCurrency(order.subtotal ?? order.total, currency)}</strong></div>
            <div><span>Discount</span><strong>${formatCurrency(order.discount ?? 0, currency)}</strong></div>
            <div><span>Payable amount</span><strong>${formatCurrency(order.total, currency)}</strong></div>
            <div><span>Cash</span><strong>${formatCurrency(order.paid, currency)}</strong></div>
            <div class="grand"><span>Due amount</span><strong>${formatCurrency(order.due, currency)}</strong></div>
          </div>
          <p class="print-date">${formatDate(order.createdAt)}</p>
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

  function printInvoice(order: OrderRecord) {
    setFeedback(null)
    const popup = window.open('', '_blank', 'width=920,height=720')

    if (!popup) {
      setFeedback('Allow popups to print or save invoice as PDF.')
      return
    }

    popup.document.open()
    popup.document.write(buildInvoiceHtml(order))
    popup.document.close()
  }

  return (
    <AdminShell active="Accounting & Finance">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Reporting period</p>
            <p className="text-xs text-muted-foreground">Choose a day or month to scope the figures below.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'daily' ? (
              <Input className="w-full sm:w-52" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            ) : (
              <Input className="w-full sm:w-52" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            )}
          </div>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {/* Section: Overview */}
        <section className="space-y-4">
          <SectionHeader icon={LayoutGrid} title="Overview" description="Key figures for the selected period." />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Revenue / Sales', formatCurrency(finance.revenue, currency), ArrowUpRight, 'Total invoice value'],
              ['Cash received', formatCurrency(finance.cashIn, currency), Wallet, 'Paid amount collected'],
              ['Customer due', formatCurrency(finance.receivable, currency), ReceiptText, 'Receivable balance'],
              ['Gross profit/loss', formatCurrency(finance.grossProfit, currency), finance.grossProfit >= 0 ? ArrowUpRight : ArrowDownLeft, 'Sales minus product cost'],
            ].map(([label, value, Icon, note]) => {
              const MetricIcon = Icon as typeof ArrowUpRight

              return (
                <Card key={label as string} className="border-border/70 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MetricIcon className="h-4 w-4" />
                      {label as string}
                    </div>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{value as string}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{note as string}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Invoices', finance.invoices.toLocaleString('en-BD'), `${finance.unitsSold} units sold`],
              ['COGS', formatCurrency(finance.cogs, currency), 'Product purchase cost'],
              ['Purchase expense', formatCurrency(finance.purchaseExpense, currency), 'Inventory purchases in period'],
              ['Net cash flow', formatCurrency(finance.netCashFlow, currency), 'Cash received minus purchases'],
            ].map(([label, value, note]) => (
              <Card key={label} className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Section: Sales & Receivables */}
        <section className="space-y-4">
          <SectionHeader
            icon={ReceiptText}
            title="Sales & receivables"
            description="Invoice ledger alongside expense, import, and payable balances."
          />

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Sales and invoice ledger</CardTitle>
                <CardDescription>Download invoices as PDF from the browser print dialog.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Sales</TableHead>
                        <TableHead>Cash</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Profit</TableHead>
                        <TableHead className="text-right">PDF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => {
                        const profit = order.total - getOrderCost(order)

                        return (
                          <TableRow key={order.id} className={cn(order.due > 0 && 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300')}>
                            <TableCell className="font-medium">{order.id}</TableCell>
                            <TableCell>{formatDate(order.createdAt)}</TableCell>
                            <TableCell>{order.customerName}</TableCell>
                            <TableCell>{formatCurrency(order.total, currency)}</TableCell>
                            <TableCell>{formatCurrency(order.paid, currency)}</TableCell>
                            <TableCell>{formatCurrency(order.due, currency)}</TableCell>
                            <TableCell>{formatCurrency(profit, currency)}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => printInvoice(order)} aria-label={`Print invoice ${order.id}`}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => printInvoice(order)} aria-label={`Download invoice ${order.id}`}>
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                            No invoices found for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Expense and payable view</CardTitle>
                <CardDescription>Purchase expenses, supplier import charges, and outstanding receivables.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Supplier import charges</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(finance.importCharges, currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Shipping + customs + other costs</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Total customer ledger due</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(customers.reduce((sum, customer) => sum + customer.due, 0), currency)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">Total supplier landed cost</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatCurrency(
                      suppliers.reduce(
                        (sum, supplier) =>
                          sum + supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost,
                        0
                      ),
                      currency
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Section: Expenses */}
        <section className="space-y-4">
          <SectionHeader
            icon={ListChecks}
            title="Expenses"
            description="Record and review day-to-day running costs."
          />

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Record expense</CardTitle>
                <CardDescription>Daily or monthly running costs (rent, transport, utilities, etc.).</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleExpenseSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Category<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      list="expense-category-options"
                      value={expenseForm.category}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="e.g. Rent, Transport, Utilities"
                      required
                    />
                    <datalist id="expense-category-options">
                      {expenseCategories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span>
                      </p>
                      <Input
                        type="number"
                        min="1"
                        value={expenseForm.amount}
                        onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Date<span className="ml-0.5 text-rose-500">*</span>
                      </p>
                      <Input
                        type="date"
                        value={expenseForm.date}
                        onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Note <span className="font-normal text-muted-foreground">(optional)</span>
                    </p>
                    <Input
                      value={expenseForm.note}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Short note about this expense"
                    />
                  </div>
                  <Button type="submit" className="rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    Save expense
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Expenses this period</CardTitle>
                <CardDescription>Total: {formatCurrency(expenseTotal, currency)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.date)}</TableCell>
                          <TableCell className="font-medium">{expense.category}</TableCell>
                          <TableCell>{formatCurrency(expense.amount, currency)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{expense.note || '-'}</TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteExpense(expense.id)}
                                aria-label="Delete expense"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredExpenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No expenses recorded for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Section: Reports */}
        <section className="space-y-4">
          <SectionHeader icon={BarChart3} title="Reports" description="Full 12-month profit and loss breakdown." />

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Monthly profit/loss report</CardTitle>
              <CardDescription>Full 12-month view for the selected year.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Month</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Cash</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>COGS</TableHead>
                      <TableHead>Purchases</TableHead>
                      <TableHead>Profit/Loss</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell>{row.invoices}</TableCell>
                        <TableCell>{formatCurrency(row.revenue, currency)}</TableCell>
                        <TableCell>{formatCurrency(row.cash, currency)}</TableCell>
                        <TableCell>{formatCurrency(row.due, currency)}</TableCell>
                        <TableCell>{formatCurrency(row.cogs, currency)}</TableCell>
                        <TableCell>{formatCurrency(row.expense, currency)}</TableCell>
                        <TableCell className={cn(row.profit < 0 && 'text-destructive')}>{formatCurrency(row.profit, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AdminShell>
  )
}
