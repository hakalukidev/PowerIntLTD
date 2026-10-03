"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, Plus, Settings2, Wallet, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { DepositRecord, DepositStatus } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { APPROVAL_STAGE_LABELS, approvalStage, canActAtStage, formatCurrency, formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function DepositPage() {
  const { data, currentUser, submitDeposit, reviewDeposit, updateSettings, hasPermission } = useERP()
  const { zones, customers } = useZoneAccess()

  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(todayInput)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [newMethod, setNewMethod] = useState('')

  const roleIds = currentUser ? userRoleIds(currentUser) : []
  const isAdmin = roleIds.includes('admin')
  const isApprover = isAdmin || roleIds.includes('authorizer') || roleIds.includes('chairman')
  const canEdit = hasPermission('credit_sheet.edit')
  const methods = data?.settings.depositMethods ?? []

  const sortedCustomers = useMemo(() => [...customers].sort((left, right) => left.name.localeCompare(right.name)), [customers])
  const nameOptions = useMemo<ComboboxOption[]>(
    () => sortedCustomers.map((item) => ({ value: item.id, label: item.name, sublabel: `ID ${partyCode(item)} · ${item.phone}` })),
    [sortedCustomers]
  )
  const idOptions = useMemo<ComboboxOption[]>(
    () => sortedCustomers.map((item) => ({ value: item.id, label: partyCode(item), sublabel: `${item.name} · ${item.phone}` })),
    [sortedCustomers]
  )

  const customer = customerId ? data?.customers[customerId] ?? null : null
  const deposits = useMemo(() => sortByCreatedAtDesc(toArray(data?.deposits)), [data?.deposits])
  const pendingForCustomer = customer
    ? deposits.filter((deposit) => deposit.customerId === customer.id && deposit.status === 'pending').reduce((sum, deposit) => sum + deposit.amount, 0)
    : 0
  const visibleDeposits = statusFilter === 'all' ? deposits : deposits.filter((deposit) => deposit.status === statusFilter)
  const address = customer ? [customer.location, customer.thana, customer.district].filter(Boolean).join(', ') : ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const value = Number(amount)
    if (!customer) return setFeedback({ tone: 'error', text: 'Select a dealer.' })
    if (!(value > 0)) return setFeedback({ tone: 'error', text: 'Enter an amount greater than zero.' })
    if (!method) return setFeedback({ tone: 'error', text: 'Select a payment method.' })

    setIsSaving(true)
    try {
      await submitDeposit({ customerId: customer.id, date: new Date(date).toISOString(), amount: value, method, note })
      setFeedback({ tone: 'success', text: `Deposit of ${formatCurrency(value)} for ${customer.name} sent to the Authorizer, then the Chairman for approval.` })
      setCustomerId('')
      setDate(todayInput())
      setAmount('')
      setMethod('')
      setNote('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the deposit.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(deposit: DepositRecord, decision: 'approve' | 'reject') {
    setReviewingId(deposit.id)
    try {
      await reviewDeposit(deposit.id, decision)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the deposit.' })
    } finally {
      setReviewingId(null)
    }
  }

  async function saveMethods(next: string[]) {
    try {
      await updateSettings({ depositMethods: next })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the payment methods.' })
    }
  }

  function addMethod() {
    const name = newMethod.trim()
    if (!name) return
    if (methods.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setNewMethod('')
      return
    }
    void saveMethods([...methods, name])
    setNewMethod('')
  }

  return (
    <AdminShell active="Deposit Form">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>New deposit</CardTitle>
              <CardDescription>Goes to your zone’s Authorizer, then the Chairman. The dealer’s due goes down once the Chairman approves it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dealer name<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={nameOptions} value={customerId} onChange={setCustomerId} placeholder="Select dealer" searchPlaceholder="Search name or phone..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dealer ID No<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={idOptions} value={customerId} onChange={setCustomerId} placeholder="Select ID" searchPlaceholder="Search ID..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Date<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Address</p>
                  <Input value={address} readOnly placeholder="Fills in from the dealer" className="bg-muted/40" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Amount<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 50000" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Method<span className="ml-0.5 text-rose-500">*</span></p>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder={methods.length ? 'Select method' : 'No methods — ask an admin'} />
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
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Particular / Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Cheque no., transaction ID" rows={2} />
                </div>
                {feedback ? (
                  <p
                    className={cn(
                      'rounded-lg border px-4 py-3 text-sm sm:col-span-2',
                      feedback.tone === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    )}
                  >
                    {feedback.text}
                  </p>
                ) : null}
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={!canEdit || isSaving} className="w-full sm:w-auto">
                    {isSaving ? 'Submitting...' : 'Submit for approval'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  Dealer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {customer ? (
                  <>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ID {partyCode(customer)} · {customerZoneName(customer, zones)}
                      </p>
                    </div>
                    <dl className="space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd>{customer.phone || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="shrink-0 text-muted-foreground">Address</dt>
                        <dd className="text-right">{address || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Awaiting approval</dt>
                        <dd className="tabular-nums">{formatCurrency(pendingForCustomer)}</dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
                        <dt>Due amount</dt>
                        <dd className={cn('tabular-nums', customer.due > 0 && 'text-rose-600')}>{formatCurrency(customer.due)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a dealer to see their address and due.</p>
                )}
              </CardContent>
            </Card>

            {isAdmin ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="h-4 w-4" />
                    Payment methods
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {methods.map((item) => (
                      <span key={item} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                        {item}
                        <button
                          type="button"
                          aria-label={`Remove ${item}`}
                          className="text-muted-foreground hover:text-rose-600"
                          onClick={() => void saveMethods(methods.filter((method) => method !== item))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {!methods.length ? <p className="text-xs text-muted-foreground">No methods yet.</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newMethod}
                      onChange={(event) => setNewMethod(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addMethod()
                        }
                      }}
                      placeholder="e.g. bKash"
                    />
                    <Button type="button" size="icon" variant="outline" aria-label="Add method" onClick={addMethod}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Deposits</CardTitle>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DepositStatus | 'all')}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {visibleDeposits.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No deposits here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isApprover ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDeposits.map((deposit) => {
                    const stage = approvalStage(deposit)
                    return (
                    <TableRow key={deposit.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(deposit.date)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{deposit.customerName}</span>
                        <span className="block text-xs text-muted-foreground">ID {partyCode(data?.customers[deposit.customerId] ?? { id: deposit.customerId })}</span>
                      </TableCell>
                      <TableCell>{deposit.method}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(deposit.amount)}</TableCell>
                      <TableCell className="max-w-48 truncate" title={deposit.note}>
                        {deposit.note || '—'}
                      </TableCell>
                      <TableCell>{deposit.submittedByName}</TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[deposit.status])}>
                          {stage ? APPROVAL_STAGE_LABELS[stage] : deposit.status}
                        </span>
                        {deposit.authorizedByName ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">Authorized by {deposit.authorizedByName}</span>
                        ) : null}
                      </TableCell>
                      {isApprover ? (
                        <TableCell className="text-right">
                          {canActAtStage(currentUser, stage) ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="gap-1"
                                disabled={reviewingId === deposit.id}
                                onClick={() => void handleReview(deposit, 'approve')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {stage === 'authorizer' ? 'Authorize' : 'Final approve'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewingId === deposit.id}
                                onClick={() => void handleReview(deposit, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{deposit.reviewedByName ?? ''}</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
