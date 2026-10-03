"use client"

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

import { downloadJoiningLetter } from '@/components/admin/employees/joiningLetter'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type {
  EmployeeApprovalStatus,
  EmployeeCompensationType,
  EmployeeInput,
  EmployeeRecord,
  EmploymentStatus,
} from '@/lib/erp/types'
import {
  DEFAULT_COMMISSION_PER_UNIT,
  DEFAULT_MONTHLY_AMOUNT_TARGET,
  DEFAULT_MONTHLY_UNIT_TARGET,
  DEFAULT_PROBATION_MONTHS,
  formatDate,
  toArray,
} from '@/lib/erp/utils'
import { zoneSubZones } from '@/lib/erp/zones'

export type EmployeeFormState = {
  name: string
  address: string
  phone: string
  designation: string
  joiningDate: string
  zoneId: string
  area: string
  fatherName: string
  motherName: string
  dateOfBirth: string
  nid: string
  experience: string
  compensationType: EmployeeCompensationType
  probationMonths: string
  employmentStatus: EmploymentStatus
  baseSalary: string
  taDa: string
  daPerDay: string
  houseRent: string
  mobileBill: string
  monthlyUnitTarget: string
  monthlyAmountTarget: string
  commissionPerUnit: string
  /** The login linked to this employee, so they can see their own profile. Set by an admin. */
  userId: string
  notes: string
}

export type PayFormState = {
  compensationType: EmployeeCompensationType
  baseSalary: string
  taDa: string
  daPerDay: string
  houseRent: string
  mobileBill: string
  commissionPerUnit: string
  monthlyUnitTarget: string
  monthlyAmountTarget: string
  notes: string
}

export const NO_ZONE = 'none'

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export const emptyEmployeeForm: EmployeeFormState = {
  name: '',
  address: '',
  phone: '',
  designation: '',
  joiningDate: todayIsoDate(),
  zoneId: '',
  area: '',
  fatherName: '',
  motherName: '',
  dateOfBirth: '',
  nid: '',
  experience: '',
  compensationType: 'salary',
  probationMonths: String(DEFAULT_PROBATION_MONTHS),
  employmentStatus: 'active',
  baseSalary: '0',
  taDa: '0',
  daPerDay: '0',
  houseRent: '0',
  mobileBill: '0',
  monthlyUnitTarget: String(DEFAULT_MONTHLY_UNIT_TARGET),
  monthlyAmountTarget: String(DEFAULT_MONTHLY_AMOUNT_TARGET),
  commissionPerUnit: String(DEFAULT_COMMISSION_PER_UNIT),
  userId: '',
  notes: '',
}

export function formFromEmployee(employee: EmployeeRecord): EmployeeFormState {
  return {
    name: employee.name,
    address: employee.address,
    phone: employee.phone,
    designation: employee.designation,
    joiningDate: employee.joiningDate.slice(0, 10),
    zoneId: employee.zoneId,
    area: employee.area,
    fatherName: employee.fatherName,
    motherName: employee.motherName,
    dateOfBirth: employee.dateOfBirth,
    nid: employee.nid,
    experience: employee.experience,
    compensationType: employee.compensationType,
    probationMonths: String(employee.probationMonths),
    employmentStatus: employee.employmentStatus,
    baseSalary: String(employee.baseSalary),
    taDa: String(employee.taDa),
    daPerDay: String(employee.daPerDay),
    houseRent: String(employee.houseRent),
    mobileBill: String(employee.mobileBill),
    monthlyUnitTarget: String(employee.monthlyUnitTarget),
    monthlyAmountTarget: String(employee.monthlyAmountTarget),
    commissionPerUnit: String(employee.commissionPerUnit),
    userId: employee.userId ?? '',
    notes: employee.notes,
  }
}

export function payFormFromEmployee(employee: EmployeeRecord): PayFormState {
  return {
    compensationType: employee.compensationType,
    baseSalary: String(employee.baseSalary || ''),
    taDa: String(employee.taDa || ''),
    daPerDay: String(employee.daPerDay || ''),
    houseRent: String(employee.houseRent || ''),
    mobileBill: String(employee.mobileBill || ''),
    commissionPerUnit: String(employee.commissionPerUnit || ''),
    monthlyUnitTarget: String(employee.monthlyUnitTarget ?? DEFAULT_MONTHLY_UNIT_TARGET),
    monthlyAmountTarget: String(employee.monthlyAmountTarget ?? DEFAULT_MONTHLY_AMOUNT_TARGET),
    notes: employee.notes,
  }
}

/**
 * Downloads an approved employee's joining letter. The first download gives them their staff
 * id if they have none yet (employees approved before ids existed).
 */
export function useJoiningLetter() {
  const { data, issueJoiningLetter } = useERP()

  return async (employee: EmployeeRecord) => {
    const issued = await issueJoiningLetter(employee.id)
    await downloadJoiningLetter(issued, {
      companyName: data?.settings.companyName || 'Power International BD',
      zoneName: data?.zones[issued.zoneId]?.name ?? '',
      approvedByName: data?.users[issued.approvedBy]?.name ?? '',
    })
  }
}


/** The joining details from the form, without pay: pay is set by an admin. */
export function joiningInputFromForm(form: EmployeeFormState): EmployeeInput {
  return {
    name: form.name,
    address: form.address,
    phone: form.phone,
    designation: form.designation,
    joiningDate: form.joiningDate,
    zoneId: form.zoneId,
    area: form.area,
    fatherName: form.fatherName,
    motherName: form.motherName,
    dateOfBirth: form.dateOfBirth,
    nid: form.nid,
    experience: form.experience,
    compensationType: form.compensationType,
    probationMonths: Number(form.probationMonths),
    employmentStatus: form.employmentStatus,
    notes: form.notes,
  }
}

export const approvalLabels: Record<EmployeeApprovalStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function approvalToneClass(status: EmployeeApprovalStatus) {
  if (status === 'pending') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }
  if (status === 'rejected') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
  }
  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

export const compensationLabels: Record<EmployeeCompensationType, string> = {
  salary: 'Salary-based',
  commission: 'Commission-based',
}

export function monthlyFixedPay(employee: Pick<EmployeeRecord, 'baseSalary' | 'taDa' | 'houseRent' | 'mobileBill'>) {
  return employee.baseSalary + employee.taDa + employee.houseRent + employee.mobileBill
}

export function FormField({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </p>
      {children}
    </div>
  )
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

/** The joining details, personal information, and work experience of the employee joining form. */
export function JoiningFormSections({
  form,
  onChange,
  showEmploymentStatus = false,
}: {
  form: EmployeeFormState
  onChange: Dispatch<SetStateAction<EmployeeFormState>>
  showEmploymentStatus?: boolean
}) {
  const { data } = useERP()
  const zones = useMemo(() => toArray(data?.zones).sort((left, right) => left.name.localeCompare(right.name)), [data?.zones])
  const areaOptions = useMemo(() => zoneSubZones(zones.find((zone) => zone.id === form.zoneId)), [form.zoneId, zones])
  const setField = <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) =>
    onChange((current) => ({ ...current, [key]: value }))

  return (
    <>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joining</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Joining date" required>
                  <Input type="date" value={form.joiningDate} onChange={(event) => setField('joiningDate', event.target.value)} required />
                </FormField>
                <FormField label="Designation" required>
                  <Input value={form.designation} onChange={(event) => setField('designation', event.target.value)} placeholder="e.g. Sales Officer" required />
                </FormField>
                <FormField label="Zone">
                  <Select
                    value={form.zoneId || NO_ZONE}
                    onValueChange={(value) => onChange((current) => ({ ...current, zoneId: value === NO_ZONE ? '' : value, area: '' }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ZONE}>No zone</SelectItem>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Area">
                  <Input list="employee-area-options" value={form.area} onChange={(event) => setField('area', event.target.value)} placeholder="e.g. Mirpur" />
                  <datalist id="employee-area-options">
                    {areaOptions.map((area) => (
                      <option key={area} value={area} />
                    ))}
                  </datalist>
                </FormField>
                <FormField label="Employment type" required>
                  <Select value={form.compensationType} onValueChange={(value) => setField('compensationType', value as EmployeeCompensationType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salary">Salary-based</SelectItem>
                      <SelectItem value="commission">Commission-based</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                {showEmploymentStatus ? (
                  <FormField label="Employment status">
                    <Select value={form.employmentStatus} onValueChange={(value) => setField('employmentStatus', value as EmploymentStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="resigned">Resigned</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal information</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Full name" required>
                  <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Sabbir Ahmed" required />
                </FormField>
                <FormField label="Father's name" required>
                  <Input value={form.fatherName} onChange={(event) => setField('fatherName', event.target.value)} required />
                </FormField>
                <FormField label="Mother's name" optional>
                  <Input value={form.motherName} onChange={(event) => setField('motherName', event.target.value)} />
                </FormField>
                <FormField label="Date of birth" optional>
                  <Input type="date" value={form.dateOfBirth} onChange={(event) => setField('dateOfBirth', event.target.value)} />
                </FormField>
                <FormField label="NID number" optional>
                  <Input value={form.nid} onChange={(event) => setField('nid', event.target.value)} placeholder="National ID" />
                </FormField>
                <FormField label="Phone number" required>
                  <Input value={form.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="e.g. 01711-000000" required />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Address" optional>
                    <Input value={form.address} onChange={(event) => setField('address', event.target.value)} placeholder="Present / permanent address" />
                  </FormField>
                </div>
              </div>
            </div>

            <FormField label="Work experience" optional>
              <Textarea
                value={form.experience}
                onChange={(event) => setField('experience', event.target.value)}
                rows={3}
                placeholder="Previous employers, roles, and years"
              />
            </FormField>
    </>
  )
}

/** An admin checks a pending joining form, sets the pay, and approves or rejects it. */
export function EmployeeReviewDialog({
  employee,
  onOpenChange,
  onReviewed,
}: {
  employee: EmployeeRecord | null
  onOpenChange: (open: boolean) => void
  onReviewed: (message: string) => void
}) {
  const { data, reviewEmployee } = useERP()
  const downloadLetter = useJoiningLetter()
  const zoneName = (zoneId: string) => data?.zones[zoneId]?.name ?? ''
  const [payForm, setPayForm] = useState<PayFormState>(() =>
    employee ? payFormFromEmployee(employee) : payFormFromEmployee({} as EmployeeRecord)
  )
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewedId, setReviewedId] = useState(employee?.id)

  // Start from the newly opened form's own details.
  if (employee && employee.id !== reviewedId) {
    setReviewedId(employee.id)
    setPayForm(payFormFromEmployee(employee))
    setReviewError(null)
  }

  const setPayField = <K extends keyof PayFormState>(key: K, value: PayFormState[K]) =>
    setPayForm((current) => ({ ...current, [key]: value }))

    async function handleReview(decision: 'approve' | 'reject') {
      if (!employee) {
        return
      }

      setReviewError(null)
      const salaryBased = payForm.compensationType === 'salary'

      try {
        const reviewed = await reviewEmployee(
          employee.id,
          decision,
          decision === 'approve'
            ? {
                compensationType: payForm.compensationType,
                baseSalary: salaryBased ? Number(payForm.baseSalary) : 0,
                taDa: salaryBased ? Number(payForm.taDa) : 0,
                houseRent: salaryBased ? Number(payForm.houseRent) : 0,
                mobileBill: salaryBased ? Number(payForm.mobileBill) : 0,
                commissionPerUnit: Number(payForm.commissionPerUnit),
                daPerDay: Number(payForm.daPerDay),
                monthlyUnitTarget: Number(payForm.monthlyUnitTarget),
                monthlyAmountTarget: Number(payForm.monthlyAmountTarget),
                notes: payForm.notes,
              }
            : undefined
        )
        onOpenChange(false)
        if (decision === 'approve') {
          // The joining letter comes with the approval as a PDF copy.
          let letterNote = 'The joining letter PDF has been downloaded.'
          try {
            await downloadLetter(reviewed)
          } catch {
            letterNote = 'Download the joining letter from the employee profile.'
          }
          onReviewed(`${employee.name}'s joining form approved as ${reviewed.employeeCode}. ${letterNote}`)
        } else {
          onReviewed(`${employee.name}'s joining form rejected.`)
        }
      } catch (reason) {
        setReviewError(reason instanceof Error ? reason.message : 'Unable to review joining form.')
      }
    }


  return (
    <Dialog open={Boolean(employee)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review joining form</DialogTitle>
          <DialogDescription>Check the details, set the pay, then approve.</DialogDescription>
        </DialogHeader>
        {employee ? (
          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border border-border/70 p-4 sm:grid-cols-3">
              <DetailRow label="Name" value={employee.name} />
              <DetailRow label="Father's name" value={employee.fatherName} />
              <DetailRow label="Mother's name" value={employee.motherName} />
              <DetailRow label="Designation" value={employee.designation} />
              <DetailRow label="Joining date" value={formatDate(employee.joiningDate)} />
              <DetailRow label="Zone / area" value={[zoneName(employee.zoneId), employee.area].filter(Boolean).join(' · ')} />
              <DetailRow label="Phone" value={employee.phone} />
              <DetailRow label="NID" value={employee.nid} />
              <DetailRow label="Date of birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : ''} />
              <div className="sm:col-span-3">
                <DetailRow label="Address" value={employee.address} />
              </div>
              <div className="sm:col-span-3">
                <p className="text-xs text-muted-foreground">Work experience</p>
                <p className="whitespace-pre-line text-sm font-medium">{employee.experience || '—'}</p>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pay</p>
              <FormField label="Employment type">
                <Select value={payForm.compensationType} onValueChange={(value) => setPayField('compensationType', value as EmployeeCompensationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">Salary-based</SelectItem>
                    <SelectItem value="commission">Commission-based</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                {payForm.compensationType === 'salary' ? (
                  <>
                    <FormField label="Salary" required>
                      <Input type="number" min="0" value={payForm.baseSalary} onChange={(event) => setPayField('baseSalary', event.target.value)} />
                    </FormField>
                    <FormField label="Commission per unit">
                      <Input type="number" min="0" value={payForm.commissionPerUnit} onChange={(event) => setPayField('commissionPerUnit', event.target.value)} />
                    </FormField>
                    <FormField label="TA/DA">
                      <Input type="number" min="0" value={payForm.taDa} onChange={(event) => setPayField('taDa', event.target.value)} />
                    </FormField>
                    <FormField label="House rent">
                      <Input type="number" min="0" value={payForm.houseRent} onChange={(event) => setPayField('houseRent', event.target.value)} />
                    </FormField>
                    <FormField label="Mobile bill">
                      <Input type="number" min="0" value={payForm.mobileBill} onChange={(event) => setPayField('mobileBill', event.target.value)} />
                    </FormField>
                  </>
                ) : (
                  <FormField label="Commission per unit" required>
                    <Input type="number" min="0" value={payForm.commissionPerUnit} onChange={(event) => setPayField('commissionPerUnit', event.target.value)} />
                  </FormField>
                )}
                <FormField label="DA per present day">
                  <Input type="number" min="0" value={payForm.daPerDay} onChange={(event) => setPayField('daPerDay', event.target.value)} />
                </FormField>
                <FormField label="Monthly target (pcs)">
                  <Input type="number" min="0" value={payForm.monthlyUnitTarget} onChange={(event) => setPayField('monthlyUnitTarget', event.target.value)} />
                </FormField>
                <FormField label="Monthly target (BDT sales)">
                  <Input type="number" min="0" value={payForm.monthlyAmountTarget} onChange={(event) => setPayField('monthlyAmountTarget', event.target.value)} />
                </FormField>
              </div>
              <p className="text-xs text-muted-foreground">
                Commission is paid only at 80% of either target, for the share of credit sales collected. Approving gives a staff
                id and downloads the joining letter.
              </p>
              <FormField label="Note" optional>
                <Textarea value={payForm.notes} onChange={(event) => setPayField('notes', event.target.value)} rows={2} />
              </FormField>
            </div>

            {reviewError ? <p className="text-sm text-destructive">{reviewError}</p> : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => void handleReview('reject')}>
                <XCircle className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleReview('approve')}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
