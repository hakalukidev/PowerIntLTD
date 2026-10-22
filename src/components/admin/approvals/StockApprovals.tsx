"use client"

import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import { STOCK_ADJUSTMENT_REASONS, stockInWarehouse } from '@/lib/erp/stock'
import type { StockAdjustmentRecord, StockTransferRecord } from '@/lib/erp/types'
import { approvalStage, formatDate, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'

import {
  ApprovalStageNote,
  approveLabel,
  EmptyState,
  FeedbackBanner,
  StatusPill,
  SubmittedBy,
  localDay,
  todayInput,
  useApprovalAccess,
  type Feedback,
} from './shared'

type StockRecord = StockTransferRecord | StockAdjustmentRecord

const signed = (quantity: number) => `${quantity > 0 ? '+' : ''}${quantity}`

function describeTransfer(transfer: StockTransferRecord) {
  return `Transfer of ${transfer.quantity} ${transfer.productName} from ${transfer.fromWarehouseName} to ${transfer.toWarehouseName}`
}

function describeAdjustment(adjustment: StockAdjustmentRecord) {
  return `${STOCK_ADJUSTMENT_REASONS[adjustment.reason] ?? 'Stock adjustment'} of ${signed(adjustment.quantity)} ${adjustment.productName}`
}

/** Authorize, approve or reject a transfer or adjustment, reporting the result through `setFeedback`. */
function useStockReview<T extends StockRecord>(
  setFeedback: (feedback: Feedback) => void,
  reviewer: (id: string, decision: 'approve' | 'reject') => Promise<void>,
  describe: (record: T) => string
) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function review(record: T, decision: 'approve' | 'reject') {
    const authorizing = approvalStage(record) === 'authorizer'
    setBusyId(record.id)
    setFeedback(null)
    try {
      await reviewer(record.id, decision)
      const what = describe(record)
      setFeedback({
        tone: 'success',
        text:
          decision === 'reject'
            ? `${what} rejected.`
            : authorizing
              ? `${what} authorized and sent to the Chairman for final approval.`
              : `${what} approved: the stock is updated.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review it.' })
    } finally {
      setBusyId(null)
    }
  }

  return { busyId, review }
}

export function useStockTransferReview(setFeedback: (feedback: Feedback) => void) {
  const { reviewStockTransfer } = useERP()
  return useStockReview<StockTransferRecord>(setFeedback, reviewStockTransfer, describeTransfer)
}

export function useStockAdjustmentReview(setFeedback: (feedback: Feedback) => void) {
  const { reviewStockAdjustment } = useERP()
  return useStockReview<StockAdjustmentRecord>(setFeedback, reviewStockAdjustment, describeAdjustment)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words tabular-nums">{children}</dd>
    </div>
  )
}

function StockCard({
  record,
  title,
  dateLabel,
  busy,
  onReview,
  badge,
  children,
}: {
  record: StockRecord
  title: React.ReactNode
  dateLabel: string
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const { data } = useERP()
  const { stage, canReview } = useApprovalAccess(record)
  const submitter = data?.users[record.submittedById]
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {badge}
            <span>{title}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {dateLabel} {formatDate(record.date)}
          </p>
          <dl className="space-y-0.5 text-sm">{children}</dl>
          <SubmittedBy name={record.submittedByName} role={submitter && data ? userRoleNames(data.roles, submitter) : ''} at={record.createdAt} />
          <ApprovalStageNote record={record} />
        </div>
        {canReview ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busy} onClick={() => onReview('reject')}>
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => onReview('approve')}>
              <Check className="h-4 w-4" />
              {approveLabel(stage)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function StockTransferCard({
  transfer,
  busy,
  onReview,
  badge,
}: {
  transfer: StockTransferRecord
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  badge?: React.ReactNode
}) {
  const { data } = useERP()
  const product = data?.products[transfer.productId]
  return (
    <StockCard record={transfer} title={`${transfer.productName} × ${transfer.quantity}`} dateLabel="Transfer on" busy={busy} onReview={onReview} badge={badge}>
      <Row label="From → to">
        {transfer.fromWarehouseName} → {transfer.toWarehouseName}
      </Row>
      {product ? (
        <Row label="Stock now">
          {transfer.fromWarehouseName} {stockInWarehouse(product, transfer.fromWarehouseId)} · {transfer.toWarehouseName} {stockInWarehouse(product, transfer.toWarehouseId)}
        </Row>
      ) : null}
      {transfer.note ? <Row label="Note">{transfer.note}</Row> : null}
    </StockCard>
  )
}

export function StockAdjustmentCard({
  adjustment,
  busy,
  onReview,
  badge,
}: {
  adjustment: StockAdjustmentRecord
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  badge?: React.ReactNode
}) {
  const { data } = useERP()
  const product = data?.products[adjustment.productId]
  return (
    <StockCard
      record={adjustment}
      title={`${adjustment.productName} ${signed(adjustment.quantity)}`}
      dateLabel={STOCK_ADJUSTMENT_REASONS[adjustment.reason] ?? 'Adjustment'}
      busy={busy}
      onReview={onReview}
      badge={badge}
    >
      <Row label="Reason">{STOCK_ADJUSTMENT_REASONS[adjustment.reason] ?? adjustment.reason}</Row>
      {adjustment.lines.map((line) => (
        <Row key={line.warehouseId} label={line.warehouseName}>
          {signed(line.quantity)}
          {product ? ` (${stockInWarehouse(product, line.warehouseId)} → ${stockInWarehouse(product, line.warehouseId) + line.quantity} after approval)` : ''}
        </Row>
      ))}
      {adjustment.note ? <Row label="Note">{adjustment.note}</Row> : null}
    </StockCard>
  )
}

function ReviewedToday({ items }: { items: Array<{ id: string; text: string; status: StockRecord['status']; by?: string }> }) {
  if (!items.length) return null
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold">Reviewed today</p>
        {items.map((item) => (
          <div key={item.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
            <p className="font-medium">
              {item.text} <StatusPill status={item.status} />
            </p>
            <p className="text-xs text-muted-foreground">By {item.by}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Transfers between warehouses. The stock moves only at the final approval. */
export function StockTransferApprovals() {
  const { data } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const { busyId, review } = useStockTransferReview(setFeedback)
  const records = useMemo(() => sortByCreatedAtDesc(toArray(data?.stockTransfers)), [data?.stockTransfers])
  const pending = records.filter((record) => record.status === 'pending')
  const today = todayInput()
  const reviewed = records.filter((record) => record.status !== 'pending' && localDay(record.reviewedAt) === today)

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text="No stock transfers are waiting for approval." /> : null}
      {pending.map((transfer) => (
        <StockTransferCard key={transfer.id} transfer={transfer} busy={busyId === transfer.id} onReview={(decision) => void review(transfer, decision)} />
      ))}
      <ReviewedToday items={reviewed.map((record) => ({ id: record.id, text: describeTransfer(record), status: record.status, by: record.reviewedByName }))} />
    </div>
  )
}

/** Stock adjustments and opening stock. The stock changes only at the final approval. */
export function StockAdjustmentApprovals() {
  const { data } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const { busyId, review } = useStockAdjustmentReview(setFeedback)
  const records = useMemo(() => sortByCreatedAtDesc(toArray(data?.stockAdjustments)), [data?.stockAdjustments])
  const pending = records.filter((record) => record.status === 'pending')
  const today = todayInput()
  const reviewed = records.filter((record) => record.status !== 'pending' && localDay(record.reviewedAt) === today)

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text="No stock adjustments are waiting for approval." /> : null}
      {pending.map((adjustment) => (
        <StockAdjustmentCard key={adjustment.id} adjustment={adjustment} busy={busyId === adjustment.id} onReview={(decision) => void review(adjustment, decision)} />
      ))}
      <ReviewedToday items={reviewed.map((record) => ({ id: record.id, text: describeAdjustment(record), status: record.status, by: record.reviewedByName }))} />
    </div>
  )
}
