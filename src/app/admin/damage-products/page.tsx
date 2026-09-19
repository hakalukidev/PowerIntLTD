"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Edit, Plus, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { divisionList } from '@/lib/data/bangladeshLocations'
import { useERP } from '@/lib/erp/provider'
import type { DamageProductInput, DamageProductRecord } from '@/lib/erp/types'
import { exportPdf, exportXlsx, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type DamageProductFormState = {
  productName: string
  quantity: string
  zone: string
  reportedDate: string
  reason: string
  notes: string
}

function emptyDamageProductForm(): DamageProductFormState {
  return {
    productName: '',
    quantity: '1',
    zone: '',
    reportedDate: new Date().toISOString().slice(0, 10),
    reason: '',
    notes: '',
  }
}

function formFromDamageProduct(record: DamageProductRecord): DamageProductFormState {
  return {
    productName: record.productName,
    quantity: String(record.quantity),
    zone: record.zone,
    reportedDate: record.reportedDate.slice(0, 10),
    reason: record.reason,
    notes: record.notes,
  }
}

const statusLabels: Record<DamageProductRecord['status'], string> = {
  pending: 'Pending at zone',
  'sent-to-office': 'Sent to main office',
  received: 'Received at main office',
  resolved: 'Resolved',
}

const nextStatus: Partial<Record<DamageProductRecord['status'], DamageProductRecord['status']>> = {
  pending: 'sent-to-office',
  'sent-to-office': 'received',
  received: 'resolved',
}

const nextStatusButtonLabel: Record<DamageProductRecord['status'], string> = {
  pending: 'Mark sent to office',
  'sent-to-office': 'Mark received',
  received: 'Mark resolved',
  resolved: '',
}

function statusToneClass(status: DamageProductRecord['status']) {
  if (status === 'pending') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
  }
  if (status === 'sent-to-office') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }
  if (status === 'received') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }
  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

export default function DamageProductsPage() {
  const { data, saveDamageProduct, updateDamageProductStatus, deleteDamageProduct } = useERP()
  const damageProducts = useMemo(() => toArray(data?.damageProducts), [data?.damageProducts])

  const [query, setQuery] = useState('')
  const [filterZone, setFilterZone] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | DamageProductRecord['status']>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DamageProductRecord | null>(null)
  const [form, setForm] = useState<DamageProductFormState>(emptyDamageProductForm())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const sortedRecords = useMemo(
    () => [...damageProducts].sort((left, right) => right.reportedDate.localeCompare(left.reportedDate)),
    [damageProducts]
  )

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return sortedRecords.filter((record) => {
      const matchesQuery =
        !normalizedQuery ||
        [record.productName, record.zone, record.reason].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesZone = filterZone === 'all' || record.zone === filterZone
      const matchesStatus = filterStatus === 'all' || record.status === filterStatus

      return matchesQuery && matchesZone && matchesStatus
    })
  }, [sortedRecords, query, filterZone, filterStatus])

  const metrics = useMemo(() => {
    return {
      total: damageProducts.length,
      pending: damageProducts.filter((record) => record.status === 'pending').length,
      inTransit: damageProducts.filter((record) => record.status === 'sent-to-office').length,
      resolved: damageProducts.filter((record) => record.status === 'resolved').length,
    }
  }, [damageProducts])

  const hasActiveFilters = query.trim() !== '' || filterZone !== 'all' || filterStatus !== 'all'

  function clearFilters() {
    setQuery('')
    setFilterZone('all')
    setFilterStatus('all')
  }

  function openCreateDialog() {
    setEditingRecord(null)
    setForm(emptyDamageProductForm())
    setFeedback(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(record: DamageProductRecord) {
    setEditingRecord(record)
    setForm(formFromDamageProduct(record))
    setFeedback(null)
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setFormError(null)

    if (!form.zone) {
      setFormError('Please select a zone before saving.')
      return
    }

    const input: DamageProductInput = {
      productName: form.productName,
      quantity: Number(form.quantity),
      zone: form.zone,
      reportedDate: form.reportedDate,
      reason: form.reason,
      notes: form.notes,
    }

    try {
      await saveDamageProduct(input, editingRecord?.id)
      setDialogOpen(false)
      setFeedback(editingRecord ? 'Damage report updated.' : 'New damage product reported.')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save damage report.')
    }
  }

  async function handleDelete(record: DamageProductRecord) {
    setFeedback(null)

    try {
      await deleteDamageProduct(record.id)
      setFeedback(`Damage report for ${record.productName} removed.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete damage report.')
    }
  }

  async function handleStatusChange(record: DamageProductRecord, status: DamageProductRecord['status']) {
    if (record.status === status) return
    setFeedback(null)

    try {
      await updateDamageProductStatus(record.id, status)
      setFeedback(`${record.productName} marked as ${statusLabels[status]}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update status.')
    }
  }

  function handleExportXlsx() {
    void exportXlsx(
      'damage-products.xlsx',
      'Damage Products',
      ['Product', 'Quantity', 'Zone', 'Reported date', 'Sent date', 'Received date', 'Reason', 'Status'],
      filteredRecords.map((record) => [
        record.productName,
        record.quantity,
        record.zone,
        formatDate(record.reportedDate),
        record.sentDate ? formatDate(record.sentDate) : '-',
        record.receivedDate ? formatDate(record.receivedDate) : '-',
        record.reason,
        statusLabels[record.status],
      ])
    )
  }

  function handleExportPdf() {
    void exportPdf(
      'damage-products.pdf',
      'Damage Products',
      ['Product', 'Quantity', 'Zone', 'Reported date', 'Status'],
      filteredRecords.map((record) => [
        record.productName,
        record.quantity,
        record.zone,
        formatDate(record.reportedDate),
        statusLabels[record.status],
      ])
    )
  }

  return (
    <AdminShell active="Damage Products">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Damage reports', metrics.total.toLocaleString('en-BD'), 'All zones combined'],
            ['Pending at zone', metrics.pending.toLocaleString('en-BD'), 'Not yet sent to main office'],
            ['Sent to office', metrics.inTransit.toLocaleString('en-BD'), 'On the way / awaiting receipt'],
            ['Resolved', metrics.resolved.toLocaleString('en-BD'), 'Closed damage cases'],
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
              <CardTitle>Damage products</CardTitle>
              <CardDescription>Track which zone reported the damage and its current status.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search product or reason"
                />
              </div>
              <Select value={filterZone} onValueChange={setFilterZone}>
                <SelectTrigger className="h-10 w-40 rounded-xl">
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All zones</SelectItem>
                  {divisionList.map((division) => (
                    <SelectItem key={division} value={division}>
                      {division}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="rounded-xl" onClick={handleExportXlsx}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={handleExportPdf}>
                Export PDF
              </Button>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Report damage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setFilterStatus('all')}
              >
                All statuses
              </Button>
              {(Object.keys(statusLabels) as DamageProductRecord['status'][]).map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFilterStatus(status)}
                >
                  {statusLabels[status]}
                </Button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Sent to office</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="min-w-48 font-medium">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span>{record.productName}</span>
                        </div>
                        {record.reason ? (
                          <p className="mt-1 text-xs text-muted-foreground">{record.reason}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{record.quantity}</TableCell>
                      <TableCell className="min-w-28">{record.zone}</TableCell>
                      <TableCell>{formatDate(record.reportedDate)}</TableCell>
                      <TableCell>{record.sentDate ? formatDate(record.sentDate) : '-'}</TableCell>
                      <TableCell>{record.receivedDate ? formatDate(record.receivedDate) : '-'}</TableCell>
                      <TableCell className="min-w-48">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('h-8 rounded-full px-3 text-sm font-medium', statusToneClass(record.status))}
                            >
                              {statusLabels[record.status]}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            {(Object.keys(statusLabels) as DamageProductRecord['status'][]).map((status) => (
                              <DropdownMenuItem key={status} onClick={() => void handleStatusChange(record, status)}>
                                {record.status === status ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                                {statusLabels[status]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {nextStatus[record.status] ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-xl whitespace-nowrap"
                              onClick={() => void handleStatusChange(record, nextStatus[record.status]!)}
                            >
                              {nextStatusButtonLabel[record.status]}
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => openEditDialog(record)}
                            aria-label="Edit damage report"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(record)}
                            aria-label="Delete damage report"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32">
                        <div className="flex flex-col items-center justify-center gap-2 text-center">
                          {hasActiveFilters ? (
                            <>
                              <p className="text-sm text-muted-foreground">
                                No damage products match the current filter
                                {filterStatus !== 'all' ? ` ("${statusLabels[filterStatus]}")` : ''}.
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Statuses only change when you open a record&apos;s &quot;Status&quot; dropdown and
                                pick the next stage — filters just narrow what you see, they don&apos;t move
                                anything.
                              </p>
                              <Button variant="outline" size="sm" className="mt-1 rounded-full" onClick={clearFilters}>
                                Clear filters
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No damage product reports found.</p>
                          )}
                        </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit damage report' : 'Report damage product'}</DialogTitle>
            <DialogDescription>
              Record which zone found the damage and track it until it reaches the main office.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {formError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
                {formError}
              </p>
            ) : null}
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What &amp; where</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    Product name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={form.productName}
                    onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))}
                    placeholder="e.g. Two Post Service Lift"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Quantity</p>
                  <Input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Zone<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Select value={form.zone || undefined} onValueChange={(value) => setForm((current) => ({ ...current, zone: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisionList.map((division) => (
                        <SelectItem key={division} value={division}>
                          {division}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    Reported date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={form.reportedDate}
                    onChange={(event) => setForm((current) => ({ ...current, reportedDate: event.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Reason for damage</p>
                <Input
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="e.g. Hydraulic cylinder leak found during unboxing"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Notes</p>
                <Input
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional internal note"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingRecord ? 'Update report' : 'Save report'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
