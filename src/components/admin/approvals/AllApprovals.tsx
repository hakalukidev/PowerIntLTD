"use client"

import { useMemo, useState } from 'react'

import { useERP } from '@/lib/erp/provider'
import type {
  ChangeRequestRecord,
  EditableSubmissionKind,
  LedgerEntryRequestRecord,
  OrderCancellationRequestRecord,
  OrderRequestRecord,
  PurchaseRequestRecord,
  StockAdjustmentRecord,
  StockTransferRecord,
} from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

import { ChangeRequestCard, useChangeReview } from './ChangeApprovals'
import { LedgerEntryCard, useLedgerEntryReview } from './LedgerEntryApprovals'
import { EditOrderDialog, OrderRequestCard, useOrderReview } from './OrderApprovals'
import { OrderCancellationCard, useOrderCancellationReview } from './OrderCancellationApprovals'
import { PurchaseRequestCard, usePurchaseReview } from './PurchaseApprovals'
import { StockAdjustmentCard, StockTransferCard, useStockAdjustmentReview, useStockTransferReview } from './StockApprovals'
import { EditSubmissionDialog, SubmissionCard, buildSubmissionRows, useSubmissionReview, type SubmissionRow } from './SubmissionApprovals'
import { EmptyState, FeedbackBanner, type Feedback } from './shared'

type Item =
  | { type: 'order'; id: string; at: string; request: OrderRequestRecord }
  | { type: EditableSubmissionKind; id: string; at: string; row: SubmissionRow }
  | { type: 'ledger'; id: string; at: string; request: LedgerEntryRequestRecord }
  | { type: 'cancellation'; id: string; at: string; request: OrderCancellationRequestRecord }
  | { type: 'change'; id: string; at: string; request: ChangeRequestRecord }
  | { type: 'purchase'; id: string; at: string; request: PurchaseRequestRecord }
  | { type: 'transfer'; id: string; at: string; transfer: StockTransferRecord }
  | { type: 'adjustment'; id: string; at: string; adjustment: StockAdjustmentRecord }

const TYPE_BADGES: Record<Item['type'], { label: string; className: string }> = {
  order: { label: 'Order', className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  deposits: { label: 'Deposit', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  ledger: { label: 'Ledger entry', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  cancellation: { label: 'Order cancellation', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  supplierPayments: { label: 'Payment', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  expenses: { label: 'Expense', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  change: { label: 'Record change', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  purchase: { label: 'Purchase', className: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  transfer: { label: 'Stock transfer', className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
  adjustment: { label: 'Stock adjustment', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

function TypeBadge({ type }: { type: Item['type'] }) {
  return (
    <span data-approval-type={type} className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', TYPE_BADGES[type].className)}>
      {TYPE_BADGES[type].label}
    </span>
  )
}

/** Every pending order, order cancellation, deposit, ledger entry, payment, expense, purchase, stock transfer and adjustment, and record change in one list, newest first. */
export function AllApprovals({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const orders = useOrderReview(setFeedback)
  const submissions = useSubmissionReview(setFeedback)
  const ledger = useLedgerEntryReview(setFeedback)
  const cancellations = useOrderCancellationReview(setFeedback)
  const changes = useChangeReview(setFeedback)
  const purchases = usePurchaseReview(setFeedback)
  const transfers = useStockTransferReview(setFeedback)
  const adjustments = useStockAdjustmentReview(setFeedback)
  const [editingOrder, setEditingOrder] = useState<OrderRequestRecord | null>(null)
  const [editingSubmission, setEditingSubmission] = useState<{ kind: EditableSubmissionKind; row: SubmissionRow } | null>(null)

  const items = useMemo<Item[]>(() => {
    if (!data) return []
    const pending = <T extends { status?: string }>(records: T[]) => records.filter((record) => record.status === 'pending')
    const submissionItems = (['deposits', 'supplierPayments', 'expenses'] as const).flatMap((kind) =>
      pending(buildSubmissionRows(kind, data)).map((row): Item => ({ type: kind, id: row.id, at: row.submittedAt, row }))
    )
    return [
      ...pending(toArray(data.orderRequests)).map((request): Item => ({ type: 'order', id: request.id, at: request.createdAt, request })),
      ...pending(toArray(data.orderCancellationRequests)).map((request): Item => ({ type: 'cancellation', id: request.id, at: request.createdAt, request })),
      ...submissionItems,
      ...pending(toArray(data.ledgerEntryRequests)).map((request): Item => ({ type: 'ledger', id: request.id, at: request.createdAt, request })),
      ...pending(toArray(data.changeRequests)).map((request): Item => ({ type: 'change', id: request.id, at: request.createdAt, request })),
      ...pending(toArray(data.purchaseRequests)).map((request): Item => ({ type: 'purchase', id: request.id, at: request.createdAt, request })),
      ...pending(toArray(data.stockTransfers)).map((transfer): Item => ({ type: 'transfer', id: transfer.id, at: transfer.createdAt, transfer })),
      ...pending(toArray(data.stockAdjustments)).map((adjustment): Item => ({ type: 'adjustment', id: adjustment.id, at: adjustment.createdAt, adjustment })),
    ].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? ''))
  }, [data])

  return (
    <div className="space-y-4">
      <FeedbackBanner feedback={feedback} />
      {!items.length ? <EmptyState text="No approvals are waiting." /> : null}
      {items.map((item) => {
        const badge = <TypeBadge type={item.type} />
        if (item.type === 'order') {
          return (
            <OrderRequestCard
              key={`order-${item.id}`}
              request={item.request}
              isAdmin={isAdmin}
              badge={badge}
              busy={orders.busyId === item.id}
              onReview={(decision) => void orders.review(item.request, decision)}
              onEdit={() => setEditingOrder(item.request)}
            />
          )
        }
        if (item.type === 'cancellation') {
          return (
            <OrderCancellationCard
              key={`cancellation-${item.id}`}
              request={item.request}
              badge={badge}
              busy={cancellations.busyId === item.id}
              onReview={(decision) => void cancellations.review(item.request, decision)}
            />
          )
        }
        if (item.type === 'ledger') {
          return (
            <LedgerEntryCard
              key={`ledger-${item.id}`}
              request={item.request}
              badge={badge}
              busy={ledger.busyId === item.id}
              onReview={(decision) => void ledger.review(item.request, decision)}
            />
          )
        }
        if (item.type === 'purchase') {
          return (
            <PurchaseRequestCard
              key={`purchase-${item.id}`}
              request={item.request}
              badge={badge}
              busy={purchases.busyId === item.id}
              onReview={(decision) => void purchases.review(item.request, decision)}
            />
          )
        }
        if (item.type === 'transfer') {
          return (
            <StockTransferCard
              key={`transfer-${item.id}`}
              transfer={item.transfer}
              badge={badge}
              busy={transfers.busyId === item.id}
              onReview={(decision) => void transfers.review(item.transfer, decision)}
            />
          )
        }
        if (item.type === 'adjustment') {
          return (
            <StockAdjustmentCard
              key={`adjustment-${item.id}`}
              adjustment={item.adjustment}
              badge={badge}
              busy={adjustments.busyId === item.id}
              onReview={(decision) => void adjustments.review(item.adjustment, decision)}
            />
          )
        }
        if (item.type === 'change') {
          return (
            <ChangeRequestCard
              key={`change-${item.id}`}
              request={item.request}
              badge={badge}
              busy={changes.busyId === item.id}
              onReview={(decision) => void changes.review(item.request, decision)}
            />
          )
        }
        const kind = item.type
        return (
          <SubmissionCard
            key={`${kind}-${item.id}`}
            kind={kind}
            row={item.row}
            isAdmin={isAdmin}
            badge={badge}
            busy={submissions.busyId === item.id}
            onReview={(decision) => void submissions.review(kind, item.row, decision)}
            onEdit={() => setEditingSubmission({ kind, row: item.row })}
          />
        )
      })}

      {editingOrder ? (
        <EditOrderDialog request={editingOrder} onClose={() => setEditingOrder(null)} onSaved={(text) => setFeedback({ tone: 'success', text })} />
      ) : null}
      {editingSubmission ? (
        <EditSubmissionDialog
          kind={editingSubmission.kind}
          row={editingSubmission.row}
          onClose={() => setEditingSubmission(null)}
          onSaved={(text) => setFeedback({ tone: 'success', text })}
        />
      ) : null}
    </div>
  )
}
