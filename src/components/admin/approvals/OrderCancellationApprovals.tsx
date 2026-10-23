"use client"

import { useMemo, useState } from 'react'
import { Check, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import { reversedOrderIds } from '@/lib/erp/ledger'
import type { OrderCancellationRequestRecord } from '@/lib/erp/types'
import { approvalStage, formatCurrency, formatDealerBalance, getOrderStatus, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'

import { ApprovalStageNote, approveLabel, EmptyState, FeedbackBanner, StatusPill, SubmittedBy, SummaryRow, localDay, todayInput, useApprovalAccess, type Feedback } from './shared'

const actionText = (request: OrderCancellationRequestRecord) => (request.action === 'cancel' ? 'Cancel' : 'Bring back')

/** Send a cancellation on to the Chairman, approve or reject it, reporting the result through `setFeedback`. */
export function useOrderCancellationReview(setFeedback: (feedback: Feedback) => void) {
  const { reviewOrderCancellation } = useERP()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function review(request: OrderCancellationRequestRecord, decision: 'approve' | 'reject') {
    const authorizing = approvalStage(request) === 'authorizer'
    setBusyId(request.id)
    setFeedback(null)
    try {
      await reviewOrderCancellation(request.id, decision)
      const what = `${actionText(request)} ${request.billNumber} (${request.customerName})`
      setFeedback({
        tone: 'success',
        text:
          decision === 'reject'
            ? `${what} rejected; the order is unchanged.`
            : authorizing
              ? `${what} authorized and sent to the Chairman for final approval.`
              : request.action === 'cancel'
                ? `${request.billNumber} cancelled: its stock is given back and the bill is off the dealer's due.`
                : `${request.billNumber} brought back: its stock is held again and the bill is back on the dealer's due.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review it.' })
    } finally {
      setBusyId(null)
    }
  }

  return { busyId, review }
}

/** One cancellation (or reinstatement): the order, what it does to the dealer's due and stock, and the review buttons. */
export function OrderCancellationCard({
  request,
  busy,
  onReview,
  badge,
}: {
  request: OrderCancellationRequestRecord
  busy: boolean
  onReview: (decision: 'approve' | 'reject') => void
  badge?: React.ReactNode
}) {
  const { data } = useERP()
  const { stage, canReview } = useApprovalAccess(request)
  const submitter = data?.users[request.submittedById]
  const customer = data?.customers[request.customerId]
  const order = data?.orders[request.orderId]
  const currency = data?.settings.currency
  const cancelling = request.action === 'cancel'
  // An order cancelled before cancellations needed approval has no ledger line, so bringing it back adds none.
  const reversed = useMemo(() => reversedOrderIds(toArray(data?.creditLedgerEntries)).has(request.orderId), [data?.creditLedgerEntries, request.orderId])
  const changesDue = cancelling !== reversed
  const currentDue = customer?.due ?? 0
  const dueAfter = changesDue ? currentDue + (cancelling ? -request.amount : request.amount) : currentDue
  const status = (id: string) => getOrderStatus(data?.settings, id).label

  return (
    <Card data-testid={`order-cancellation-${request.id}`}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {badge}
            <span>
              {actionText(request)} {request.billNumber} · {request.customerName}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {status(request.fromStatus)} → {status(request.toStatus)}
          </p>
          <dl className="max-w-sm space-y-1 text-sm">
            <SummaryRow label="Bill (after discount)" value={formatCurrency(request.amount, currency)} />
            <SummaryRow label="Paid on this order" value={formatCurrency(request.paid, currency)} />
            <SummaryRow label="Dealer due now" value={formatDealerBalance(currentDue, currency)} />
            <SummaryRow label="Dealer due after" value={formatDealerBalance(dueAfter, currency)} strong />
          </dl>
          <p className="text-xs text-muted-foreground">
            {cancelling
              ? `Final approval adds "Cancelled ${request.billNumber}" (debit ${formatCurrency(request.amount, currency)}) to the dealer's ledger and gives the held stock back.${request.paid > 0 ? ` The ${formatCurrency(request.paid, currency)} paid stays on the sheet as the dealer's advance.` : ''}`
              : changesDue
                ? `Final approval adds "Reinstated ${request.billNumber}" (credit ${formatCurrency(request.amount, currency)}) to the dealer's ledger and holds the stock again.`
                : `This order was cancelled without a ledger line, so bringing it back only changes its status and stock.`}
          </p>
          {cancelling && order?.delivery ? (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Posted for delivery since it was asked: it can no longer be cancelled.</p>
          ) : null}
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
              {stage === 'authorizer' ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {approveLabel(stage)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Cancelling an approved order, or bringing a cancelled one back: the Authorizer, then the Chairman. */
export function OrderCancellationApprovals() {
  const { data } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const { busyId, review } = useOrderCancellationReview(setFeedback)

  const requests = useMemo(() => sortByCreatedAtDesc(toArray(data?.orderCancellationRequests)), [data?.orderCancellationRequests])
  const pending = requests.filter((request) => request.status === 'pending')
  const today = todayInput()
  const reviewedToday = requests.filter((request) => request.status !== 'pending' && localDay(request.reviewedAt) === today)

  return (
    <div className="space-y-3">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text="No order cancellations are waiting for approval." /> : null}
      {pending.map((request) => (
        <OrderCancellationCard key={request.id} request={request} busy={busyId === request.id} onReview={(decision) => void review(request, decision)} />
      ))}

      {reviewedToday.length ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">Reviewed today</p>
            {reviewedToday.map((request) => (
              <div key={request.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-medium">
                  {actionText(request)} {request.billNumber} · {request.customerName} <StatusPill status={request.status} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(request.amount, data?.settings.currency)} · By {request.reviewedByName}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
