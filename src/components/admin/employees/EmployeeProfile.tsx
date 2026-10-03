"use client"

import { useMemo, useState, type FormEvent } from 'react'
import {
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Clock,
  FileDown,
  HandCoins,
  Lock,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react'

import { compensationLabels, DetailRow, FormField, monthlyFixedPay, todayIsoDate, useJoiningLetter } from '@/components/admin/employees/EmployeeForms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { balanceSide, buildEmployeeLedger, ledgerTotalsOf, withRunningBalance } from '@/lib/erp/ledger'
import { useERP } from '@/lib/erp/provider'
import type { EmployeeRecord } from '@/lib/erp/types'
import {
  canAuthorizeCommission,
  computeMonthlyPay,
  currentMonthKey,
  employmentStatusLabel,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  getProbationStatus,
  getRecentMonthKeys,
  getTargetAchievement,
  monthlyAttendance,
  TARGET_ACHIEVEMENT_HOLD_THRESHOLD,
  toArray,
} from '@/lib/erp/utils'
import { customerZoneId, subZoneLabel } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const toneGood = 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
const toneWarn = 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
const toneBad = 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
const toneInfo = 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tracking-tight sm:text-lg">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function PayLine({ label, value, strong, minus }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong && 'border-t border-border/70 pt-2.5 font-semibold')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span className={cn(minus && 'text-rose-600 dark:text-rose-400')}>
        {minus ? '− ' : ''}
        {value}
      </span>
    </div>
  )
}

/**
 * One employee's profile: details, pay structure, the month's target and commission, advances,
 * the payable amount, payment history, and the clients of their zone or area. `selfView` is the
 * employee looking at their own profile: they can apply for owner authorization but not change pay.
 */
export function EmployeeProfile({ employee, selfView = false }: { employee: EmployeeRecord; selfView?: boolean }) {
  const {
    data,
    currentUser,
    hasPermission,
    saveEmployeeAdvance,
    deleteEmployeeAdvance,
    requestCommissionAuthorization,
    reviewCommissionAuthorization,
    requestAdvance,
  } = useERP()
  const downloadLetter = useJoiningLetter()
  const currency = data?.settings.currency
  const canManagePay = !selfView && hasPermission('salary.edit')
  const isOwner = canAuthorizeCommission(currentUser)
  const monthOptions = useMemo(() => getRecentMonthKeys(6).reverse(), [])
  const zones = useMemo(() => toArray(data?.zones), [data?.zones])

  const [month, setMonth] = useState(currentMonthKey())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [letterBusy, setLetterBusy] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({ date: todayIsoDate(), amount: '', method: 'cash', note: '' })
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestForm, setRequestForm] = useState({ amount: '', reason: '' })
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyReason, setApplyReason] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [clientQuery, setClientQuery] = useState('')

  const pay = useMemo(() => computeMonthlyPay(data, employee, month), [data, employee, month])
  const achievement = getTargetAchievement({
    unitsSold: pay.unitsSold,
    unitTarget: pay.unitTarget,
    amountSold: pay.amountSold,
    amountTarget: pay.amountTarget,
  })
  const probation = getProbationStatus(employee)
  const attendance = monthlyAttendance(data?.attendance, employee, month)
  const monthOver = month < currentMonthKey()
  const zoneName = data?.zones[employee.zoneId]?.name ?? ''
  const targetReached = pay.achievementPercent >= TARGET_ACHIEVEMENT_HOLD_THRESHOLD
  const authorization = pay.authorization

  const sheet = useMemo(() => (data ? withRunningBalance(buildEmployeeLedger(employee, data)) : []), [data, employee])
  const sheetTotals = ledgerTotalsOf(sheet)
  const advanceRequests = useMemo(
    () =>
      toArray(data?.advanceRequests)
        .filter((request) => request.employeeId === employee.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 5),
    [data?.advanceRequests, employee.id]
  )
  const pendingRequest = advanceRequests.find((request) => request.status === 'pending')
  const canRequestAdvance = selfView || hasPermission('salary.edit')

  // Clients of the employee's zone, narrowed to their area when one is set.
  const clients = useMemo(() => {
    if (!employee.zoneId && !employee.area) return []
    const area = employee.area.trim().toLowerCase()
    return toArray(data?.customers)
      .filter((customer) => !employee.zoneId || customerZoneId(customer, zones) === employee.zoneId)
      .filter((customer) => !area || (customer.thana ?? '').trim().toLowerCase() === area)
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [data?.customers, employee.area, employee.zoneId, zones])
  const filteredClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase()
    if (!query) return clients
    return clients.filter((customer) =>
      [customer.name, customer.company, customer.phone, customer.thana, customer.district].join(' ').toLowerCase().includes(query)
    )
  }, [clientQuery, clients])
  const clientDue = clients.reduce((sum, customer) => sum + (customer.due ?? 0), 0)

  async function handleLetter() {
    setFeedback(null)
    setLetterBusy(true)
    try {
      await downloadLetter(employee)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to make the joining letter.')
    } finally {
      setLetterBusy(false)
    }
  }

  async function handleAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDialogError(null)
    setBusy(true)
    try {
      await saveEmployeeAdvance({
        employeeId: employee.id,
        date: advanceForm.date,
        amount: Number(advanceForm.amount),
        method: advanceForm.method,
        note: advanceForm.note,
      })
      setAdvanceOpen(false)
      setMonth(advanceForm.date.slice(0, 7))
      setFeedback(`Advance of ${formatCurrency(Number(advanceForm.amount), currency)} recorded. It comes off ${formatMonthLabel(advanceForm.date.slice(0, 7))}'s pay.`)
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Unable to record the advance.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRequestAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDialogError(null)
    setBusy(true)
    try {
      await requestAdvance({ employeeId: employee.id, amount: Number(requestForm.amount), reason: requestForm.reason })
      setRequestOpen(false)
      setFeedback('Emergency advance request sent to the office.')
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Unable to send the request.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAdvance(advanceId: string) {
    setFeedback(null)
    try {
      await deleteEmployeeAdvance(advanceId)
      setFeedback('Advance removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove the advance.')
    }
  }

  async function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDialogError(null)
    setBusy(true)
    try {
      await requestCommissionAuthorization({ employeeId: employee.id, month, reason: applyReason })
      setApplyOpen(false)
      setApplyReason('')
      setFeedback('Application sent to the owner.')
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Unable to send the application.')
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(decision: 'approve' | 'reject') {
    if (!authorization) return
    setFeedback(null)
    try {
      await reviewCommissionAuthorization(authorization.id, decision, reviewNote)
      setReviewNote('')
      setFeedback(decision === 'approve' ? 'Commission authorized by owner.' : 'Application refused.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to decide the application.')
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-6 w-6 text-muted-foreground" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{employee.name}</h2>
                {employee.employeeCode ? (
                  <Badge variant="outline" className="rounded-full font-mono">{employee.employeeCode}</Badge>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Briefcase className="h-4 w-4" /> {employee.designation} · {compensationLabels[employee.compensationType]}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {employee.phone}</span>
                {zoneName || employee.area ? (
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {[zoneName, employee.area].filter(Boolean).join(' · ')}</span>
                ) : null}
                <span>Joined {formatDate(employee.joiningDate)}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {employee.approvalStatus !== 'approved' ? (
                  <Badge variant="outline" className={cn('rounded-full', employee.approvalStatus === 'pending' ? toneWarn : toneBad)}>
                    {employee.approvalStatus === 'pending' ? 'Awaiting approval' : 'Rejected'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className={cn('rounded-full', probation.confirmationStatus === 'confirmed' ? toneGood : toneInfo)}>
                    {probation.confirmationStatus === 'confirmed' ? 'Confirmed' : `Probation · ${probation.daysRemaining}d left`}
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-full">{employmentStatusLabel(employee.employmentStatus)}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
            {employee.approvalStatus === 'approved' ? (
              <Button variant="outline" className="rounded-xl" onClick={() => void handleLetter()} disabled={letterBusy}>
                <FileDown className="mr-2 h-4 w-4" />
                {letterBusy ? 'Preparing…' : 'Joining letter (PDF)'}
              </Button>
            ) : null}
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-full rounded-xl sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option} value={option}>{formatMonthLabel(option)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {feedback ? (
        <Card className="border-border/70 bg-primary/5 shadow-sm">
          <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
        </Card>
      ) : null}

      {employee.approvalStatus !== 'approved' ? (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Pay, target, and commission show here once an admin approves the joining form.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Pay structure</CardTitle>
                <CardDescription>Set by an admin on approval.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {employee.compensationType === 'salary' ? (
                  <>
                    <DetailRow label="Basic salary" value={formatCurrency(employee.baseSalary, currency)} />
                    <DetailRow label="TA/DA (monthly)" value={formatCurrency(employee.taDa, currency)} />
                    <DetailRow label="House rent" value={formatCurrency(employee.houseRent, currency)} />
                    <DetailRow label="Mobile bill" value={formatCurrency(employee.mobileBill, currency)} />
                  </>
                ) : null}
                <DetailRow label="DA per present day" value={formatCurrency(employee.daPerDay, currency)} />
                <DetailRow label="Commission per unit" value={formatCurrency(employee.commissionPerUnit, currency)} />
                <DetailRow label="Monthly fixed pay" value={formatCurrency(monthlyFixedPay(employee), currency)} />
                <DetailRow label="Monthly target (pcs)" value={employee.monthlyUnitTarget.toLocaleString('en-BD')} />
                <DetailRow label="Monthly target (sales)" value={formatCurrency(employee.monthlyAmountTarget, currency)} />
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Target · {formatMonthLabel(month)}</CardTitle>
                <CardDescription>
                  Commission needs {TARGET_ACHIEVEMENT_HOLD_THRESHOLD}% of either target, and is paid for the share of credit sales collected.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pieces sold</span>
                    <span className="font-medium">{pay.unitsSold.toLocaleString('en-BD')} / {pay.unitTarget.toLocaleString('en-BD')}</span>
                  </div>
                  <Progress value={achievement.unitProgressPercent} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sales amount</span>
                    <span className="font-medium">{formatCurrency(pay.amountSold, currency)} / {formatCurrency(pay.amountTarget, currency)}</span>
                  </div>
                  <Progress value={achievement.amountProgressPercent} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Due collected</span>
                    <span className="font-medium">{formatCurrency(pay.amountCollected, currency)} ({pay.collectionPercent.toFixed(1)}%)</span>
                  </div>
                  <Progress value={Math.min(pay.collectionPercent, 100)} />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className={cn('rounded-full', targetReached ? toneGood : toneBad)}>
                    {pay.achievementPercent.toFixed(1)}% of target
                  </Badge>
                  {targetReached ? (
                    <Badge variant="outline" className={cn('rounded-full', toneGood)}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Commission payable
                    </Badge>
                  ) : pay.ownerAuthorized ? (
                    <Badge variant="outline" className={cn('rounded-full', toneInfo)}>
                      <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Authorized by owner
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn('rounded-full', toneBad)}>
                      <Lock className="mr-1 h-3.5 w-3.5" /> No commission
                    </Badge>
                  )}
                </div>

                {!targetReached ? (
                  <div className="space-y-3 rounded-xl border border-border/70 p-3 text-sm">
                    {authorization?.status === 'approved' ? (
                      <p>
                        <span className="font-medium">Authorized by owner</span> — {authorization.reviewedByName}, {formatDateTime(authorization.reviewedAt ?? '')}.
                        {authorization.reviewNote ? ` “${authorization.reviewNote}”` : ''}
                      </p>
                    ) : authorization?.status === 'pending' ? (
                      <>
                        <p className="flex items-start gap-2">
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          <span>
                            Waiting for the owner. {authorization.requestedByName} applied on {formatDateTime(authorization.requestedAt)}: “{authorization.reason}”
                          </span>
                        </p>
                        {isOwner ? (
                          <div className="space-y-2">
                            <Input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Note (optional)" />
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded-xl" onClick={() => void handleReview('approve')}>
                                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Authorize
                              </Button>
                              <Button size="sm" variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => void handleReview('reject')}>
                                <XCircle className="mr-1.5 h-4 w-4" /> Refuse
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {authorization?.status === 'rejected' ? (
                          <p className="text-muted-foreground">
                            The owner refused the last application{authorization.reviewNote ? `: “${authorization.reviewNote}”` : ''}. You can apply again.
                          </p>
                        ) : (
                          <p className="text-muted-foreground">
                            Below {TARGET_ACHIEVEMENT_HOLD_THRESHOLD}% there is no commission, unless the owner authorizes it.
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => {
                            setDialogError(null)
                            setApplyOpen(true)
                          }}
                        >
                          Apply for owner authorization
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Payable · {formatMonthLabel(month)}</CardTitle>
                <CardDescription>
                  {monthOver ? 'Month closed — this is the final amount.' : 'Month in progress — updates as sales, collections, and advances come in.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {employee.compensationType === 'salary' ? (
                  <PayLine label="Fixed pay (salary + allowances)" value={formatCurrency(pay.fixedPay, currency)} />
                ) : null}
                <PayLine label={`Commission earned (${pay.unitsSold} × ${formatCurrency(employee.commissionPerUnit, currency)})`} value={formatCurrency(pay.commissionEarned, currency)} />
                <PayLine
                  label={
                    pay.commissionEligible
                      ? `Commission payable (${pay.collectionPercent.toFixed(1)}% collected${pay.ownerAuthorized ? ', authorized by owner' : ''})`
                      : 'Commission payable (target not reached)'
                  }
                  value={formatCurrency(pay.commissionAmount, currency)}
                />
                <PayLine label="Gross payable" value={formatCurrency(pay.grossPayable, currency)} strong />
                <PayLine label="Advance taken" value={formatCurrency(pay.advanceAmount, currency)} minus />
                <PayLine label="Net payable" value={formatCurrency(pay.netPayable, currency)} strong />
                <PayLine label="Paid" value={formatCurrency(pay.paidAmount, currency)} minus />
                <PayLine label="Due to employee" value={formatCurrency(pay.dueAmount, currency)} strong />
                <p className="mt-3 text-xs text-muted-foreground">
                  Attendance: {attendance.present} present, {attendance.absent} absent · DA earned {formatCurrency(attendance.daAmount, currency)} (claimed through the DA expense).
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Advances · {formatMonthLabel(month)}</CardTitle>
                  <CardDescription>Taken before the month is over; deducted from the month&apos;s pay.</CardDescription>
                </div>
                {canRequestAdvance && !canManagePay ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    disabled={Boolean(pendingRequest)}
                    onClick={() => {
                      setRequestForm({ amount: '', reason: '' })
                      setDialogError(null)
                      setRequestOpen(true)
                    }}
                  >
                    <HandCoins className="mr-1.5 h-4 w-4" /> {pendingRequest ? 'Request pending' : 'Emergency advance'}
                  </Button>
                ) : null}
                {canManagePay ? (
                  <Button
                    size="sm"
                    className="shrink-0 rounded-xl"
                    onClick={() => {
                      setAdvanceForm({ date: todayIsoDate(), amount: '', method: 'cash', note: '' })
                      setDialogError(null)
                      setAdvanceOpen(true)
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Advance
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {pay.advances.length ? (
                  <div className="divide-y divide-border/70 rounded-xl border border-border/70">
                    {pay.advances.map((advance) => (
                      <div key={advance.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{formatCurrency(advance.amount, currency)} <span className="font-normal capitalize text-muted-foreground">· {advance.method}</span></p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(advance.date)} · by {advance.givenByName}{advance.note ? ` · ${advance.note}` : ''}
                          </p>
                        </div>
                        {canManagePay ? (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => void handleDeleteAdvance(advance.id)}
                            aria-label="Remove advance"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HandCoins className="h-4 w-4" /> No advance taken this month.
                  </p>
                )}
                {advanceRequests.length ? (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Emergency requests</p>
                    {advanceRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {formatCurrency(request.amount, currency)} · {request.reason}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 rounded-full', request.status === 'approved' ? toneGood : request.status === 'rejected' ? toneBad : toneWarn)}
                        >
                          {request.status === 'approved'
                            ? `Given ${formatCurrency(request.approvedAmount ?? request.amount, currency)}`
                            : request.status === 'rejected'
                              ? 'Refused'
                              : 'Waiting for office'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Employee sheet</CardTitle>
              <CardDescription>
                Pay earned (credit) against payments and advances (debit). Salary is due at the start of the next month, commission on the
                16th–20th. The balance is what is still owed to {selfView ? 'you' : employee.name}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Dr/Cr</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                        <TableCell className="min-w-56">{row.particulars}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.debit ? formatCurrency(row.debit, currency) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.credit ? formatCurrency(row.credit, currency) : ''}</TableCell>
                        <TableCell>{balanceSide(row.balance)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(Math.abs(row.balance), currency)}</TableCell>
                      </TableRow>
                    ))}
                    {sheet.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">Nothing on the sheet yet — the first month is posted once it closes.</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(sheetTotals.debit, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(sheetTotals.credit, currency)}</TableCell>
                        <TableCell>{balanceSide(sheetTotals.balance)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(Math.abs(sheetTotals.balance), currency)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {employee.zoneId || employee.area ? (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Clients · {[zoneName, employee.area].filter(Boolean).join(' · ')}</CardTitle>
              <CardDescription>
                {clients.length} client(s) in {selfView ? 'your' : 'the'} {employee.area ? 'area' : 'zone'} · total due {formatCurrency(clientDue, currency)}
              </CardDescription>
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} className="pl-9" placeholder="Search clients" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Client</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead className="text-right">Credit limit</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="min-w-48">
                        <p className="font-medium">{customer.name}</p>
                        {customer.company ? <p className="text-xs text-muted-foreground">{customer.company}</p> : null}
                      </TableCell>
                      <TableCell className="min-w-32">{customer.phone || '—'}</TableCell>
                      <TableCell className="min-w-32">{[subZoneLabel(customer), customer.district].filter(Boolean).join(', ')}</TableCell>
                      <TableCell className="text-right">{customer.creditLimit ? formatCurrency(customer.creditLimit, currency) : '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(customer.due ?? 0, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No clients found.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Advance — {employee.name}</DialogTitle>
            <DialogDescription>Deducted from the pay of the month it is given in.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAdvance}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Date" required>
                <Input type="date" value={advanceForm.date} onChange={(event) => setAdvanceForm((current) => ({ ...current, date: event.target.value }))} required />
              </FormField>
              <FormField label="Amount (BDT)" required>
                <Input type="number" min="1" value={advanceForm.amount} onChange={(event) => setAdvanceForm((current) => ({ ...current, amount: event.target.value }))} required />
              </FormField>
            </div>
            <FormField label="Method">
              <Select value={advanceForm.method} onValueChange={(value) => setAdvanceForm((current) => ({ ...current, method: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Note" optional>
              <Textarea value={advanceForm.note} onChange={(event) => setAdvanceForm((current) => ({ ...current, note: event.target.value }))} rows={2} />
            </FormField>
            {dialogError ? <p className="text-sm text-destructive">{dialogError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record advance'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Emergency advance</DialogTitle>
            <DialogDescription>
              Ask the office for money before payday. They approve an amount, and it is deducted from this month&apos;s pay.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRequestAdvance}>
            <FormField label="Amount needed (BDT)" required>
              <Input type="number" min="1" value={requestForm.amount} onChange={(event) => setRequestForm((current) => ({ ...current, amount: event.target.value }))} required />
            </FormField>
            <FormField label="Reason" required>
              <Textarea value={requestForm.reason} onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))} rows={3} placeholder="What is the emergency?" required />
            </FormField>
            {dialogError ? <p className="text-sm text-destructive">{dialogError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to office'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for owner authorization</DialogTitle>
            <DialogDescription>
              {formatMonthLabel(month)}: {pay.achievementPercent.toFixed(1)}% of target. If the owner accepts, the month&apos;s commission is paid and marked “Authorized by owner”.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleApply}>
            <FormField label="Reason" required>
              <Textarea value={applyReason} onChange={(event) => setApplyReason(event.target.value)} rows={4} placeholder="Why should the commission be allowed this month?" required />
            </FormField>
            {dialogError ? <p className="text-sm text-destructive">{dialogError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to owner'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
