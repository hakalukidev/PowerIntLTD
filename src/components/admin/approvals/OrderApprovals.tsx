"use client"

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { OrderRequestRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { approvalStage, canActAtStage, formatCurrency, formatDate, partyCode, shortRecordId, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'

import {
  ApprovalStageNote,
  EditHistory,
  EmptyState,
  FeedbackBanner,
  NotifyButtons,
  StatusPill,
  SubmittedBy,
  SummaryRow,
  localDay,
  todayInput,
  type Feedback,
} from './shared'

function orderMessage(request: OrderRequestRecord, companyName: string) {
  const lines = request.items.map((item) => `${item.productName} x ${item.quantity}`).join(', ')
  return [
    `Dear ${request.customerName}, your order has been confirmed by ${companyName}.`,
    `Items: ${lines}.`,
    `Total: ${request.total.toLocaleString()} BDT, paid ${request.paid.toLocaleString()}, due ${request.due.toLocaleString()}.`,
    `Delivery: ${formatDate(request.deliveryDate)}${request.courierName ? ` by ${request.courierName}` : ''}.`,
  ].join('\n')
}

export function OrderApprovals({ isAdmin }: { isAdmin: boolean }) {
  const { data, reviewOrderRequest } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrderRequestRecord | null>(null)

  const requests = useMemo(() => sortByCreatedAtDesc(toArray(data?.orderRequests)), [data?.orderRequests])
  const pending = requests.filter((request) => request.status === 'pending')
  const today = todayInput()
  const reviewedToday = requests.filter((request) => request.status !== 'pending' && localDay(request.reviewedAt) === today)

  async function review(request: OrderRequestRecord, decision: 'approve' | 'reject') {
    setBusyId(request.id)
    setFeedback(null)
    try {
      const authorizing = approvalStage(request) === 'authorizer'
      await reviewOrderRequest(request.id, decision)
      setFeedback({
        tone: 'success',
        text:
          decision === 'reject'
            ? `Order for ${request.customerName} rejected.`
            : authorizing
              ? `Order for ${request.customerName} authorized and sent to the Chairman for final approval.`
              : `Order for ${request.customerName} approved and added to their history and credit sheet. Notify them below.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the order.' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {pending.length ? (
        pending.map((request) => (
          <OrderRequestCard
            key={request.id}
            request={request}
            isAdmin={isAdmin}
            busy={busyId === request.id}
            onReview={(decision) => void review(request, decision)}
            onEdit={() => setEditing(request)}
          />
        ))
      ) : (
        <EmptyState text="No orders are waiting for approval." />
      )}

      {reviewedToday.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewed today</CardTitle>
            <CardDescription>Send the confirmation to dealers whose orders were approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewedToday.map((request) => {
              const customer = data?.customers[request.customerId]
              return (
                <div key={request.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium">
                      {request.customerName} · {formatCurrency(request.total)} <StatusPill status={request.status} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewedByName}
                      {request.edits?.length ? ' · edited' : ''}
                    </p>
                  </div>
                  {request.status === 'approved' ? (
                    <NotifyButtons phone={customer?.phone} message={orderMessage(request, data?.settings.companyName ?? '')} />
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      {editing ? <EditOrderDialog request={editing} onClose={() => setEditing(null)} onSaved={(text) => setFeedback({ tone: 'success', text })} /> : null}
    </div>
  )
}

function OrderRequestCard({
  request,
  isAdmin,
  busy,
  onReview,
  onEdit,
}: {
  request: OrderRequestRecord
  isAdmin: boolean
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  onEdit: () => void
}) {
  const { data, currentUser } = useERP()
  const { zones } = useZoneAccess()
  const customer = data?.customers[request.customerId]
  const stage = approvalStage(request)
  const canReview = canActAtStage(currentUser, stage)

  const history = useMemo(() => {
    const orders = toArray(data?.orders).filter((order) => order.customerId === request.customerId)
    const lastOrder = sortByCreatedAtDesc(orders)[0]
    const pendingDeposits = toArray(data?.deposits)
      .filter((deposit) => deposit.customerId === request.customerId && deposit.status === 'pending')
      .reduce((sum, deposit) => sum + deposit.amount, 0)
    return {
      orderCount: orders.length,
      units: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
      amount: orders.reduce((sum, order) => sum + order.total, 0),
      paid: orders.reduce((sum, order) => sum + order.paid, 0),
      lastOrderAt: lastOrder?.createdAt ?? '',
      pendingDeposits,
    }
  }, [data?.orders, data?.deposits, request.customerId])

  const currentDue = customer?.due ?? 0
  const creditLimit = customer?.creditLimit ?? 0
  const dueAfter = currentDue + request.due
  const availableAfter = creditLimit > 0 ? creditLimit - dueAfter : null
  const units = request.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {request.customerName}
            {request.overCreditLimit ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Over credit limit
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            ID {partyCode(data?.customers[request.customerId] ?? { id: request.customerId })}
            {customer ? ` · ${customerZoneName(customer, zones)} · ${customer.phone}` : ''}
          </CardDescription>
          <SubmittedBy name={request.submittedByName} role={request.submittedByRole} at={request.createdAt} />
          <ApprovalStageNote record={request} />
        </div>
        {isAdmin || canReview ? (
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : null}
            {canReview ? (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busy} onClick={() => onReview('reject')}>
                  <X className="h-4 w-4" />
                  Reject
                </Button>
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => onReview('approve')}>
                  <Check className="h-4 w-4" />
                  {busy ? 'Saving...' : stage === 'authorizer' ? 'Authorize' : 'Final approve'}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.items.map((item) => {
                  const stock = data?.products[item.productId]?.stockQty ?? 0
                  return (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                      <TableCell className={stock < item.quantity ? 'text-right tabular-nums text-rose-600' : 'text-right tabular-nums'}>{stock}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <SummaryRow label="Order date" value={formatDate(request.orderDate)} />
            <SummaryRow label="Delivery date" value={formatDate(request.deliveryDate)} />
            <SummaryRow label="Courier" value={request.courierName || '—'} />
            <SummaryRow label="Employee" value={request.employeeName ? `${shortRecordId(request.employeeId)} — ${request.employeeName}` : '—'} />
            <SummaryRow label="Units" value={units} />
            <SummaryRow label="Total" value={formatCurrency(request.total)} />
            <SummaryRow label="Paid now" value={formatCurrency(request.paid)} />
            <SummaryRow label="Added to due" value={formatCurrency(request.due)} />
          </dl>
          <EditHistory edits={request.edits} />
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-semibold">Customer summary</p>
          <dl className="space-y-1.5 text-sm">
            <SummaryRow label="Orders so far" value={history.orderCount} />
            <SummaryRow label="Units bought" value={history.units} />
            <SummaryRow label="Total bought" value={formatCurrency(history.amount)} />
            <SummaryRow label="Total paid on orders" value={formatCurrency(history.paid)} />
            <SummaryRow label="Last order" value={history.lastOrderAt ? formatDate(history.lastOrderAt) : '—'} />
            <SummaryRow label="Deposits pending" value={formatCurrency(history.pendingDeposits)} />
            <SummaryRow label="Current due" value={formatCurrency(currentDue)} strong />
            <SummaryRow label="Due after this order" value={formatCurrency(dueAfter)} />
            <SummaryRow label="Credit limit" value={creditLimit > 0 ? formatCurrency(creditLimit) : 'No limit'} />
            <SummaryRow
              label="Available after"
              value={availableAfter === null ? 'Unlimited' : formatCurrency(availableAfter)}
              tone={availableAfter !== null && availableAfter < 0 ? 'danger' : undefined}
            />
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}

type EditLine = { key: string; productId: string; quantity: string; unitPrice: string }

function EditOrderDialog({ request, onClose, onSaved }: { request: OrderRequestRecord; onClose: () => void; onSaved: (text: string) => void }) {
  const { data, editOrderRequest } = useERP()
  const [lines, setLines] = useState<EditLine[]>(() =>
    request.items.map((item) => ({ key: item.productId, productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice) }))
  )
  const [paid, setPaid] = useState(String(request.paid))
  const [deliveryDate, setDeliveryDate] = useState(localDay(request.deliveryDate))
  const [courierName, setCourierName] = useState(request.courierName)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((product) => ({ value: product.id, label: product.name, sublabel: `${product.sku} · Stock ${product.stockQty}` })),
    [data?.products]
  )

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0)

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function selectProduct(key: string, productId: string) {
    const product = data?.products[productId]
    updateLine(key, { productId, unitPrice: product ? String(product.wholesalePrice || product.sellingPrice) : '0' })
  }

  async function save() {
    const items = lines.filter((line) => line.productId)
    if (!items.length) return setError('Add at least one product.')
    if (new Set(items.map((line) => line.productId)).size !== items.length) return setError('Each product can only be listed once.')
    if (!deliveryDate) return setError('Set the delivery date.')

    setIsSaving(true)
    setError(null)
    try {
      await editOrderRequest(request.id, {
        items: items.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) || 0, unitPrice: Number(line.unitPrice) || 0 })),
        paid: Number(paid) || 0,
        deliveryDate: new Date(deliveryDate).toISOString(),
        courierName,
      })
      onSaved(`Order for ${request.customerName} edited. Confirm it to send it to the daily audit.`)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the changes.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit order — {request.customerName}</DialogTitle>
          <DialogDescription>Your name and every changed field are recorded on the order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_120px_auto] sm:items-end">
              <Combobox options={productOptions} value={line.productId} onChange={(productId) => selectProduct(line.key, productId)} placeholder="Select product" />
              <Input type="number" min={1} aria-label="Quantity" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} />
              <Input type="number" min={0} aria-label="Unit price" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove product"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setLines((current) => [...current, { key: Math.random().toString(36).slice(2), productId: '', quantity: '1', unitPrice: '0' }])}
          >
            <Plus className="h-4 w-4" />
            Add product
          </Button>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Paid now</span>
              <Input type="number" min={0} value={paid} onChange={(event) => setPaid(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Delivery date</span>
              <Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Courier</span>
              <Input value={courierName} onChange={(event) => setCourierName(event.target.value)} />
            </label>
          </div>
          <p className="text-right text-sm font-semibold tabular-nums">Total {formatCurrency(total)}</p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void save()}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
