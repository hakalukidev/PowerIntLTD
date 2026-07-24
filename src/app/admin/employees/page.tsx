"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Briefcase, Edit, MapPin, Phone, Plus, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
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
  DEFAULT_COMMISSION_PER_UNIT,
  DEFAULT_MONTHLY_AMOUNT_TARGET,
  DEFAULT_MONTHLY_UNIT_TARGET,
  DEFAULT_PROBATION_MONTHS,
  employmentStatusLabel,
  formatCurrency,
  formatDate,
  getProbationStatus,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type EmployeeFormState = {
  name: string
  address: string
  phone: string
  designation: string
  joiningDate: string
  probationMonths: string
  employmentStatus: EmploymentStatus
  baseSalary: string
  monthlyUnitTarget: string
  monthlyAmountTarget: string
  commissionPerUnit: string
  notes: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

const emptyEmployeeForm: EmployeeFormState = {
  name: '',
  address: '',
  phone: '',
  designation: '',
  joiningDate: todayIsoDate(),
  probationMonths: String(DEFAULT_PROBATION_MONTHS),
  employmentStatus: 'active',
  baseSalary: '0',
  monthlyUnitTarget: String(DEFAULT_MONTHLY_UNIT_TARGET),
  monthlyAmountTarget: String(DEFAULT_MONTHLY_AMOUNT_TARGET),
  commissionPerUnit: String(DEFAULT_COMMISSION_PER_UNIT),
  notes: '',
}

function formFromEmployee(employee: EmployeeRecord): EmployeeFormState {
  return {
    name: employee.name,
    address: employee.address,
    phone: employee.phone,
    designation: employee.designation,
    joiningDate: employee.joiningDate.slice(0, 10),
    probationMonths: String(employee.probationMonths),
    employmentStatus: employee.employmentStatus,
    baseSalary: String(employee.baseSalary),
    monthlyUnitTarget: String(employee.monthlyUnitTarget),
    monthlyAmountTarget: String(employee.monthlyAmountTarget),
    commissionPerUnit: String(employee.commissionPerUnit),
    notes: employee.notes,
  }
}

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
  const { data, saveEmployee, deleteEmployee, hasPermission } = useERP()
  const canManage = hasPermission('manage_employees')
  const employees = useMemo(() => toArray(data?.employees), [data?.employees])
  const currency = data?.settings.currency

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'probation' | 'confirmed'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null)
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(emptyEmployeeForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const rows = useMemo(() => {
    return employees
      .map((employee) => ({ employee, probation: getProbationStatus(employee) }))
      .sort((left, right) => right.employee.joiningDate.localeCompare(left.employee.joiningDate))
  }, [employees])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return rows.filter(({ employee, probation }) => {
      const matchesSearch =
        !normalizedQuery ||
        [employee.name, employee.designation, employee.phone, employee.address]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || probation.confirmationStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [query, rows, statusFilter])

  const metrics = useMemo(() => {
    const onProbation = rows.filter(({ probation }) => probation.confirmationStatus === 'probation').length
    const activeCount = employees.filter((employee) => employee.employmentStatus === 'active').length
    const avgBaseSalary = employees.length
      ? Math.round(employees.reduce((sum, employee) => sum + employee.baseSalary, 0) / employees.length)
      : 0

    return {
      total: employees.length,
      onProbation,
      confirmed: employees.length - onProbation,
      activeCount,
      avgBaseSalary,
    }
  }, [employees, rows])

  function openCreateDialog() {
    setEditingEmployee(null)
    setEmployeeForm(emptyEmployeeForm)
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

    const input: EmployeeInput = {
      name: employeeForm.name,
      address: employeeForm.address,
      phone: employeeForm.phone,
      designation: employeeForm.designation,
      joiningDate: employeeForm.joiningDate,
      probationMonths: Number(employeeForm.probationMonths),
      employmentStatus: employeeForm.employmentStatus,
      baseSalary: Number(employeeForm.baseSalary),
      monthlyUnitTarget: Number(employeeForm.monthlyUnitTarget),
      monthlyAmountTarget: Number(employeeForm.monthlyAmountTarget),
      commissionPerUnit: Number(employeeForm.commissionPerUnit),
      notes: employeeForm.notes,
    }

    try {
      await saveEmployee(input, editingEmployee?.id)
      setDialogOpen(false)
      setEmployeeForm(emptyEmployeeForm)
      setEditingEmployee(null)
      setFeedback(editingEmployee ? 'Employee profile updated.' : 'New employee added.')
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

  return (
    <AdminShell active="Employee Management">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total employees', metrics.total.toLocaleString('en-BD'), `${metrics.activeCount} currently active`],
            ['On probation', metrics.onProbation.toLocaleString('en-BD'), `${DEFAULT_PROBATION_MONTHS}-month probation window`],
            ['Confirmed', metrics.confirmed.toLocaleString('en-BD'), 'Auto-confirmed after probation ends'],
            ['Avg. base salary', formatCurrency(metrics.avgBaseSalary, currency), 'Before commission'],
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
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Employee profiles</CardTitle>
              <CardDescription>
                Joining date, probation, and confirmation status are tracked automatically for every employee.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search employees" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="probation">On probation</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
              {canManage ? (
                <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Add employee
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
                    <TableHead>Confirmation status</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Monthly target</TableHead>
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
                            <p className="font-semibold">{employee.name}</p>
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Briefcase className="h-3.5 w-3.5" />
                              {employee.designation}
                            </p>
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
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Badge variant="outline" className={cn('rounded-full', employmentToneClass(employee.employmentStatus))}>
                          {employmentStatusLabel(employee.employmentStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <p className="text-sm font-medium">{employee.monthlyUnitTarget.toLocaleString('en-BD')} units</p>
                        <p className="text-xs text-muted-foreground">
                          or {formatCurrency(employee.monthlyAmountTarget, currency)} · {formatCurrency(employee.commissionPerUnit, currency)}/unit
                        </p>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-2">
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
            <DialogTitle>{editingEmployee ? 'Edit employee' : 'Add new employee'}</DialogTitle>
            <DialogDescription>
              Confirmation status is calculated automatically from the joining date and probation length — no manual toggle needed.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Full name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sabbir Ahmed" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Phone number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 01711-000000" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Designation<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={employeeForm.designation} onChange={(event) => setEmployeeForm((current) => ({ ...current, designation: event.target.value }))} placeholder="e.g. Sales Officer" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Address <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={employeeForm.address} onChange={(event) => setEmployeeForm((current) => ({ ...current, address: event.target.value }))} placeholder="City / address" />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joining &amp; probation</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Joining date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input type="date" value={employeeForm.joiningDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, joiningDate: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Probation (months)</p>
                  <Input type="number" min="0" value={employeeForm.probationMonths} onChange={(event) => setEmployeeForm((current) => ({ ...current, probationMonths: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Employment status</p>
                  <Select value={employeeForm.employmentStatus} onValueChange={(value) => setEmployeeForm((current) => ({ ...current, employmentStatus: value as EmploymentStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="resigned">Resigned</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary &amp; monthly target</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Base salary</p>
                  <Input type="number" min="0" value={employeeForm.baseSalary} onChange={(event) => setEmployeeForm((current) => ({ ...current, baseSalary: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Commission per unit</p>
                  <Input type="number" min="0" value={employeeForm.commissionPerUnit} onChange={(event) => setEmployeeForm((current) => ({ ...current, commissionPerUnit: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Monthly unit target</p>
                  <Input type="number" min="0" value={employeeForm.monthlyUnitTarget} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlyUnitTarget: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Monthly amount target (BDT)</p>
                  <Input type="number" min="0" value={employeeForm.monthlyAmountTarget} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlyAmountTarget: event.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                An employee hits target by reaching either the unit count or the amount — whichever comes first.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea value={employeeForm.notes} onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>

            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">{editingEmployee ? 'Update employee' : 'Save employee'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
