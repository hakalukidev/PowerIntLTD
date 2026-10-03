"use client"

import { useMemo, useState } from 'react'
import { Check, FileImage, Pencil, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { DepositStatus, EditableSubmissionKind, ERPData, SubmissionEdit, SubmissionPatch } from '@/lib/erp/types'
import { formatCurrency, formatDate, getExpenseCategories, sortByCreatedAtDesc, toArray, userRoleNames } from '@/lib/erp/utils'

import { EditHistory, EmptyState, FeedbackBanner, NotifyButtons, StatusPill, SubmittedBy, localDay, todayInput, type Feedback } from './shared'

type SubmissionRow = {
  id: string
  party: string
  amount: number
  date: string
  status: DepositStatus
  group: string
  details: Array<[string, string]>
  submittedByName: string
  submittedByRole: string
  submittedAt: string
  reviewedAt?: string
  reviewedByName?: string
  edits?: SubmissionEdit[]
  documentUrl?: string
  /** Fields the edit dialog starts from. */
  editable: SubmissionPatch
  /** Actual TA amounts come from the trips, so the amount is not editable. */
  amountLocked?: boolean
  notify?: { phone: string; message: string }
}

const KIND_COPY: Record<EditableSubmissionKind, { empty: string; noun: string }> = {
  deposits: { empty: 'No deposits are waiting for approval.', noun: 'deposit' },
  supplierPayments: { empty: 'No supplier payments are waiting for approval.', noun: 'payment' },
  expenses: { empty: 'No expenses are waiting for approval.', noun: 'expense' },
}

function buildRows(kind: EditableSubmissionKind, data: ERPData): SubmissionRow[] {
  const roleOf = (userId: string) => {
    const user = data.users[userId]
    return user ? userRoleNames(data.roles, user) : ''
  }
  const company = data.settings.companyName

  if (kind === 'deposits') {
    return sortByCreatedAtDesc(toArray(data.deposits)).map((deposit) => ({
      id: deposit.id,
      party: deposit.customerName,
      amount: deposit.amount,
      date: deposit.date,
      status: deposit.status,
      group: '',
      details: [
        ['Method', deposit.method],
        ['Current due', formatCurrency(data.customers[deposit.customerId]?.due ?? 0)],
        ['Note', deposit.note],
      ],
      submittedByName: deposit.submittedByName,
      submittedByRole: roleOf(deposit.submittedById),
      submittedAt: deposit.createdAt,
      reviewedAt: deposit.reviewedAt,
      reviewedByName: deposit.reviewedByName,
      edits: deposit.edits,
      editable: { amount: deposit.amount, date: deposit.date, method: deposit.method, note: deposit.note },
      notify: {
        phone: data.customers[deposit.customerId]?.phone ?? '',
        message: `Dear ${deposit.customerName}, ${company} has received your payment of ${deposit.amount.toLocaleString()} BDT (${deposit.method}) on ${formatDate(deposit.date)}. Thank you.`,
      },
    }))
  }

  if (kind === 'supplierPayments') {
    return sortByCreatedAtDesc(toArray(data.supplierPayments)).map((payment) => ({
      id: payment.id,
      party: payment.supplierName,
      amount: payment.amount,
      date: payment.date,
      status: payment.status,
      group: '',
      details:
        payment.method === 'bank'
          ? [
              ['Method', `Bank${payment.sendingType ? ` · ${payment.sendingType}` : ''}`],
              ['From', payment.fromLabel],
              ['To', payment.toLabel],
              ['Purpose', payment.purpose],
              ['Note', payment.note],
            ]
          : [
              ['Method', 'Cash'],
              ['Received by', payment.cashReceiver],
              ['Purpose', payment.purpose],
              ['Note', payment.note],
            ],
      submittedByName: payment.submittedByName,
      submittedByRole: roleOf(payment.submittedById),
      submittedAt: payment.createdAt,
      reviewedAt: payment.reviewedAt,
      reviewedByName: payment.reviewedByName,
      edits: payment.edits,
      documentUrl: payment.proofUrl,
      editable: { amount: payment.amount, date: payment.date, purpose: payment.purpose, note: payment.note },
      notify: {
        phone: data.suppliers[payment.supplierId]?.phone ?? '',
        message: `Dear ${payment.supplierName}, ${company} has sent you ${payment.amount.toLocaleString()} BDT (${payment.method === 'bank' ? 'bank' : 'cash'}) on ${formatDate(payment.date)} for ${payment.purpose}.`,
      },
    }))
  }

  // Expenses without a status were entered on the finance page and never need approval.
  return sortByCreatedAtDesc(toArray(data.expenses).filter((expense) => expense.status)).map((expense) => ({
    id: expense.id,
    party: expense.expenseBy || expense.createdByName,
    amount: expense.amount,
    date: expense.date,
    status: expense.status ?? 'approved',
    group: expense.category,
    details: [
      ['Category', expense.taType ? `${expense.category} (${expense.taType})` : expense.category],
      ...(expense.taEntries?.length
        ? [['Trips', expense.taEntries.map((entry) => `${entry.from}→${entry.to} ${entry.vehicle} ${entry.amount}`).join('; ')] as [string, string]]
        : []),
      ['Note', expense.note],
    ],
    submittedByName: expense.createdByName,
    submittedByRole: roleOf(expense.createdBy),
    submittedAt: expense.createdAt,
    reviewedAt: expense.reviewedAt,
    reviewedByName: expense.reviewedByName,
    edits: expense.edits,
    documentUrl: expense.documentUrl,
    editable: { amount: expense.amount, date: expense.date, category: expense.category, note: expense.note },
    amountLocked: expense.taType === 'actual',
  }))
}

export function SubmissionApprovals({ kind, isAdmin }: { kind: EditableSubmissionKind; isAdmin: boolean }) {
  const { data, reviewDeposit, reviewSupplierPayment, reviewExpense } = useERP()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<SubmissionRow | null>(null)

  const rows = useMemo(() => (data ? buildRows(kind, data) : []), [data, kind])
  const pending = rows.filter((row) => row.status === 'pending')
  const today = todayInput()
  const reviewedToday = rows.filter((row) => row.status !== 'pending' && localDay(row.reviewedAt) === today)

  // Expenses are shown by category, each with its subtotal.
  const groups = useMemo(() => {
    const map = new Map<string, SubmissionRow[]>()
    pending.forEach((row) => map.set(row.group, [...(map.get(row.group) ?? []), row]))
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [pending])

  async function review(row: SubmissionRow, decision: 'approve' | 'reject') {
    setBusyId(row.id)
    setFeedback(null)
    try {
      const reviewFn = kind === 'deposits' ? reviewDeposit : kind === 'supplierPayments' ? reviewSupplierPayment : reviewExpense
      await reviewFn(row.id, decision)
      setFeedback({
        tone: 'success',
        text: `${KIND_COPY[kind].noun[0].toUpperCase()}${KIND_COPY[kind].noun.slice(1)} of ${formatCurrency(row.amount)} (${row.party}) ${decision === 'approve' ? 'approved' : 'rejected'} and added to the daily audit.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review it.' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />
      {!pending.length ? <EmptyState text={KIND_COPY[kind].empty} /> : null}
      {groups.map(([group, groupRows]) => (
        <div key={group || 'all'} className="space-y-3">
          {group ? (
            <div className="flex items-baseline justify-between border-b border-border pb-1">
              <h3 className="text-sm font-semibold">{group}</h3>
              <span className="text-sm tabular-nums text-muted-foreground">
                {groupRows.length} · {formatCurrency(groupRows.reduce((sum, row) => sum + row.amount, 0))}
              </span>
            </div>
          ) : null}
          {groupRows.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium">
                    {row.party} · <span className="tabular-nums">{formatCurrency(row.amount)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Date {formatDate(row.date)}</p>
                  <dl className="space-y-0.5 text-sm">
                    {row.details
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                          <dd className="min-w-0 break-words">{value}</dd>
                        </div>
                      ))}
                  </dl>
                  {row.documentUrl ? (
                    <a href={row.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline">
                      <FileImage className="h-4 w-4" />
                      View voucher / proof
                    </a>
                  ) : null}
                  <SubmittedBy name={row.submittedByName} role={row.submittedByRole} at={row.submittedAt} />
                  <EditHistory edits={row.edits} />
                </div>
                {isAdmin ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === row.id} onClick={() => setEditing(row)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busyId === row.id} onClick={() => void review(row, 'reject')}>
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button size="sm" className="gap-1.5" disabled={busyId === row.id} onClick={() => void review(row, 'approve')}>
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {reviewedToday.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewed today</CardTitle>
            {kind !== 'expenses' ? <CardDescription>Let the {kind === 'deposits' ? 'dealer' : 'supplier'} know it went through.</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewedToday.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium">
                    {row.party} · {formatCurrency(row.amount)} <StatusPill status={row.status} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    By {row.reviewedByName}
                    {row.edits?.length ? ' · edited' : ''}
                  </p>
                </div>
                {row.status === 'approved' && row.notify ? <NotifyButtons phone={row.notify.phone} message={row.notify.message} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <EditSubmissionDialog kind={kind} row={editing} onClose={() => setEditing(null)} onSaved={(text) => setFeedback({ tone: 'success', text })} />
      ) : null}
    </div>
  )
}

function EditSubmissionDialog({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: EditableSubmissionKind
  row: SubmissionRow
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const { data, editSubmission } = useERP()
  const [amount, setAmount] = useState(String(row.editable.amount ?? ''))
  const [date, setDate] = useState(localDay(row.editable.date))
  const [method, setMethod] = useState(row.editable.method ?? '')
  const [purpose, setPurpose] = useState(row.editable.purpose ?? '')
  const [category, setCategory] = useState(row.editable.category ?? '')
  const [note, setNote] = useState(row.editable.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const methods = useMemo(() => Array.from(new Set([...(data?.settings.depositMethods ?? []), method].filter(Boolean))), [data?.settings.depositMethods, method])
  const categories = useMemo(
    () => Array.from(new Set([...getExpenseCategories(data?.settings.expenseCategories), category].filter(Boolean))),
    [data?.settings.expenseCategories, category]
  )

  async function save() {
    // Keep the stored time of day when only the calendar date is unchanged.
    const patch: SubmissionPatch = {
      amount: Number(amount),
      date: date === localDay(row.editable.date) ? row.editable.date : new Date(date).toISOString(),
      note,
      ...(kind === 'deposits' ? { method } : {}),
      ...(kind === 'supplierPayments' ? { purpose } : {}),
      ...(kind === 'expenses' ? { category } : {}),
    }
    setIsSaving(true)
    setError(null)
    try {
      await editSubmission(kind, row.id, patch)
      onSaved(`${row.party}'s ${KIND_COPY[kind].noun} edited. Approve it to send it to the daily audit.`)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the changes.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {KIND_COPY[kind].noun} — {row.party}
          </DialogTitle>
          <DialogDescription>Your name and every changed field are recorded on it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Amount</span>
            <Input type="number" min={0} value={amount} disabled={row.amountLocked} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Date</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {kind === 'deposits' ? (
            <div className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Method</span>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {kind === 'expenses' ? (
            <div className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Category</span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {kind === 'supplierPayments' ? (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Purpose</span>
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </label>
          ) : null}
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Note</span>
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
