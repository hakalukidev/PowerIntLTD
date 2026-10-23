"use client"

import { useState, type ReactNode } from 'react'
import { History, PencilLine } from 'lucide-react'

import { ProductImage, statusBadgeClass, statusLabel, unitsLabel } from './productDisplay'
import { StockHistory } from './StockHistory'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useERP } from '@/lib/erp/provider'
import { onHandTotal, warehouseSplit } from '@/lib/erp/stock'
import { formatDateTime, formatTableAmount, getProductStatus } from '@/lib/erp/utils'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground sm:text-xs">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Everything about one product, opened from its row in the inventory list. Stock is what is on the
 * shelves (units held for approved orders included), valued at purchase cost, as in the warehouse report.
 */
export function ProductDetailsDialog({
  productId,
  open,
  onOpenChange,
  onEdit,
}: {
  productId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shown as an Edit button when given. */
  onEdit?: (productId: string) => void
}) {
  const { data } = useERP()
  // The history is read only once asked for, and for the product it was asked for.
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const product = productId ? data?.products[productId] : undefined
  const currency = data?.settings.currency ?? 'BDT'

  return (
    <Dialog open={open && Boolean(product)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-product-details>
        {product ? (() => {
          const status = getProductStatus(product.stockQty, product.minStock)
          const onShelves = onHandTotal(product)
          const held = product.reservedQty ?? 0
          const split = warehouseSplit(product, data?.warehouses)
          const supplier = data?.suppliers[product.supplierId]
          const mainWarehouse = data?.warehouses[product.warehouseId]

          return (
            <>
              <DialogHeader>
                <DialogTitle className="break-words pr-6">{product.name}</DialogTitle>
                <DialogDescription>Product details and stock in each warehouse.</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-5 sm:flex-row">
                <ProductImage src={product.imageUrl} alt={product.name} className="h-28 w-28 self-center rounded-2xl text-[10px] sm:h-48 sm:w-48 sm:self-start sm:text-xs" />
                <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
                  <Detail label="Model / SKU">{product.sku || '—'}</Detail>
                  <Detail label="Category">{product.category || 'General equipment'}</Detail>
                  {product.serialNumber ? <Detail label="Serial number">{product.serialNumber}</Detail> : null}
                  <Detail label="Supplier">{supplier?.name ?? 'Not assigned'}</Detail>
                  <Detail label="Warranty">{product.warrantyMonths ? `${product.warrantyMonths} months` : 'None'}</Detail>
                  <Detail label="Main warehouse">{mainWarehouse?.name ?? 'None'}</Detail>
                  <Detail label="Status">
                    <Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge>
                  </Detail>
                  <Detail label="Updated">{formatDateTime(product.updatedAt)}</Detail>
                </dl>
              </div>

              <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-3">
                <Detail label={`Purchase cost (${currency})`}>
                  <span data-detail="purchase-cost">{formatTableAmount(product.purchasePrice, currency)}</span>
                </Detail>
                <Detail label={`Selling price (${currency})`}>
                  <span data-detail="selling-price">{formatTableAmount(product.sellingPrice, currency)}</span>
                </Detail>
                <Detail label="Total units">
                  <span data-detail="total-units">{unitsLabel(onShelves)}</span>
                  {held ? <span className="block text-xs font-normal text-muted-foreground">{product.stockQty} available · {held} held for orders</span> : null}
                </Detail>
                <Detail label={`Stock value at cost (${currency})`}>
                  <span data-detail="stock-value">{formatTableAmount(onShelves * product.purchasePrice, currency)}</span>
                </Detail>
                <Detail label="Low-stock level">
                  <span data-detail="min-stock">{unitsLabel(product.minStock)}</span>
                </Detail>
                {product.maxStock ? <Detail label="Maximum stock">{unitsLabel(product.maxStock)}</Detail> : null}
              </dl>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Stock by warehouse</p>
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <table className="w-full text-sm" data-product-warehouses>
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Warehouse</th>
                        <th className="px-3 py-2 text-right font-medium">Units</th>
                        <th className="px-3 py-2 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {split.map((entry) => (
                        <tr key={entry.id} className="border-t border-border/70" data-warehouse-id={entry.id}>
                          <td className="break-words px-3 py-2">
                            {entry.name}
                            {entry.id === product.warehouseId ? <span className="ml-1.5 text-xs text-muted-foreground">(main)</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{entry.quantity}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatTableAmount(entry.quantity * product.purchasePrice, currency)}</td>
                        </tr>
                      ))}
                      {!split.length ? (
                        <tr className="border-t border-border/70">
                          <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No stock in any warehouse.</td>
                        </tr>
                      ) : null}
                    </tbody>
                    {split.length ? (
                      <tfoot>
                        <tr className="border-t border-border/70 bg-muted/30 font-semibold" data-total>
                          <td className="px-3 py-2">Total</td>
                          <td className="px-3 py-2 text-right tabular-nums">{onShelves}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatTableAmount(onShelves * product.purchasePrice, currency)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>

              <div className="space-y-2" data-product-history>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Stock history</p>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setHistoryFor(historyFor === product.id ? null : product.id)}>
                    <History className="mr-2 h-4 w-4" />
                    {historyFor === product.id ? 'Hide stock history' : 'Show stock history'}
                  </Button>
                </div>
                {historyFor === product.id ? <StockHistory productId={product.id} /> : null}
              </div>

              <DialogFooter className="gap-2">
                {onEdit ? (
                  <Button type="button" variant="outline" onClick={() => onEdit(product.id)}>
                    <PencilLine className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                ) : null}
                <Button type="button" onClick={() => onOpenChange(false)}>Close</Button>
              </DialogFooter>
            </>
          )
        })() : null}
      </DialogContent>
    </Dialog>
  )
}
