"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { BatteryCharging, Printer, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { brandedDocument, openPrintWindow } from '@/components/admin/credit-sheet/printSheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { BatteryCondition, BatteryFault, BatteryReportInput, BatteryReportRecord, BatteryVerdict } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { escapeHtml, formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const CONDITION_LABELS: Record<BatteryCondition, string> = {
  good: 'Body OK',
  bulged: 'Bulged / swollen',
  cracked: 'Cracked case',
  leaking: 'Acid leaking',
  terminal_damaged: 'Terminal damaged',
  burnt: 'Burnt / melted',
}

const FAULT_LABELS: Record<BatteryFault, string> = {
  none: 'No fault found',
  discharged: 'Only discharged',
  weak_cell: 'Weak cell',
  dead_cell: 'Dead cell',
  short_circuit: 'Short circuit',
  sulphation: 'Sulphation',
  overcharged: 'Overcharged',
  physical_damage: 'Physical damage',
  manufacturing_defect: 'Manufacturing defect',
}

const VERDICT_LABELS: Record<BatteryVerdict, string> = {
  recharge_return: 'Recharge & return to dealer',
  repair: 'Repair',
  replace: 'Replace under warranty',
  not_covered: 'Not covered by warranty',
}

const VERDICT_STYLES: Record<BatteryVerdict, string> = {
  recharge_return: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  repair: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  replace: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  not_covered: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

type FormState = {
  checkDate: string
  customerId: string
  productId: string
  serialNumber: string
  saleDate: string
  endCustomerName: string
  endCustomerPhone: string
  complaintId: string
  ratedVoltage: string
  ratedCapacityAh: string
  ratedCca: string
  openCircuitVoltage: string
  loadVoltage: string
  measuredCca: string
  internalResistance: string
  specificGravity: string
  afterChargeVoltage: string
  condition: BatteryCondition[]
  fault: BatteryFault
  verdict: BatteryVerdict
  remarks: string
}

const emptyForm = (): FormState => ({
  checkDate: todayInput(),
  customerId: '',
  productId: '',
  serialNumber: '',
  saleDate: '',
  endCustomerName: '',
  endCustomerPhone: '',
  complaintId: '',
  ratedVoltage: '12',
  ratedCapacityAh: '',
  ratedCca: '',
  openCircuitVoltage: '',
  loadVoltage: '',
  measuredCca: '',
  internalResistance: '',
  specificGravity: '',
  afterChargeVoltage: '',
  condition: ['good'],
  fault: 'none',
  verdict: 'recharge_return',
  remarks: '',
})

/** Warranty end date (`YYYY-MM-DD`) from the sale date and warranty months, or '' when unknown. */
function warrantyEnd(saleDate: string, months: number) {
  if (!saleDate || !months) return ''
  const date = new Date(`${saleDate}T00:00:00`)
  date.setMonth(date.getMonth() + months)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Battery health from the tester's CCA against the rated CCA. */
function healthPercent(measured: number, rated: number) {
  return rated > 0 && measured > 0 ? Math.min(Math.round((measured / rated) * 100), 100) : null
}

export default function BatteryReportPage() {
  const { data, currentUser, saveBatteryReport, deleteBatteryReport, hasPermission } = useERP()
  const { customers } = useZoneAccess()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [verdictFilter, setVerdictFilter] = useState<BatteryVerdict | 'all'>('all')

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canEdit = hasPermission('customers.edit')
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }))

  const dealerOptions = useMemo<ComboboxOption[]>(
    () =>
      [...customers]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: `${item.name} (${partyCode(item)})`, sublabel: item.phone })),
    [customers]
  )
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: item.name, sublabel: [item.brand, item.sku].filter(Boolean).join(' · ') })),
    [data?.products]
  )
  const complaintOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Not linked' },
      ...sortByCreatedAtDesc(toArray(data?.complaints))
        .filter((complaint) => !form.customerId || complaint.customerId === form.customerId)
        .map((complaint) => ({
          value: complaint.id,
          label: `${complaint.productName} — ${complaint.customerName}`,
          sublabel: [formatDate(complaint.createdAt), complaint.serialNumber && `SL ${complaint.serialNumber}`, complaint.problem].filter(Boolean).join(' · '),
        })),
    ],
    [data?.complaints, form.customerId]
  )

  const product = form.productId ? data?.products[form.productId] ?? null : null
  const warrantyEndsOn = warrantyEnd(form.saleDate, product?.warrantyMonths ?? 0)
  const inWarranty = warrantyEndsOn ? form.checkDate <= warrantyEndsOn : null
  const health = healthPercent(Number(form.measuredCca), Number(form.ratedCca))

  const reports = useMemo(() => sortByCreatedAtDesc(toArray(data?.batteryReports)), [data?.batteryReports])
  const visibleReports = verdictFilter === 'all' ? reports : reports.filter((report) => report.verdict === verdictFilter)

  function selectComplaint(complaintId: string) {
    const complaint = complaintId ? data?.complaints[complaintId] : undefined
    setForm((current) => ({
      ...current,
      complaintId,
      ...(complaint
        ? {
            customerId: complaint.customerId,
            productId: complaint.productId,
            serialNumber: complaint.serialNumber || current.serialNumber,
            saleDate: complaint.guaranteeDate || current.saleDate,
            endCustomerName: complaint.endCustomerName || current.endCustomerName,
            endCustomerPhone: complaint.endCustomerPhone || current.endCustomerPhone,
          }
        : {}),
    }))
  }

  function toggleCondition(condition: BatteryCondition) {
    setForm((current) => {
      const has = current.condition.includes(condition)
      if (condition === 'good') return { ...current, condition: ['good'] }
      const next = has ? current.condition.filter((item) => item !== condition) : [...current.condition.filter((item) => item !== 'good'), condition]
      return { ...current, condition: next.length ? next : ['good'] }
    })
  }

  function editReport(report: BatteryReportRecord) {
    const text = (value: number) => (value ? String(value) : '')
    setEditingId(report.id)
    setFeedback(null)
    setForm({
      checkDate: report.checkDate,
      customerId: report.customerId,
      productId: report.productId,
      serialNumber: report.serialNumber,
      saleDate: report.saleDate,
      endCustomerName: report.endCustomerName,
      endCustomerPhone: report.endCustomerPhone,
      complaintId: report.complaintId ?? '',
      ratedVoltage: text(report.ratedVoltage),
      ratedCapacityAh: text(report.ratedCapacityAh),
      ratedCca: text(report.ratedCca),
      openCircuitVoltage: text(report.openCircuitVoltage),
      loadVoltage: text(report.loadVoltage),
      measuredCca: text(report.measuredCca),
      internalResistance: text(report.internalResistance),
      specificGravity: report.specificGravity,
      afterChargeVoltage: text(report.afterChargeVoltage),
      condition: report.condition ?? ['good'],
      fault: report.fault,
      verdict: report.verdict,
      remarks: report.remarks,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (!form.customerId) return setFeedback({ tone: 'error', text: 'Select the dealer.' })
    if (!form.productId) return setFeedback({ tone: 'error', text: 'Select the battery model.' })

    const input: BatteryReportInput = {
      checkDate: form.checkDate,
      customerId: form.customerId,
      productId: form.productId,
      serialNumber: form.serialNumber,
      saleDate: form.saleDate,
      endCustomerName: form.endCustomerName,
      endCustomerPhone: form.endCustomerPhone,
      complaintId: form.complaintId || undefined,
      ratedVoltage: Number(form.ratedVoltage),
      ratedCapacityAh: Number(form.ratedCapacityAh),
      ratedCca: Number(form.ratedCca),
      openCircuitVoltage: Number(form.openCircuitVoltage),
      loadVoltage: Number(form.loadVoltage),
      measuredCca: Number(form.measuredCca),
      internalResistance: Number(form.internalResistance),
      specificGravity: form.specificGravity,
      afterChargeVoltage: Number(form.afterChargeVoltage),
      condition: form.condition,
      fault: form.fault,
      verdict: form.verdict,
      remarks: form.remarks,
    }

    setIsSaving(true)
    try {
      await saveBatteryReport(input, editingId ?? undefined)
      setFeedback({ tone: 'success', text: editingId ? 'Battery report updated.' : 'Battery check report saved.' })
      setForm(emptyForm())
      setEditingId(null)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the report.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(report: BatteryReportRecord) {
    if (!window.confirm(`Delete battery report ${report.reportNo}?`)) return
    try {
      await deleteBatteryReport(report.id)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not delete the report.' })
    }
  }

  function printReport(report: BatteryReportRecord) {
    const customer = data?.customers[report.customerId]
    const end = warrantyEnd(report.saleDate, report.warrantyMonths)
    const reportHealth = healthPercent(report.measuredCca, report.ratedCca)
    const value = (amount: number, unit: string) => (amount ? `${amount} ${unit}` : '—')
    const row = (label: string, text: string, label2: string, text2: string) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(text)}</td><td class="label">${escapeHtml(label2)}</td><td>${escapeHtml(text2)}</td></tr>`

    const body = `
      <p class="section-title">Battery & owner</p>
      <table class="info">
        ${row('Report No.', report.reportNo, 'Check date', formatDate(report.checkDate))}
        ${row('Dealer', `${report.customerName} (${partyCode(customer ?? { id: report.customerId })})`, 'Dealer phone', customer?.phone ?? '—')}
        ${row('End customer', report.endCustomerName || '—', 'Phone', report.endCustomerPhone || '—')}
        ${row('Battery model', report.productName, 'Serial No.', report.serialNumber || '—')}
        ${row('Sale / guarantee date', report.saleDate ? formatDate(report.saleDate) : '—', 'Warranty', end ? `${report.warrantyMonths} months · until ${formatDate(end)} (${report.checkDate <= end ? 'IN warranty' : 'EXPIRED'})` : '—')}
      </table>
      <p class="section-title">Test readings</p>
      <table>
        <thead><tr><th>Test</th><th class="numeric">Rated</th><th class="numeric">Measured</th></tr></thead>
        <tbody>
          <tr><td>Voltage (open circuit)</td><td class="numeric">${value(report.ratedVoltage, 'V')}</td><td class="numeric">${value(report.openCircuitVoltage, 'V')}</td></tr>
          <tr><td>Voltage under load</td><td class="numeric">—</td><td class="numeric">${value(report.loadVoltage, 'V')}</td></tr>
          <tr><td>Cold cranking amps (CCA)</td><td class="numeric">${value(report.ratedCca, 'A')}</td><td class="numeric">${value(report.measuredCca, 'A')}</td></tr>
          <tr><td>Capacity</td><td class="numeric">${value(report.ratedCapacityAh, 'Ah')}</td><td class="numeric">—</td></tr>
          <tr><td>Internal resistance</td><td class="numeric">—</td><td class="numeric">${value(report.internalResistance, 'mΩ')}</td></tr>
          <tr><td>Specific gravity (cells)</td><td class="numeric">—</td><td class="numeric">${escapeHtml(report.specificGravity || '—')}</td></tr>
          <tr><td>Voltage after full charge</td><td class="numeric">—</td><td class="numeric">${value(report.afterChargeVoltage, 'V')}</td></tr>
          <tr class="grand"><td>State of health</td><td></td><td class="numeric">${reportHealth === null ? '—' : `${reportHealth}%`}</td></tr>
        </tbody>
      </table>
      <p class="section-title">Findings</p>
      <table class="info">
        ${row('Physical condition', (report.condition ?? []).map((item) => CONDITION_LABELS[item]).join(', '), 'Fault', FAULT_LABELS[report.fault])}
        ${row('Decision', VERDICT_LABELS[report.verdict], 'Checked by', report.checkedByName)}
        <tr><td class="label">Remarks</td><td colspan="3">${escapeHtml(report.remarks || '—')}</td></tr>
      </table>
      <table style="margin-top:48px;border:0">
        <tr>
          <td style="border:0;border-top:1px solid #111827;text-align:center;width:30%">Checked by</td>
          <td style="border:0;width:5%"></td>
          <td style="border:0;border-top:1px solid #111827;text-align:center;width:30%">Service in-charge</td>
          <td style="border:0;width:5%"></td>
          <td style="border:0;border-top:1px solid #111827;text-align:center;width:30%">Dealer</td>
        </tr>
      </table>
    `
    const html = brandedDocument({ title: `Battery report ${report.reportNo}`, heading: 'Battery check report', badge: report.reportNo, body })
    if (!openPrintWindow(html)) setFeedback({ tone: 'error', text: 'Allow popups to print the report.' })
  }

  const numberField = (key: keyof FormState, label: string, unit: string, placeholder = '') => (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">({unit})</span>
      </p>
      <Input type="number" step="any" min={0} value={form[key] as string} placeholder={placeholder} onChange={(event) => set(key, event.target.value as never)} />
    </div>
  )

  return (
    <AdminShell active="Battery Check Report">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BatteryCharging className="h-5 w-5" />
              {editingId ? 'Edit battery check report' : 'New battery check report'}
            </CardTitle>
            <CardDescription>
              Filled on the bench after a returned or complained battery is tested: who it came from and its warranty, the readings, what is
              wrong, and the decision. Link it to the complaint to fill the details in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <p className="text-sm font-medium">
                    Complaint <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Combobox options={complaintOptions} value={form.complaintId} onChange={selectComplaint} placeholder="Not linked" searchPlaceholder="Search complaints..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Check date<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="date" value={form.checkDate} onChange={(event) => set('checkDate', event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dealer<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={dealerOptions} value={form.customerId} onChange={(value) => set('customerId', value)} placeholder="Select dealer" searchPlaceholder="Search name, ID or phone..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Battery model<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={productOptions} value={form.productId} onChange={(value) => set('productId', value)} placeholder="Select product" searchPlaceholder="Search product..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Serial No.</p>
                  <Input value={form.serialNumber} onChange={(event) => set('serialNumber', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Sale / guarantee date</p>
                  <Input type="date" value={form.saleDate} onChange={(event) => set('saleDate', event.target.value)} />
                  {warrantyEndsOn ? (
                    <p className={cn('text-xs', inWarranty ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                      {inWarranty ? 'In warranty' : 'Warranty expired'} — until {formatDate(warrantyEndsOn)}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">End customer</p>
                    <Input value={form.endCustomerName} onChange={(event) => set('endCustomerName', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Phone</p>
                    <Input value={form.endCustomerPhone} onChange={(event) => set('endCustomerPhone', event.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Test readings</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {numberField('ratedVoltage', 'Rated voltage', 'V')}
                  {numberField('ratedCapacityAh', 'Rated capacity', 'Ah')}
                  {numberField('ratedCca', 'Rated CCA', 'A')}
                  {numberField('openCircuitVoltage', 'Open circuit voltage', 'V', '12.6 = full')}
                  {numberField('loadVoltage', 'Voltage under load', 'V', '≥ 9.6 = pass')}
                  {numberField('measuredCca', 'Measured CCA', 'A')}
                  {numberField('internalResistance', 'Internal resistance', 'mΩ')}
                  {numberField('afterChargeVoltage', 'Voltage after full charge', 'V')}
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium">
                      Specific gravity <span className="font-normal text-muted-foreground">(per cell)</span>
                    </p>
                    <Input value={form.specificGravity} onChange={(event) => set('specificGravity', event.target.value)} placeholder="e.g. 1.26, 1.25, 1.12, 1.26, 1.25, 1.26" />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <p className="text-sm">
                      State of health: <span className="font-semibold">{health === null ? '— (enter rated and measured CCA)' : `${health}%`}</span>
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Physical condition</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(CONDITION_LABELS) as BatteryCondition[]).map((condition) => (
                      <button
                        key={condition}
                        type="button"
                        onClick={() => toggleCondition(condition)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-colors',
                          form.condition.includes(condition) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
                        )}
                      >
                        {CONDITION_LABELS[condition]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fault found</p>
                  <Select value={form.fault} onValueChange={(value) => set('fault', value as BatteryFault)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FAULT_LABELS) as BatteryFault[]).map((fault) => (
                        <SelectItem key={fault} value={fault}>
                          {FAULT_LABELS[fault]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Decision</p>
                  <Select value={form.verdict} onValueChange={(value) => set('verdict', value as BatteryVerdict)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VERDICT_LABELS) as BatteryVerdict[]).map((verdict) => (
                        <SelectItem key={verdict} value={verdict}>
                          {VERDICT_LABELS[verdict]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.verdict === 'replace' && inWarranty === false ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">The warranty has expired — check before replacing.</p>
                  ) : null}
                </div>
                <div className="space-y-2 lg:col-span-3">
                  <p className="text-sm font-medium">Remarks</p>
                  <Textarea value={form.remarks} onChange={(event) => set('remarks', event.target.value)} rows={2} />
                </div>
              </section>

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
              <div className="flex justify-end gap-2">
                {editingId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null)
                      setForm(emptyForm())
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
                <Button type="submit" disabled={!canEdit || isSaving}>
                  {isSaving ? 'Saving...' : editingId ? 'Update report' : 'Save report'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Battery reports</CardTitle>
            <Select value={verdictFilter} onValueChange={(value) => setVerdictFilter(value as BatteryVerdict | 'all')}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                {(Object.keys(VERDICT_LABELS) as BatteryVerdict[]).map((verdict) => (
                  <SelectItem key={verdict} value={verdict}>
                    {VERDICT_LABELS[verdict]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {visibleReports.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No battery reports yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Battery</TableHead>
                    <TableHead className="text-right">OCV / Load</TableHead>
                    <TableHead className="text-right">Health</TableHead>
                    <TableHead>Fault</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReports.map((report) => {
                    const reportHealth = healthPercent(report.measuredCca, report.ratedCca)
                    return (
                      <TableRow key={report.id}>
                        <TableCell>
                          <span className="block font-mono text-xs font-medium">{report.reportNo}</span>
                          <span className="block text-xs text-muted-foreground">{formatDate(report.checkDate)} · {report.checkedByName}</span>
                        </TableCell>
                        <TableCell>{report.customerName}</TableCell>
                        <TableCell>
                          <span className="block font-medium">{report.productName}</span>
                          {report.serialNumber ? <span className="block text-xs text-muted-foreground">SL {report.serialNumber}</span> : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {report.openCircuitVoltage || '—'} / {report.loadVoltage || '—'} V
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{reportHealth === null ? '—' : `${reportHealth}%`}</TableCell>
                        <TableCell>{FAULT_LABELS[report.fault]}</TableCell>
                        <TableCell>
                          <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', VERDICT_STYLES[report.verdict])}>
                            {VERDICT_LABELS[report.verdict]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => printReport(report)}>
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </Button>
                            {canEdit ? (
                              <Button size="sm" variant="outline" onClick={() => editReport(report)}>
                                Edit
                              </Button>
                            ) : null}
                            {isAdmin ? (
                              <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete report" onClick={() => void handleDelete(report)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
