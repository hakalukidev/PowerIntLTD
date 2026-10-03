"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Tags, Trash2, UserMinus, UserPlus, Warehouse } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { DepotInput, DepotRecord, ProductRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatCurrency, partyCode, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

type Feedback = { tone: 'success' | 'error'; text: string }

function emptyDraft(): DepotInput {
  return { name: '', ownerName: '', phone: '', address: '', zoneId: '', ownerUserId: '', notes: '' }
}

function draftFromDepot(depot: DepotRecord): DepotInput {
  return {
    name: depot.name,
    ownerName: depot.ownerName,
    phone: depot.phone,
    address: depot.address,
    zoneId: depot.zoneId,
    ownerUserId: depot.ownerUserId,
    notes: depot.notes,
  }
}

export default function DepotPage() {
  const { data, currentUser, hasPermission, deleteDepot, setDealersDepot } = useERP()
  const { zones, customers } = useZoneAccess()
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canEdit = hasPermission('customers.edit')

  const depots = useMemo(() => toArray(data?.depots).sort((left, right) => left.name.localeCompare(right.name)), [data?.depots])
  const [selectedId, setSelectedId] = useState('')
  const depot = depots.find((item) => item.id === selectedId) ?? depots[0] ?? null

  const [editing, setEditing] = useState<{ id?: string; draft: DepotInput } | null>(null)
  const [pricesOpen, setPricesOpen] = useState(false)
  const [dealerToAdd, setDealerToAdd] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const dealers = useMemo(
    () => (depot ? customers.filter((customer) => customer.depotId === depot.id).sort((left, right) => left.name.localeCompare(right.name)) : []),
    [customers, depot]
  )
  const addableOptions = useMemo<ComboboxOption[]>(
    () =>
      depot
        ? customers
            .filter((customer) => customer.depotId !== depot.id)
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((customer) => {
              const currentDepot = customer.depotId ? data?.depots[customer.depotId] : undefined
              return {
                value: customer.id,
                label: customer.name,
                sublabel: [`ID ${partyCode(customer)}`, customer.phone, currentDepot ? `now in ${currentDepot.name}` : '']
                  .filter(Boolean)
                  .join(' · '),
              }
            })
        : [],
    [customers, data?.depots, depot]
  )
  const totalDue = dealers.reduce((sum, dealer) => sum + dealer.due, 0)
  const pricedCount = Object.keys(depot?.prices ?? {}).length

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setFeedback(null)
    try {
      await action()
      setFeedback({ tone: 'success', text: success })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  function handleAddDealer() {
    if (!depot || !dealerToAdd) return
    const name = data?.customers[dealerToAdd]?.name ?? 'Dealer'
    void run(async () => {
      await setDealersDepot([dealerToAdd], depot.id)
      setDealerToAdd('')
    }, `${name} is now a dealer of ${depot.name}.`)
  }

  function handleRemoveDealer(customerId: string, name: string) {
    if (!depot || !window.confirm(`Take ${name} out of ${depot.name}? They go back to zone prices and normal delivery.`)) return
    void run(() => setDealersDepot([customerId], ''), `${name} was taken out of ${depot.name}.`)
  }

  function handleDelete(item: DepotRecord) {
    if (!window.confirm(`Delete ${item.name} depot? Its dealers stay, but are no longer under a depot.`)) return
    void run(async () => {
      await deleteDepot(item.id)
      setSelectedId('')
    }, `${item.name} depot was deleted.`)
  }

  return (
    <AdminShell active="Depot">
      <div className="space-y-6">
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

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Depots</CardTitle>
              <CardDescription>
                Fill up the depot form first. Once the depot is saved, its dealers can be added; they get the depot’s prices and
                their deliveries leave from the depot.
              </CardDescription>
            </div>
            {canEdit ? (
              <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setEditing({ draft: emptyDraft() })}>
                <Plus className="h-4 w-4" />
                Add depot
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {depots.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {canEdit ? 'No depots yet. Add a depot to start putting dealers under it.' : 'You have no depot yet. Your dealers appear here once your depot is set up.'}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {depots.map((item) => {
                  const count = toArray(data?.customers).filter((customer) => customer.depotId === item.id).length
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        'rounded-lg border p-4 text-left transition-colors hover:bg-muted/50',
                        depot?.id === item.id && 'border-primary bg-primary/5'
                      )}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <Warehouse className="h-4 w-4 text-muted-foreground" />
                        {item.name}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {item.ownerName} · {item.phone}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {count} {count === 1 ? 'dealer' : 'dealers'}
                        {item.zoneId && data?.zones[item.zoneId] ? ` · ${data.zones[item.zoneId].name}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {depot ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>{depot.name}</CardTitle>
                  <CardDescription>Owned by {depot.ownerName}</CardDescription>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label="Edit depot" onClick={() => setEditing({ id: depot.id, draft: draftFromDepot(depot) })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Delete depot" disabled={busy} onClick={() => handleDelete(depot)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Phone', depot.phone],
                    ['Address', depot.address || '—'],
                    ['Zone', (depot.zoneId && data?.zones[depot.zoneId]?.name) || '—'],
                    ['Owner login', (depot.ownerUserId && data?.users[depot.ownerUserId]?.name) || 'Not linked'],
                    ['Delivers from', data?.warehouses[depot.warehouseId]?.name ?? '—'],
                    ['Dealers', String(dealers.length)],
                    ['Dealers’ due', formatCurrency(totalDue, data?.settings.currency)],
                    ['Depot prices set', `${pricedCount} ${pricedCount === 1 ? 'product' : 'products'}`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {depot.notes ? <p className="mt-4 text-sm text-muted-foreground">{depot.notes}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Dealers of {depot.name}</CardTitle>
                  <CardDescription>Their orders use this depot’s prices and are delivered from the depot.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {canEdit ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Combobox
                      className="sm:max-w-md"
                      options={addableOptions}
                      value={dealerToAdd}
                      onChange={setDealerToAdd}
                      placeholder="Select a dealer to add"
                      searchPlaceholder="Search name, ID or phone..."
                    />
                    <Button type="button" className="gap-1.5" disabled={!dealerToAdd || busy} onClick={handleAddDealer}>
                      <UserPlus className="h-4 w-4" />
                      Add to depot
                    </Button>
                  </div>
                ) : null}
                {dealers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No dealers under this depot yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dealer</TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Zone</TableHead>
                          <TableHead className="text-right">Due</TableHead>
                          {canEdit ? <TableHead className="text-right">Action</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dealers.map((dealer) => (
                          <TableRow key={dealer.id}>
                            <TableCell className="font-medium">{dealer.name}</TableCell>
                            <TableCell className="tabular-nums">{partyCode(dealer)}</TableCell>
                            <TableCell>{dealer.phone}</TableCell>
                            <TableCell>{customerZoneName(dealer, zones)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(dealer.due, data?.settings.currency)}</TableCell>
                            {canEdit ? (
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Remove ${dealer.name} from depot`}
                                  disabled={busy}
                                  onClick={() => handleRemoveDealer(dealer.id, dealer.name)}
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Depot prices</CardTitle>
                  <CardDescription>What this depot’s dealers pay. Products without a depot price use the zone or wholesale price.</CardDescription>
                </div>
                {isAdmin ? (
                  <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setPricesOpen(true)}>
                    <Tags className="h-4 w-4" />
                    Set prices
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {pricedCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No depot prices yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Wholesale</TableHead>
                          <TableHead className="text-right">Depot price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(depot.prices ?? {})
                          .map(([productId, price]) => ({ product: data?.products[productId], price }))
                          .filter((row): row is { product: ProductRecord; price: number } => Boolean(row.product))
                          .sort((left, right) => left.product.name.localeCompare(right.product.name))
                          .map(({ product, price }) => (
                            <TableRow key={product.id}>
                              <TableCell>
                                <span className="block font-medium">{product.name}</span>
                                <span className="block text-xs text-muted-foreground">{product.sku}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(product.wholesalePrice || product.sellingPrice)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{formatCurrency(price)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {editing ? (
        <DepotDialog
          key={editing.id ?? 'new'}
          depotId={editing.id}
          initial={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={(id, created) => {
            setSelectedId(id)
            setFeedback({
              tone: 'success',
              text: created ? 'Depot saved. Now add its dealers below.' : 'Depot details updated.',
            })
          }}
        />
      ) : null}
      {pricesOpen && depot ? <DepotPricesDialog depot={depot} onClose={() => setPricesOpen(false)} /> : null}
    </AdminShell>
  )
}

function DepotDialog({
  depotId,
  initial,
  onClose,
  onSaved,
}: {
  depotId?: string
  initial: DepotInput
  onClose: () => void
  onSaved: (id: string, created: boolean) => void
}) {
  const { data, saveDepot } = useERP()
  const { zoneOptions } = useZoneAccess()
  const [draft, setDraft] = useState(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.users)
        .filter((user) => user.status === 'active')
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((user) => ({ value: user.id, label: user.name, sublabel: [user.loginId, user.phone].filter(Boolean).join(' · ') })),
    [data?.users]
  )

  const set = (key: keyof DepotInput) => (value: string) => setDraft((current) => ({ ...current, [key]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const id = await saveDepot(draft, depotId)
      onSaved(id, !depotId)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the depot.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{depotId ? 'Edit depot' : 'Depot form'}</DialogTitle>
          <DialogDescription>
            {depotId ? 'Change the depot’s details.' : 'Saving the depot also sets up its warehouse. Dealers are added after it is saved.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">
              Depot name<span className="ml-0.5 text-rose-500">*</span>
            </span>
            <Input value={draft.name} onChange={(event) => set('name')(event.target.value)} placeholder="e.g. Bogura Depot" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">
              Owner name<span className="ml-0.5 text-rose-500">*</span>
            </span>
            <Input value={draft.ownerName} onChange={(event) => set('ownerName')(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">
              Phone<span className="ml-0.5 text-rose-500">*</span>
            </span>
            <Input value={draft.phone} onChange={(event) => set('phone')(event.target.value)} placeholder="01XXXXXXXXX" />
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Zone</span>
            <Select value={draft.zoneId || 'none'} onValueChange={(value) => set('zoneId')(value === 'none' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No zone</SelectItem>
                {zoneOptions.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Depot address</span>
            <Input value={draft.address} onChange={(event) => set('address')(event.target.value)} />
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Owner login</span>
            <Combobox
              options={userOptions}
              value={draft.ownerUserId ?? ''}
              onChange={set('ownerUserId')}
              placeholder="Not linked"
              searchPlaceholder="Search user..."
            />
            <p className="text-xs text-muted-foreground">The linked user sees only this depot’s dealers.</p>
          </div>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Notes</span>
            <Textarea value={draft.notes} onChange={(event) => set('notes')(event.target.value)} rows={3} />
          </label>
          {error ? <p className="text-sm text-rose-600 sm:col-span-2">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            {draft.ownerUserId ? (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => set('ownerUserId')('')}>
                Unlink owner
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save depot'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DepotPricesDialog({ depot, onClose }: { depot: DepotRecord; onClose: () => void }) {
  const { data, saveDepotPrices } = useERP()
  const products = useMemo(() => toArray(data?.products).sort((left, right) => left.name.localeCompare(right.name)), [data?.products])
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products.map((product) => {
        const price = depot.prices?.[product.id]
        return [product.id, typeof price === 'number' ? String(price) : '']
      })
    )
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      await saveDepotPrices(
        depot.id,
        Object.fromEntries(Object.entries(drafts).map(([productId, value]) => [productId, value.trim() === '' ? null : Number(value)]))
      )
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save prices.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{depot.name} prices</DialogTitle>
          <DialogDescription>Leave a price empty to use the zone or wholesale price.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Wholesale</TableHead>
              <TableHead className="w-36">Depot price</TableHead>
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
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? 'Saving...' : 'Save prices'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
