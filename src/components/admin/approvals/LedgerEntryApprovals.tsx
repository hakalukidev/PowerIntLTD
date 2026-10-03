"use client"

import { useMemo, useState } from 'react'
import { Check, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import type { LedgerEntryRequestRecord } from '@/lib/erp/types'
import { approvalStage, canActAtStage, formatCurrency, formatDate, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'

import { ApprovalStageNote, EmptyState, FeedbackBanner, StatusPill, SubmittedBy, localDay, todayInput, type Feedback } from './shared'

/**
 * Ledger entries a zone in charge made for their zone's clients. The zone's Authorizer sends each
 * one to the Chairman, whose approval writes it to the client's ledger.
 * With `customerId` it lists only that client's waiting entries, and nothing when there are none.
 */
export function LedgerEntryApprovals({ customerId }: { customerId?: string }) {
  const { data, currentUser, reviewLedgerEntryRequest } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const requests = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.ledgerEntryRequests)).filter((request) => !customerId || request.customerId === customerId),
    [customerId, data?.ledgerEntryRequests]
  )
  const pending = requests.filter((request) => request.status === 'pending')
  const today = todayInput()
  const reviewedToday = customerId ? [] : requests.filter((request) => request.status !== 'pending' && localDay(request.reviewedAt) === today)

  const roleOf = (userId: string) => {
    const user = data?.users[userId]
    return user && data ? userRoleNames(data.roles, user) : ''
  }

  async function review(request: LedgerEntryRequestRecord, decision: 'approve' | 'reject') {
    const authorizing = approvalStage(request) === 'authorizer'
    setBusyId(request.id)
    setFeedback(null)
    try {
      await reviewLedgerEntryRequest(request.id, decision)
      const what = `Ledger entry for ${request.customerName} (${formatCurrency(Math.max(request.debit, request.credit))})`
      setFeedback({
        tone: 'success',
        text:
          decision === 'reject'
            ? `${what} rejected.`
            : authorizing
              ? `${what} authorized and sent to the Chairman for final approval.`
              : `${what} approved and added to the client's ledger.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review it.' })
    } finally {
      setBusyId(null)
    }
  }

  if (customerId && !pending.length && !feedback) return null

  return (
    <div className="space-y-3">
      {customerId ? <h3 className="text-sm font-semibold">Ledger entries waiting for approval</h3> : null}
      <FeedbackBanner feedback={feedback} />
      {!customerId && !pending.length ? <EmptyState text="No ledger entries are waiting for approval." /> : null}
      {pending.map((request) => {
        const stage = approvalStage(request)
        const canReview = canActAtStage(currentUser, stage)
        const isDebit = request.debit > 0
        return (
          <Card key={request.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <p className="font-medium">
                  {request.customerName} · <span className="tabular-nums">{formatCurrency(isDebit ? request.debit : request.credit)}</span>{' '}
                  <span className="text-xs font-normal text-muted-foreground">{isDebit ? 'Debit' : 'Credit'}</span>
                </p>
                <p className="text-xs text-muted-foreground">Date {formatDate(request.date)}</p>
                <dl className="space-y-0.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Particulars:</dt>
                    <dd className="min-w-0 break-words">{request.particulars}</dd>
                  </div>
                  {request.qty || request.unitPrice ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Qty × Unit price:</dt>
                      <dd className="tabular-nums">
                        {request.qty} × {formatCurrency(request.unitPrice)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <SubmittedBy name={request.submittedByName} role={roleOf(request.submittedById)} at={request.createdAt} />
                <ApprovalStageNote record={request} />
              </div>
              {canReview ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busyId === request.id} onClick={() => void review(request, 'reject')}>
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button size="sm" className="gap-1.5" disabled={busyId === request.id} onClick={() => void review(request, 'approve')}>
                    {stage === 'authorizer' ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {stage === 'authorizer' ? 'Submit to Chairman' : 'Final approve'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}

      {reviewedToday.length ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">Reviewed today</p>
            {reviewedToday.map((request) => (
              <div key={request.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-medium">
                  {request.customerName} · {formatCurrency(Math.max(request.debit, request.credit))} <StatusPill status={request.status} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {request.particulars} · By {request.reviewedByName}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
