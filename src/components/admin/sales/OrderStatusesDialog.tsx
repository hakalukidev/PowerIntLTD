"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useERP } from '@/lib/erp/provider'
import type { OrderStatusColor, OrderStatusConfig } from '@/lib/erp/types'
import { cn } from '@/lib/utils'
import {
  getOrderStatus,
  getOrderStatuses,
  ORDER_STATUS_COLORS,
  orderStatusBadgeClass,
  PROTECTED_ORDER_STATUS_IDS,
  toArray,
} from '@/lib/erp/utils'

/** A read-only status chip in the status's configured colour. */
export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const { data } = useERP()
  const config = getOrderStatus(data?.settings, status)
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap rounded-full', orderStatusBadgeClass(config.color), className)}>
      {config.label}
    </Badge>
  )
}

type StatusForm = Pick<OrderStatusConfig, 'label' | 'color' | 'isFinal' | 'isDelivered'>

const emptyForm: StatusForm = { label: '', color: 'slate', isFinal: false, isDelivered: false }
const colorKeys = Object.keys(ORDER_STATUS_COLORS) as OrderStatusColor[]

type OrderStatusesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Admin-only: add, rename, recolour, reorder and delete the order statuses. */
export function OrderStatusesDialog({ open, onOpenChange }: OrderStatusesDialogProps) {
  const { data, saveOrderStatus, reorderOrderStatuses, deleteOrderStatus } = useERP()
  const statuses = useMemo(() => getOrderStatuses(data?.settings), [data?.settings])
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const order of toArray(data?.orders)) counts.set(order.status, (counts.get(order.status) ?? 0) + 1)
    return counts
  }, [data?.orders])

  // `null`: the list; `''`: adding a new status; otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<StatusForm>(emptyForm)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [replacementId, setReplacementId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setEditingId(null)
    setDeletingId(null)
    setError(null)
  }, [open])

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback)
      return false
    } finally {
      setBusy(false)
    }
  }

  function startEdit(status?: OrderStatusConfig) {
    setDeletingId(null)
    setError(null)
    setEditingId(status?.id ?? '')
    setForm(status ? { label: status.label, color: status.color, isFinal: status.isFinal, isDelivered: status.isDelivered } : emptyForm)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await run(() => saveOrderStatus(form, editingId || undefined), 'Unable to save the status.')) setEditingId(null)
  }

  function move(index: number, offset: number) {
    const ids = statuses.map((status) => status.id)
    const target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => reorderOrderStatuses(ids), 'Unable to reorder the statuses.')
  }

  function startDelete(status: OrderStatusConfig) {
    setEditingId(null)
    setError(null)
    setDeletingId(status.id)
    setReplacementId(statuses.find((entry) => entry.id !== status.id)?.id ?? '')
  }

  async function confirmDelete() {
    if (!deletingId) return
    if (await run(() => deleteOrderStatus(deletingId, replacementId), 'Unable to delete the status.')) setDeletingId(null)
  }

  const deleting = statuses.find((status) => status.id === deletingId)
  const deletingUsage = deletingId ? usage.get(deletingId) ?? 0 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <DialogHeader>
          <DialogTitle>Order statuses</DialogTitle>
          <DialogDescription>
            The steps an order moves through. Changes apply to the sales table, filter and order dialog right away.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        {editingId !== null ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="order-status-label" className="text-sm font-medium text-foreground">
                Status name<span className="ml-0.5 text-rose-500">*</span>
              </label>
              <Input
                id="order-status-label"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="e.g. Delivered"
                maxLength={40}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Colour</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {colorKeys.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={form.color === color}
                    aria-label={ORDER_STATUS_COLORS[color].label}
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium',
                      orderStatusBadgeClass(color),
                      form.color === color && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    )}
                  >
                    {form.color === color ? <Check className="h-3 w-3" /> : null}
                    {ORDER_STATUS_COLORS[color].label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={form.isFinal}
                onChange={(event) => setForm((current) => ({ ...current, isFinal: event.target.checked }))}
              />
              <span>
                Final step
                <span className="block text-xs text-muted-foreground">Orders with this status no longer count as open.</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={form.isDelivered}
                onChange={(event) => setForm((current) => ({ ...current, isDelivered: event.target.checked }))}
              />
              <span>
                Counts as delivered
                <span className="block text-xs text-muted-foreground">
                  Moving an order here sets its delivered date to that day; moving it to a status without this clears it.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditingId(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={busy || !form.label.trim()}>
                {editingId ? 'Save status' : 'Add status'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
              {statuses.map((status, index) => {
                const count = usage.get(status.id) ?? 0
                const isProtected = PROTECTED_ORDER_STATUS_IDS.includes(status.id)
                return (
                  <li key={status.id} className="space-y-3 p-3" data-testid={`order-status-${status.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn('rounded-full', orderStatusBadgeClass(status.color))}>
                          {status.label}
                        </Badge>
                        {status.isFinal ? <span className="text-xs font-medium text-muted-foreground">Final</span> : null}
                        {status.isDelivered ? <span className="text-xs font-medium text-muted-foreground">Delivered</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {count} order{count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => move(index, -1)}
                          disabled={busy || index === 0}
                          aria-label={`Move ${status.label} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => move(index, 1)}
                          disabled={busy || index === statuses.length - 1}
                          aria-label={`Move ${status.label} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(status)}
                          disabled={busy}
                          aria-label={`Edit ${status.label}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                          onClick={() => startDelete(status)}
                          disabled={busy || isProtected}
                          title={isProtected ? 'Used by the order and delivery workflow, so it can be renamed but not deleted.' : undefined}
                          aria-label={`Delete ${status.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {deleting?.id === status.id ? (
                      <div className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
                        <p>
                          Delete <span className="font-semibold">{deleting.label}</span>?
                          {deletingUsage
                            ? ` ${deletingUsage} order${deletingUsage === 1 ? ' uses' : 's use'} it and will be moved to:`
                            : ' No orders use it.'}
                        </p>
                        {deletingUsage ? (
                          <Select value={replacementId} onValueChange={setReplacementId}>
                            <SelectTrigger aria-label="Replacement status">
                              <SelectValue placeholder="Pick a status" />
                            </SelectTrigger>
                            <SelectContent>
                              {statuses
                                .filter((entry) => entry.id !== deleting.id)
                                .map((entry) => (
                                  <SelectItem key={entry.id} value={entry.id}>
                                    {entry.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setDeletingId(null)} disabled={busy}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => void confirmDelete()}
                            disabled={busy || (deletingUsage > 0 && !replacementId)}
                          >
                            Delete status
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              {PROTECTED_ORDER_STATUS_IDS.map((id) => getOrderStatus(data?.settings, id).label).join(', ')} are set by the order and
              delivery workflow, so they can be renamed but not deleted.
            </p>
            <div className="flex justify-end">
              <Button type="button" className="rounded-xl" onClick={() => startEdit()} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" />
                Add status
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
