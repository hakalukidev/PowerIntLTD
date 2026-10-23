"use client"

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, RefreshCw } from 'lucide-react'

import { todayInput } from '@/components/admin/approvals/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { fetchAllStockHistory, fetchStockHistory, STOCK_MOVEMENT_TYPES, type StockHistoryCursor, type StockHistoryFilter } from '@/lib/erp/stockHistory'
import type { StockMovementRecord, StockMovementType } from '@/lib/erp/types'
import { exportXlsx, formatDate, formatDateTime, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const ANY = 'all'

/** `YYYY-MM-DD`, `days` before today. */
function daysAgoInput(days: number) {
  const date = new Date(`${todayInput()}T00:00:00`)
  date.setDate(date.getDate() - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function typeBadgeClass(type: StockMovementType) {
  if (type === 'purchase' || type === 'opening' || type === 'starting_balance') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300'
  }
  if (type === 'transfer_in' || type === 'transfer_out') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-500/30 dark:text-sky-300'
  }
  if (type === 'sale' || type === 'return') {
    return 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-500/30 dark:text-violet-300'
  }
  if (type === 'damage') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:text-rose-300'
  }
  return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-300'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/**
 * The stock history: every change to a warehouse's count, newest first, read only while this is on
 * screen. Filters for warehouse, product, type and dates (default: the last 30 days), a page at a
 * time, and an Excel export of everything the filters match. `productId` / `warehouseId` fix that
 * filter (the product dialog, a warehouse's History) and hide it.
 */
export function StockHistory({ productId, warehouseId, className }: { productId?: string; warehouseId?: string; className?: string }) {
  const { data } = useERP()
  const [filter, setFilter] = useState<StockHistoryFilter>(() => ({
    productId: productId ?? '',
    warehouseId: warehouseId ?? '',
    type: '',
    from: daysAgoInput(30),
    to: todayInput(),
  }))
  const [rows, setRows] = useState<StockMovementRecord[]>([])
  const [next, setNext] = useState<StockHistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)

  const productOptions = useMemo(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((product) => ({ value: product.id, label: product.name, sublabel: product.sku })),
    [data?.products]
  )
  const warehouses = useMemo(() => toArray(data?.warehouses).sort((left, right) => left.name.localeCompare(right.name)), [data?.warehouses])

  useEffect(() => {
    let current = true
    setLoading(true)
    setError(null)
    fetchStockHistory(filter, null)
      .then((page) => {
        if (!current) return
        setRows(page.rows)
        setNext(page.next)
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : 'Could not load the stock history.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [filter, reloads])

  async function loadOlder() {
    if (!next) return
    setLoading(true)
    try {
      const page = await fetchStockHistory(filter, next)
      setRows((current) => [...current, ...page.rows])
      setNext(page.next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the stock history.')
    } finally {
      setLoading(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const all = await fetchAllStockHistory(filter)
      await exportXlsx(
        `stock-history-${filter.from || 'start'}-to-${filter.to || todayInput()}.xlsx`,
        'Stock history',
        ['Date', 'Product', 'Warehouse', 'Type', 'Change', 'Balance after', 'Reference', 'By', 'Recorded at'],
        all.map((row) => [
          formatDate(row.date),
          row.productName,
          row.warehouseName,
          STOCK_MOVEMENT_TYPES[row.type] ?? row.type,
          row.change,
          row.balance,
          row.refLabel,
          row.byName,
          formatDateTime(row.createdAt),
        ])
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not export the stock history.')
    } finally {
      setExporting(false)
    }
  }

  const change = (patch: Partial<StockHistoryFilter>) => setFilter((current) => ({ ...current, ...patch }))
  const showProduct = !productId
  const showWarehouse = !warehouseId
  const columns = 6 + (showProduct ? 1 : 0) + (showWarehouse ? 1 : 0)

  return (
    <div className={cn('space-y-3', className)} data-stock-history>
      <div className={cn('grid gap-3 sm:grid-cols-2', showProduct && showWarehouse ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {showProduct ? (
          <Field label="Product">
            <div className="flex gap-1.5" data-history-filter="product">
              <Combobox
                options={productOptions}
                value={filter.productId}
                onChange={(value) => change({ productId: value })}
                placeholder="All products"
                searchPlaceholder="Search products..."
                className="min-w-0 flex-1"
              />
              {filter.productId ? (
                <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => change({ productId: '' })}>
                  All
                </Button>
              ) : null}
            </div>
          </Field>
        ) : null}
        {showWarehouse ? (
          <Field label="Warehouse">
            <Select value={filter.warehouseId || ANY} onValueChange={(value) => change({ warehouseId: value === ANY ? '' : value })}>
              <SelectTrigger className="w-full" aria-label="Warehouse">
                <SelectValue placeholder="All warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All warehouses</SelectItem>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label="Type">
          <Select value={filter.type || ANY} onValueChange={(value) => change({ type: value === ANY ? '' : (value as StockMovementType) })}>
            <SelectTrigger className="w-full" aria-label="Type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {(Object.entries(STOCK_MOVEMENT_TYPES) as Array<[StockMovementType, string]>).map(([type, label]) => (
                <SelectItem key={type} value={type}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="From">
          <DateInput value={filter.from} onChange={(value) => change({ from: value })} max={filter.to || undefined} />
        </Field>
        <Field label="To">
          <DateInput value={filter.to} onChange={(value) => change({ to: value })} min={filter.from || undefined} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" data-history-count>
          {loading && !rows.length ? 'Loading…' : `${rows.length}${next ? '+' : ''} movement${rows.length === 1 ? '' : 's'}${filter.from || filter.to ? ` from ${filter.from ? formatDate(filter.from) : 'the start'} to ${filter.to ? formatDate(filter.to) : 'today'}` : ''}`}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setReloads((count) => count + 1)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void exportExcel()} disabled={exporting || (!rows.length && !next)}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:text-rose-300">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-border/70">
        <div className="overflow-x-auto">
          <Table data-stock-history-table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                {showProduct ? <TableHead>Product</TableHead> : null}
                {showWarehouse ? <TableHead>Warehouse</TableHead> : null}
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-movement-id={row.id} data-movement-type={row.type} data-warehouse-id={row.warehouseId}>
                  <TableCell className="whitespace-nowrap" title={`Recorded ${formatDateTime(row.createdAt)}`}>{formatDate(row.date)}</TableCell>
                  {showProduct ? <TableCell className="min-w-[10rem]">{row.productName}</TableCell> : null}
                  {showWarehouse ? <TableCell className="min-w-[8rem]">{row.warehouseName}</TableCell> : null}
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap', typeBadgeClass(row.type))}>{STOCK_MOVEMENT_TYPES[row.type] ?? row.type}</Badge>
                  </TableCell>
                  <TableCell
                    data-cell="change"
                    className={cn('text-right font-semibold tabular-nums', row.change > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}
                  >
                    {row.change > 0 ? `+${row.change}` : row.change}
                  </TableCell>
                  <TableCell data-cell="balance" className="text-right tabular-nums">{row.balance}</TableCell>
                  <TableCell className="min-w-[9rem]">{row.refLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.byName}</TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">No stock movements for these filters.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>

      {next ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void loadOlder()} disabled={loading}>
            {loading ? 'Loading…' : 'Load older'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
