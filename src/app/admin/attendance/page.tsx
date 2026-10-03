"use client"

import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarDays, Check, CheckCheck, KeyRound, Send, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { AttendanceStatus, EmployeeRecord } from '@/lib/erp/types'
import {
  currentMonthKey,
  dayKey,
  formatCurrency,
  formatDateTime,
  formatMonthLabel,
  isApprovedExpense,
  monthDayKeys,
  monthlyAttendance,
  toArray,
  userRoleIds,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Tab = 'daily' | 'monthly'

const STATUS_BUTTON: Record<AttendanceStatus, { active: string; label: string }> = {
  present: { active: 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600', label: 'Present' },
  absent: { active: 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600', label: 'Absent' },
}

function isOnPayroll(employee: EmployeeRecord) {
  return employee.approvalStatus === 'approved' && employee.employmentStatus === 'active'
}

export default function AttendancePage() {
  const { data, users, currentUser, markAttendance, canTakeAttendance, submitExpense, updateSettings, hasPermission } = useERP()

  const [tab, setTab] = useState<Tab>('daily')
  const [day, setDay] = useState(() => dayKey())
  const [month, setMonth] = useState(() => currentMonthKey())
  const [search, setSearch] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canClaimDa = isAdmin || hasPermission('finance.edit')
  const today = dayKey()
  const currency = data?.settings.currency
  const handlerIds = data?.settings.attendanceHandlerIds ?? []

  const allEmployees = useMemo(() => toArray(data?.employees).sort((left, right) => left.name.localeCompare(right.name)), [data?.employees])
  const zoneName = (zoneId: string) => (zoneId ? data?.zones[zoneId]?.name ?? '' : '')
  const matchesSearch = (employee: EmployeeRecord) => {
    const query = search.trim().toLowerCase()
    return !query || [employee.name, employee.designation, employee.phone, zoneName(employee.zoneId)].some((value) => value?.toLowerCase().includes(query))
  }

  const dayMarks = data?.attendance?.[day] ?? {}
  // Former staff stay on the sheet for days they were marked on.
  const dailyEmployees = allEmployees.filter((employee) => (isOnPayroll(employee) || dayMarks[employee.id]) && matchesSearch(employee))
  const presentCount = dailyEmployees.filter((employee) => dayMarks[employee.id]?.status === 'present').length
  const absentCount = dailyEmployees.filter((employee) => dayMarks[employee.id]?.status === 'absent').length
  const unmarked = dailyEmployees.filter((employee) => !dayMarks[employee.id])

  const monthDays = useMemo(() => monthDayKeys(month), [month])
  const monthlyEmployees = allEmployees.filter(
    (employee) => (isOnPayroll(employee) || monthDays.some((key) => data?.attendance?.[key]?.[employee.id])) && matchesSearch(employee)
  )
  const monthlyRows = monthlyEmployees.map((employee) => ({ employee, ...monthlyAttendance(data?.attendance, employee, month) }))
  const totalDa = monthlyRows.reduce((sum, row) => sum + row.daAmount, 0)

  // A month's DA is claimed once; a rejected claim can be sent again.
  const daClaims = useMemo(() => {
    const claims = new Map<string, string>()
    toArray(data?.expenses).forEach((expense) => {
      if (expense.employeeId && expense.daMonth && expense.status !== 'rejected') {
        claims.set(`${expense.employeeId}|${expense.daMonth}`, isApprovedExpense(expense) ? 'approved' : 'pending')
      }
    })
    return claims
  }, [data?.expenses])

  const handlerCandidates = users
    .filter((user) => user.status === 'active' && !userRoleIds(user).includes('admin'))
    .sort((left, right) => left.name.localeCompare(right.name))

  async function run(key: string, action: () => Promise<void>, success?: string) {
    setBusyKey(key)
    setFeedback(null)
    try {
      await action()
      if (success) setFeedback({ tone: 'success', text: success })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Something went wrong.' })
    } finally {
      setBusyKey(null)
    }
  }

  function toggleMark(employee: EmployeeRecord, status: AttendanceStatus) {
    // Clicking the active mark again clears it.
    const next = dayMarks[employee.id]?.status === status ? null : status
    void run(employee.id, () => markAttendance(day, { [employee.id]: next }))
  }

  function markAllPresent() {
    const marks = Object.fromEntries(unmarked.map((employee) => [employee.id, 'present' as const]))
    void run('all', () => markAttendance(day, marks), `Marked ${unmarked.length} employee(s) present.`)
  }

  function claimDa(employee: EmployeeRecord, present: number, amount: number) {
    void run(
      `da-${employee.id}`,
      () =>
        submitExpense({
          category: 'DA',
          amount,
          expenseBy: employee.name,
          employeeId: employee.id,
          daMonth: month,
          date: new Date().toISOString(),
          note: `DA for ${formatMonthLabel(month)}: ${present} present day(s) × ${formatCurrency(employee.daPerDay, currency)}`,
        }),
      `${employee.name}'s DA of ${formatCurrency(amount, currency)} sent to an admin for approval.`
    )
  }

  function toggleHandler(userId: string, allowed: boolean) {
    const next = allowed ? Array.from(new Set([...handlerIds, userId])) : handlerIds.filter((id) => id !== userId)
    void run(`handler-${userId}`, () => updateSettings({ attendanceHandlerIds: next }))
  }

  return (
    <AdminShell active="Attendance">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
            {(
              [
                ['daily', 'Daily attendance', CalendarCheck],
                ['monthly', 'Monthly sheet & DA', CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  tab === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, designation, zone..." className="w-full sm:w-72" />
        </div>

        {feedback ? (
          <p
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              feedback.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            )}
          >
            {feedback.text}
          </p>
        ) : null}

        {tab === 'daily' ? (
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Attendance for the day</CardTitle>
                <CardDescription>
                  {canTakeAttendance
                    ? 'Tick present or cross absent for every employee. Click a mark again to clear it.'
                    : 'You can view attendance. Ask an admin for access to take it.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} className="w-40" />
                {canTakeAttendance ? (
                  <Button type="button" variant="outline" className="gap-1.5" disabled={!unmarked.length || busyKey === 'all'} onClick={markAllPresent}>
                    <CheckCheck className="h-4 w-4" />
                    Mark rest present ({unmarked.length})
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-700 dark:text-emerald-300">Present {presentCount}</span>
                <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-700 dark:text-rose-300">Absent {absentCount}</span>
                <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Not marked {unmarked.length}</span>
              </div>
              {dailyEmployees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No employees to show.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Zone / area</TableHead>
                        <TableHead className="text-center">Attendance</TableHead>
                        <TableHead>Marked by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyEmployees.map((employee) => {
                        const mark = dayMarks[employee.id]
                        return (
                          <TableRow key={employee.id}>
                            <TableCell>
                              <span className="block font-medium">{employee.name}</span>
                              <span className="block text-xs text-muted-foreground">{employee.designation}</span>
                            </TableCell>
                            <TableCell className="text-sm">{[zoneName(employee.zoneId), employee.area].filter(Boolean).join(' · ') || '—'}</TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1.5">
                                {(['present', 'absent'] as const).map((status) => (
                                  <Button
                                    key={status}
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    aria-label={`${STATUS_BUTTON[status].label}: ${employee.name}`}
                                    aria-pressed={mark?.status === status}
                                    disabled={!canTakeAttendance || busyKey === employee.id || busyKey === 'all'}
                                    onClick={() => toggleMark(employee, status)}
                                    className={cn('h-9 w-9 disabled:opacity-100', mark?.status === status && STATUS_BUTTON[status].active)}
                                  >
                                    {status === 'present' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                  </Button>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {mark ? (
                                <>
                                  <span className="block text-foreground">{mark.markedByName}</span>
                                  {formatDateTime(mark.markedAt)}
                                </>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Monthly sheet & DA</CardTitle>
                <CardDescription>DA = present days × the employee’s DA per day (set on their employee profile).</CardDescription>
              </div>
              <Input type="month" value={month} max={currentMonthKey()} onChange={(event) => event.target.value && setMonth(event.target.value)} className="w-44" />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {monthlyRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No employees to show.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card">Employee</TableHead>
                      {monthDays.map((key) => (
                        <TableHead key={key} className="px-1 text-center text-xs">
                          {Number(key.slice(-2))}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Present</TableHead>
                      <TableHead className="text-right">Absent</TableHead>
                      <TableHead className="text-right">DA / day</TableHead>
                      <TableHead className="text-right">DA</TableHead>
                      {canClaimDa ? <TableHead className="text-right">Payment</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRows.map(({ employee, present, absent, daAmount }) => {
                      const claim = daClaims.get(`${employee.id}|${month}`)
                      return (
                        <TableRow key={employee.id}>
                          <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-card">
                            <span className="block font-medium">{employee.name}</span>
                            <span className="block text-xs text-muted-foreground">{employee.designation}</span>
                          </TableCell>
                          {monthDays.map((key) => {
                            const status = data?.attendance?.[key]?.[employee.id]?.status
                            return (
                              <TableCell key={key} className="px-1 text-center" title={`${key}: ${status ?? 'not marked'}`}>
                                {status === 'present' ? (
                                  <Check className="mx-auto h-3.5 w-3.5 text-emerald-600" aria-label="Present" />
                                ) : status === 'absent' ? (
                                  <X className="mx-auto h-3.5 w-3.5 text-rose-600" aria-label="Absent" />
                                ) : (
                                  <span className="text-muted-foreground/50">·</span>
                                )}
                              </TableCell>
                            )
                          })}
                          <TableCell className="text-right tabular-nums">{present}</TableCell>
                          <TableCell className="text-right tabular-nums">{absent}</TableCell>
                          <TableCell className="text-right tabular-nums">{employee.daPerDay ? formatCurrency(employee.daPerDay, currency) : '—'}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(daAmount, currency)}</TableCell>
                          {canClaimDa ? (
                            <TableCell className="text-right">
                              {claim ? (
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                                    claim === 'approved'
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  )}
                                >
                                  {claim}
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={!(daAmount > 0) || busyKey === `da-${employee.id}`}
                                  onClick={() => claimDa(employee, present, daAmount)}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  Send DA
                                </Button>
                              )}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-muted font-semibold">Total DA</TableCell>
                      <TableCell colSpan={monthDays.length + 3} />
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totalDa, currency)}</TableCell>
                      {canClaimDa ? <TableCell /> : null}
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Who can take attendance
              </CardTitle>
              <CardDescription>
                Admins always can. Turn it on for anyone else here, or give a whole role the “Create &amp; edit daily attendance and DA”
                permission under User &amp; Role Management. People limited to a zone only see their own team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {handlerCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other active users.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {handlerCandidates.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.title || user.loginId}</p>
                      </div>
                      <Switch
                        checked={handlerIds.includes(user.id)}
                        disabled={busyKey === `handler-${user.id}`}
                        onCheckedChange={(checked) => toggleHandler(user.id, checked)}
                        aria-label={`Let ${user.name} take attendance`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  )
}
