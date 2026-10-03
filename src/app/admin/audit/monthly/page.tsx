"use client"

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Printer } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { EmptyState, localDay, todayInput } from '@/components/admin/approvals/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { ERPData, OrderDelivery, OrderRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, formatDateTime, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Tab = 'reports' | 'days' | 'delivery'

type ReportKind = 'delivery' | 'deposit' | 'supplier_payment' | 'expense' | 'complaint' | 'replacement' | 'replacement_return'

const KIND_LABELS: Record<ReportKind, string> = {
  delivery: 'Deliveries',
  deposit: 'Deposits',
  supplier_payment: 'Supplier payments',
  expense: 'Expenses',
  complaint: 'Complaints',
  replacement: 'Replacements',
  replacement_return: 'Replacement returns',
}

/** Kinds that carry no money; their cards show a count only. */
const COUNT_ONLY: ReportKind[] = ['complaint', 'replacement', 'replacement_return']

type ReportRow = {
  id: string
  kind: ReportKind
  party: string
  details: string
  amount: number
  submittedByName: string
  reviewedByName: string
  /** When it was approved (a delivery: submitted); finance-page expenses have no review and use their own date. */
  approvedAt: string
  documentUrl?: string
}

type DeliveryRow = OrderRecord & { delivery: OrderDelivery }

/** `YYYY-MM` of today, for the month input. */
function currentMonth() {
  return todayInput().slice(0, 7)
}

/** `YYYY-MM` moved by `delta` months. */
function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(year, value - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Every `YYYY-MM-DD` of a `YYYY-MM` month. */
function daysOf(month: string) {
  const [year, value] = month.split('-').map(Number)
  const count = new Date(year, value, 0).getDate()
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

function monthLabel(month: string) {
  const [year, value] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-BD', { month: 'long', year: 'numeric' }).format(new Date(year, value - 1, 1))
}

/** Kinds that carry money, shown as columns on the day-by-day table. */
const MONEY_KINDS: ReportKind[] = ['delivery', 'deposit', 'supplier_payment', 'expense']

function safeDate(value: string | undefined) {
  return value && !Number.isNaN(new Date(value).getTime()) ? formatDate(value) : '—'
}

function safeDateTime(value: string | undefined) {
  return value && !Number.isNaN(new Date(value).getTime()) ? formatDateTime(value) : '—'
}

/** Approved orders whose delivery document has been submitted; until then a delivery stays off the audit. */
function submittedDeliveries(data: ERPData | null | undefined): DeliveryRow[] {
  if (!data) return []
  const approvedOrderIds = new Set(
    toArray(data.orderRequests)
      .filter((request) => request.status === 'approved' && request.orderId)
      .map((request) => request.orderId)
  )
  return toArray(data.orders)
    .filter((order): order is DeliveryRow => approvedOrderIds.has(order.id) && order.delivery?.status === 'submitted')
    .sort((left, right) => right.delivery.submittedAt.localeCompare(left.delivery.submittedAt))
}

/** Every approved submission and submitted delivery, newest first. */
function approvedReports(data: ERPData | null | undefined): ReportRow[] {
  if (!data) return []
  const rows: ReportRow[] = []

  submittedDeliveries(data).forEach((order) =>
    rows.push({
      id: `delivery-${order.id}`,
      kind: 'delivery',
      party: order.customerName,
      details: [order.billNumber, order.delivery.warehouseName, order.delivery.deliveryManName, order.delivery.courierName].filter(Boolean).join(' · '),
      amount: order.total,
      submittedByName: order.delivery.postedByName,
      reviewedByName: order.delivery.submittedByName,
      approvedAt: order.delivery.submittedAt,
      documentUrl: order.delivery.documentUrl,
    })
  )

  toArray(data.deposits)
    .filter((deposit) => deposit.status === 'approved')
    .forEach((deposit) =>
      rows.push({
        id: `deposit-${deposit.id}`,
        kind: 'deposit',
        party: deposit.customerName,
        details: [deposit.method, deposit.note].filter(Boolean).join(' · '),
        amount: deposit.amount,
        submittedByName: deposit.submittedByName,
        reviewedByName: deposit.reviewedByName ?? '',
        approvedAt: deposit.reviewedAt ?? deposit.updatedAt,
      })
    )

  toArray(data.supplierPayments)
    .filter((payment) => payment.status === 'approved')
    .forEach((payment) =>
      rows.push({
        id: `payment-${payment.id}`,
        kind: 'supplier_payment',
        party: payment.supplierName,
        details: [payment.method === 'bank' ? 'Bank' : 'Cash', payment.purpose, payment.note].filter(Boolean).join(' · '),
        amount: payment.amount,
        submittedByName: payment.submittedByName,
        reviewedByName: payment.reviewedByName ?? '',
        approvedAt: payment.reviewedAt ?? payment.updatedAt,
      })
    )

  // Expenses entered on the finance page have no status and count as approved.
  toArray(data.expenses)
    .filter((expense) => !expense.status || expense.status === 'approved')
    .forEach((expense) =>
      rows.push({
        id: `expense-${expense.id}`,
        kind: 'expense',
        party: expense.expenseBy || expense.createdByName,
        details: [expense.category, expense.note].filter(Boolean).join(' · '),
        amount: expense.amount,
        submittedByName: expense.createdByName,
        reviewedByName: expense.reviewedByName ?? '',
        approvedAt: expense.status ? expense.reviewedAt ?? expense.createdAt : expense.date,
      })
    )

  toArray(data.complaints)
    .filter((complaint) => complaint.status === 'approved')
    .forEach((complaint) =>
      rows.push({
        id: `complaint-${complaint.id}`,
        kind: 'complaint',
        party: complaint.customerName,
        details: [complaint.productName, complaint.serialNumber && `SN ${complaint.serialNumber}`, complaint.problem].filter(Boolean).join(' · '),
        amount: 0,
        submittedByName: complaint.submittedByName,
        reviewedByName: complaint.reviewedByName ?? '',
        approvedAt: complaint.reviewedAt ?? complaint.updatedAt,
      })
    )

  toArray(data.replacements)
    .filter((replacement) => replacement.status === 'approved')
    .forEach((replacement) =>
      rows.push({
        id: `replacement-${replacement.id}`,
        kind: 'replacement',
        party: replacement.customerName,
        details: [replacement.productName, replacement.serialNumber && `SN ${replacement.serialNumber}`, replacement.problem].filter(Boolean).join(' · '),
        amount: 0,
        submittedByName: replacement.submittedByName,
        reviewedByName: replacement.reviewedByName ?? '',
        approvedAt: replacement.reviewedAt ?? replacement.updatedAt,
      })
    )

  toArray(data.replacementReturns)
    .filter((item) => item.status === 'approved')
    .forEach((item) =>
      rows.push({
        id: `return-${item.id}`,
        kind: 'replacement_return',
        party: item.customerName,
        details: [item.productName, item.note].filter(Boolean).join(' · '),
        amount: 0,
        submittedByName: item.submittedByName,
        reviewedByName: item.reviewedByName ?? '',
        approvedAt: item.reviewedAt ?? item.updatedAt,
      })
    )

  return rows.sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))
}

function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone === 'danger' && 'text-rose-600')}>{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

export default function MonthlyAuditPage() {
  const { data } = useERP()
  const [tab, setTab] = useState<Tab>('reports')
  const [month, setMonth] = useState(currentMonth)
  const [kind, setKind] = useState<ReportKind | 'all'>('all')
  const [search, setSearch] = useState('')

  const inRange = (value: string | undefined) => localDay(value).startsWith(`${month}-`)

  const reports = useMemo(() => approvedReports(data), [data])
  const reportsInRange = reports.filter((row) => inRange(row.approvedAt))
  const query = search.trim().toLowerCase()
  const visibleReports = reportsInRange.filter(
    (row) =>
      (kind === 'all' || row.kind === kind) &&
      (!query || [row.party, row.details, row.submittedByName, row.reviewedByName].some((value) => value.toLowerCase().includes(query)))
  )

  const totals = (Object.keys(KIND_LABELS) as ReportKind[]).map((item) => {
    const rows = reportsInRange.filter((row) => row.kind === item)
    return { kind: item, count: rows.length, amount: rows.reduce((sum, row) => sum + row.amount, 0) }
  })

  const deliveries = useMemo(() => submittedDeliveries(data), [data])
  const deliveriesInRange = deliveries.filter((row) => inRange(row.delivery.submittedAt))
  const visibleDeliveries = deliveriesInRange.filter(
    (row) =>
      !query ||
      [row.customerName, row.billNumber, row.delivery.warehouseName, row.delivery.deliveryManName, row.delivery.courierName, row.delivery.trackingNumber].some((value) =>
        value.toLowerCase().includes(query)
      )
  )
  const today = todayInput()
  const days = daysOf(month)
    .filter((day) => day <= today)
    .map((day) => {
      const rows = reportsInRange.filter((row) => localDay(row.approvedAt) === day)
      const amounts = Object.fromEntries(
        MONEY_KINDS.map((item) => [item, rows.filter((row) => row.kind === item).reduce((sum, row) => sum + row.amount, 0)])
      ) as Record<ReportKind, number>
      return { day, count: rows.length, amounts }
    })
    .reverse()
  const activeDays = days.filter((row) => row.count > 0)

  const productMoves = reportsInRange.filter((row) => row.kind === 'replacement' || row.kind === 'replacement_return')

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'reports', label: 'Approved reports' },
    { id: 'days', label: 'Day by day' },
    { id: 'delivery', label: 'Delivery' },
  ]

  return (
    <AdminShell active="Monthly Audit">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Monthly audit — {monthLabel(month)}</h2>
            <p className="text-sm text-muted-foreground">Only what an admin has approved. Pending and rejected submissions are left out.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="outline" size="icon" className="h-9 w-9" title="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="month" className="w-auto" value={month} max={currentMonth()} onChange={(event) => setMonth(event.target.value || currentMonth())} />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Next month"
              disabled={month >= currentMonth()}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Input className="sm:w-64" placeholder="Search party, bill, person…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {tab === 'reports' ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {totals.map((total) => (
                <button
                  key={total.kind}
                  type="button"
                  onClick={() => setKind(kind === total.kind ? 'all' : total.kind)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    kind === total.kind ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  )}
                >
                  <p className="text-xs text-muted-foreground">{KIND_LABELS[total.kind]}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{COUNT_ONLY.includes(total.kind) ? total.count : formatCurrency(total.amount)}</p>
                  <p className="text-xs text-muted-foreground">{COUNT_ONLY.includes(total.kind) ? 'approved' : `${total.count} approved`}</p>
                </button>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{kind === 'all' ? 'All approved reports' : KIND_LABELS[kind]}</CardTitle>
                <CardDescription>{visibleReports.length} approved in this month</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {visibleReports.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Approved</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Party</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Submitted / posted by</TableHead>
                        <TableHead>Approved by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleReports.map((row) => (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="whitespace-nowrap text-sm">{safeDateTime(row.approvedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{KIND_LABELS[row.kind]}</TableCell>
                          <TableCell className="font-medium">{row.party || '—'}</TableCell>
                          <TableCell className="max-w-xs text-sm">
                            {row.details || '—'}
                            {row.documentUrl ? (
                              <a href={row.documentUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                <FileText className="h-3 w-3" />
                                Delivery document
                              </a>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{COUNT_ONLY.includes(row.kind) ? '—' : formatCurrency(row.amount)}</TableCell>
                          <TableCell>{row.submittedByName || '—'}</TableCell>
                          <TableCell>{row.reviewedByName || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState text="Nothing approved in this month." />
                )}
              </CardContent>
            </Card>
          </>
        ) : tab === 'days' ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Days with activity" value={activeDays.length} note={`of ${days.length} so far`} />
              <Stat label="Reports approved" value={reportsInRange.length} />
              <Stat label="Deposits received" value={formatCurrency(totals.find((total) => total.kind === 'deposit')?.amount ?? 0)} />
              <Stat
                label="Paid out"
                value={formatCurrency(
                  totals.filter((total) => total.kind === 'supplier_payment' || total.kind === 'expense').reduce((sum, total) => sum + total.amount, 0)
                )}
                note="Supplier payments and expenses"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Day by day</CardTitle>
                <CardDescription>Approved amounts for each day of the month. Open the Daily Audit for a day's individual entries.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {activeDays.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Day</TableHead>
                        {MONEY_KINDS.map((item) => (
                          <TableHead key={item} className="text-right">
                            {KIND_LABELS[item]}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Reports</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeDays.map((row) => (
                        <TableRow key={row.day}>
                          <TableCell className="whitespace-nowrap font-medium">{safeDate(row.day)}</TableCell>
                          {MONEY_KINDS.map((item) => (
                            <TableCell key={item} className="text-right tabular-nums">
                              {row.amounts[item] ? formatCurrency(row.amounts[item]) : '—'}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell>Month total</TableCell>
                        {MONEY_KINDS.map((item) => (
                          <TableCell key={item} className="text-right tabular-nums">
                            {formatCurrency(activeDays.reduce((sum, row) => sum + row.amounts[item], 0))}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{reportsInRange.length}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState text="Nothing approved in this month." />
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Deliveries submitted" value={deliveriesInRange.length} />
              <Stat label="Value delivered" value={formatCurrency(deliveriesInRange.reduce((sum, row) => sum + row.total, 0))} />
              <Stat label="Delivery charges" value={formatCurrency(deliveriesInRange.reduce((sum, row) => sum + (row.delivery.deliveryCharge || 0), 0))} />
              <Stat label="Warehouses used" value={new Set(deliveriesInRange.map((row) => row.delivery.warehouseId)).size} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Submitted deliveries</CardTitle>
                <CardDescription>Approved orders whose delivery document was submitted in this month. Posted deliveries still waiting for a document are not listed.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {visibleDeliveries.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill</TableHead>
                        <TableHead>Dealer</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Delivery man</TableHead>
                        <TableHead>Courier</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleDeliveries.map((row) => (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="whitespace-nowrap">{row.billNumber}</TableCell>
                          <TableCell className="font-medium">{row.customerName}</TableCell>
                          <TableCell>{row.delivery.warehouseName}</TableCell>
                          <TableCell>
                            <span className="block">{row.delivery.deliveryManName}</span>
                            {row.delivery.vehicle ? <span className="block text-xs text-muted-foreground">{row.delivery.vehicle}</span> : null}
                          </TableCell>
                          <TableCell>
                            <span className="block">{row.delivery.courierName || '—'}</span>
                            {row.delivery.trackingNumber ? <span className="block text-xs text-muted-foreground">{row.delivery.trackingNumber}</span> : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            <span className="block">{safeDateTime(row.delivery.submittedAt)}</span>
                            <span className="block text-xs text-muted-foreground">{row.delivery.submittedByName}</span>
                          </TableCell>
                          <TableCell>
                            <a href={row.delivery.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                              <FileText className="h-4 w-4" />
                              View
                            </a>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState text="No deliveries submitted in this month." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approved replacements and returns</CardTitle>
                <CardDescription>Products going out to or coming back from dealers.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {productMoves.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Approved</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dealer</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Approved by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productMoves.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-sm">{safeDateTime(row.approvedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap">{KIND_LABELS[row.kind]}</TableCell>
                          <TableCell className="font-medium">{row.party}</TableCell>
                          <TableCell className="max-w-xs text-sm">{row.details || '—'}</TableCell>
                          <TableCell>{row.reviewedByName || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No replacements or returns approved in this month.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  )
}
