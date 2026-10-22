"use client"

import { Fragment, useMemo } from 'react'
import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { CourierStatus } from '@/lib/erp/types'
import { formatCurrency, formatDate, getOrderStatus, getOrderStatuses, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

import { EmptyState, SummaryRow, localDay } from './shared'

function sumBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => number) {
  const map = new Map<string, number>()
  items.forEach((item) => map.set(key(item) || '—', (map.get(key(item) || '—') ?? 0) + amount(item)))
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function BreakdownCard({ title, rows, total }: { title: string; rows: Array<[string, number]>; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <dl className="space-y-1.5 text-sm">
            {rows.map(([label, value]) => (
              <SummaryRow key={label} label={label} value={formatCurrency(value)} />
            ))}
            <SummaryRow label="Total" value={formatCurrency(total)} strong />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing on this day.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** New stock on the day, stock by warehouse, and products running low. */
export function StockReport({ day }: { day: string }) {
  const { data } = useERP()

  const products = useMemo(() => toArray(data?.products), [data?.products])
  const purchases = useMemo(() => toArray(data?.purchases).filter((purchase) => localDay(purchase.createdAt) === day), [data?.purchases, day])
  const soldToday = useMemo(() => {
    const sold = new Map<string, { name: string; quantity: number }>()
    toArray(data?.orders)
      .filter((order) => localDay(order.createdAt) === day)
      .forEach((order) =>
        order.items.forEach((item) => {
          const current = sold.get(item.productId) ?? { name: item.productName, quantity: 0 }
          sold.set(item.productId, { ...current, quantity: current.quantity + item.quantity })
        })
      )
    return [...sold.values()].sort((left, right) => right.quantity - left.quantity)
  }, [data?.orders, day])

  // One block per warehouse, its products sorted by name, with the warehouse subtotal.
  const warehouses = useMemo(() => {
    const rows = toArray(data?.warehouses).map((warehouse) => ({ id: warehouse.id, name: warehouse.name, location: warehouse.location }))
    const unassigned = { id: '', name: 'No warehouse', location: '' }
    return [...rows, unassigned]
      .map((warehouse) => {
        const items = products
          .filter((product) => (data?.warehouses[product.warehouseId] ? product.warehouseId : '') === warehouse.id)
          .sort((left, right) => left.name.localeCompare(right.name))
        return {
          ...warehouse,
          items,
          units: items.reduce((sum, product) => sum + product.stockQty, 0),
          value: items.reduce((sum, product) => sum + product.stockQty * product.purchasePrice, 0),
        }
      })
      .filter((warehouse) => warehouse.id || warehouse.items.length)
  }, [data?.warehouses, products])

  const lowStock = products
    .filter((product) => product.status !== 'active')
    .sort((left, right) => left.stockQty - right.stockQty)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="New stock in" value={purchases.reduce((sum, purchase) => sum + purchase.quantity, 0)} note={`${purchases.length} purchase(s)`} />
        <Stat label="Units sold" value={soldToday.reduce((sum, item) => sum + item.quantity, 0)} />
        <Stat label="Low stock" value={products.filter((product) => product.status === 'low-stock').length} />
        <Stat label="Out of stock" value={products.filter((product) => product.status === 'out-of-stock').length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New stock</CardTitle>
          <CardDescription>Purchases received on {formatDate(day)}.</CardDescription>
        </CardHeader>
        <CardContent>
          {purchases.length ? (
            <Table className="md:min-w-[640px]" data-report="new-stock">
              <TableHeader>
                <TableRow>
                  <TableHead sticky>Product</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="whitespace-normal text-right">Previous stock qty</TableHead>
                  <TableHead className="whitespace-normal text-right">New stock qty</TableHead>
                  <TableHead className="whitespace-normal text-right">Unit cost (new stock)</TableHead>
                  <TableHead className="whitespace-normal text-right">Total qty</TableHead>
                  <TableHead className="whitespace-normal text-right">Total value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => {
                  // Purchases received before stock was recorded have no previous qty; show "—" rather than guess.
                  const totalQty = typeof purchase.stockBefore === 'number' ? purchase.stockBefore + purchase.quantity : null
                  return (
                    <TableRow key={purchase.id} data-purchase-id={purchase.id}>
                      <TableCell sticky className="font-medium">{purchase.productName}</TableCell>
                      <TableCell>{purchase.supplierName}</TableCell>
                      <TableCell className="text-right tabular-nums">{totalQty === null ? '—' : purchase.stockBefore}</TableCell>
                      <TableCell className="text-right tabular-nums">{purchase.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{purchase.unitCost.toLocaleString()} {purchase.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{totalQty ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalQty === null ? '—' : `${(totalQty * purchase.unitCost).toLocaleString()} ${purchase.currency}`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No new stock on this day.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Warehouse report</CardTitle>
          <CardDescription>Current stock in each warehouse, valued at purchase price.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="md:min-w-[640px]" data-report="warehouse">
            <TableHeader>
              <TableRow>
                <TableHead sticky>Warehouse</TableHead>
                <TableHead>Product name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Purchase price</TableHead>
                <TableHead className="text-right">Stock value (purchase cost)</TableHead>
                <TableHead className="text-right">Low-stock qty</TableHead>
              </TableRow>
            </TableHeader>
            {/* Merged warehouse cells would make the default zebra striping look broken. */}
            <TableBody className="[&>tr:nth-child(even)]:bg-transparent">
              {warehouses.map((warehouse) => {
                const warehouseCell = (
                  <TableCell
                    rowSpan={warehouse.items.length ? warehouse.items.length + 1 : 1}
                    data-warehouse-id={warehouse.id || 'none'}
                    sticky
                    className="border-r border-border bg-muted/30 align-middle [--sticky-tint:hsl(var(--muted)/0.3)] md:min-w-36"
                  >
                    <span className="block font-medium">{warehouse.name}</span>
                    {warehouse.location ? <span className="block text-xs text-muted-foreground">{warehouse.location}</span> : null}
                  </TableCell>
                )
                if (!warehouse.items.length) {
                  return (
                    <TableRow key={warehouse.id || 'none'} className="border-b-2 border-border">
                      {warehouseCell}
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No products
                      </TableCell>
                    </TableRow>
                  )
                }
                return (
                  <Fragment key={warehouse.id || 'none'}>
                    {warehouse.items.map((product, index) => {
                      const stockState = product.stockQty <= 0 ? 'out' : product.stockQty <= product.minStock ? 'low' : 'ok'
                      // On the product cells, not the row, so the merged warehouse cell keeps its own look.
                      const tone = cn(
                        stockState === 'out' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                        stockState === 'low' && 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                      )
                      return (
                        <TableRow key={product.id} data-product-id={product.id} data-stock-state={stockState}>
                          {index === 0 ? warehouseCell : null}
                          <TableCell className={cn('font-medium', tone)}>{product.name}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', tone)}>{product.stockQty}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', tone)}>{formatCurrency(product.purchasePrice)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', tone)}>{formatCurrency(product.stockQty * product.purchasePrice)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', tone)}>{product.minStock}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow data-row="subtotal" className="border-b-2 border-border font-semibold">
                      <TableCell className="text-muted-foreground">Subtotal</TableCell>
                      <TableCell className="text-right tabular-nums">{warehouse.units}</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">{formatCurrency(warehouse.value)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow data-row="grand-total" className="font-semibold">
                <TableCell colSpan={2}>Grand total</TableCell>
                <TableCell className="text-right tabular-nums">{warehouses.reduce((sum, warehouse) => sum + warehouse.units, 0)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{formatCurrency(warehouses.reduce((sum, warehouse) => sum + warehouse.value, 0))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Low and out of stock</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length ? (
              <dl className="space-y-1.5 text-sm">
                {lowStock.map((product) => (
                  <SummaryRow
                    key={product.id}
                    label={`${product.name} · ${data?.warehouses[product.warehouseId]?.name ?? 'No warehouse'}`}
                    value={`${product.stockQty} / min ${product.minStock}`}
                    tone={product.stockQty <= 0 ? 'danger' : undefined}
                  />
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Every product is above its minimum.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock out (sold)</CardTitle>
          </CardHeader>
          <CardContent>
            {soldToday.length ? (
              <dl className="space-y-1.5 text-sm">
                {soldToday.map((item) => (
                  <SummaryRow key={item.name} label={item.name} value={item.quantity} />
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing sold on this day.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Money in and out on one day, from orders and approved deposits, supplier payments and expenses. */
export function DailyClosingReport({ day }: { day: string }) {
  const { data } = useERP()

  const report = useMemo(() => {
    const orders = toArray(data?.orders).filter((order) => localDay(order.createdAt) === day)
    // Approved records count on the date entered on their form, not the day they were approved.
    const deposits = toArray(data?.deposits).filter((deposit) => deposit.status === 'approved' && localDay(deposit.date) === day)
    const payments = toArray(data?.supplierPayments).filter((payment) => payment.status === 'approved' && localDay(payment.date) === day)
    // Expenses entered on the finance page have no status and are already approved.
    const expenses = toArray(data?.expenses).filter((expense) => (!expense.status || expense.status === 'approved') && localDay(expense.date) === day)
    const sections: Array<Record<string, { status?: string }> | undefined> = [
      data?.orderRequests,
      data?.deposits,
      data?.supplierPayments,
      data?.expenses,
      data?.purchaseRequests,
      data?.ledgerEntryRequests,
      data?.changeRequests,
    ]
    const pending = sections.reduce((sum, section) => sum + Object.values(section ?? {}).filter((item) => item.status === 'pending').length, 0)

    const sales = orders.reduce((sum, order) => sum + order.total, 0)
    const orderPaid = orders.reduce((sum, order) => sum + order.paid, 0)
    const depositTotal = deposits.reduce((sum, deposit) => sum + deposit.amount, 0)
    const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)
    return {
      orders,
      sales,
      orderPaid,
      orderDue: orders.reduce((sum, order) => sum + order.due, 0),
      depositTotal,
      paymentTotal,
      expenseTotal,
      pending,
      moneyIn: orderPaid + depositTotal,
      moneyOut: paymentTotal + expenseTotal,
      depositsByMethod: sumBy(deposits, (deposit) => deposit.method, (deposit) => deposit.amount),
      paymentsByMethod: sumBy(payments, (payment) => (payment.method === 'bank' ? 'Bank' : 'Cash'), (payment) => payment.amount),
      expensesByCategory: sumBy(expenses, (expense) => expense.category, (expense) => expense.amount),
    }
  }, [data, day])

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Daily closing — {formatDate(day)}</h2>
          <p className="text-sm text-muted-foreground">{data?.settings.companyName}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(report.sales)} note={`${report.orders.length} order(s), ${formatCurrency(report.orderDue)} on due`} />
        <Stat label="Money in" value={formatCurrency(report.moneyIn)} note="Paid on orders + deposits" />
        <Stat label="Money out" value={formatCurrency(report.moneyOut)} note="Supplier payments + expenses" />
        <Stat label="Net" value={formatCurrency(report.moneyIn - report.moneyOut)} note={report.pending ? `${report.pending} still awaiting approval` : 'Nothing awaiting approval'} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <BreakdownCard title="Paid on orders" rows={report.orderPaid ? [['Collected with orders', report.orderPaid]] : []} total={report.orderPaid} />
        <BreakdownCard title="Deposits" rows={report.depositsByMethod} total={report.depositTotal} />
        <BreakdownCard title="Supplier payments" rows={report.paymentsByMethod} total={report.paymentTotal} />
        <BreakdownCard title="Expenses" rows={report.expensesByCategory} total={report.expenseTotal} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {report.orders.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Sold by</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.billNumber}</TableCell>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
                    <TableCell>{order.salesPersonName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(order.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(order.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(order.due)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No orders on this day.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const COURIER_STATUSES: CourierStatus[] = ['in-transit', 'delivered', 'returned', 'cod-collected']

/** Orders due for delivery, late deliveries, and courier parcels. */
export function DeliveryReport({ day }: { day: string }) {
  const { data } = useERP()

  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const parcels = useMemo(() => toArray(data?.couriers), [data?.couriers])
  const statuses = getOrderStatuses(data?.settings)
  const open = orders.filter((order) => order.status !== 'shipped' && !getOrderStatus(data?.settings, order.status).isFinal)
  const dueOnDay = orders.filter((order) => localDay(order.deliveryDate) === day)
  const late = open.filter((order) => localDay(order.deliveryDate) && localDay(order.deliveryDate) < day)
  const byCourier = sumBy(open, (order) => order.courierName ?? '', () => 1)
  const sentOnDay = parcels.filter((parcel) => localDay(parcel.sentDate) === day)

  const orderTable = (rows: typeof orders, empty: string) =>
    rows.length ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dealer</TableHead>
            <TableHead>Courier</TableHead>
            <TableHead>Delivery date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium">{order.customerName}</TableCell>
              <TableCell>{order.courierName || '—'}</TableCell>
              <TableCell>{formatDate(order.deliveryDate)}</TableCell>
              <TableCell>{getOrderStatus(data?.settings, order.status).label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(order.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statuses.map((status) => (
          <Stat key={status.id} label={`Orders ${status.label}`} value={orders.filter((order) => order.status === status.id).length} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deliveries due {formatDate(day)}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">{orderTable(dueOnDay, 'No deliveries due on this day.')}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Late deliveries</CardTitle>
          <CardDescription>Past their delivery date and not yet shipped.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">{orderTable(late, 'No late deliveries.')}</CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open orders by courier</CardTitle>
          </CardHeader>
          <CardContent>
            {byCourier.length ? (
              <dl className="space-y-1.5 text-sm">
                {byCourier.map(([courier, count]) => (
                  <SummaryRow key={courier} label={courier} value={count} />
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No open orders.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Courier parcels</CardTitle>
            <CardDescription>{sentOnDay.length} sent on this day.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              {COURIER_STATUSES.map((status) => {
                const items = parcels.filter((parcel) => parcel.status === status)
                return (
                  <SummaryRow
                    key={status}
                    label={status.replace('-', ' ')}
                    value={`${items.length} · COD ${formatCurrency(items.reduce((sum, parcel) => sum + parcel.codAmount, 0))}`}
                  />
                )
              })}
            </dl>
          </CardContent>
        </Card>
      </div>
      {!orders.length && !parcels.length ? <EmptyState text="No orders or parcels yet." /> : null}
    </div>
  )
}
