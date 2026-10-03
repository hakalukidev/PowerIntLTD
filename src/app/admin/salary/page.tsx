"use client"

import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, History, Lock, ShieldCheck, XCircle } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { AdvanceRequestRecord, SalaryPaymentKind, SalaryPaymentStatus } from '@/lib/erp/types'
import {
  canAuthorizeCommission,
  computeMonthlyPay,
  currentMonthKey,
  dayKey,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  getRecentMonthKeys,
  inCommissionWindow,
  payrollSchedule,
  toArray,
  userRoleIds,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function paymentStatusTone(status: SalaryPaymentStatus) {
  if (status === 'paid') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }
  if (status === 'partial') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }
  return 'border-border bg-muted text-muted-foreground'
}

export default function SalaryPage() {
  const { data, currentUser, saveSalaryPayment, reviewCommissionAuthorization, reviewAdvanceRequest, hasPermission } = useERP()
  const canManage = hasPermission('salary.edit')
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const isOwner = canAuthorizeCommission(currentUser)
  const currency = data?.settings.currency

  const employees = useMemo(() => toArray(data?.employees), [data?.employees])
  const salaries = useMemo(() => toArray(data?.salaries), [data?.salaries])
  const authorizationRequests = useMemo(
    () =>
      toArray(data?.commissionAuthorizations).sort(
        (left, right) => Number(right.status === 'pending') - Number(left.status === 'pending') || right.requestedAt.localeCompare(left.requestedAt)
      ),
    [data?.commissionAuthorizations]
  )
  const monthOptions = useMemo(() => getRecentMonthKeys(6).reverse(), [])

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payEmployeeId, setPayEmployeeId] = useState('')
  const [payKind, setPayKind] = useState<SalaryPaymentKind>('salary')
  const [amount, setAmount] = useState('0')
  const [method, setMethod] = useState('bank')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    return employees
      .filter((employee) => employee.employmentStatus === 'active' && employee.approvalStatus === 'approved')
      // Always worked out from the live sales, collections, advances, and owner authorizations.
      .map((employee) => ({ employee, ...computeMonthlyPay(data, employee, selectedMonth) }))
  }, [data, employees, selectedMonth])

  const metrics = useMemo(() => {
    return {
      totalPayable: rows.reduce((sum, row) => sum + row.netPayable, 0),
      totalPaid: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      totalDue: rows.reduce((sum, row) => sum + row.dueAmount, 0),
      onHold: rows.filter((row) => row.holdStatus === 'hold').length,
    }
  }, [rows])

  const paymentHistory = useMemo(() => {
    return salaries
      .flatMap((salary) => salary.payments.map((payment) => ({ salary, payment })))
      .sort((left, right) => right.payment.paidAt.localeCompare(left.payment.paidAt))
      .slice(0, 25)
  }, [salaries])

  const schedule = payrollSchedule(selectedMonth)
  const advanceRequests = useMemo(
    () =>
      toArray(data?.advanceRequests).sort(
        (left, right) => Number(right.status === 'pending') - Number(left.status === 'pending') || right.createdAt.localeCompare(left.createdAt)
      ),
    [data?.advanceRequests]
  )

  function openPayDialog(employeeId: string, kind: SalaryPaymentKind) {
    const row = rows.find((item) => item.employee.id === employeeId)
    setPayEmployeeId(employeeId)
    setPayKind(kind)
    setAmount(String(row ? (kind === 'commission' ? row.commissionDue : row.salaryDue) : 0))
    setMethod('bank')
    setNote('')
    setFeedback(null)
    setPayDialogOpen(true)
  }

  const activeRow = rows.find((row) => row.employee.id === payEmployeeId)

  async function handleAuthorization(requestId: string, decision: 'approve' | 'reject') {
    setFeedback(null)
    try {
      await reviewCommissionAuthorization(requestId, decision)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to decide the request.')
    }
  }

  async function handlePaySalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      await saveSalaryPayment({
        employeeId: payEmployeeId,
        month: selectedMonth,
        kind: payKind,
        amount: Number(amount) || 0,
        method,
        note,
      })
      setPayDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record salary payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell active="Salary & Commission">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Payroll month</p>
            <p className="text-lg font-semibold">{formatMonthLabel(selectedMonth)}</p>
            <p className="text-xs text-muted-foreground">
              Salary paid from {formatDate(schedule.salaryDate)} · commission paid {formatDate(schedule.commissionFrom)} – {formatDate(schedule.commissionTo)}
            </p>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month} value={month}>
                  {formatMonthLabel(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            ['Net payable', formatCurrency(metrics.totalPayable, currency), 'Salary + commission − advances'],
            ['Paid so far', formatCurrency(metrics.totalPaid, currency), 'Across all employees'],
            ['Outstanding due', formatCurrency(metrics.totalDue, currency), 'Remaining to be paid'],
            ['No commission', metrics.onHold.toLocaleString('en-BD'), 'Below 80% of target, not authorized'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Salary &amp; commission</CardTitle>
            <CardDescription>
              Commission is units sold × commission per unit, paid for the share of credit sales collected — and only at 80% of
              target or when the owner authorizes it. Advances taken during the month are deducted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Fixed pay</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Achievement</TableHead>
                    <TableHead>Commission status</TableHead>
                    <TableHead>Advance</TableHead>
                    <TableHead>Net payable / Paid / Due</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.employee.id}>
                      <TableCell className="min-w-48">
                        <Link href={`/admin/employees/${row.employee.id}`} className="font-semibold hover:underline">{row.employee.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {[row.employee.employeeCode, row.employee.designation].filter(Boolean).join(' · ')}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-32">{formatCurrency(row.fixedPay, currency)}</TableCell>
                      <TableCell className="min-w-36">
                        <p>{formatCurrency(row.commissionAmount, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          of {formatCurrency(row.commissionEarned, currency)} · {row.collectionPercent.toFixed(0)}% collected
                        </p>
                      </TableCell>
                      <TableCell className="min-w-28">{row.achievementPercent.toFixed(1)}%</TableCell>
                      <TableCell className="min-w-36">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full',
                            row.holdStatus === 'released'
                              ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                              : 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
                          )}
                        >
                          {row.ownerAuthorized ? (
                            <>
                              <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Authorized by owner
                            </>
                          ) : row.holdStatus === 'released' ? (
                            <>
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Payable
                            </>
                          ) : (
                            <>
                              <Lock className="mr-1 h-3.5 w-3.5" /> No commission
                            </>
                          )}
                        </Badge>
                        {row.holdStatus === 'hold' && row.authorization?.status === 'pending' ? (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Waiting for owner</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-28">{row.advanceAmount ? formatCurrency(row.advanceAmount, currency) : '—'}</TableCell>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold">{formatCurrency(row.netPayable, currency)}</span>
                          <Badge variant="outline" className={cn('rounded-full', paymentStatusTone(row.paymentStatus))}>
                            {row.paymentStatus}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Paid {formatCurrency(row.paidAmount, currency)} · Due {formatCurrency(row.dueAmount, currency)}
                        </p>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex flex-col items-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => openPayDialog(row.employee.id, 'salary')}
                              disabled={row.salaryDue <= 0}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Salary {row.salaryDue > 0 ? formatCurrency(row.salaryDue, currency) : 'paid'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => openPayDialog(row.employee.id, 'commission')}
                              disabled={row.commissionDue <= 0}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Commission {row.commissionDue > 0 ? formatCurrency(row.commissionDue, currency) : '—'}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 8 : 7} className="h-28 text-center text-muted-foreground">
                        No active employees to pay yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" /> Owner authorization
            </CardTitle>
            <CardDescription>
              Applications to pay commission for a month the employee missed 80% of target.
              {isOwner ? ' Authorize or refuse them here.' : ' Only the owner can decide them.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Achievement</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applied by</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authorizationRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="min-w-40 font-medium">{request.employeeName}</TableCell>
                      <TableCell className="min-w-32">{formatMonthLabel(request.month)}</TableCell>
                      <TableCell>{request.achievementPercent.toFixed(1)}%</TableCell>
                      <TableCell className="min-w-56 text-sm">{request.reason}</TableCell>
                      <TableCell className="min-w-40 text-sm text-muted-foreground">
                        {request.requestedByName}
                        <br />
                        {formatDateTime(request.requestedAt)}
                      </TableCell>
                      <TableCell className="min-w-48 text-right">
                        {request.status === 'pending' && isOwner ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" className="rounded-xl" onClick={() => void handleAuthorization(request.id, 'approve')}>
                              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Authorize
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-destructive hover:text-destructive"
                              onClick={() => void handleAuthorization(request.id, 'reject')}
                            >
                              <XCircle className="mr-1.5 h-4 w-4" /> Refuse
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full',
                                request.status === 'approved'
                                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                  : request.status === 'rejected'
                                    ? 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
                                    : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                              )}
                            >
                              {request.status === 'approved' ? 'Authorized by owner' : request.status === 'rejected' ? 'Refused' : 'Waiting for owner'}
                            </Badge>
                            {request.reviewedByName ? (
                              <p className="mt-1 text-xs text-muted-foreground">{request.reviewedByName}</p>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {authorizationRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                        No applications yet. Apply from an employee&apos;s profile when they miss the target.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <AdvanceRequestsCard requests={advanceRequests} canReview={isAdmin} currency={currency} onReview={reviewAdvanceRequest} />

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Payment history
            </CardTitle>
            <CardDescription>Most recent salary payments across all employees and months.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Paid by</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory.map(({ salary, payment }) => (
                    <TableRow key={payment.id}>
                      <TableCell className="min-w-40 font-medium">{salary.employeeName}</TableCell>
                      <TableCell className="min-w-32">{formatMonthLabel(salary.month)}</TableCell>
                      <TableCell className="capitalize">{payment.kind ?? 'salary'}</TableCell>
                      <TableCell className="min-w-28 font-semibold">{formatCurrency(payment.amount, currency)}</TableCell>
                      <TableCell className="min-w-24 capitalize">{payment.method}</TableCell>
                      <TableCell className="min-w-32">{payment.paidBy}</TableCell>
                      <TableCell className="min-w-40 text-sm text-muted-foreground">{formatDateTime(payment.paidAt)}</TableCell>
                      <TableCell className="min-w-40 text-sm text-muted-foreground">{payment.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {paymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No salary payments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pay {payKind} — {activeRow?.employee.name}
            </DialogTitle>
            <DialogDescription>
              {payKind === 'commission' ? 'Commission' : 'Salary'} due for {formatMonthLabel(selectedMonth)}:{' '}
              {activeRow ? formatCurrency(payKind === 'commission' ? activeRow.commissionDue : activeRow.salaryDue, currency) : '—'}
            </DialogDescription>
          </DialogHeader>
          {payKind === 'commission' && !inCommissionWindow(selectedMonth, dayKey()) ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:border-amber-900 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Commission for {formatMonthLabel(selectedMonth)} is paid {formatDate(schedule.commissionFrom)} – {formatDate(schedule.commissionTo)}.
                {isAdmin ? ' As an admin you can still pay it now.' : ' Only an admin can pay it outside these days.'}
              </p>
            </div>
          ) : null}
          {payKind === 'commission' && activeRow?.holdStatus === 'hold' ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:border-amber-900 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                No commission this month — {activeRow.achievementPercent.toFixed(1)}% of the monthly target reached, below 80%. The
                owner can authorize it from the employee&apos;s profile.
              </p>
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={handlePaySalary}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount (BDT)</p>
              <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Payment method</p>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
            </div>
            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Confirm payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

/** Emergency money asked for ahead of payday; the office approves an amount, which comes off that month's pay. */
function AdvanceRequestsCard({
  requests,
  canReview,
  currency,
  onReview,
}: {
  requests: AdvanceRequestRecord[]
  canReview: boolean
  currency?: string
  onReview: (requestId: string, decision: 'approve' | 'reject', options?: { amount?: number; method?: string; note?: string }) => Promise<void>
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(request: AdvanceRequestRecord, decision: 'approve' | 'reject') {
    setBusyId(request.id)
    setError(null)
    try {
      await onReview(request.id, decision, decision === 'approve' ? { amount: Number(amounts[request.id] ?? request.amount) } : {})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review the request.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-4 w-4" /> Emergency advances
        </CardTitle>
        <CardDescription>
          Requests from employees who need money before payday. The office approves an amount — it can be less than asked — and it is
          deducted from that month&apos;s pay. Decisions go to the Daily Audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Employee</TableHead>
                <TableHead>Asked</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="min-w-40 font-medium">{request.employeeName}</TableCell>
                  <TableCell className="min-w-28 font-semibold">{formatCurrency(request.amount, currency)}</TableCell>
                  <TableCell className="min-w-56 text-sm">{request.reason}</TableCell>
                  <TableCell className="min-w-40 text-sm text-muted-foreground">
                    {request.submittedByName}
                    <br />
                    {formatDateTime(request.createdAt)}
                  </TableCell>
                  <TableCell className="min-w-64 text-right">
                    {request.status === 'pending' && canReview ? (
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-28"
                          aria-label="Approved amount"
                          value={amounts[request.id] ?? String(request.amount)}
                          onChange={(event) => setAmounts((current) => ({ ...current, [request.id]: event.target.value }))}
                        />
                        <Button size="sm" className="rounded-xl" disabled={busyId === request.id} onClick={() => void decide(request, 'approve')}>
                          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-destructive hover:text-destructive"
                          disabled={busyId === request.id}
                          onClick={() => void decide(request, 'reject')}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Badge variant="outline" className={cn('rounded-full', paymentStatusTone(request.status === 'approved' ? 'paid' : request.status === 'pending' ? 'partial' : 'unpaid'))}>
                          {request.status === 'approved'
                            ? `Given ${formatCurrency(request.approvedAmount ?? request.amount, currency)}`
                            : request.status === 'rejected'
                              ? 'Refused'
                              : 'Waiting for office'}
                        </Badge>
                        {request.reviewedByName ? <p className="mt-1 text-xs text-muted-foreground">{request.reviewedByName}</p> : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No emergency advance requests. Employees ask from My Profile.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
