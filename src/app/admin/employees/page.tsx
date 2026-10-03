"use client"

import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import { Briefcase, ClipboardCheck, Edit, Eye, MapPin, Phone, Plus, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import {
  approvalLabels,
  approvalToneClass,
  compensationLabels,
  EmployeeReviewDialog,
  emptyEmployeeForm,
  FormField,
  formFromEmployee,
  JoiningFormSections,
  joiningInputFromForm,
  monthlyFixedPay,
  todayIsoDate,
  type EmployeeFormState,
} from '@/components/admin/employees/EmployeeForms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { EmployeeInput, EmployeeRecord, EmploymentStatus } from '@/lib/erp/types'
import {
  DEFAULT_PROBATION_MONTHS,
  employmentStatusLabel,
  formatCurrency,
  formatDate,
  getProbationStatus,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const NO_LOGIN = 'none'

function employmentToneClass(status: EmploymentStatus) {
  if (status === 'resigned') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }
  if (status === 'terminated') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
  }
  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

export default function EmployeesPage() {
  const { data, currentUser, saveEmployee, deleteEmployee, hasPermission } = useERP()
  const canManage = hasPermission('employees.edit')
  const isAdmin = currentUser?.roleId === 'admin'
  const employees = useMemo(() => toArray(data?.employees), [data?.employees])
  const zones = useMemo(() => toArray(data?.zones).sort((left, right) => left.name.localeCompare(right.name)), [data?.zones])
  const currency = data?.settings.currency
  const users = useMemo(() => toArray(data?.users).sort((left, right) => left.name.localeCompare(right.name)), [data?.users])

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'probation' | 'confirmed' | 'rejected'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null)
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(emptyEmployeeForm)
  const [reviewingEmployee, setReviewingEmployee] = useState<EmployeeRecord | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const zoneNames = useMemo(() => new Map(zones.map((zone) => [zone.id, zone.name])), [zones])
  const zoneName = (zoneId: string) => zoneNames.get(zoneId) ?? ''
  // Pay is set by an admin: on a new entry it is saved approved, on a pending form it is set while approving.
  const showPayFields = isAdmin && (!editingEmployee || editingEmployee.approvalStatus === 'approved')

  const rows = useMemo(() => {
    return employees
      .map((employee) => ({ employee, probation: getProbationStatus(employee) }))
      .sort((left, right) => {
        // Joining forms waiting for approval come first.
        const pendingOrder = Number(right.employee.approvalStatus === 'pending') - Number(left.employee.approvalStatus === 'pending')
        return pendingOrder || right.employee.joiningDate.localeCompare(left.employee.joiningDate)
      })
  }, [employees])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return rows.filter(({ employee, probation }) => {
      const matchesSearch =
        !normalizedQuery ||
        [employee.name, employee.employeeCode ?? '', employee.designation, employee.phone, employee.address, employee.area, zoneNames.get(employee.zoneId) ?? '']
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pending' || statusFilter === 'rejected'
          ? employee.approvalStatus === statusFilter
          : employee.approvalStatus === 'approved' && probation.confirmationStatus === statusFilter)

      return matchesSearch && matchesStatus
    })
  }, [query, rows, statusFilter, zoneNames])

  const metrics = useMemo(() => {
    const approved = rows.filter(({ employee }) => employee.approvalStatus === 'approved')
    const pending = rows.filter(({ employee }) => employee.approvalStatus === 'pending').length
    const onProbation = approved.filter(({ probation }) => probation.confirmationStatus === 'probation').length
    const activeCount = approved.filter(({ employee }) => employee.employmentStatus === 'active').length
    const salaried = approved.filter(({ employee }) => employee.compensationType === 'salary')
    const avgFixedPay = salaried.length
      ? Math.round(salaried.reduce((sum, { employee }) => sum + monthlyFixedPay(employee), 0) / salaried.length)
      : 0

    return {
      total: approved.length,
      pending,
      onProbation,
      activeCount,
      avgFixedPay,
    }
  }, [rows])

  function openCreateDialog() {
    setEditingEmployee(null)
    setEmployeeForm({ ...emptyEmployeeForm, joiningDate: todayIsoDate() })
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(employee: EmployeeRecord) {
    setEditingEmployee(employee)
    setEmployeeForm(formFromEmployee(employee))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const salaryBased = employeeForm.compensationType === 'salary'
    const input: EmployeeInput = {
      ...joiningInputFromForm(employeeForm),
      ...(showPayFields
        ? {
            baseSalary: salaryBased ? Number(employeeForm.baseSalary) : 0,
            taDa: salaryBased ? Number(employeeForm.taDa) : 0,
            houseRent: salaryBased ? Number(employeeForm.houseRent) : 0,
            mobileBill: salaryBased ? Number(employeeForm.mobileBill) : 0,
            commissionPerUnit: Number(employeeForm.commissionPerUnit),
            daPerDay: Number(employeeForm.daPerDay),
            monthlyUnitTarget: Number(employeeForm.monthlyUnitTarget),
            monthlyAmountTarget: Number(employeeForm.monthlyAmountTarget),
          }
        : {}),
      ...(isAdmin ? { userId: employeeForm.userId } : {}),
    }

    try {
      await saveEmployee(input, editingEmployee?.id)
      setDialogOpen(false)
      setEmployeeForm(emptyEmployeeForm)
      setEditingEmployee(null)
      setFeedback(
        editingEmployee
          ? 'Employee profile updated.'
          : isAdmin
            ? 'New employee added and approved.'
            : 'Joining form submitted. An admin will set the pay and approve it.'
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save employee.')
    }
  }

  async function handleDelete(employee: EmployeeRecord) {
    setFeedback(null)

    try {
      await deleteEmployee(employee.id)
      setFeedback(`${employee.name} removed from employee list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete employee.')
    }
  }

  const setField = <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) =>
    setEmployeeForm((current) => ({ ...current, [key]: value }))

  return (
    <AdminShell active="Employee Management">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            ['Total employees', metrics.total.toLocaleString('en-BD'), `${metrics.activeCount} currently active`],
            ['Awaiting approval', metrics.pending.toLocaleString('en-BD'), 'Joining forms for an admin to approve'],
            ['On probation', metrics.onProbation.toLocaleString('en-BD'), `${DEFAULT_PROBATION_MONTHS}-month probation window`],
            ['Avg. fixed pay', formatCurrency(metrics.avgFixedPay, currency), 'Salary + allowances, salary-based staff'],
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

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Employee profiles</CardTitle>
              <CardDescription>
                Joining forms wait for an admin to set the pay and approve them. Probation and confirmation are then tracked automatically.
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search employees" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Awaiting approval</SelectItem>
                  <SelectItem value="probation">On probation</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {canManage ? (
                <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  {isAdmin ? 'Add employee' : 'Joining form'}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Joining date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Pay</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ employee, probation }) => (
                    <TableRow key={employee.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                            <UserRound className="h-4 w-4 text-muted-foreground" />
                          </span>
                          <div>
                            <Link href={`/admin/employees/${employee.id}`} className="font-semibold hover:underline">
                              {employee.name}
                            </Link>
                            {employee.employeeCode ? (
                              <p className="font-mono text-xs text-muted-foreground">{employee.employeeCode}</p>
                            ) : null}
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Briefcase className="h-3.5 w-3.5" />
                              {employee.designation}
                            </p>
                            {employee.zoneId || employee.area ? (
                              <p className="text-xs text-muted-foreground">
                                {[zoneName(employee.zoneId), employee.area].filter(Boolean).join(' · ')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-52">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{employee.phone}</span>
                          </div>
                          {employee.address ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{employee.address}</span>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-32 text-sm">{formatDate(employee.joiningDate)}</TableCell>
                      <TableCell className="min-w-44">
                        {employee.approvalStatus !== 'approved' ? (
                          <Badge variant="outline" className={cn('rounded-full', approvalToneClass(employee.approvalStatus))}>
                            {approvalLabels[employee.approvalStatus]}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full',
                              probation.confirmationStatus === 'confirmed'
                                ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                : 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
                            )}
                          >
                            {probation.confirmationStatus === 'confirmed' ? (
                              <>
                                <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Confirmed
                              </>
                            ) : (
                              `Probation · ${probation.daysRemaining}d left`
                            )}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Badge variant="outline" className={cn('rounded-full', employmentToneClass(employee.employmentStatus))}>
                          {employmentStatusLabel(employee.employmentStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <p className="text-sm font-medium">{compensationLabels[employee.compensationType]}</p>
                        {employee.approvalStatus !== 'approved' ? (
                          <p className="text-xs text-muted-foreground">Set by an admin on approval</p>
                        ) : employee.compensationType === 'salary' ? (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(monthlyFixedPay(employee), currency)}/month · {formatCurrency(employee.commissionPerUnit, currency)}/unit
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{formatCurrency(employee.commissionPerUnit, currency)}/unit commission</p>
                        )}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {isAdmin && employee.approvalStatus === 'pending' ? (
                              <Button size="sm" className="h-9 rounded-xl" onClick={() => setReviewingEmployee(employee)}>
                                <ClipboardCheck className="mr-1.5 h-4 w-4" />
                                Review
                              </Button>
                            ) : null}
                            <Button asChild variant="outline" size="icon" className="h-9 w-9" aria-label={`View ${employee.name}'s profile`}>
                              <Link href={`/admin/employees/${employee.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(employee)} aria-label={`Edit ${employee.name}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(employee)}
                              aria-label={`Delete ${employee.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="h-28 text-center text-muted-foreground">
                        No employees found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Edit employee' : 'Employee joining form'}</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? 'Fill in the joining details and set the pay. An entry you add is approved straight away.'
                : 'Fill in the joining details and submit. An admin sets the salary, commission, and allowances, then approves it.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <JoiningFormSections form={employeeForm} onChange={setEmployeeForm} showEmploymentStatus={Boolean(editingEmployee)} />

            {showPayFields ? (
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pay &amp; monthly target <span className="font-normal normal-case">(admin only)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {employeeForm.compensationType === 'salary' ? (
                    <>
                      <FormField label="Base salary">
                        <Input type="number" min="0" value={employeeForm.baseSalary} onChange={(event) => setField('baseSalary', event.target.value)} />
                      </FormField>
                      <FormField label="TA/DA">
                        <Input type="number" min="0" value={employeeForm.taDa} onChange={(event) => setField('taDa', event.target.value)} />
                      </FormField>
                      <FormField label="House rent">
                        <Input type="number" min="0" value={employeeForm.houseRent} onChange={(event) => setField('houseRent', event.target.value)} />
                      </FormField>
                      <FormField label="Mobile bill">
                        <Input type="number" min="0" value={employeeForm.mobileBill} onChange={(event) => setField('mobileBill', event.target.value)} />
                      </FormField>
                    </>
                  ) : null}
                  <FormField label="Commission per unit">
                    <Input type="number" min="0" value={employeeForm.commissionPerUnit} onChange={(event) => setField('commissionPerUnit', event.target.value)} />
                  </FormField>
                  <FormField label="DA per present day">
                    <Input type="number" min="0" value={employeeForm.daPerDay} onChange={(event) => setField('daPerDay', event.target.value)} />
                  </FormField>
                  <FormField label="Probation (months)">
                    <Input type="number" min="0" value={employeeForm.probationMonths} onChange={(event) => setField('probationMonths', event.target.value)} />
                  </FormField>
                  <FormField label="Monthly unit target">
                    <Input type="number" min="0" value={employeeForm.monthlyUnitTarget} onChange={(event) => setField('monthlyUnitTarget', event.target.value)} />
                  </FormField>
                  <FormField label="Monthly amount target (BDT)">
                    <Input type="number" min="0" value={employeeForm.monthlyAmountTarget} onChange={(event) => setField('monthlyAmountTarget', event.target.value)} />
                  </FormField>
                </div>
                <p className="text-xs text-muted-foreground">
                  An employee hits target by reaching either the unit count or the amount — whichever comes first.
                </p>
              </div>
            ) : null}

            {isAdmin ? (
              <FormField label="Linked login" optional>
                <Select value={employeeForm.userId || NO_LOGIN} onValueChange={(value) => setField('userId', value === NO_LOGIN ? '' : value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOGIN}>No login linked</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name} ({user.loginId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The employee sees their own profile, pay, and clients under My Profile with this login.</p>
              </FormField>
            ) : null}

            <FormField label="Notes" optional>
              <Textarea value={employeeForm.notes} onChange={(event) => setField('notes', event.target.value)} rows={3} />
            </FormField>

            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">
                {editingEmployee ? 'Update employee' : isAdmin ? 'Save & approve' : 'Submit for approval'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <EmployeeReviewDialog
        employee={reviewingEmployee}
        onOpenChange={(open) => (open ? null : setReviewingEmployee(null))}
        onReviewed={setFeedback}
      />
    </AdminShell>
  )
}
