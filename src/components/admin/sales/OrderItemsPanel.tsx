"use client"

import { useState } from 'react'

import { OrderStatusBadge } from './OrderStatusesDialog'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { OrderRecord } from '@/lib/erp/types'
import { formatDate, getOrderStatus, getOrderStatuses, orderItemProgress, orderLineStates } from '@/lib/erp/utils'

/**
 * Next to the order's status: "1/2 delivered" while only some of its products are delivered,
 * "Mixed" when its products are on different statuses otherwise. Nothing for a uniform order.
 */
export function OrderProgressChip({ order }: { order: OrderRecord }) {
  const { data } = useERP()
  const progress = orderItemProgress(data?.settings, order)
  if (!progress.partial && !progress.mixed) return null
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap rounded-full border-dashed px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
      data-testid="order-progress"
    >
      {progress.partial ? `${progress.delivered}/${progress.total} delivered` : 'Mixed'}
    </Badge>
  )
}

/**
 * The products of one order, each with its own status and delivered date: a small table from
 * md up, a stacked list on phones. Users who may change order status change each product here.
 */
export function OrderItemsPanel({ order }: { order: OrderRecord }) {
  const { data, hasPermission, updateOrderItemStatus } = useERP()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const lines = orderLineStates(data?.settings, order)
  // Cancelling is for the whole order (from the invoice), so it is not offered per product.
  const choices = getOrderStatuses(data?.settings).filter((status) => !status.isCancelled)
  const orderCancelled = getOrderStatus(data?.settings, order.status).isCancelled || order.stockState === 'released'
  const canEdit = hasPermission('sales.edit') && !orderCancelled

  function change(index: number, status: string) {
    setError(null)
    setSaving(index)
    updateOrderItemStatus(order.id, index, status)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to change the status.'))
      .finally(() => setSaving(null))
  }

  function statusControl(index: number, productName: string) {
    const current = lines[index].status
    if (!canEdit) return <OrderStatusBadge status={current} />
    return (
      <Select value={current} onValueChange={(value) => change(index, value)} disabled={saving !== null}>
        <SelectTrigger className="h-8 w-full min-w-0 md:w-40" aria-label={`Status of ${productName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* A product on a status that was removed (or that cancels) still shows it until moved. */}
          {choices.some((status) => status.id === current) ? null : (
            <SelectItem value={current}>{getOrderStatus(data?.settings, current).label}</SelectItem>
          )}
          {choices.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const deliveredText = (index: number) => {
    const date = lines[index].deliveredAt
    return date ? formatDate(date) : 'Not delivered'
  }

  return (
    <div className="space-y-2" data-testid={`order-items-${order.id}`}>
      <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivered date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item, index) => (
              <TableRow key={`${item.productId}-${index}`} data-testid="order-item-row">
                <TableCell className="font-medium">{item.productName}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell>{statusControl(index, item.productName)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{deliveredText(index)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {order.items.map((item, index) => (
          <li key={`${item.productId}-${index}`} className="space-y-2 rounded-xl border border-border/70 bg-card p-3" data-testid="order-item-card">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words font-medium">{item.productName}</p>
              <p className="shrink-0 text-muted-foreground">Qty {item.quantity}</p>
            </div>
            {statusControl(index, item.productName)}
            <p className="text-xs text-muted-foreground">Delivered: {deliveredText(index)}</p>
          </li>
        ))}
      </ul>

      {orderCancelled ? <p className="text-xs text-muted-foreground">This order is cancelled. Its status changes for the whole order only.</p> : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  )
}
