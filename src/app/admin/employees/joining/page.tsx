"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ClipboardCheck, Send } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import {
  approvalLabels,
  approvalToneClass,
  compensationLabels,
  EmployeeReviewDialog,
  emptyEmployeeForm,
  FormField,
  JoiningFormSections,
  joiningInputFromForm,
  todayIsoDate,
  type EmployeeFormState,
} from '@/components/admin/employees/EmployeeForms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { EmployeeApprovalStatus, EmployeeRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export default function EmployeeJoiningPage() {
  const { data, currentUser, saveEmployee, hasPermission } = useERP()
  const canSubmit = hasPermission('employees.edit')
  const isAdmin = currentUser?.roleId === 'admin'
  const currency = data?.settings.currency
  const employees = useMemo(() => toArray(data?.employees), [data?.employees])

  const [form, setForm] = useState<EmployeeFormState>(() => ({ ...emptyEmployeeForm, joiningDate: todayIsoDate() }))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<EmployeeApprovalStatus | 'all'>('pending')
  const [reviewingEmployee, setReviewingEmployee] = useState<EmployeeRecord | null>(null)

  const userName = (userId: string) => (userId ? data?.users[userId]?.name ?? '' : '')
  const zoneName = (zoneId: string) => (zoneId ? data?.zones[zoneId]?.name ?? '' : '')

  // Joining forms are the entries someone submitted; employees added before the form existed have no submitter.
  const forms = useMemo(
    () =>
      employees
        .filter((employee) => employee.submittedBy || employee.approvalStatus !== 'approved')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [employees]
  )
  const filteredForms = forms.filter((employee) => statusFilter === 'all' || employee.approvalStatus === statusFilter)
  const pendingCount = forms.filter((employee) => employee.approvalStatus === 'pending').length

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFeedback(null)
    setSaving(true)

    try {
      await saveEmployee(joiningInputFromForm(form), undefined, { submitForApproval: true })
      setForm({ ...emptyEmployeeForm, joiningDate: todayIsoDate() })
      setFeedback(
        isAdmin
          ? `${form.name}'s joining form is submitted. Review it below to set the pay and approve.`
          : `${form.name}'s joining form is submitted. An admin will set the pay and approve it.`
      )
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to submit the joining form.')
    } finally {
      setSaving(false)
    }
  }

  function payLabel(employee: EmployeeRecord) {
    if (employee.approvalStatus !== 'approved') return 'Set on approval'
    if (employee.compensationType === 'commission') return `${formatCurrency(employee.commissionPerUnit, currency)}/unit`
    return `${formatCurrency(employee.baseSalary + employee.taDa + employee.houseRent + employee.mobileBill, currency)}/month`
  }

  return (
    <AdminShell active="Employee Joining Form">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {canSubmit ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Employee joining form</CardTitle>
              <CardDescription>
                Fill in the date, zone/area, designation, personal details, and work experience, then submit for approval. An admin
                sets the salary, commission, TA/DA, house rent, and mobile bill before approving. For a commission-based employee,
                only the commission and a note are set.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <JoiningFormSections form={form} onChange={setForm} />
                <FormField label="Notes" optional>
                  <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                </FormField>

                {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setForm({ ...emptyEmployeeForm, joiningDate: todayIsoDate() })}
                    disabled={saving}
                  >
                    Clear
                  </Button>
                  <Button type="submit" className="rounded-xl" disabled={saving}>
                    <Send className="mr-2 h-4 w-4" />
                    {saving ? 'Submitting...' : 'Submit for approval'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Submitted joining forms</CardTitle>
              <CardDescription>
                {pendingCount
                  ? `${pendingCount} form${pendingCount === 1 ? '' : 's'} awaiting approval.`
                  : 'No forms are awaiting approval.'}
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Awaiting approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All forms</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Zone / area</TableHead>
                    <TableHead>Joining date</TableHead>
                    <TableHead>Type &amp; pay</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredForms.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="min-w-48">
                        <p className="font-semibold">{employee.name}</p>
                        <p className="text-sm text-muted-foreground">{employee.designation}</p>
                        {employee.fatherName ? <p className="text-xs text-muted-foreground">Father: {employee.fatherName}</p> : null}
                      </TableCell>
                      <TableCell className="min-w-36 text-sm">
                        {[zoneName(employee.zoneId), employee.area].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="min-w-32 text-sm">{formatDate(employee.joiningDate)}</TableCell>
                      <TableCell className="min-w-40">
                        <p className="text-sm font-medium">{compensationLabels[employee.compensationType]}</p>
                        <p className="text-xs text-muted-foreground">{payLabel(employee)}</p>
                      </TableCell>
                      <TableCell className="min-w-36 text-sm">
                        <p>{userName(employee.submittedBy) || '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(employee.createdAt)}</p>
                      </TableCell>
                      <TableCell className="min-w-36">
                        <Badge variant="outline" className={cn('rounded-full', approvalToneClass(employee.approvalStatus))}>
                          {approvalLabels[employee.approvalStatus]}
                        </Badge>
                        {employee.approvalStatus !== 'pending' && employee.approvedBy ? (
                          <p className="mt-1 text-xs text-muted-foreground">by {userName(employee.approvedBy)}</p>
                        ) : null}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {employee.approvalStatus === 'pending' ? (
                            <Button size="sm" className="h-9 rounded-xl" onClick={() => setReviewingEmployee(employee)}>
                              <ClipboardCheck className="mr-1.5 h-4 w-4" />
                              Review
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {filteredForms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 7 : 6} className="h-28 text-center text-muted-foreground">
                        No joining forms here.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <EmployeeReviewDialog
        employee={reviewingEmployee}
        onOpenChange={(open) => (open ? null : setReviewingEmployee(null))}
        onReviewed={setFeedback}
      />
    </AdminShell>
  )
}
