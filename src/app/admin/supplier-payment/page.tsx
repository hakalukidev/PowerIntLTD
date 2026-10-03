"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Check, ImagePlus, Landmark, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { BankAccountRecord, DepositStatus, SupplierPaymentMethod, SupplierPaymentRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const PAYMENT_PROOF_FOLDER = 'supplier-payments'
/** The "From" value for cash deposited straight into the receiving bank. */
const CASH_DEPOSIT = 'cash'
const SENDING_TYPES = ['RTGS', 'BEFTN', 'Transfer', 'Deposit']

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function accountOption(account: BankAccountRecord): ComboboxOption {
  return {
    value: account.id,
    label: `${account.bankName} — ${account.accountNumber}`,
    sublabel: [account.accountName, account.branch].filter(Boolean).join(' · '),
  }
}

export default function SupplierPaymentPage() {
  const { data, currentUser, submitSupplierPayment, reviewSupplierPayment, hasPermission } = useERP()

  const [supplierId, setSupplierId] = useState('')
  const [date, setDate] = useState(todayInput)
  const [method, setMethod] = useState<SupplierPaymentMethod>('bank')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [sendingType, setSendingType] = useState('')
  const [cashReceiver, setCashReceiver] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  // Accountants enter payments through finance access, without being able to edit suppliers.
  const canEdit = hasPermission('suppliers.edit') || hasPermission('finance.edit')

  const suppliers = useMemo(
    () => toArray(data?.suppliers).sort((left, right) => left.name.localeCompare(right.name)),
    [data?.suppliers]
  )
  const nameOptions = useMemo<ComboboxOption[]>(
    () => suppliers.map((item) => ({ value: item.id, label: item.name, sublabel: `ID ${partyCode(item)} · ${item.phone}` })),
    [suppliers]
  )
  const idOptions = useMemo<ComboboxOption[]>(
    () => suppliers.map((item) => ({ value: item.id, label: partyCode(item), sublabel: `${item.name} · ${item.phone}` })),
    [suppliers]
  )

  const accounts = useMemo(
    () => toArray(data?.bankAccounts).sort((left, right) => left.bankName.localeCompare(right.bankName)),
    [data?.bankAccounts]
  )
  const fromOptions = useMemo<ComboboxOption[]>(
    () => [
      ...accounts.filter((account) => account.side === 'sender').map(accountOption),
      { value: CASH_DEPOSIT, label: 'Cash', sublabel: 'Cash deposited directly into the bank' },
    ],
    [accounts]
  )
  // The selected supplier's own accounts first, then accounts not tied to any supplier.
  const toOptions = useMemo<ComboboxOption[]>(() => {
    const receivers = accounts.filter((account) => account.side === 'receiver')
    const own = receivers.filter((account) => supplierId && account.supplierId === supplierId)
    const shared = receivers.filter((account) => !account.supplierId)
    return [...own, ...shared].map(accountOption)
  }, [accounts, supplierId])

  const supplier = supplierId ? data?.suppliers[supplierId] ?? null : null
  const toAccount = toAccountId ? data?.bankAccounts[toAccountId] ?? null : null
  const isCashDeposit = method === 'bank' && fromAccountId === CASH_DEPOSIT
  const proofRequired = method === 'cash' || isCashDeposit

  const proofPreview = useMemo(() => (proofFile ? URL.createObjectURL(proofFile) : ''), [proofFile])
  useEffect(() => () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
  }, [proofPreview])

  const payments = useMemo(() => sortByCreatedAtDesc(toArray(data?.supplierPayments)), [data?.supplierPayments])
  const visiblePayments = statusFilter === 'all' ? payments : payments.filter((payment) => payment.status === statusFilter)
  const pendingForSupplier = supplier
    ? payments.filter((payment) => payment.supplierId === supplier.id && payment.status === 'pending').reduce((sum, payment) => sum + payment.amount, 0)
    : 0
  const approvedForSupplier = supplier
    ? payments.filter((payment) => payment.supplierId === supplier.id && payment.status === 'approved').reduce((sum, payment) => sum + payment.amount, 0)
    : 0

  function selectSupplier(id: string) {
    setSupplierId(id)
    setFeedback(null)
    // A receiving account linked to another supplier no longer applies.
    const current = toAccountId ? data?.bankAccounts[toAccountId] : undefined
    if (current?.supplierId && current.supplierId !== id) setToAccountId('')
    // Pick the supplier's own account when there is exactly one.
    const own = accounts.filter((account) => account.side === 'receiver' && account.supplierId === id)
    if (own.length === 1) setToAccountId(own[0].id)
  }

  function selectFrom(id: string) {
    setFromAccountId(id)
    if (id === CASH_DEPOSIT) setSendingType('Deposit')
  }

  function resetForm() {
    setSupplierId('')
    setDate(todayInput())
    setMethod('bank')
    setFromAccountId('')
    setToAccountId('')
    setSendingType('')
    setCashReceiver('')
    setProofFile(null)
    setAmount('')
    setPurpose('')
    setNote('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const value = Number(amount)
    if (!supplier) return setFeedback({ tone: 'error', text: 'Select a supplier.' })
    if (method === 'bank') {
      if (!fromAccountId) return setFeedback({ tone: 'error', text: 'Select where the payment is sent from.' })
      if (!toAccountId) return setFeedback({ tone: 'error', text: 'Select the receiving bank.' })
      if (!sendingType) return setFeedback({ tone: 'error', text: 'Select the sending type.' })
    } else if (!cashReceiver.trim()) {
      return setFeedback({ tone: 'error', text: 'Enter who received the cash.' })
    }
    if (proofRequired && !proofFile) return setFeedback({ tone: 'error', text: 'Attach the deposit proof (voucher or slip).' })
    if (!(value > 0)) return setFeedback({ tone: 'error', text: 'Enter an amount greater than zero.' })
    if (!purpose.trim()) return setFeedback({ tone: 'error', text: 'Enter the purpose.' })

    setIsSaving(true)
    let uploaded: { imageUrl: string; imagePublicId: string } | null = null
    try {
      if (proofFile) uploaded = await uploadImageToCloudinary(proofFile, PAYMENT_PROOF_FOLDER)
      await submitSupplierPayment({
        supplierId: supplier.id,
        date: new Date(date).toISOString(),
        method,
        fromAccountId,
        toAccountId,
        sendingType,
        cashReceiver,
        proofUrl: uploaded?.imageUrl,
        proofPublicId: uploaded?.imagePublicId,
        amount: value,
        purpose,
        note,
      })
      setFeedback({ tone: 'success', text: `Payment of ${formatCurrency(value)} to ${supplier.name} sent for approval.` })
      resetForm()
    } catch (error) {
      if (uploaded) void deleteCloudinaryImage(uploaded.imagePublicId).catch(() => undefined)
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the payment.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(payment: SupplierPaymentRecord, decision: 'approve' | 'reject') {
    setReviewingId(payment.id)
    try {
      await reviewSupplierPayment(payment.id, decision)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the payment.' })
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <AdminShell active="Payment Form">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Supplier payment</CardTitle>
              <CardDescription>The payment counts once an admin approves it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Supplier<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={nameOptions} value={supplierId} onChange={selectSupplier} placeholder="Select supplier" searchPlaceholder="Search name or phone..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Supplier ID<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={idOptions} value={supplierId} onChange={selectSupplier} placeholder="Select ID" searchPlaceholder="Search ID..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Date<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Method<span className="ml-0.5 text-rose-500">*</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['bank', 'cash'] as const).map((item) => (
                      <Button
                        key={item}
                        type="button"
                        variant={method === item ? 'default' : 'outline'}
                        className="capitalize"
                        onClick={() => setMethod(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>

                {method === 'bank' ? (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">From<span className="ml-0.5 text-rose-500">*</span></p>
                      <Combobox options={fromOptions} value={fromAccountId} onChange={selectFrom} placeholder="Select bank or cash" searchPlaceholder="Search bank..." />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">To<span className="ml-0.5 text-rose-500">*</span></p>
                      <Combobox
                        options={toOptions}
                        value={toAccountId}
                        onChange={setToAccountId}
                        placeholder="Select bank"
                        searchPlaceholder="Search bank..."
                        emptyText="No receiver banks — ask an admin."
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Sending type<span className="ml-0.5 text-rose-500">*</span></p>
                      <Select value={sendingType} onValueChange={setSendingType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SENDING_TYPES.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Cash received by<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input value={cashReceiver} onChange={(event) => setCashReceiver(event.target.value)} placeholder="Name of the person who took the cash" />
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Amount<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 50000" required />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Deposit proof
                    {proofRequired ? <span className="ml-0.5 text-rose-500">*</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
                  </p>
                  {proofFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={proofPreview} alt="Deposit proof" className="h-16 w-16 rounded object-cover" />
                      <span className="min-w-0 flex-1 truncate text-sm">{proofFile.name}</span>
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove proof" onClick={() => setProofFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:bg-muted/40">
                      <ImagePlus className="h-4 w-4" />
                      Add photo of the company voucher or bank slip
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => {
                          setProofFile(event.target.files?.[0] ?? null)
                          event.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">Purpose<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Advance for LC shipment" required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Transaction ID, cheque no." rows={2} />
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
                <CardTitle className="text-base">Supplier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {supplier ? (
                  <>
                    <div>
                      <p className="font-medium">{supplier.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ID {partyCode(supplier)}
                        {supplier.company ? ` · ${supplier.company}` : ''}
                      </p>
                    </div>
                    <dl className="space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd>{supplier.phone || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Awaiting approval</dt>
                        <dd className="tabular-nums">{formatCurrency(pendingForSupplier)}</dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
                        <dt>Total paid</dt>
                        <dd className="tabular-nums">{formatCurrency(approvedForSupplier)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a supplier to see their details.</p>
                )}
              </CardContent>
            </Card>

            {method === 'bank' && toAccount ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark className="h-4 w-4" />
                    Receiving account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-1.5 text-sm">
                    {[
                      ['Bank', toAccount.bankName],
                      ['Account holder', toAccount.accountName],
                      ['Account no.', toAccount.accountNumber],
                      ['Branch', toAccount.branch],
                      ['Routing no.', toAccount.routingNumber],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2">
                        <dt className="shrink-0 text-muted-foreground">{label}</dt>
                        <dd className="text-right">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            {isAdmin ? (
              <Button asChild variant="outline" className="w-full gap-1.5">
                <Link href="/admin/bank-accounts">
                  <Landmark className="h-4 w-4" />
                  Manage bank accounts
                </Link>
              </Button>
            ) : null}
          </aside>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Supplier payments</CardTitle>
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
            {visiblePayments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No payments here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Proof</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{payment.supplierName}</span>
                        <span className="block text-xs text-muted-foreground">ID {partyCode(data?.suppliers[payment.supplierId] ?? { id: payment.supplierId })}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {payment.method === 'bank' ? (
                          <>
                            <span className="block font-medium">Bank · {payment.sendingType}</span>
                            <span className="block text-muted-foreground">From {payment.fromLabel || '—'}</span>
                            <span className="block text-muted-foreground">To {payment.toLabel || '—'}</span>
                          </>
                        ) : (
                          <>
                            <span className="block font-medium">Cash</span>
                            <span className="block text-muted-foreground">Received by {payment.cashReceiver}</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell className="max-w-48">
                        <span className="block truncate" title={payment.purpose}>
                          {payment.purpose}
                        </span>
                        {payment.note ? (
                          <span className="block truncate text-xs text-muted-foreground" title={payment.note}>
                            {payment.note}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {payment.proofUrl ? (
                          <a href={payment.proofUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-2 hover:underline">
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{payment.submittedByName}</TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[payment.status])}>
                          {payment.status}
                        </span>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {payment.status === 'pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="gap-1"
                                disabled={reviewingId === payment.id}
                                onClick={() => void handleReview(payment, 'approve')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewingId === payment.id}
                                onClick={() => void handleReview(payment, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{payment.reviewedByName ?? ''}</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
