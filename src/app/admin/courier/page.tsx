"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, Edit, Plus, Search, Trash2, Truck } from 'lucide-react'

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { CourierInput, CourierRecord } from '@/lib/erp/types'
import { exportPdf, exportXlsx, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type CourierFormState = {
  customerName: string
  billNumber: string
  courierName: string
  productDescription: string
  quantity: string
  codAmount: string
  sentDate: string
}

function emptyCourierForm(): CourierFormState {
  return {
    customerName: '',
    billNumber: '',
    courierName: '',
    productDescription: '',
    quantity: '1',
    codAmount: '0',
    sentDate: new Date().toISOString().slice(0, 10),
  }
}

function formFromCourier(courier: CourierRecord): CourierFormState {
  return {
    customerName: courier.customerName,
    billNumber: courier.billNumber,
    courierName: courier.courierName,
    productDescription: courier.productDescription,
    quantity: String(courier.quantity),
    codAmount: String(courier.codAmount),
    sentDate: courier.sentDate.slice(0, 10),
  }
}

const statusLabels: Record<CourierRecord['status'], string> = {
  'in-transit': 'In transit',
  delivered: 'Delivered',
  'cod-collected': 'COD collected',
  returned: 'Returned',
}

function statusToneClass(status: CourierRecord['status']) {
  if (status === 'in-transit') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }
  if (status === 'delivered' || status === 'cod-collected') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }
  return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
}

export default function CourierUpdatePage() {
  const { data, saveCourier, updateCourierStatus, deleteCourier } = useERP()
  const currency = data?.settings.currency
  const couriers = useMemo(() => toArray(data?.couriers), [data?.couriers])
  const customerNameOptions = useMemo(
    () => Array.from(new Set(toArray(data?.customers).map((customer) => customer.name).filter(Boolean))).sort(),
    [data?.customers]
  )
  const courierNameOptions = useMemo(
    () => Array.from(new Set(couriers.map((courier) => courier.courierName).filter(Boolean))).sort(),
    [couriers]
  )

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCourier, setEditingCourier] = useState<CourierRecord | null>(null)
  const [courierForm, setCourierForm] = useState<CourierFormState>(emptyCourierForm())
  const [feedback, setFeedback] = useState<string | null>(null)

  const sortedCouriers = useMemo(
    () => [...couriers].sort((left, right) => right.sentDate.localeCompare(left.sentDate)),
    [couriers]
  )

  const filteredCouriers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return sortedCouriers

    return sortedCouriers.filter((courier) =>
      [courier.customerName, courier.billNumber, courier.courierName, courier.productDescription]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [sortedCouriers, query])

  const metrics = useMemo(() => {
    return {
      total: couriers.length,
      inTransit: couriers.filter((courier) => courier.status === 'in-transit').length,
      codPending: couriers
        .filter((courier) => courier.status !== 'cod-collected')
        .reduce((sum, courier) => sum + courier.codAmount, 0),
      returned: couriers.filter((courier) => courier.status === 'returned').length,
    }
  }, [couriers])

  function openCreateDialog() {
    setEditingCourier(null)
    setCourierForm(emptyCourierForm())
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(courier: CourierRecord) {
    setEditingCourier(courier)
    setCourierForm(formFromCourier(courier))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: CourierInput = {
      customerName: courierForm.customerName,
      billNumber: courierForm.billNumber,
      courierName: courierForm.courierName,
      productDescription: courierForm.productDescription,
      quantity: Number(courierForm.quantity),
      codAmount: Number(courierForm.codAmount),
      sentDate: courierForm.sentDate,
    }

    try {
      await saveCourier(input, editingCourier?.id)
      setDialogOpen(false)
      setFeedback(editingCourier ? 'Courier entry updated.' : 'New courier shipment recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save courier entry.')
    }
  }

  async function handleDelete(courier: CourierRecord) {
    setFeedback(null)

    try {
      await deleteCourier(courier.id)
      setFeedback(`Shipment for ${courier.customerName} removed.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete courier entry.')
    }
  }

  async function handleStatusChange(courier: CourierRecord, status: CourierRecord['status']) {
    if (courier.status === status) return
    setFeedback(null)

    try {
      await updateCourierStatus(courier.id, status)
      setFeedback(`${courier.customerName}'s shipment marked as ${statusLabels[status]}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update status.')
    }
  }

  function handleExportXlsx() {
    void exportXlsx(
      'courier-update.xlsx',
      'Courier Update',
      ['Customer', 'Bill number', 'Courier', 'Product', 'Sent date', 'COD amount', 'Status'],
      filteredCouriers.map((courier) => [
        courier.customerName,
        courier.billNumber,
        courier.courierName,
        courier.productDescription,
        formatDate(courier.sentDate),
        courier.codAmount,
        statusLabels[courier.status],
      ])
    )
  }

  function handleExportPdf() {
    void exportPdf(
      'courier-update.pdf',
      'Courier Update',
      ['Customer', 'Bill number', 'Courier', 'Sent date', 'COD amount', 'Status'],
      filteredCouriers.map((courier) => [
        courier.customerName,
        courier.billNumber,
        courier.courierName,
        formatDate(courier.sentDate),
        courier.codAmount,
        statusLabels[courier.status],
      ])
    )
  }

  return (
    <AdminShell active="Courier Update">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Shipments', metrics.total.toLocaleString('en-BD'), 'All courier records'],
            ['In transit', metrics.inTransit.toLocaleString('en-BD'), 'Not yet delivered'],
            ['COD pending', formatCurrency(metrics.codPending, currency), 'Cash on delivery outstanding'],
            ['Returned', metrics.returned.toLocaleString('en-BD'), 'Sent back by courier'],
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
              <CardTitle>Courier shipments</CardTitle>
              <CardDescription>Search by customer, bill number, courier, or product.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search shipments"
                />
              </div>
              <Button variant="outline" className="rounded-xl" onClick={handleExportXlsx}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={handleExportPdf}>
                Export PDF
              </Button>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add shipment
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Customer</TableHead>
                    <TableHead>Bill number</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Sent date</TableHead>
                    <TableHead>COD amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCouriers.map((courier) => (
                    <TableRow key={courier.id}>
                      <TableCell className="min-w-44 font-medium">{courier.customerName}</TableCell>
                      <TableCell className="min-w-32">{courier.billNumber}</TableCell>
                      <TableCell className="min-w-36">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <span>{courier.courierName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48 text-sm text-muted-foreground">
                        {courier.productDescription}
                      </TableCell>
                      <TableCell>{formatDate(courier.sentDate)}</TableCell>
                      <TableCell>{formatCurrency(courier.codAmount, currency)}</TableCell>
                      <TableCell className="min-w-44">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('h-8 rounded-full px-3 text-sm font-medium', statusToneClass(courier.status))}
                            >
                              {statusLabels[courier.status]}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            {(Object.keys(statusLabels) as CourierRecord['status'][]).map((status) => (
                              <DropdownMenuItem key={status} onClick={() => void handleStatusChange(courier, status)}>
                                {courier.status === status ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                                {statusLabels[status]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(courier)} aria-label="Edit shipment">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(courier)}
                            aria-label="Delete shipment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCouriers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                        No courier shipments found.
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
            <DialogTitle>{editingCourier ? 'Edit shipment' : 'Add courier shipment'}</DialogTitle>
            <DialogDescription>Track which courier is holding which customer&apos;s product and COD amount.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Customer name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    list="courier-customer-options"
                    value={courierForm.customerName}
                    onChange={(event) => setCourierForm((current) => ({ ...current, customerName: event.target.value }))}
                    placeholder="e.g. Md. Karim Uddin"
                    required
                  />
                  <datalist id="courier-customer-options">
                    {customerNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Courier service<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    list="courier-service-options"
                    value={courierForm.courierName}
                    onChange={(event) => setCourierForm((current) => ({ ...current, courierName: event.target.value }))}
                    placeholder="e.g. Pathao, Sundarban"
                    required
                  />
                  <datalist id="courier-service-options">
                    {courierNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    Bill number <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={courierForm.billNumber}
                    onChange={(event) => setCourierForm((current) => ({ ...current, billNumber: event.target.value }))}
                    placeholder="Link to a sales invoice, if any"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What &amp; when</p>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Product description<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={courierForm.productDescription}
                  onChange={(event) => setCourierForm((current) => ({ ...current, productDescription: event.target.value }))}
                  placeholder="e.g. 2x Two Post Service Lift"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Quantity</p>
                  <Input
                    type="number"
                    min="1"
                    value={courierForm.quantity}
                    onChange={(event) => setCourierForm((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">COD amount ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={courierForm.codAmount}
                    onChange={(event) => setCourierForm((current) => ({ ...current, codAmount: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Sent date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={courierForm.sentDate}
                    onChange={(event) => setCourierForm((current) => ({ ...current, sentDate: event.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingCourier ? 'Update shipment' : 'Save shipment'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
