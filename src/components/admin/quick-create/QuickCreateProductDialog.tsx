"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useERP } from '@/lib/erp/provider'
import { toArray } from '@/lib/erp/utils'

import { QuickCreateSupplierDialog } from './QuickCreateSupplierDialog'
import { QuickCreateWarehouseDialog } from './QuickCreateWarehouseDialog'

const SUPPLIER_NONE = '__none__'

type QuickCreateProductDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (productId: string) => void
}

export function QuickCreateProductDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateProductDialogProps) {
  const { data, saveProduct } = useERP()
  const warehouses = useMemo(() => toArray(data?.warehouses), [data?.warehouses])
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])

  const [name, setName] = useState(initialName)
  const [sku, setSku] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [supplierId, setSupplierId] = useState(SUPPLIER_NONE)
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [sellingPrice, setSellingPrice] = useState('')
  const [stockQty, setStockQty] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [quickCreateWarehouseOpen, setQuickCreateWarehouseOpen] = useState(false)
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false)
  const [pendingSearchText, setPendingSearchText] = useState('')

  useEffect(() => {
    if (open) {
      setName(initialName)
      setSku('')
      setWarehouseId('')
      setSupplierId(SUPPLIER_NONE)
      setPurchasePrice('0')
      setSellingPrice('')
      setStockQty('0')
      setMinStock('0')
      setFeedback(null)
    }
  }, [open, initialName])

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name, sublabel: warehouse.location })),
    [warehouses]
  )

  const supplierOptions: ComboboxOption[] = useMemo(
    () => [
      { value: SUPPLIER_NONE, label: 'Not assigned' },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, sublabel: supplier.phone })),
    ],
    [suppliers]
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!warehouseId) {
      setFeedback('Select a warehouse for this product.')
      return
    }

    setSaving(true)

    try {
      const productId = await saveProduct({
        name,
        sku,
        category: '',
        warehouseId,
        supplierId: supplierId === SUPPLIER_NONE ? undefined : supplierId,
        purchasePrice: Number(purchasePrice || 0),
        sellingPrice: Number(sellingPrice || 0),
        stockQty: Number(stockQty || 0),
        minStock: Number(minStock || 0),
      })
      onCreated(productId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new product</DialogTitle>
            <DialogDescription>
              Use the essential fields only. Category, serial number, and images can be added later from Inventory.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Product name<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Two Post Service Lift" autoFocus required />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Model / SKU<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="TLT240SB" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Warehouse<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Combobox
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="Select warehouse"
                  searchPlaceholder="Search warehouses..."
                  onCreateNew={(typedText) => {
                    setPendingSearchText(typedText)
                    setQuickCreateWarehouseOpen(true)
                  }}
                  createNewLabel="Create warehouse"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Supplier</p>
                <Combobox
                  options={supplierOptions}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Select supplier"
                  searchPlaceholder="Search suppliers..."
                  onCreateNew={(typedText) => {
                    setPendingSearchText(typedText)
                    setQuickCreateSupplierOpen(true)
                  }}
                  createNewLabel="Create supplier"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Purchase cost</p>
                <Input inputMode="numeric" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="330000" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Selling price<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input inputMode="numeric" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} placeholder="350000" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Opening stock</p>
                <Input type="number" min="0" value={stockQty} onChange={(event) => setStockQty(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Minimum stock</p>
                <Input type="number" min="0" value={minStock} onChange={(event) => setMinStock(event.target.value)} required />
              </div>
            </div>
            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Create product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QuickCreateWarehouseDialog
        open={quickCreateWarehouseOpen}
        onOpenChange={setQuickCreateWarehouseOpen}
        initialName={pendingSearchText}
        onCreated={(newWarehouseId) => setWarehouseId(newWarehouseId)}
      />
      <QuickCreateSupplierDialog
        open={quickCreateSupplierOpen}
        onOpenChange={setQuickCreateSupplierOpen}
        initialName={pendingSearchText}
        onCreated={(newSupplierId) => setSupplierId(newSupplierId)}
      />
    </>
  )
}
