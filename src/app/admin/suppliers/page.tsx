"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, Edit, MapPin, Phone, Plus, Search, Ship, Trash2 } from 'lucide-react'

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { SupplierInput, SupplierRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SupplierFormState = {
  name: string
  company: string
  phone: string
  email: string
  location: string
  supplierType: SupplierRecord['supplierType']
  country: string
  lcNumber: string
  lcStatus: SupplierRecord['lcStatus']
  productCost: string
  shippingCost: string
  customsDuty: string
  otherCost: string
  currency: string
  notes: string
}

const emptySupplierForm: SupplierFormState = {
  name: '',
  company: '',
  phone: '',
  email: '',
  location: '',
  supplierType: 'local',
  country: 'Bangladesh',
  lcNumber: '',
  lcStatus: 'not-required',
  productCost: '0',
  shippingCost: '0',
  customsDuty: '0',
  otherCost: '0',
  currency: 'BDT',
  notes: '',
}

const supplierTypeLabels: Record<SupplierRecord['supplierType'], string> = {
  local: 'Local supplier',
  foreign: 'Foreign supplier',
  importer: 'Importer',
}

const lcStatusLabels: Record<SupplierRecord['lcStatus'], string> = {
  'not-required': 'No LC',
  pending: 'LC pending',
  opened: 'LC opened',
  released: 'Released',
  closed: 'Closed',
}

const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']
const commonCountries = ['Bangladesh', 'China', 'India', 'United States', 'United Arab Emirates']

function getLandedCost(supplier: SupplierRecord) {
  return supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost
}

function typeToneClass(type: SupplierRecord['supplierType']) {
  if (type === 'foreign') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }

  if (type === 'importer') {
    return 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300'
  }

  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

function lcToneClass(status: SupplierRecord['lcStatus']) {
  if (status === 'pending') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  if (status === 'opened' || status === 'released') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }

  if (status === 'closed') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }

  return 'border-border bg-muted text-muted-foreground'
}

function formFromSupplier(supplier: SupplierRecord): SupplierFormState {
  return {
    name: supplier.name,
    company: supplier.company,
    phone: supplier.phone,
    email: supplier.email,
    location: supplier.location,
    supplierType: supplier.supplierType,
    country: supplier.country,
    lcNumber: supplier.lcNumber,
    lcStatus: supplier.lcStatus,
    productCost: String(supplier.productCost),
    shippingCost: String(supplier.shippingCost),
    customsDuty: String(supplier.customsDuty),
    otherCost: String(supplier.otherCost),
    currency: supplier.currency,
    notes: supplier.notes,
  }
}

export default function SuppliersPage() {
  const { data, saveSupplier, deleteSupplier } = useERP()
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const purchases = useMemo(() => toArray(data?.purchases), [data?.purchases])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const currency = data?.settings.currency
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SupplierRecord['supplierType'] | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null)
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const supplierRows = useMemo(() => {
    return suppliers
      .map((supplier) => {
        const supplierPurchases = purchases.filter((purchase) => purchase.supplierId === supplier.id)
        const purchaseTotal = supplierPurchases.reduce((sum, purchase) => sum + purchase.total, 0)
        const lastPurchase = [...supplierPurchases].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
        const assignedProducts = products.filter((product) => product.supplierId === supplier.id).length

        return {
          supplier,
          purchaseCount: supplierPurchases.length,
          purchaseTotal,
          assignedProducts,
          lastPurchaseDate: lastPurchase?.createdAt ?? supplier.updatedAt,
          landedCost: getLandedCost(supplier),
          hasHistory: supplierPurchases.length > 0 || assignedProducts > 0,
        }
      })
      .sort((left, right) => right.landedCost - left.landedCost)
  }, [products, purchases, suppliers])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return supplierRows.filter(({ supplier }) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          supplier.name,
          supplier.company,
          supplier.phone,
          supplier.email,
          supplier.location,
          supplier.country,
          supplier.lcNumber,
          supplier.notes,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesType = typeFilter === 'all' || supplier.supplierType === typeFilter

      return matchesSearch && matchesType
    })
  }, [query, supplierRows, typeFilter])

  const metrics = useMemo(() => {
    return {
      suppliers: suppliers.length,
      importPartners: suppliers.filter((supplier) => supplier.supplierType !== 'local').length,
      landedCost: suppliers.reduce((sum, supplier) => sum + getLandedCost(supplier), 0),
      importCharges: suppliers.reduce(
        (sum, supplier) => sum + supplier.shippingCost + supplier.customsDuty + supplier.otherCost,
        0
      ),
    }
  }, [suppliers])

  const countryOptions = useMemo(
    () => Array.from(new Set([...commonCountries, ...suppliers.map((supplier) => supplier.country)].filter(Boolean))),
    [suppliers]
  )

  const previewLandedCost =
    Number(supplierForm.productCost || 0) +
    Number(supplierForm.shippingCost || 0) +
    Number(supplierForm.customsDuty || 0) +
    Number(supplierForm.otherCost || 0)

  function openCreateDialog() {
    setEditingSupplier(null)
    setSupplierForm(emptySupplierForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(supplier: SupplierRecord) {
    setEditingSupplier(supplier)
    setSupplierForm(formFromSupplier(supplier))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: SupplierInput = {
      name: supplierForm.name,
      company: supplierForm.company,
      phone: supplierForm.phone,
      email: supplierForm.email,
      location: supplierForm.location,
      supplierType: supplierForm.supplierType,
      country: supplierForm.country,
      lcNumber: supplierForm.lcNumber,
      lcStatus: supplierForm.lcStatus,
      productCost: Number(supplierForm.productCost),
      shippingCost: Number(supplierForm.shippingCost),
      customsDuty: Number(supplierForm.customsDuty),
      otherCost: Number(supplierForm.otherCost),
      currency: supplierForm.currency,
      notes: supplierForm.notes,
    }

    try {
      await saveSupplier(input, editingSupplier?.id)
      setDialogOpen(false)
      setSupplierForm(emptySupplierForm)
      setEditingSupplier(null)
      setFeedback(editingSupplier ? 'Supplier details updated.' : 'New supplier added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save supplier.')
    }
  }

  async function handleDelete(supplier: SupplierRecord) {
    setFeedback(null)

    try {
      await deleteSupplier(supplier.id)
      setFeedback(`${supplier.name} removed from supplier list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete supplier.')
    }
  }

  async function handleLcStatusChange(supplier: SupplierRecord, lcStatus: SupplierRecord['lcStatus']) {
    if (supplier.lcStatus === lcStatus) {
      return
    }

    setFeedback(null)

    try {
      await saveSupplier(
        {
          name: supplier.name,
          company: supplier.company,
          phone: supplier.phone,
          email: supplier.email,
          location: supplier.location,
          supplierType: supplier.supplierType,
          country: supplier.country,
          lcNumber: supplier.lcNumber,
          lcStatus,
          productCost: supplier.productCost,
          shippingCost: supplier.shippingCost,
          customsDuty: supplier.customsDuty,
          otherCost: supplier.otherCost,
          currency: supplier.currency,
          notes: supplier.notes,
        },
        supplier.id
      )
      setFeedback(`${supplier.name} LC status changed to ${lcStatusLabels[lcStatus]}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update LC status.')
    }
  }

  return (
    <AdminShell active="Suppliers & Imports">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Suppliers', metrics.suppliers.toLocaleString('en-BD'), 'Local, foreign, and importers'],
            ['Import partners', metrics.importPartners.toLocaleString('en-BD'), 'Foreign suppliers and importers'],
            ['Landed cost', formatCurrency(metrics.landedCost, currency), 'Product + shipping + duty + other'],
            ['Import charges', formatCurrency(metrics.importCharges, currency), 'Shipping, customs, and handling'],
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
              <CardTitle>Supplier and import data table</CardTitle>
              <CardDescription>Search by supplier, importer, phone, country, LC number, or location.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_190px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search suppliers"
                />
              </div>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="local">Local supplier</SelectItem>
                  <SelectItem value="foreign">Foreign supplier</SelectItem>
                  <SelectItem value="importer">Importer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add supplier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Supplier</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>LC status</TableHead>
                    <TableHead>Import costs</TableHead>
                    <TableHead>Landed cost</TableHead>
                    <TableHead>Purchase history</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ supplier, purchaseCount, purchaseTotal, assignedProducts, lastPurchaseDate, landedCost, hasHistory }) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="min-w-60">
                        <div>
                          <p className="font-semibold">{supplier.name}</p>
                          <p className="text-sm text-muted-foreground">{supplier.company}</p>
                          <Badge variant="outline" className={cn('mt-2 rounded-full', typeToneClass(supplier.supplierType))}>
                            {supplierTypeLabels[supplier.supplierType]}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{supplier.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{supplier.location || supplier.country}</span>
                          </div>
                          {supplier.email ? <p className="text-xs text-muted-foreground">{supplier.email}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('h-8 rounded-full px-3 text-sm font-medium', lcToneClass(supplier.lcStatus))}
                            >
                              <Ship className="mr-1 h-3.5 w-3.5" />
                              {lcStatusLabels[supplier.lcStatus]}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            {(Object.keys(lcStatusLabels) as SupplierRecord['lcStatus'][]).map((status) => (
                              <DropdownMenuItem key={status} onClick={() => void handleLcStatusChange(supplier, status)}>
                                {supplier.lcStatus === status ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                                {lcStatusLabels[status]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="mt-2 text-xs text-muted-foreground">{supplier.lcNumber || 'No LC number'}</p>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>Product: {formatCurrency(supplier.productCost, supplier.currency)}</p>
                          <p>Shipping: {formatCurrency(supplier.shippingCost, supplier.currency)}</p>
                          <p>Customs: {formatCurrency(supplier.customsDuty, supplier.currency)}</p>
                          <p>Other: {formatCurrency(supplier.otherCost, supplier.currency)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <p className="font-semibold">{formatCurrency(landedCost, supplier.currency)}</p>
                        <p className="text-xs text-muted-foreground">Total until warehouse</p>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <p className="font-medium">{formatCurrency(purchaseTotal, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {purchaseCount} purchases, {assignedProducts} products
                        </p>
                        <p className="text-xs text-muted-foreground">Last {formatDate(lastPurchaseDate)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(supplier)} aria-label={`Edit ${supplier.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(supplier)}
                            disabled={hasHistory}
                            aria-label={`Delete ${supplier.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No suppliers found.
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
            <DialogTitle>{editingSupplier ? 'Edit supplier' : 'Add new supplier'}</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Update supplier/importer details, LC tracking, and cost estimates.'
                : 'Just the contact and trade type — LC tracking and cost estimates are optional and can be refined later.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Supplier name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Shenzhen Auto Parts Co." required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Phone number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 01711-000000" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Company <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.company} onChange={(event) => setSupplierForm((current) => ({ ...current, company: event.target.value }))} placeholder="Trade name, if different" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Email <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Location <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.location} onChange={(event) => setSupplierForm((current) => ({ ...current, location: event.target.value }))} placeholder="City / address" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Country</p>
                  <Input
                    list="supplier-country-options"
                    value={supplierForm.country}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, country: event.target.value }))}
                    placeholder="Bangladesh"
                  />
                  <datalist id="supplier-country-options">
                    {countryOptions.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trade type &amp; currency</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Supplier type</p>
                  <Select value={supplierForm.supplierType} onValueChange={(value) => setSupplierForm((current) => ({ ...current, supplierType: value as SupplierRecord['supplierType'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local supplier</SelectItem>
                      <SelectItem value="foreign">Foreign supplier</SelectItem>
                      <SelectItem value="importer">Importer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Billing currency</p>
                  <Select value={supplierForm.currency} onValueChange={(value) => setSupplierForm((current) => ({ ...current, currency: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {supplierForm.supplierType !== 'local' ? (
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Letter of Credit (LC) tracking
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">LC status</p>
                      <Select value={supplierForm.lcStatus} onValueChange={(value) => setSupplierForm((current) => ({ ...current, lcStatus: value as SupplierRecord['lcStatus'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-required">No LC</SelectItem>
                          <SelectItem value="pending">LC pending</SelectItem>
                          <SelectItem value="opened">LC opened</SelectItem>
                          <SelectItem value="released">Released</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        LC number <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <Input value={supplierForm.lcNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, lcNumber: event.target.value }))} placeholder="Bank LC reference" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <details className="group space-y-4 rounded-2xl border border-border/70 p-4">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                + Initial cost estimate <span className="font-normal normal-case">(optional — exact costs are recorded per purchase)</span>
              </summary>
              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Typical product cost</p>
                  <Input type="number" min="0" value={supplierForm.productCost} onChange={(event) => setSupplierForm((current) => ({ ...current, productCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Shipping cost</p>
                  <Input type="number" min="0" value={supplierForm.shippingCost} onChange={(event) => setSupplierForm((current) => ({ ...current, shippingCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Customs duty</p>
                  <Input type="number" min="0" value={supplierForm.customsDuty} onChange={(event) => setSupplierForm((current) => ({ ...current, customsDuty: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Other cost</p>
                  <Input type="number" min="0" value={supplierForm.otherCost} onChange={(event) => setSupplierForm((current) => ({ ...current, otherCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-border/70 bg-card p-4">
                  <p className="text-sm text-muted-foreground">Calculated landed cost</p>
                  <p className="mt-1 text-2xl font-semibold">{formatCurrency(previewLandedCost, supplierForm.currency || currency)}</p>
                </div>
              </div>
            </details>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} placeholder="LC, shipment, customs, or importer notes" rows={4} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">{editingSupplier ? 'Update supplier' : 'Save supplier'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
