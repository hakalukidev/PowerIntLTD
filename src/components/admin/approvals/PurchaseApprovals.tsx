"use client"

import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import type { PurchaseRequestRecord } from '@/lib/erp/types'
import { approvalStage, formatCurrency, formatDate, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'

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

/** Authorize, approve or reject a stock-in, reporting the result through `setFeedback`. */
export function usePurchaseReview(setFeedback: (feedback: Feedback) => void) {
  const { reviewPurchaseRequest } = useERP()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function review(request: PurchaseRequestRecord, decision: 'approve' | 'reject') {
    const authorizing = approvalStage(request) === 'authorizer'
    setBusyId(request.id)
    setFeedback(null)
    try {
      await reviewPurchaseRequest(request.id, decision)
      const what = `Purchase of ${request.quantity} ${request.productName} from ${request.supplierName}`
      setFeedback({
        tone: 'success',
        text:
          decision === 'reject'
            ? `${what} rejected.`
            : authorizing
              ? `${what} authorized and sent to the Chairman for final approval.`
              : `${what} approved: stock and the supplier's sheet are updated.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review it.' })
    } finally {
      setBusyId(null)
    }
  }

  return { busyId, review }
}

export function PurchaseRequestCard({
  request,
  busy,
  onReview,
  badge,
}: {
  request: PurchaseRequestRecord
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  badge?: React.ReactNode
}) {
  const { data } = useERP()
  const { stage, canReview } = useApprovalAccess(request)
  const submitter = data?.users[request.submittedById]
  const product = data?.products[request.productId]
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {badge}
            <span>
              {request.supplierName} · <span className="tabular-nums">{formatCurrency(request.total, request.currency)}</span>
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Received {formatDate(request.date)}</p>
          <dl className="space-y-0.5 text-sm">
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Product:</dt>
              <dd className="min-w-0 break-words">{request.productName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Qty × Unit cost:</dt>
              <dd className="tabular-nums">
                {request.quantity} × {formatCurrency(request.unitCost, request.currency)}
              </dd>
            </div>
            {product ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">Stock now:</dt>
                <dd className="tabular-nums">
                  {product.stockQty} → {product.stockQty + request.quantity} after approval
                </dd>
              </div>
            ) : null}
          </dl>
          <SubmittedBy name={request.submittedByName} role={submitter && data ? userRoleNames(data.roles, submitter) : ''} at={request.createdAt} />
          <ApprovalStageNote record={request} />
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

/** Stock-ins from Receive purchase. Stock and the supplier's balance only change at the final approval. */
export function PurchaseApprovals() {
  const { data } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const { busyId, review } = usePurchaseReview(setFeedback)

  const requests = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchaseRequests)), [data?.purchaseRequests])
  const pending = requests.filter((request) => request.status === 'pending')
  const today = todayInput()
  const reviewedToday = requests.filter((request) => request.status !== 'pending' && localDay(request.reviewedAt) === today)

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text="No purchases are waiting for approval." /> : null}
      {pending.map((request) => (
        <PurchaseRequestCard key={request.id} request={request} busy={busyId === request.id} onReview={(decision) => void review(request, decision)} />
      ))}

      {reviewedToday.length ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">Reviewed today</p>
            {reviewedToday.map((request) => (
              <div key={request.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-medium">
                  {request.supplierName} · {request.productName} × {request.quantity} <StatusPill status={request.status} />
                </p>
                <p className="text-xs text-muted-foreground">By {request.reviewedByName}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
