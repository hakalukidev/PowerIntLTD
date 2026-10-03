"use client"

import { useMemo, useState } from 'react'
import { Tags } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dealerPrice, generalPrice, PRICE_SOURCE_LABELS } from '@/lib/erp/pricing'
import { useERP } from '@/lib/erp/provider'
import type { ProductRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatTableAmount, partyCode, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneId } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

type Scope = 'general' | 'zone' | 'dealer'

const SCOPES: Array<{ id: Scope; label: string; description: string }> = [
  { id: 'general', label: 'Every dealer', description: 'The general price every dealer pays unless a zone, depot or dealer price is set.' },
  { id: 'zone', label: 'One zone', description: 'A price for every dealer of one zone. Dealers you leave out keep the general price.' },
  { id: 'dealer', label: 'One dealer', description: 'A price only this dealer gets. It wins over every other price.' },
]

type Feedback = { tone: 'success' | 'error'; text: string } | null

/** Turns the editable price boxes into what the provider saves: a number, or null for "not set". */
function parseDrafts(drafts: Record<string, string>) {
  return Object.fromEntries(Object.entries(drafts).map(([productId, value]) => [productId, value.trim() === '' ? null : Number(value)]))
}

export default function PriceListPage() {
  const { data, currentUser } = useERP()
  const [scope, setScope] = useState<Scope>('general')
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const products = useMemo(() => toArray(data?.products).sort((left, right) => left.name.localeCompare(right.name)), [data?.products])

  return (
    <AdminShell active="Price List">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Price list
            </CardTitle>
            <CardDescription>
              Prices change for one dealer, for a zone (leaving some dealers out), or for every dealer. An order takes the most specific price:
              dealer, then depot, then zone, then general. Orders already placed keep the price they were billed at.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((item) => (
                <Button key={item.id} type="button" variant={scope === item.id ? 'default' : 'outline'} size="sm" onClick={() => setScope(item.id)}>
                  {item.label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{SCOPES.find((item) => item.id === scope)?.description}</p>
            {!isAdmin ? <p className="text-sm text-amber-600 dark:text-amber-400">Only an admin can change prices; you can view them.</p> : null}
          </CardContent>
        </Card>

        {scope === 'general' ? <GeneralPrices products={products} canEdit={isAdmin} /> : null}
        {scope === 'zone' ? <ZonePrices products={products} canEdit={isAdmin} /> : null}
        {scope === 'dealer' ? <DealerPrices products={products} canEdit={isAdmin} /> : null}
      </div>
    </AdminShell>
  )
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
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
  )
}

function PriceInput({ value, placeholder, disabled, onChange }: { value: string; placeholder: string; disabled: boolean; onChange: (value: string) => void }) {
  return <Input type="number" min={0} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-32" />
}

function GeneralPrices({ products, canEdit }: { products: ProductRecord[]; canEdit: boolean }) {
  const { saveGeneralPrices } = useERP()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function handleSave() {
    setIsSaving(true)
    setFeedback(null)
    try {
      const prices = Object.fromEntries(
        Object.entries(parseDrafts(drafts)).filter((entry): entry is [string, number] => entry[1] !== null && Number.isFinite(entry[1]))
      )
      await saveGeneralPrices(prices)
      setDrafts({})
      setFeedback({ tone: 'success', text: 'General prices saved. They apply to every dealer without a more specific price.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save prices.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">General price for every dealer</CardTitle>
        {canEdit ? (
          <Button type="button" disabled={isSaving || Object.keys(drafts).length === 0} onClick={() => void handleSave()}>
            {isSaving ? 'Saving...' : 'Save prices'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <FeedbackLine feedback={feedback} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Retail</TableHead>
              <TableHead className="text-right">Current general</TableHead>
              <TableHead>New price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <span className="block font-medium">{product.name}</span>
                  <span className="block text-xs text-muted-foreground">{product.sku}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatTableAmount(product.sellingPrice)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatTableAmount(generalPrice(product))}</TableCell>
                <TableCell>
                  <PriceInput
                    value={drafts[product.id] ?? ''}
                    placeholder="Unchanged"
                    disabled={!canEdit}
                    onChange={(value) =>
                      setDrafts((current) => {
                        const next = { ...current }
                        if (value === '') delete next[product.id]
                        else next[product.id] = value
                        return next
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ZonePrices({ products, canEdit }: { products: ProductRecord[]; canEdit: boolean }) {
  const { data, saveZonePrices, saveZonePriceExclusions } = useERP()
  const { zones, customers } = useZoneAccess()
  const [zoneId, setZoneId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const zone = zoneId ? data?.zones[zoneId] ?? null : null
  const zoneDealers = useMemo(
    () => (zoneId ? customers.filter((customer) => customerZoneId(customer, zones) === zoneId).sort((left, right) => left.name.localeCompare(right.name)) : []),
    [customers, zoneId, zones]
  )

  function selectZone(id: string) {
    setZoneId(id)
    setFeedback(null)
    setDrafts(
      Object.fromEntries(
        products.map((product) => {
          const price = product.zonePrices?.[id]
          return [product.id, typeof price === 'number' ? String(price) : '']
        })
      )
    )
    setExcluded(new Set(data?.zones[id]?.priceExcludedCustomerIds ?? []))
  }

  function toggleDealer(customerId: string) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  async function handleSave() {
    if (!zone) return
    setIsSaving(true)
    setFeedback(null)
    try {
      await saveZonePrices(zone.id, parseDrafts(drafts))
      await saveZonePriceExclusions(zone.id, Array.from(excluded))
      setFeedback({
        tone: 'success',
        text: `Prices for ${zone.name} saved${excluded.size ? `; ${excluded.size} dealer${excluded.size === 1 ? '' : 's'} left out keep the general price` : ''}.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save prices.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <Select value={zoneId} onValueChange={selectZone}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && zone ? (
            <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
              {isSaving ? 'Saving...' : 'Save zone prices'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto">
          <FeedbackLine feedback={feedback} />
          {zone ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">General</TableHead>
                  <TableHead>Zone price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <span className="block font-medium">{product.name}</span>
                      <span className="block text-xs text-muted-foreground">{product.sku}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTableAmount(generalPrice(product))}</TableCell>
                    <TableCell>
                      <PriceInput
                        value={drafts[product.id] ?? ''}
                        placeholder="General"
                        disabled={!canEdit}
                        onChange={(value) => setDrafts((current) => ({ ...current, [product.id]: value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Select a zone to set its prices.</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dealers left out</CardTitle>
          <CardDescription>Ticked dealers do not follow this zone’s prices and keep the general price.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[60vh] space-y-1 overflow-y-auto">
          {!zone ? <p className="text-sm text-muted-foreground">Select a zone first.</p> : null}
          {zone && zoneDealers.length === 0 ? <p className="text-sm text-muted-foreground">This zone has no dealers yet.</p> : null}
          {zoneDealers.map((customer) => (
            <label key={customer.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
              <input type="checkbox" className="h-4 w-4 rounded" checked={excluded.has(customer.id)} disabled={!canEdit} onChange={() => toggleDealer(customer.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{customer.name}</span>
                <span className="block text-xs text-muted-foreground">{partyCode(customer)}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DealerPrices({ products, canEdit }: { products: ProductRecord[]; canEdit: boolean }) {
  const { data, saveDealerPrices } = useERP()
  const { zones, customers } = useZoneAccess()
  const [customerId, setCustomerId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const customer = customerId ? data?.customers[customerId] ?? null : null
  const zoneId = customer ? customerZoneId(customer, zones) : ''
  const zone = zoneId ? data?.zones[zoneId] ?? null : null
  const depot = customer?.depotId ? data?.depots[customer.depotId] ?? null : null

  const dealerOptions = useMemo<ComboboxOption[]>(
    () =>
      [...customers]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: `${item.name} (${partyCode(item)})`, sublabel: item.phone })),
    [customers]
  )

  function selectDealer(id: string) {
    setCustomerId(id)
    setFeedback(null)
    const prices = data?.customers[id]?.prices ?? {}
    setDrafts(Object.fromEntries(products.map((product) => [product.id, typeof prices[product.id] === 'number' ? String(prices[product.id]) : ''])))
  }

  async function handleSave() {
    if (!customer) return
    setIsSaving(true)
    setFeedback(null)
    try {
      await saveDealerPrices(customer.id, parseDrafts(drafts))
      setFeedback({ tone: 'success', text: `Prices for ${customer.name} saved.` })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save prices.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="w-full max-w-sm">
          <Combobox options={dealerOptions} value={customerId} onChange={selectDealer} placeholder="Select dealer" searchPlaceholder="Search name, ID or phone..." />
        </div>
        {canEdit && customer ? (
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? 'Saving...' : 'Save dealer prices'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <FeedbackLine feedback={feedback} />
        {customer ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Pays now</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Dealer price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const current = dealerPrice(product, { customer, zone, depot })
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <span className="block font-medium">{product.name}</span>
                      <span className="block text-xs text-muted-foreground">{product.sku}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatTableAmount(current.price)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{PRICE_SOURCE_LABELS[current.source]}</TableCell>
                    <TableCell>
                      <PriceInput
                        value={drafts[product.id] ?? ''}
                        placeholder="Not set"
                        disabled={!canEdit}
                        onChange={(value) => setDrafts((currentDrafts) => ({ ...currentDrafts, [product.id]: value }))}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Select a dealer to set prices only they get.</p>
        )}
      </CardContent>
    </Card>
  )
}
