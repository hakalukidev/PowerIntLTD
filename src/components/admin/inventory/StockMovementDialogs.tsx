"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { todayInput } from '@/components/admin/approvals/shared'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import { formatWarehouseSplit, STOCK_ADJUSTMENT_REASONS, stockInWarehouse } from '@/lib/erp/stock'
import type { StockAdjustmentReason } from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects the product, e.g. when opened from a row of the inventory list. */
  productId?: string
  onDone: (message: string) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {children}
    </div>
  )
}

function useStockOptions() {
  const { data } = useERP()
  const warehouses = useMemo(() => toArray(data?.warehouses).sort((left, right) => left.name.localeCompare(right.name)), [data?.warehouses])
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((product) => ({ value: product.id, label: product.name, sublabel: `${product.sku} · ${formatWarehouseSplit(product, data?.warehouses) || 'no stock'}` })),
    [data?.products, data?.warehouses]
  )
  return { data, warehouses, productOptions }
}

function WarehousePicker({
  value,
  onChange,
  label,
  productId,
  exclude,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  productId: string
  exclude?: string
}) {
  const { data, warehouses } = useStockOptions()
  const product = productId ? data?.products[productId] : undefined
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder="Choose a warehouse" />
      </SelectTrigger>
      <SelectContent>
        {warehouses.map((warehouse) => (
          <SelectItem key={warehouse.id} value={warehouse.id} disabled={warehouse.id === exclude}>
            {warehouse.name}
            {product ? ` · ${stockInWarehouse(product, warehouse.id)} in stock` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** From warehouse → to warehouse, qty. Sent for the two-stage approval; the stock moves at the final one. */
export function StockTransferDialog({ open, onOpenChange, productId: initialProductId = '', onDone }: DialogProps) {
  const { data, productOptions } = useStockOptions()
  const { submitStockTransfer } = useERP()
  const [form, setForm] = useState({ productId: '', fromWarehouseId: '', toWarehouseId: '', quantity: '', date: todayInput(), note: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const product = initialProductId ? data?.products[initialProductId] : undefined
    setForm({ productId: initialProductId, fromWarehouseId: product?.warehouseId ?? '', toWarehouseId: '', quantity: '', date: todayInput(), note: '' })
    setError(null)
    // Only when it opens: later data changes must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProductId])

  const product = form.productId ? data?.products[form.productId] : undefined
  const available = product && form.fromWarehouseId ? stockInWarehouse(product, form.fromWarehouseId) : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await submitStockTransfer({
        productId: form.productId,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
        quantity: Number(form.quantity || 0),
        date: new Date(form.date || todayInput()).toISOString(),
        note: form.note,
      })
      onDone('Transfer sent for approval. The stock moves once the Authorizer and the Chairman approve it.')
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the transfer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>Move stock from one warehouse to another. Nothing moves until the Authorizer and the Chairman approve it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Product">
            <Combobox
              options={productOptions}
              value={form.productId}
              onChange={(value) => setForm((current) => ({ ...current, productId: value, fromWarehouseId: data?.products[value]?.warehouseId ?? '' }))}
              placeholder="Select product"
              searchPlaceholder="Search products..."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From warehouse">
              <WarehousePicker
                label="From warehouse"
                productId={form.productId}
                value={form.fromWarehouseId}
                exclude={form.toWarehouseId}
                onChange={(value) => setForm((current) => ({ ...current, fromWarehouseId: value }))}
              />
            </Field>
            <Field label="To warehouse">
              <WarehousePicker
                label="To warehouse"
                productId={form.productId}
                value={form.toWarehouseId}
                exclude={form.fromWarehouseId}
                onChange={(value) => setForm((current) => ({ ...current, toWarehouseId: value }))}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity">
              <Input type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
              {available !== null ? <p className="text-xs text-muted-foreground">{available} in the warehouse it leaves.</p> : null}
            </Field>
            <Field label="Transfer date">
              <DateInput value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} required />
            </Field>
          </div>
          <Field label="Note">
            <Textarea rows={2} value={form.note} placeholder="Optional" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
          </Field>
          {error ? <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send for approval'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const ADJUSTMENT_REASONS = (Object.keys(STOCK_ADJUSTMENT_REASONS) as StockAdjustmentReason[]).filter((reason) => reason !== 'opening')

/** A + or − change to one warehouse's stock, with a reason. Sent for the two-stage approval. */
export function StockAdjustmentDialog({ open, onOpenChange, productId: initialProductId = '', onDone }: DialogProps) {
  const { data, productOptions } = useStockOptions()
  const { submitStockAdjustment } = useERP()
  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    direction: 'add' as 'add' | 'remove',
    quantity: '',
    reason: 'count_correction' as StockAdjustmentReason,
    note: '',
    date: todayInput(),
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const product = initialProductId ? data?.products[initialProductId] : undefined
    setForm({ productId: initialProductId, warehouseId: product?.warehouseId ?? '', direction: 'add', quantity: '', reason: 'count_correction', note: '', date: todayInput() })
    setError(null)
    // Only when it opens: later data changes must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProductId])

  const product = form.productId ? data?.products[form.productId] : undefined
  const inWarehouse = product && form.warehouseId ? stockInWarehouse(product, form.warehouseId) : null
  const change = Number(form.quantity || 0) * (form.direction === 'remove' ? -1 : 1)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await submitStockAdjustment({
        productId: form.productId,
        reason: form.reason,
        lines: [{ warehouseId: form.warehouseId, quantity: change }],
        note: form.note,
        date: new Date(form.date || todayInput()).toISOString(),
      })
      onDone('Stock adjustment sent for approval. The stock changes once the Authorizer and the Chairman approve it.')
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the adjustment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stock adjustment</DialogTitle>
          <DialogDescription>Add or take off stock in one warehouse, with the reason. The stock changes once the Authorizer and the Chairman approve it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Product">
            <Combobox
              options={productOptions}
              value={form.productId}
              onChange={(value) => setForm((current) => ({ ...current, productId: value, warehouseId: data?.products[value]?.warehouseId ?? current.warehouseId }))}
              placeholder="Select product"
              searchPlaceholder="Search products..."
            />
          </Field>
          <Field label="Warehouse">
            <WarehousePicker label="Warehouse" productId={form.productId} value={form.warehouseId} onChange={(value) => setForm((current) => ({ ...current, warehouseId: value }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Change">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                <Select value={form.direction} onValueChange={(value) => setForm((current) => ({ ...current, direction: value as 'add' | 'remove' }))}>
                  <SelectTrigger aria-label="Add or remove" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">+ Add</SelectItem>
                    <SelectItem value="remove">− Remove</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" min="1" step="1" inputMode="numeric" aria-label="Quantity" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
              </div>
              {inWarehouse !== null ? (
                <p className="text-xs text-muted-foreground">
                  {inWarehouse} in this warehouse{form.quantity ? ` → ${inWarehouse + change} after approval` : ''}.
                </p>
              ) : null}
            </Field>
            <Field label="Reason">
              <Select value={form.reason} onValueChange={(value) => setForm((current) => ({ ...current, reason: value as StockAdjustmentReason }))}>
                <SelectTrigger aria-label="Reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {STOCK_ADJUSTMENT_REASONS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Date">
            <DateInput value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} required />
          </Field>
          <Field label="Note">
            <Textarea rows={2} value={form.note} placeholder="What was found, what happened" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} required />
          </Field>
          {error ? <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send for approval'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
