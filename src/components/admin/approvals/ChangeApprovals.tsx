"use client"

import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import type {
  ChangeRequestAction,
  ChangeRequestKind,
  ChangeRequestRecord,
  CreditLedgerEntryInput,
  CustomerInput,
  ERPData,
  ExpenseInput,
  SupplierInput,
} from '@/lib/erp/types'
import { formatCurrency, formatDate, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

import { EmptyState, FeedbackBanner, StatusPill, SubmittedBy, localDay, todayInput, type Feedback } from './shared'

const KIND_LABELS: Record<ChangeRequestKind, string> = {
  customer: 'Dealer',
  supplier: 'Supplier',
  credit_entry: 'Credit sheet entry',
  expense: 'Expense',
}

const ACTION_STYLES: Record<ChangeRequestAction, { label: string; className: string }> = {
  create: { label: 'Add', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  update: { label: 'Edit', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  delete: { label: 'Delete', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
}

/** Fields a dealer or supplier edit compares against the stored record. */
const RECORD_FIELDS: Array<[string, string]> = [
  ['name', 'Name'],
  ['company', 'Company'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['location', 'Location'],
  ['district', 'District'],
  ['thana', 'Sub-zone'],
  ['creditLimit', 'Credit limit'],
  ['due', 'Due'],
  ['nid', 'NID'],
  ['tradeLicenseNo', 'Trade license'],
  ['supplierType', 'Type'],
  ['country', 'Country'],
  ['lcNumber', 'LC number'],
  ['lcStatus', 'LC status'],
  ['productCost', 'Product cost'],
  ['shippingCost', 'Shipping cost'],
  ['customsDuty', 'Customs duty'],
  ['otherCost', 'Other cost'],
  ['description', 'Description'],
]

const show = (value: unknown) => (value === undefined || value === null || value === '' ? '—' : String(value))

/** What the change does, line by line: the changed fields of an edit, or the values of an add or delete. */
function describe(request: ChangeRequestRecord, data: ERPData): Array<[string, string]> {
  const { kind, action, targetId } = request

  if (kind === 'credit_entry') {
    const entry = action === 'delete' ? data.creditLedgerEntries[targetId] : (request.input as CreditLedgerEntryInput | undefined)
    if (!entry) return []
    return [
      ['Date', entry.date ? formatDate(entry.date) : '—'],
      ['Particulars', show(entry.particulars)],
      ['Debit', formatCurrency(entry.debit ?? 0)],
      ['Credit', formatCurrency(entry.credit ?? 0)],
    ]
  }

  if (kind === 'expense') {
    const expense = action === 'delete' ? data.expenses[targetId] : (request.input as ExpenseInput | undefined)
    if (!expense) return []
    const before = action === 'update' ? data.expenses[targetId] : undefined
    const line = (label: string, next: string, previous?: string): [string, string] => [
      label,
      before && previous !== next ? `${previous || '—'} → ${next}` : next,
    ]
    return [
      line('Category', expense.category, before?.category),
      line('Amount', formatCurrency(expense.amount), before ? formatCurrency(before.amount) : undefined),
      line('Date', expense.date ? formatDate(expense.date) : '—', before?.date ? formatDate(before.date) : undefined),
      line('Note', show(expense.note), before ? show(before.note) : undefined),
    ]
  }

  const stored = (kind === 'customer' ? data.customers[targetId] : data.suppliers[targetId]) as Record<string, unknown> | undefined
  if (action === 'delete') {
    return stored ? RECORD_FIELDS.filter(([key]) => key in stored && stored[key] !== '').slice(0, 5).map(([key, label]) => [label, show(stored[key])]) : []
  }

  const input = (request.input ?? {}) as (CustomerInput | SupplierInput) & Record<string, unknown>
  if (action === 'create') {
    return RECORD_FIELDS.filter(([key]) => input[key] !== undefined && input[key] !== '').map(([key, label]) => [label, show(input[key])])
  }
  const changed = RECORD_FIELDS.filter(([key]) => input[key] !== undefined && show(input[key]) !== show(stored?.[key]))
  return changed.length ? changed.map(([key, label]) => [label, `${show(stored?.[key])} → ${show(input[key])}`]) : [['Fields', 'No visible field changes (documents or photos only)']]
}

/** Changes to dealers, suppliers, credit sheet entries and expenses by users whose role needs approval. */
export function ChangeApprovals({ isAdmin }: { isAdmin: boolean }) {
  const { data, reviewChangeRequest } = useERP()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const requests = useMemo(() => sortByCreatedAtDesc(toArray(data?.changeRequests)), [data?.changeRequests])
  const pending = requests.filter((request) => request.status === 'pending')
  const today = todayInput()
  const reviewedToday = requests.filter((request) => request.status !== 'pending' && localDay(request.reviewedAt) === today)

  const roleOf = (userId: string) => {
    const user = data?.users[userId]
    return user ? userRoleNames(data?.roles, user) : ''
  }

  async function review(request: ChangeRequestRecord, decision: 'approve' | 'reject') {
    setBusyId(request.id)
    setFeedback(null)
    try {
      await reviewChangeRequest(request.id, decision)
      setFeedback({
        tone: 'success',
        text: `${ACTION_STYLES[request.action].label} ${KIND_LABELS[request.kind].toLowerCase()} — ${request.targetName}: ${
          decision === 'approve' ? 'approved and applied' : 'rejected'
        }.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the change.' })
    } finally {
      setBusyId(null)
    }
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text="No record changes are waiting for approval." /> : null}
      {pending.map((request) => (
        <Card key={request.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ACTION_STYLES[request.action].className)}>
                  {ACTION_STYLES[request.action].label}
                </span>
                {KIND_LABELS[request.kind]} · {request.targetName}
              </p>
              <dl className="space-y-0.5 text-sm">
                {describe(request, data).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <SubmittedBy name={request.submittedByName} role={roleOf(request.submittedById)} at={request.createdAt} />
            </div>
            {isAdmin ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busyId === request.id} onClick={() => void review(request, 'reject')}>
                  <X className="h-4 w-4" />
                  Reject
                </Button>
                <Button size="sm" className="gap-1.5" disabled={busyId === request.id} onClick={() => void review(request, 'approve')}>
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {reviewedToday.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewed today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewedToday.map((request) => (
              <div key={request.id} className="border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                <p className="font-medium">
                  {ACTION_STYLES[request.action].label} {KIND_LABELS[request.kind].toLowerCase()} · {request.targetName} <StatusPill status={request.status} />
                </p>
                <p className="text-xs text-muted-foreground">
                  Asked by {request.submittedByName} · reviewed by {request.reviewedByName}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
