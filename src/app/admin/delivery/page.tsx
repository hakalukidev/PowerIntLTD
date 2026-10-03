"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { FileText, PackageCheck, Save, Send, Upload } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { EmptyState, FeedbackBanner, type Feedback } from '@/components/admin/approvals/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { OrderRecord, OrderRequestRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, formatDateTime, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const DEFAULT_COURIERS = ['Sundarban Courier', 'SA Paribahan', 'Steadfast', 'Pathao', 'RedX', 'Janani Express', 'Office Delivery']
const DELIVERY_DOCUMENT_FOLDER = 'power-int/delivery-documents'

type Tab = 'to-post' | 'posted' | 'submitted'

type DeliveryRow = { order: OrderRecord; request: OrderRequestRecord }

type Options = {
  warehouses: ComboboxOption[]
  deliveryMen: ComboboxOption[]
  couriers: ComboboxOption[]
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </p>
      {children}
    </div>
  )
}

function OrderSummary({ row }: { row: DeliveryRow }) {
  const { order, request } = row
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{order.customerName}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{order.billNumber}</span>
      </div>
      <p className="text-sm text-muted-foreground">{order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}</p>
      <p className="text-xs text-muted-foreground">
        {formatCurrency(order.total)} · Deliver by {formatDate(order.deliveryDate)} · Approved by {request.reviewedByName}
        {request.reviewedAt ? ` on ${formatDateTime(request.reviewedAt)}` : ''}
      </p>
    </div>
  )
}

function WarehouseSelect({ options, value, onChange }: { options: ComboboxOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a warehouse" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Step 1: choose where it leaves from, who takes it and the courier, then post. */
function PostCard({ row, options, onFeedback }: { row: DeliveryRow; options: Options; onFeedback: (feedback: Feedback) => void }) {
  const { data, postDelivery } = useERP()
  // A depot's dealers are delivered from the depot's warehouse.
  const depotId = data?.customers[row.order.customerId]?.depotId
  const depotWarehouseId = (depotId && data?.depots[depotId]?.warehouseId) || ''
  const [warehouseId, setWarehouseId] = useState(depotWarehouseId)
  const [deliveryManId, setDeliveryManId] = useState('')
  const [courierName, setCourierName] = useState(row.order.courierName ?? '')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId) return onFeedback({ tone: 'error', text: 'Choose the warehouse.' })
    if (!deliveryManId) return onFeedback({ tone: 'error', text: 'Choose the delivery man.' })
    if (!courierName) return onFeedback({ tone: 'error', text: 'Choose a courier.' })
    setBusy(true)
    try {
      await postDelivery(row.order.id, { warehouseId, deliveryManId, courierName })
      onFeedback({ tone: 'success', text: `${row.order.billNumber} posted. Add the delivery document under "Posted" once it comes back.` })
    } catch (error) {
      onFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not post the delivery.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <OrderSummary row={row} />
        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <Field label="Warehouse" required>
            <WarehouseSelect options={options.warehouses} value={warehouseId} onChange={setWarehouseId} />
            {depotWarehouseId ? <p className="text-xs text-muted-foreground">Depot dealer — delivered from the depot.</p> : null}
          </Field>
          <Field label="Delivery man" required>
            <Combobox options={options.deliveryMen} value={deliveryManId} onChange={setDeliveryManId} placeholder="Choose an employee" searchPlaceholder="Search name..." />
          </Field>
          <Field label="Courier" required>
            <Combobox options={options.couriers} value={courierName} onChange={setCourierName} placeholder="Choose a courier" searchPlaceholder="Search courier..." />
          </Field>
          <Button type="submit" disabled={busy} className="gap-1.5">
            <Send className="h-4 w-4" />
            {busy ? 'Posting…' : 'Post'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** Step 2: fill in the rest of the delivery, then add the delivery document and submit it to the audit. */
function PostedCard({ row, options, onFeedback }: { row: DeliveryRow; options: Options; onFeedback: (feedback: Feedback) => void }) {
  const { updateDeliveryDetails, submitDelivery } = useERP()
  const delivery = row.order.delivery!
  const [form, setForm] = useState({
    warehouseId: delivery.warehouseId,
    deliveryManId: delivery.deliveryManId,
    courierName: delivery.courierName,
    trackingNumber: delivery.trackingNumber,
    vehicle: delivery.vehicle,
    deliveryCharge: delivery.deliveryCharge ? String(delivery.deliveryCharge) : '',
    note: delivery.note,
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function handleSave() {
    setBusy('save')
    try {
      await updateDeliveryDetails(row.order.id, { ...form, deliveryCharge: Number(form.deliveryCharge) || 0 })
      onFeedback({ tone: 'success', text: `Delivery details of ${row.order.billNumber} saved.` })
    } catch (error) {
      onFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the details.' })
    } finally {
      setBusy(null)
    }
  }

  async function handleSubmit() {
    if (!file) return onFeedback({ tone: 'error', text: 'Add the delivery document first.' })
    setBusy('submit')
    try {
      const uploaded = await uploadImageToCloudinary(file, DELIVERY_DOCUMENT_FOLDER)
      await submitDelivery(row.order.id, { url: uploaded.imageUrl, publicId: uploaded.imagePublicId })
      onFeedback({ tone: 'success', text: `${row.order.billNumber} submitted to the audit. The document is on ${row.order.customerName}'s credit sheet.` })
    } catch (error) {
      onFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the delivery.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <OrderSummary row={row} />
          <p className="text-xs text-muted-foreground">
            Posted by {delivery.postedByName} · {formatDateTime(delivery.postedAt)}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Warehouse" required>
            <WarehouseSelect options={options.warehouses} value={form.warehouseId} onChange={set('warehouseId')} />
          </Field>
          <Field label="Delivery man" required>
            <Combobox options={options.deliveryMen} value={form.deliveryManId} onChange={set('deliveryManId')} placeholder="Choose an employee" searchPlaceholder="Search name..." />
          </Field>
          <Field label="Courier">
            <Combobox options={options.couriers} value={form.courierName} onChange={set('courierName')} placeholder="Choose a courier" searchPlaceholder="Search courier..." />
          </Field>
          <Field label="Tracking / CN number">
            <Input value={form.trackingNumber} onChange={(event) => set('trackingNumber')(event.target.value)} />
          </Field>
          <Field label="Vehicle">
            <Input value={form.vehicle} placeholder="Van, bike, pickup…" onChange={(event) => set('vehicle')(event.target.value)} />
          </Field>
          <Field label="Delivery charge">
            <Input type="number" min={0} value={form.deliveryCharge} onChange={(event) => set('deliveryCharge')(event.target.value)} />
          </Field>
          <div className="md:col-span-3">
            <Field label="Note">
              <Textarea rows={2} value={form.note} onChange={(event) => set('note')(event.target.value)} />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-end md:justify-between">
          <Field label="Delivery document" required>
            <Input type="file" accept="image/*" className="md:w-80" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => void handleSave()}>
              <Save className="h-4 w-4" />
              {busy === 'save' ? 'Saving…' : 'Save details'}
            </Button>
            <Button type="button" className="gap-1.5" disabled={busy !== null || !file} onClick={() => void handleSubmit()}>
              <Upload className="h-4 w-4" />
              {busy === 'submit' ? 'Submitting…' : 'Submit to audit'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SubmittedCard({ row }: { row: DeliveryRow }) {
  const delivery = row.order.delivery!
  const details = [
    ['Warehouse', delivery.warehouseName],
    ['Delivery man', delivery.deliveryManName],
    ['Courier', delivery.courierName],
    ['Tracking', delivery.trackingNumber],
    ['Vehicle', delivery.vehicle],
    ['Charge', delivery.deliveryCharge ? formatCurrency(delivery.deliveryCharge) : ''],
  ].filter(([, value]) => value)

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <OrderSummary row={row} />
          <a href={delivery.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <FileText className="h-4 w-4" />
            Delivery document
          </a>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {delivery.note ? <p className="text-sm text-muted-foreground">{delivery.note}</p> : null}
        <p className="text-xs text-muted-foreground">
          Submitted by {delivery.submittedByName} · {formatDateTime(delivery.submittedAt)}
        </p>
      </CardContent>
    </Card>
  )
}

export default function DeliveryPage() {
  const { data } = useERP()
  const [tab, setTab] = useState<Tab>('to-post')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Only orders an admin approved from the order form are delivered from here.
  const rows = useMemo<DeliveryRow[]>(
    () =>
      toArray(data?.orderRequests)
        .filter((request) => request.status === 'approved' && request.orderId && data?.orders[request.orderId])
        .map((request) => ({ request, order: data!.orders[request.orderId!] }))
        .sort((left, right) => (right.request.reviewedAt ?? '').localeCompare(left.request.reviewedAt ?? '')),
    [data]
  )

  const options = useMemo<Options>(() => {
    const couriers = new Set(DEFAULT_COURIERS)
    toArray(data?.couriers).forEach((courier) => courier.courierName && couriers.add(courier.courierName))
    rows.forEach((row) => row.order.courierName && couriers.add(row.order.courierName))
    return {
      warehouses: toArray(data?.warehouses)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((warehouse) => ({ value: warehouse.id, label: warehouse.location ? `${warehouse.name} — ${warehouse.location}` : warehouse.name })),
      deliveryMen: toArray(data?.employees)
        .filter((employee) => employee.approvalStatus === 'approved' && employee.employmentStatus === 'active')
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((employee) => ({ value: employee.id, label: employee.name, sublabel: employee.designation })),
      couriers: [...couriers].sort().map((name) => ({ value: name, label: name })),
    }
  }, [data?.couriers, data?.employees, data?.warehouses, rows])

  const query = search.trim().toLowerCase()
  const matches = (row: DeliveryRow) =>
    !query || [row.order.customerName, row.order.billNumber, row.order.delivery?.deliveryManName ?? ''].some((value) => value.toLowerCase().includes(query))
  const groups: Record<Tab, DeliveryRow[]> = {
    'to-post': rows.filter((row) => !row.order.delivery),
    posted: rows.filter((row) => row.order.delivery?.status === 'posted'),
    submitted: rows.filter((row) => row.order.delivery?.status === 'submitted'),
  }
  const visible = groups[tab].filter(matches)

  const tabs: Array<{ id: Tab; label: string; hint: string }> = [
    { id: 'to-post', label: 'To post', hint: 'Approved orders waiting for a warehouse, delivery man and courier.' },
    { id: 'posted', label: 'Posted', hint: 'Sent out. Fill in the details and add the delivery document when it comes back.' },
    { id: 'submitted', label: 'Submitted', hint: 'Document received and sent to the audit.' },
  ]

  return (
    <AdminShell active="Delivery">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id)
                    setFeedback(null)
                  }}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.label}
                  {groups[item.id].length && item.id !== 'submitted' ? (
                    <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{groups[item.id].length}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <Input className="sm:w-64" placeholder="Search dealer, bill, delivery man…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <Card className="border-dashed">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-4 w-4" />
              {tabs.find((item) => item.id === tab)?.label}
            </CardTitle>
            <CardDescription>{tabs.find((item) => item.id === tab)?.hint}</CardDescription>
          </CardHeader>
        </Card>

        <FeedbackBanner feedback={feedback} />

        {visible.length ? (
          <div className="space-y-4">
            {visible.map((row) =>
              tab === 'to-post' ? (
                <PostCard key={row.order.id} row={row} options={options} onFeedback={setFeedback} />
              ) : tab === 'posted' ? (
                <PostedCard key={row.order.id} row={row} options={options} onFeedback={setFeedback} />
              ) : (
                <SubmittedCard key={row.order.id} row={row} />
              )
            )}
          </div>
        ) : (
          <EmptyState text={query ? 'No deliveries match your search.' : 'Nothing here right now.'} />
        )}
      </div>
    </AdminShell>
  )
}
