"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Banknote, History, Lock, ShieldCheck } from 'lucide-react'

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
import type { SalaryPaymentStatus } from '@/lib/erp/types'
import {
  computeSalaryFigures,
  currentMonthKey,
  formatCurrency,
  formatDateTime,
  formatMonthLabel,
  getRecentMonthKeys,
  toArray,
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
  const { data, saveSalaryPayment, hasPermission } = useERP()
  const canManage = hasPermission('salary.edit')
  const currency = data?.settings.currency

  const employees = useMemo(() => toArray(data?.employees), [data?.employees])
  const salesTargets = useMemo(() => toArray(data?.salesTargets), [data?.salesTargets])
  const salaries = useMemo(() => toArray(data?.salaries), [data?.salaries])
  const monthOptions = useMemo(() => getRecentMonthKeys(6).reverse(), [])

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payEmployeeId, setPayEmployeeId] = useState('')
  const [amount, setAmount] = useState('0')
  const [method, setMethod] = useState('bank')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    return employees
      .filter((employee) => employee.employmentStatus === 'active')
      .map((employee) => {
        const target = salesTargets.find((entry) => entry.employeeId === employee.id && entry.month === selectedMonth)
        const salary = salaries.find((entry) => entry.employeeId === employee.id && entry.month === selectedMonth)
        const figures = computeSalaryFigures(employee, target ?? null)

        const grossPayable = salary?.grossPayable ?? figures.grossPayable
        const paidAmount = salary?.paidAmount ?? 0
        const dueAmount = salary?.dueAmount ?? grossPayable
        const paymentStatus = salary?.paymentStatus ?? 'unpaid'
        const holdStatus = salary?.holdStatus ?? figures.holdStatus
        const achievementPercent = salary?.achievementPercent ?? figures.achievementPercent
        const commissionAmount = salary?.commissionAmount ?? figures.commissionAmount

        return { employee, salary, grossPayable, paidAmount, dueAmount, paymentStatus, holdStatus, achievementPercent, commissionAmount }
      })
  }, [employees, salaries, salesTargets, selectedMonth])

  const metrics = useMemo(() => {
    return {
      totalPayable: rows.reduce((sum, row) => sum + row.grossPayable, 0),
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

  function openPayDialog(employeeId: string) {
    setPayEmployeeId(employeeId)
    setAmount('0')
    setMethod('bank')
    setNote('')
    setFeedback(null)
    setPayDialogOpen(true)
  }

  const activeRow = rows.find((row) => row.employee.id === payEmployeeId)

  async function handlePaySalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      await saveSalaryPayment({
        employeeId: payEmployeeId,
        month: selectedMonth,
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total payable', formatCurrency(metrics.totalPayable, currency), 'Base salary + commission'],
            ['Paid so far', formatCurrency(metrics.totalPaid, currency), 'Across all employees'],
            ['Outstanding due', formatCurrency(metrics.totalDue, currency), 'Remaining to be paid'],
            ['On hold', metrics.onHold.toLocaleString('en-BD'), 'Below 80% target achievement'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Salary &amp; commission</CardTitle>
            <CardDescription>
              Commission is units sold × commission per unit. Salary is held automatically when target achievement is below 80%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Base salary</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Achievement</TableHead>
                    <TableHead>Hold status</TableHead>
                    <TableHead>Payable / Paid / Due</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.employee.id}>
                      <TableCell className="min-w-48">
                        <p className="font-semibold">{row.employee.name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee.designation}</p>
                      </TableCell>
                      <TableCell className="min-w-32">{formatCurrency(row.employee.baseSalary, currency)}</TableCell>
                      <TableCell className="min-w-32">{formatCurrency(row.commissionAmount, currency)}</TableCell>
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
                          {row.holdStatus === 'released' ? (
                            <>
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Released
                            </>
                          ) : (
                            <>
                              <Lock className="mr-1 h-3.5 w-3.5" /> Hold
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold">{formatCurrency(row.grossPayable, currency)}</span>
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
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => openPayDialog(row.employee.id)}
                              disabled={row.dueAmount <= 0}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Pay salary
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="h-28 text-center text-muted-foreground">
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
                      <TableCell className="min-w-28 font-semibold">{formatCurrency(payment.amount, currency)}</TableCell>
                      <TableCell className="min-w-24 capitalize">{payment.method}</TableCell>
                      <TableCell className="min-w-32">{payment.paidBy}</TableCell>
                      <TableCell className="min-w-40 text-sm text-muted-foreground">{formatDateTime(payment.paidAt)}</TableCell>
                      <TableCell className="min-w-40 text-sm text-muted-foreground">{payment.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {paymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
            <DialogTitle>Pay salary — {activeRow?.employee.name}</DialogTitle>
            <DialogDescription>
              Due for {formatMonthLabel(selectedMonth)}: {activeRow ? formatCurrency(activeRow.dueAmount, currency) : '—'}
            </DialogDescription>
          </DialogHeader>
          {activeRow?.holdStatus === 'hold' ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:border-amber-900 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Salary is on hold — {activeRow.achievementPercent.toFixed(1)}% of the monthly target reached, below the 80% release
                threshold. You can still pay if approved.
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
