"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Plus, TrendingUp } from 'lucide-react'

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
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import {
  TARGET_ACHIEVEMENT_HOLD_THRESHOLD,
  computeCommission,
  currentMonthKey,
  formatCurrency,
  formatMonthLabel,
  getRecentMonthKeys,
  getTargetAchievement,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export default function SalesTargetPage() {
  const { data, recordSale, hasPermission } = useERP()
  const canManage = hasPermission('sales_target.edit')
  const currency = data?.settings.currency

  const employees = useMemo(() => toArray(data?.employees), [data?.employees])
  const salesTargets = useMemo(() => toArray(data?.salesTargets), [data?.salesTargets])
  const monthOptions = useMemo(() => getRecentMonthKeys(6).reverse(), [])

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [saleDialogOpen, setSaleDialogOpen] = useState(false)
  const [saleEmployeeId, setSaleEmployeeId] = useState('')
  const [units, setUnits] = useState('0')
  const [amount, setAmount] = useState('0')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    return employees
      .filter((employee) => employee.employmentStatus === 'active')
      .map((employee) => {
        const target = salesTargets.find((entry) => entry.employeeId === employee.id && entry.month === selectedMonth)
        const unitTarget = target?.unitTarget ?? employee.monthlyUnitTarget
        const amountTarget = target?.amountTarget ?? employee.monthlyAmountTarget
        const unitsSold = target?.unitsSold ?? 0
        const amountSold = target?.amountSold ?? 0
        const achievement = getTargetAchievement({ unitsSold, unitTarget, amountSold, amountTarget })
        const commissionAmount = computeCommission(unitsSold, employee.commissionPerUnit)
        const onTrack = achievement.achievementPercent >= TARGET_ACHIEVEMENT_HOLD_THRESHOLD

        return { employee, unitTarget, amountTarget, unitsSold, amountSold, achievement, commissionAmount, onTrack }
      })
      .sort((left, right) => right.achievement.achievementPercent - left.achievement.achievementPercent)
  }, [employees, salesTargets, selectedMonth])

  const metrics = useMemo(() => {
    const onTrack = rows.filter((row) => row.onTrack).length
    const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0)
    const totalUnitsSold = rows.reduce((sum, row) => sum + row.unitsSold, 0)
    const totalUnitTarget = rows.reduce((sum, row) => sum + row.unitTarget, 0)

    return {
      employees: rows.length,
      onTrack,
      belowTarget: rows.length - onTrack,
      totalCommission,
      totalUnitsSold,
      totalUnitTarget,
    }
  }, [rows])

  function openSaleDialog(employeeId: string) {
    setSaleEmployeeId(employeeId)
    setUnits('0')
    setAmount('0')
    setNote('')
    setFeedback(null)
    setSaleDialogOpen(true)
  }

  async function handleRecordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      await recordSale({
        employeeId: saleEmployeeId,
        month: selectedMonth,
        units: Number(units) || 0,
        amount: Number(amount) || 0,
        note,
      })
      setSaleDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record sale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell active="Sales & Target">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Reviewing</p>
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
            ['Active sales staff', metrics.employees.toLocaleString('en-BD'), 'Tracked against this month’s target'],
            ['On track (≥80%)', metrics.onTrack.toLocaleString('en-BD'), 'Salary hold released'],
            ['Below target', metrics.belowTarget.toLocaleString('en-BD'), 'Salary hold risk'],
            ['Commission this month', formatCurrency(metrics.totalCommission, currency), 'BDT per unit sold, summed'],
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

        {feedback ? (
          <Card className="border-border/70 bg-destructive/5 shadow-sm">
            <CardContent className="p-4 text-sm text-destructive">{feedback}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ employee, unitTarget, amountTarget, unitsSold, amountSold, achievement, commissionAmount, onTrack }) => (
            <Card key={employee.id} className="border-border/70 shadow-sm">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">{employee.name}</CardTitle>
                  <CardDescription>{employee.designation}</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 rounded-full',
                    onTrack
                      ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                      : 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
                  )}
                >
                  {onTrack ? (
                    <>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Target on track
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Below 80%
                    </>
                  )}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Achievement</span>
                    <span className="font-semibold">{achievement.achievementPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={achievement.progressPercent} className={cn(!onTrack && '[&>div]:bg-rose-500')} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Units sold</p>
                    <p className="font-semibold">{unitsSold.toLocaleString('en-BD')} / {unitTarget.toLocaleString('en-BD')}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Sales amount</p>
                    <p className="font-semibold">{formatCurrency(amountSold, currency)}</p>
                    <p className="text-xs text-muted-foreground">of {formatCurrency(amountTarget, currency)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Commission earned</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(commissionAmount, currency)}</span>
                </div>

                {canManage ? (
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => openSaleDialog(employee.id)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record sale
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {rows.length === 0 ? (
            <Card className="border-border/70 shadow-sm xl:col-span-2">
              <CardContent className="p-10 text-center text-muted-foreground">
                No active employees with a monthly target yet. Add employees from Employee Management first.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record sale</DialogTitle>
            <DialogDescription>
              Adds to {formatMonthLabel(selectedMonth)}&apos;s running total for this employee. Commission and hold status update immediately.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRecordSale}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Units sold</p>
              <Input type="number" min="0" value={units} onChange={(event) => setUnits(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Sales amount (BDT)</p>
              <Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
            </div>
            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Record sale'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
