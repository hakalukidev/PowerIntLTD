"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { SupplierReturnDirection, SupplierReturnRecord } from '@/lib/erp/types'
import { computeSupplierReturns, dayKey, formatDate, partyCode, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export const supplierReturnDirectionLabels: Record<SupplierReturnDirection, string> = {
  sent: 'Returned to supplier',
  received: 'Replacement received',
}

function directionToneClass(direction: SupplierReturnDirection) {
  return direction === 'sent'
    ? 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
    : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

/** Badge for how many products a supplier still owes as replacement. */
export function PendingReplaceBadge({ pending }: { pending: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full',
        pending > 0
          ? 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
          : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
      )}
    >
      {pending > 0 ? `${pending.toLocaleString('en-BD')} to receive` : 'Nothing due'}
    </Badge>
  )
}

/** Form for one return sheet line. `supplierId` fixes the supplier; without it the user picks one. */
export function SupplierReturnEntryDialog({
  open,
  onOpenChange,
  supplierId,
  initialDirection = 'sent',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId?: string
  initialDirection?: SupplierReturnDirection
}) {
  const { data, saveSupplierReturn } = useERP()
  const suppliers = useMemo(() => toArray(data?.suppliers).sort((left, right) => left.name.localeCompare(right.name)), [data?.suppliers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const [selectedSupplierId, setSelectedSupplierId] = useState(supplierId ?? '')
  const [direction, setDirection] = useState<SupplierReturnDirection>(initialDirection)
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [date, setDate] = useState(() => dayKey())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const activeSupplierId = supplierId ?? selectedSupplierId
  const supplier = data?.suppliers[activeSupplierId]
  // This supplier's own products come first in the suggestions.
  const productOptions = useMemo(() => {
    const own = products.filter((product) => product.supplierId === activeSupplierId).map((product) => product.name)
    return Array.from(new Set([...(supplier?.suppliedProducts ?? []), ...own, ...products.map((product) => product.name)].filter(Boolean)))
  }, [activeSupplierId, products, supplier?.suppliedProducts])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      const typed = productName.trim().toLowerCase()
      const product = products.find((item) => item.name.toLowerCase() === typed)
      await saveSupplierReturn({
        supplierId: activeSupplierId,
        direction,
        productId: product?.id,
        productName,
        quantity: Number(quantity),
        date,
        note,
      })
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the entry.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add product return entry</DialogTitle>
          <DialogDescription>
            Record faulty products returned to a supplier, or replacements the supplier sent back.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Supplier</p>
            {supplierId ? (
              <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm font-medium">{supplier?.name ?? 'Supplier'}</p>
            ) : (
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name} ({partyCode(item)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Entry type</p>
            <Select value={direction} onValueChange={(value) => setDirection(value as SupplierReturnDirection)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sent">Returned to supplier (we gave)</SelectItem>
                <SelectItem value="received">Replacement received (we got back)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Product</p>
            <Input
              list="supplier-return-product-options"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Pick or type a product"
              required
            />
            <datalist id="supplier-return-product-options">
              {productOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Quantity</p>
              <Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Date</p>
              <DateInput value={date} onChange={setDate} required />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Problem, challan no, courier..." />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save entry'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One supplier's return and replace history, shown inside the supplier details dialog. */
export function SupplierReturnSection({ supplierId }: { supplierId: string }) {
  const { data, deleteSupplierReturn, hasPermission } = useERP()
  const canAdd = hasPermission('suppliers.edit') || hasPermission('suppliers.create')
  const canDelete = hasPermission('suppliers.delete')
  const entries = useMemo(
    () =>
      toArray(data?.supplierReturns)
        .filter((item) => item.supplierId === supplierId)
        .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)),
    [data?.supplierReturns, supplierId]
  )
  const summary = useMemo(() => computeSupplierReturns(data)[supplierId] ?? { sent: 0, received: 0, pending: 0 }, [data, supplierId])
  // Still due from the supplier, product by product.
  const pendingByProduct = useMemo(() => {
    const totals = new Map<string, { name: string; sent: number; received: number }>()
    entries.forEach((item) => {
      const key = item.productId || item.productName.toLowerCase()
      const row = totals.get(key) ?? { name: item.productName, sent: 0, received: 0 }
      row[item.direction] += item.quantity
      totals.set(key, row)
    })
    return Array.from(totals.values()).filter((row) => row.sent > row.received)
  }, [entries])
  const [entryDialog, setEntryDialog] = useState<{ key: number; direction: SupplierReturnDirection } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(item: SupplierReturnRecord) {
    setError(null)
    try {
      await deleteSupplierReturn(item.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the entry.')
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product return &amp; replace</p>
        {canAdd ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEntryDialog({ key: Date.now(), direction: 'sent' })}>
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Return given
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEntryDialog({ key: Date.now(), direction: 'received' })}>
              <ArrowDownLeft className="mr-1 h-4 w-4" />
              Replace received
            </Button>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Returned to supplier</p>
          <p className="mt-0.5 font-semibold">{summary.sent.toLocaleString('en-BD')}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Replace received</p>
          <p className="mt-0.5 font-semibold">{summary.received.toLocaleString('en-BD')}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Replace due</p>
          <p className={cn('mt-0.5 font-semibold', summary.pending > 0 && 'text-rose-600 dark:text-rose-400')}>
            {summary.pending.toLocaleString('en-BD')}
          </p>
        </div>
      </div>
      {pendingByProduct.length ? (
        <p className="text-xs text-muted-foreground">
          Still to receive: {pendingByProduct.map((row) => `${row.name} × ${row.sent - row.received}`).join(', ')}
        </p>
      ) : null}
      {entries.length ? (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Note</TableHead>
                {canDelete ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap rounded-full', directionToneClass(item.direction))}>
                      {supplierReturnDirectionLabels[item.direction]}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell className="text-right font-medium">{item.quantity.toLocaleString('en-BD')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.note || '—'}</TableCell>
                  {canDelete ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(item)}
                        aria-label={`Delete return entry for ${item.productName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No product returns recorded for this supplier yet.</p>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {entryDialog ? (
        <SupplierReturnEntryDialog
          key={entryDialog.key}
          open
          onOpenChange={(open) => (open ? null : setEntryDialog(null))}
          supplierId={supplierId}
          initialDirection={entryDialog.direction}
        />
      ) : null}
    </div>
  )
}

/** The return sheet on Suppliers (CRM): one row per supplier with what was given, received, and still due. */
export function SupplierReturnSheet({ onOpenSupplier }: { onOpenSupplier: (supplierId: string) => void }) {
  const { data, hasPermission } = useERP()
  const canAdd = hasPermission('suppliers.edit') || hasPermission('suppliers.create')
  const [query, setQuery] = useState('')
  const [onlyPending, setOnlyPending] = useState<'all' | 'pending'>('all')
  const [entryDialogKey, setEntryDialogKey] = useState<number | null>(null)
  const summary = useMemo(() => computeSupplierReturns(data), [data])

  const rows = useMemo(() => {
    const lastDates: Record<string, string> = {}
    toArray(data?.supplierReturns).forEach((item) => {
      if (!lastDates[item.supplierId] || item.date > lastDates[item.supplierId]) lastDates[item.supplierId] = item.date
    })
    const normalizedQuery = query.trim().toLowerCase()

    return toArray(data?.suppliers)
      .map((supplier) => ({
        supplier,
        totals: summary[supplier.id] ?? { sent: 0, received: 0, pending: 0 },
        lastDate: lastDates[supplier.id] ?? '',
      }))
      .filter(
        ({ supplier, totals }) =>
          (onlyPending === 'all' || totals.pending > 0) &&
          (!normalizedQuery || [partyCode(supplier), supplier.name, supplier.company, supplier.phone].join(' ').toLowerCase().includes(normalizedQuery))
      )
      .sort((left, right) => right.totals.pending - left.totals.pending || right.totals.sent - left.totals.sent || left.supplier.name.localeCompare(right.supplier.name))
  }, [data?.supplierReturns, data?.suppliers, onlyPending, query, summary])

  const totals = useMemo(
    () =>
      Object.values(summary).reduce(
        (sum, row) => ({ sent: sum.sent + row.sent, received: sum.received + row.received, pending: sum.pending + row.pending }),
        { sent: 0, received: 0, pending: 0 }
      ),
    [summary]
  )

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Product return sheet</CardTitle>
          <CardDescription>
            Returned to suppliers: {totals.sent.toLocaleString('en-BD')} · Replacements received: {totals.received.toLocaleString('en-BD')} · Still
            due: {totals.pending.toLocaleString('en-BD')}
          </CardDescription>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(200px,1fr)_170px_auto]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search return sheet" />
          </div>
          <Select value={onlyPending} onValueChange={(value) => setOnlyPending(value as typeof onlyPending)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              <SelectItem value="pending">Replace due only</SelectItem>
            </SelectContent>
          </Select>
          {canAdd ? (
            <Button onClick={() => setEntryDialogKey(Date.now())} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Add return entry
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead sticky>Supplier</TableHead>
                <TableHead className="text-right">Returned to supplier</TableHead>
                <TableHead className="text-right">Replace received</TableHead>
                <TableHead>Replace due</TableHead>
                <TableHead>Last entry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ supplier, totals: rowTotals, lastDate }) => (
                <TableRow
                  key={supplier.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => onOpenSupplier(supplier.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onOpenSupplier(supplier.id)
                  }}
                >
                  <TableCell sticky>
                    <p className="font-semibold">{supplier.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground md:text-xs">{partyCode(supplier)}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium">{rowTotals.sent.toLocaleString('en-BD')}</TableCell>
                  <TableCell className="text-right font-medium">{rowTotals.received.toLocaleString('en-BD')}</TableCell>
                  <TableCell><PendingReplaceBadge pending={rowTotals.pending} /></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{lastDate ? formatDate(lastDate) : '—'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No suppliers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {entryDialogKey ? (
        <SupplierReturnEntryDialog key={entryDialogKey} open onOpenChange={(open) => (open ? null : setEntryDialogKey(null))} />
      ) : null}
    </Card>
  )
}
