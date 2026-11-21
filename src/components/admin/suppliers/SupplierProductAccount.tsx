"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import { computeSupplierProductAccount, formatCurrency, formatDate, type SupplierProductAccountRow } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

/** `row` edits an existing product line; without it a new product is added. */
function SupplierProductTermDialog({
  supplierId,
  row,
  onOpenChange,
}: {
  supplierId: string
  row: SupplierProductAccountRow | null
  onOpenChange: (open: boolean) => void
}) {
  const { saveSupplierProductTerm, data } = useERP()
  const currency = data?.settings.currency
  const [productName, setProductName] = useState(row?.productName ?? '')
  const [startDate, setStartDate] = useState(row?.term?.startDate ?? '')
  const [supplyValue, setSupplyValue] = useState(row?.term?.supplyValue ? String(row.term.supplyValue) : '')
  const [notes, setNotes] = useState(row?.term?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await saveSupplierProductTerm({
        id: row?.term?.id,
        supplierId,
        productId: row?.productId || undefined,
        productName,
        startDate,
        supplyValue: Number(supplyValue) || 0,
        notes,
      })
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (saving ? null : onOpenChange(open))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? row.productName : 'Add supplier product'}</DialogTitle>
          <DialogDescription>Join date, promised supply value, and notes for this product. Quantity, price and payable come from purchases and payments.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {row ? null : (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Product name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. 12V 100Ah battery" required />
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Join date</p>
            <DateInput value={startDate} onChange={setStartDate} />
            <p className="text-xs text-muted-foreground">
              The day supply of this product started.{row?.firstPurchaseDate ? ` Left empty, the first purchase date (${formatDate(row.firstPurchaseDate)}) is shown.` : ''}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Supply value {currency ? `(${currency})` : ''}</p>
            <Input type="number" min="0" step="any" inputMode="decimal" value={supplyValue} onChange={(event) => setSupplyValue(event.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">Total value of the products the supplier has promised to supply.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Notes</p>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Delivery schedule, terms, remarks" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The supplier's product-by-product account on the details dialog: 7 columns from join date to payable. */
export function SupplierProductAccount({ supplierId }: { supplierId: string }) {
  const { data, hasPermission, deleteSupplierProductTerm } = useERP()
  const canEdit = hasPermission('suppliers.edit') || hasPermission('suppliers.create')
  const canDelete = hasPermission('suppliers.delete')
  const currency = data?.settings.currency
  const { rows, unpaidOpeningDue } = useMemo(() => computeSupplierProductAccount(data, supplierId), [data, supplierId])
  const [editing, setEditing] = useState<{ key: number; row: SupplierProductAccountRow | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totals = rows.reduce(
    (sum, row) => ({
      supplyValue: sum.supplyValue + (row.term?.supplyValue ?? 0),
      quantity: sum.quantity + row.quantity,
      purchaseTotal: sum.purchaseTotal + row.purchaseTotal,
      payable: sum.payable + row.payable,
    }),
    { supplyValue: 0, quantity: 0, purchaseTotal: 0, payable: 0 }
  )

  async function handleDelete(row: SupplierProductAccountRow) {
    if (!row.term || !window.confirm(`Remove the join date, supply value and notes saved for ${row.productName}?`)) return
    setError(null)
    try {
      await deleteSupplierProductTerm(row.term.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pt-1 text-xs font-medium text-muted-foreground">Product details ({rows.length})</p>
        {canEdit ? (
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing({ key: Date.now(), row: null })}>
            <Plus className="mr-1 h-4 w-4" />
            Add product
          </Button>
        ) : null}
      </div>

      {rows.length ? (
        <div className="max-h-96 overflow-auto rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Join date</TableHead>
                <TableHead>Product name</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Supply value</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Purchase price</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                {canEdit || canDelete ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const joinDate = row.term?.startDate || row.firstPurchaseDate
                return (
                  <TableRow key={row.key}>
                    <TableCell className="whitespace-nowrap">{joinDate ? formatDate(joinDate) : '—'}</TableCell>
                    <TableCell className="min-w-36 font-medium">{row.productName}</TableCell>
                    <TableCell className="min-w-40 max-w-64 whitespace-pre-line text-xs text-muted-foreground">{row.term?.notes || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.term?.supplyValue ? formatCurrency(row.term.supplyValue, currency) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.quantity.toLocaleString('en-BD')} pcs</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.quantity ? formatCurrency(row.unitPrice, currency) : '—'}</TableCell>
                    <TableCell className={cn('whitespace-nowrap text-right font-medium', row.payable > 0 && 'text-rose-600 dark:text-rose-400')}>
                      {formatCurrency(row.payable, currency)}
                    </TableCell>
                    {canEdit || canDelete ? (
                      <TableCell className="whitespace-nowrap text-right">
                        {canEdit ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ key: Date.now(), row })} aria-label={`Edit ${row.productName}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canDelete && row.term ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(row)}
                            aria-label={`Remove saved terms for ${row.productName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
              {unpaidOpeningDue > 0 ? (
                <TableRow>
                  <TableCell />
                  <TableCell className="font-medium">Opening due</TableCell>
                  <TableCell className="text-xs text-muted-foreground">Owed before purchases were recorded here</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="whitespace-nowrap text-right font-medium text-rose-600 dark:text-rose-400">{formatCurrency(unpaidOpeningDue, currency)}</TableCell>
                  {canEdit || canDelete ? <TableCell /> : null}
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="whitespace-nowrap text-right">{formatCurrency(totals.supplyValue, currency)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{totals.quantity.toLocaleString('en-BD')} pcs</TableCell>
                <TableCell className="whitespace-nowrap text-right">{totals.quantity ? formatCurrency(totals.purchaseTotal / totals.quantity, currency) : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{formatCurrency(totals.payable + unpaidOpeningDue, currency)}</TableCell>
                {canEdit || canDelete ? <TableCell /> : null}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No products yet. Add one, or record a purchase from this supplier.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Purchase price is the average per piece (purchase total ÷ quantity). Payable: payments clear the opening due first, then purchases oldest first.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {editing ? (
        <SupplierProductTermDialog key={editing.key} supplierId={supplierId} row={editing.row} onOpenChange={(open) => (open ? null : setEditing(null))} />
      ) : null}
    </div>
  )
}
