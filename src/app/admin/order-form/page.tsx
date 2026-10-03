"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CreditCard, Plus, Settings2, Tags, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dealerPrice, PRICE_SOURCE_LABELS } from '@/lib/erp/pricing'
import { useERP } from '@/lib/erp/provider'
import type { CustomerRecord, ProductRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatCurrency, partyCode, shortRecordId, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneId, customerZoneName, UNASSIGNED_ZONE_ID } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const DEFAULT_COURIERS = ['Sundarban Courier', 'SA Paribahan', 'Steadfast', 'Pathao', 'RedX', 'Janani Express', 'Office Delivery']

type OrderLine = {
  key: string
  productId: string
  quantity: string
}

function newLine(): OrderLine {
  return { key: Math.random().toString(36).slice(2), productId: '', quantity: '1' }
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function dealerIdNo(customer: CustomerRecord) {
  return partyCode(customer)
}

export default function OrderFormPage() {
  const { data, currentUser, submitOrderRequest, setCustomerCreditLimit, updateSettings, hasPermission } = useERP()
  const { zones, customers } = useZoneAccess()

  const [customerId, setCustomerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([newLine()])
  const [orderDate, setOrderDate] = useState(todayInput)
  const [deliveryDate, setDeliveryDate] = useState(todayInput)
  const [courierName, setCourierName] = useState('')
  const [paid, setPaid] = useState('0')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [limitDraft, setLimitDraft] = useState<string | null>(null)
  const [pricesOpen, setPricesOpen] = useState(false)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canEdit = hasPermission('sales.edit')
  const blockOverLimit = data?.settings.blockOverLimitOrders ?? false

  const sortedCustomers = useMemo(() => [...customers].sort((left, right) => left.name.localeCompare(right.name)), [customers])
  const customer = customerId ? data?.customers[customerId] ?? null : null
  const zoneId = customer ? customerZoneId(customer, zones) : ''
  const pricingZoneId = zoneId === UNASSIGNED_ZONE_ID ? '' : zoneId
  const pricingZone = pricingZoneId ? data?.zones[pricingZoneId] ?? null : null
  const depot = customer?.depotId ? data?.depots[customer.depotId] ?? null : null

  const nameOptions = useMemo<ComboboxOption[]>(
    () =>
      sortedCustomers.map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: `ID ${dealerIdNo(item)} · ${item.phone}`,
      })),
    [sortedCustomers]
  )
  const idOptions = useMemo<ComboboxOption[]>(
    () =>
      sortedCustomers.map((item) => ({
        value: item.id,
        label: dealerIdNo(item),
        sublabel: `${item.name} · ${item.phone}`,
      })),
    [sortedCustomers]
  )

  const employeeOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.employees)
        .filter((employee) => employee.approvalStatus === 'approved' && employee.employmentStatus === 'active')
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((employee) => ({
          value: employee.id,
          label: `${shortRecordId(employee.id)} — ${employee.name}`,
          sublabel: [employee.designation, employee.phone].filter(Boolean).join(' · '),
        })),
    [data?.employees]
  )

  const products = useMemo(
    () => toArray(data?.products).sort((left, right) => left.name.localeCompare(right.name)),
    [data?.products]
  )
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: `${product.sku} · Stock ${product.stockQty}`,
      })),
    [products]
  )

  const courierOptions = useMemo<ComboboxOption[]>(() => {
    const names = new Set(DEFAULT_COURIERS)
    toArray(data?.couriers).forEach((courier) => courier.courierName && names.add(courier.courierName))
    if (courierName) names.add(courierName)
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [data?.couriers, courierName])

  const pricedLines = lines.map((line) => {
    const product = line.productId ? data?.products[line.productId] : undefined
    const quantity = Math.max(Number(line.quantity) || 0, 0)
    const priced = product ? dealerPrice(product, { customer, zone: pricingZone, depot }) : null
    const unitPrice = priced?.price ?? 0
    return { ...line, product, quantity, unitPrice, priceSource: priced?.source, lineTotal: unitPrice * quantity }
  })
  const total = pricedLines.reduce((sum, line) => sum + line.lineTotal, 0)
  const paidAmount = Math.min(Math.max(Number(paid) || 0, 0), total)
  const orderDue = total - paidAmount

  const creditLimit = customer?.creditLimit ?? 0
  const currentDue = customer?.due ?? 0
  const available = creditLimit > 0 ? creditLimit - currentDue : null
  const isOverLimit = creditLimit > 0 && currentDue + orderDue > creditLimit
  const submitBlocked = isOverLimit && blockOverLimit

  function updateLine(key: string, patch: Partial<OrderLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function selectCustomer(id: string) {
    setCustomerId(id)
    setLimitDraft(null)
    setFeedback(null)
  }

  function resetForm() {
    setCustomerId('')
    setEmployeeId('')
    setLines([newLine()])
    setOrderDate(todayInput())
    setDeliveryDate(todayInput())
    setCourierName('')
    setPaid('0')
    setLimitDraft(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!customer) return setFeedback({ tone: 'error', text: 'Select a dealer.' })
    if (!employeeId) return setFeedback({ tone: 'error', text: 'Select the employee ID.' })
    const items = pricedLines.filter((line) => line.product)
    if (!items.length) return setFeedback({ tone: 'error', text: 'Add at least one product.' })
    if (items.some((line) => line.quantity <= 0)) return setFeedback({ tone: 'error', text: 'Every quantity must be at least 1.' })
    if (!deliveryDate) return setFeedback({ tone: 'error', text: 'Set the delivery date.' })
    if (!courierName) return setFeedback({ tone: 'error', text: 'Choose a courier.' })
    if (submitBlocked) return setFeedback({ tone: 'error', text: 'This order is over the dealer’s credit limit. Over-limit orders are blocked.' })

    setIsSaving(true)
    try {
      await submitOrderRequest({
        customerId: customer.id,
        employeeId,
        items: items.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice })),
        paid: paidAmount,
        orderDate: new Date(orderDate).toISOString(),
        deliveryDate: new Date(deliveryDate).toISOString(),
        courierName,
      })
      setFeedback({
        tone: 'success',
        text: isOverLimit
          ? `Order for ${customer.name} sent for approval, marked over the credit limit.`
          : `Order for ${customer.name} sent for approval.`,
      })
      resetForm()
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the order.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function saveCreditLimit() {
    if (!customer || limitDraft === null) return
    try {
      await setCustomerCreditLimit(customer.id, Number(limitDraft) || 0)
      setLimitDraft(null)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the credit limit.' })
    }
  }

  return (
    <AdminShell active="Order Form">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dealer & employee</CardTitle>
              <CardDescription>Search by dealer name or ID — picking one fills the other.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Dealer name<span className="ml-0.5 text-rose-500">*</span></p>
                <Combobox
                  options={nameOptions}
                  value={customerId}
                  onChange={selectCustomer}
                  placeholder="Select dealer"
                  searchPlaceholder="Search name or phone..."
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Dealer ID No<span className="ml-0.5 text-rose-500">*</span></p>
                <Combobox
                  options={idOptions}
                  value={customerId}
                  onChange={selectCustomer}
                  placeholder="Select ID"
                  searchPlaceholder="Search ID..."
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium">Employee ID<span className="ml-0.5 text-rose-500">*</span></p>
                <Combobox
                  options={employeeOptions}
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder="Select employee (for commission)"
                  searchPlaceholder="Search employee ID or name..."
                  emptyText="No approved, active employees."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Products</CardTitle>
                <CardDescription>
                  {customer
                    ? depot
                      ? `Depot prices of ${depot.name}; products without one use ${customerZoneName(customer, zones)} prices.`
                      : `Prices for ${customerZoneName(customer, zones)}.`
                    : 'Select a dealer first — prices follow the dealer’s depot or zone.'}
                </CardDescription>
              </div>
              {isAdmin ? (
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setPricesOpen(true)}>
                  <Tags className="h-4 w-4" />
                  Zone prices
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {pricedLines.map((line) => (
                <div key={line.key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_96px_120px_auto] sm:items-end sm:border-0 sm:p-0">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Product</p>
                    <Combobox
                      options={productOptions}
                      value={line.productId}
                      onChange={(productId) => updateLine(line.key, { productId })}
                      placeholder="Select product"
                      searchPlaceholder="Search name or SKU..."
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Quantity</p>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Price</p>
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums">
                      {line.product ? formatCurrency(line.unitPrice) : '—'}
                    </div>
                    {line.priceSource && line.priceSource !== 'general' ? (
                      <p className="text-[11px] text-muted-foreground">{PRICE_SOURCE_LABELS[line.priceSource]}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="text-sm font-medium tabular-nums sm:hidden">{formatCurrency(line.lineTotal)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove product"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {line.product && line.quantity > line.product.stockQty ? (
                    <p className="text-xs text-rose-600 sm:col-span-4">Only {line.product.stockQty} in stock.</p>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((current) => [...current, newLine()])}>
                <Plus className="h-4 w-4" />
                Add product
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Date<span className="ml-0.5 text-rose-500">*</span></p>
                <Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Delivery date<span className="ml-0.5 text-rose-500">*</span></p>
                <Input type="date" value={deliveryDate} min={orderDate} onChange={(event) => setDeliveryDate(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Courier<span className="ml-0.5 text-rose-500">*</span></p>
                <Combobox
                  options={courierOptions}
                  value={courierName}
                  onChange={setCourierName}
                  placeholder="Choose a courier"
                  searchPlaceholder="Search courier..."
                  onCreateNew={(typed) => typed && setCourierName(typed)}
                  createNewLabel="Use"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Paid now <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input type="number" min={0} value={paid} onChange={(event) => setPaid(event.target.value)} />
              </div>
            </CardContent>
          </Card>

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

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={!canEdit || isSaving || submitBlocked} className="w-full sm:w-auto">
              {isSaving ? 'Submitting...' : 'Submit for approval'}
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                Dealer credit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {customer ? (
                <>
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID {dealerIdNo(customer)} · {customerZoneName(customer, zones)}
                    </p>
                  </div>
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Credit limit</dt>
                      <dd className="tabular-nums">{creditLimit > 0 ? formatCurrency(creditLimit) : 'No limit'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Current due</dt>
                      <dd className="tabular-nums">{formatCurrency(currentDue)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
                      <dt>Available credit</dt>
                      <dd className={cn('tabular-nums', available !== null && available <= 0 && 'text-rose-600')}>
                        {available === null ? 'Unlimited' : formatCurrency(available)}
                      </dd>
                    </div>
                  </dl>
                  {isOverLimit ? (
                    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        This order puts the dealer {formatCurrency(currentDue + orderDue - creditLimit)} over their limit.{' '}
                        {blockOverLimit ? 'It cannot be submitted.' : 'It will be submitted marked over-limit.'}
                      </span>
                    </div>
                  ) : null}
                  {isAdmin ? (
                    limitDraft === null ? (
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setLimitDraft(String(creditLimit))}>
                        Set credit limit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Input type="number" min={0} value={limitDraft} onChange={(event) => setLimitDraft(event.target.value)} placeholder="0 = no limit" />
                        <Button type="button" size="sm" onClick={() => void saveCreditLimit()}>
                          Save
                        </Button>
                      </div>
                    )
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">Select a dealer to see their available credit.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Items</span>
                <span className="tabular-nums">{pricedLines.filter((line) => line.product).reduce((sum, line) => sum + line.quantity, 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Paid now</span>
                <span className="tabular-nums">{formatCurrency(paidAmount)}</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
                <span>Added to due</span>
                <span className="tabular-nums">{formatCurrency(orderDue)}</span>
              </div>
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  Admin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <label className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">Block over-limit orders</span>
                    <span className="block text-xs text-muted-foreground">
                      {blockOverLimit ? 'On: over-limit orders cannot be submitted.' : 'Off: they are submitted and marked.'}
                    </span>
                  </span>
                  <Switch
                    checked={blockOverLimit}
                    onCheckedChange={(checked) =>
                      void updateSettings({ blockOverLimitOrders: checked }).catch((error: unknown) =>
                        setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the setting.' })
                      )
                    }
                  />
                </label>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      {isAdmin ? <ZonePricesDialog open={pricesOpen} onOpenChange={setPricesOpen} products={products} /> : null}
    </AdminShell>
  )
}

function ZonePricesDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: ProductRecord[]
}) {
  const { saveZonePrices } = useERP()
  const { zones } = useZoneAccess()
  const [zoneId, setZoneId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function selectZone(id: string) {
    setZoneId(id)
    setError(null)
    setDrafts(
      Object.fromEntries(
        products.map((product) => {
          const price = product.zonePrices?.[id]
          return [product.id, typeof price === 'number' ? String(price) : '']
        })
      )
    )
  }

  async function handleSave() {
    if (!zoneId) return
    setIsSaving(true)
    setError(null)
    try {
      await saveZonePrices(
        zoneId,
        Object.fromEntries(Object.entries(drafts).map(([productId, value]) => [productId, value.trim() === '' ? null : Number(value)]))
      )
      onOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save prices.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zone prices</DialogTitle>
          <DialogDescription>Set a product’s price for one zone. Leave a price empty to use the wholesale price.</DialogDescription>
        </DialogHeader>
        <Select value={zoneId} onValueChange={selectZone}>
          <SelectTrigger>
            <SelectValue placeholder="Select zone" />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {zoneId ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Wholesale</TableHead>
                <TableHead className="w-36">Zone price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <span className="block font-medium">{product.name}</span>
                    <span className="block text-xs text-muted-foreground">{product.sku}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(product.wholesalePrice || product.sellingPrice)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={drafts[product.id] ?? ''}
                      placeholder="Default"
                      onChange={(event) => setDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!zoneId || isSaving} onClick={() => void handleSave()}>
            {isSaving ? 'Saving...' : 'Save prices'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
