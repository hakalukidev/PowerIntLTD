"use client"

import { useMemo, useState } from 'react'
import { Edit, Eye, Landmark, MapPin, Phone, Plus, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import {
  SupplierDetailsDialog,
  SupplierFormDialog,
  supplierTypeLabels,
  typeToneClass,
} from '@/components/admin/suppliers/SupplierDialogs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { SupplierRecord } from '@/lib/erp/types'
import { computeSupplierPayables, formatCurrency, formatDate, partyCode, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const DOCUMENT_FIELDS = [
  'supplierPhotoUrl',
  'bankDocumentUrl',
  'nidCopyUrl',
  'tradeLicenseCopyUrl',
  'passportPhotoUrl',
  'signatureUrl',
] as const satisfies ReadonlyArray<keyof SupplierRecord>

function supplierInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function attachedDocuments(supplier: SupplierRecord) {
  return DOCUMENT_FIELDS.filter((field) => supplier[field]).length
}

function hasBankDetails(supplier: SupplierRecord) {
  return Boolean(supplier.bankName && supplier.bankAccountNumber)
}

export default function SupplierCrmPage() {
  const { data, deleteSupplier, hasPermission, changesNeedApproval } = useERP()
  const canEdit = hasPermission('suppliers.edit')
  const canDelete = hasPermission('suppliers.delete')
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const purchases = useMemo(() => toArray(data?.purchases), [data?.purchases])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const currency = data?.settings.currency
  const payables = useMemo(() => computeSupplierPayables(data), [data])

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SupplierRecord['supplierType'] | 'all'>('all')
  const [profileFilter, setProfileFilter] = useState<'all' | 'complete' | 'incomplete'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null)
  const viewingSupplier = viewingSupplierId ? (data?.suppliers[viewingSupplierId] ?? null) : null
  const [feedback, setFeedback] = useState<string | null>(null)

  const rows = useMemo(() => {
    return suppliers
      .map((supplier) => {
        const supplierPurchases = purchases.filter((purchase) => purchase.supplierId === supplier.id)
        const hasHistory =
          supplierPurchases.length > 0 || products.some((product) => product.supplierId === supplier.id)
        // A complete profile has bank details and every document, like a dealer's file.
        const complete = hasBankDetails(supplier) && attachedDocuments(supplier) === DOCUMENT_FIELDS.length

        return {
          supplier,
          purchaseCount: supplierPurchases.length,
          purchaseTotal: supplierPurchases.reduce((sum, purchase) => sum + purchase.total, 0),
          payable: payables[supplier.id]?.payable ?? supplier.openingDue,
          pendingPayment: payables[supplier.id]?.pendingPayment ?? 0,
          hasHistory,
          complete,
        }
      })
      .sort((left, right) => right.supplier.createdAt.localeCompare(left.supplier.createdAt))
  }, [payables, products, purchases, suppliers])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return rows.filter(({ supplier, complete }) => {
      const matchesSearch =
        !normalizedQuery ||
        [partyCode(supplier), supplier.name, supplier.company, supplier.phone, supplier.email, supplier.location, supplier.country, supplier.nid, supplier.tradeLicenseNo]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesType = typeFilter === 'all' || supplier.supplierType === typeFilter
      const matchesProfile = profileFilter === 'all' || (profileFilter === 'complete') === complete
      const joined = supplier.createdAt.slice(0, 10)
      const matchesDate = (!dateFrom || joined >= dateFrom) && (!dateTo || joined <= dateTo)

      return matchesSearch && matchesType && matchesProfile && matchesDate
    })
  }, [dateFrom, dateTo, profileFilter, query, rows, typeFilter])

  const metrics = useMemo(
    () => ({
      total: suppliers.length,
      purchaseTotal: rows.reduce((sum, row) => sum + row.purchaseTotal, 0),
      payable: rows.reduce((sum, row) => sum + Math.max(row.payable, 0), 0),
      complete: rows.filter((row) => row.complete).length,
    }),
    [rows, suppliers.length]
  )

  function openCreateDialog() {
    setEditingSupplier(null)
    setFormKey((key) => key + 1)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(supplier: SupplierRecord) {
    setEditingSupplier(supplier)
    setFormKey((key) => key + 1)
    setFeedback(null)
    setViewingSupplierId(null)
    setDialogOpen(true)
  }

  async function handleDelete(supplier: SupplierRecord) {
    setFeedback(null)

    try {
      await deleteSupplier(supplier.id)
      setFeedback(
        changesNeedApproval ? `Deleting ${supplier.name} was sent to an admin for approval.` : `${supplier.name} removed from supplier list.`
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete supplier.')
    }
  }

  return (
    <AdminShell active="Suppliers (CRM)">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            ['Suppliers', metrics.total.toLocaleString('en-BD'), 'Supplier profiles'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From purchase history'],
            ['Total payable', formatCurrency(metrics.payable, currency), 'Opening due + purchases - approved payments'],
            ['Complete profiles', `${metrics.complete} / ${metrics.total}`, 'Bank details and all documents'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
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
              <CardTitle>Supplier data table</CardTitle>
              <CardDescription>Search by name, phone, company, NID, trade license, or location.</CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(220px,1fr)_auto]">
              <div className={cn('relative col-span-2 xl:col-span-1', !canEdit && 'xl:col-span-2')}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search by name or phone" />
              </div>
              {canEdit ? (
                <Button onClick={openCreateDialog} className="col-span-2 h-10 rounded-xl xl:col-span-1">
                  <Plus className="mr-2 h-4 w-4" />
                  Add supplier
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-border/70 p-3 sm:p-4 lg:grid-cols-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Supplier type</p>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {(Object.keys(supplierTypeLabels) as SupplierRecord['supplierType'][]).map((type) => (
                      <SelectItem key={type} value={type}>{supplierTypeLabels[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Profile</p>
                <Select value={profileFilter} onValueChange={(value) => setProfileFilter(value as typeof profileFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All profiles</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="incomplete">Missing bank or documents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Supplier</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Payable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ supplier, purchaseCount, purchaseTotal, payable, pendingPayment, hasHistory, complete }) => {
                    const photo = supplier.supplierPhotoUrl || supplier.passportPhotoUrl
                    const documentCount = attachedDocuments(supplier)

                    return (
                      <TableRow key={supplier.id}>
                        <TableCell className="min-w-56">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 shrink-0">
                              {photo ? <AvatarImage src={photo} alt={supplier.name} className="object-cover" /> : null}
                              <AvatarFallback className="bg-muted text-muted-foreground">{supplierInitials(supplier.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{supplier.name}</p>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-mono text-xs">{partyCode(supplier)}</span>
                                {supplier.company ? ` · ${supplier.company}` : ''}
                              </p>
                              <Badge variant="outline" className={cn('mt-1 rounded-full text-xs', typeToneClass(supplier.supplierType))}>
                                {supplierTypeLabels[supplier.supplierType]}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-48">
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{supplier.phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{[supplier.location, supplier.country].filter(Boolean).join(', ')}</span>
                            </div>
                            {supplier.email ? <p className="break-all text-xs text-muted-foreground">{supplier.email}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-48">
                          {hasBankDetails(supplier) ? (
                            <div className="flex items-start gap-2 text-sm">
                              <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{supplier.bankName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {supplier.bankBranch ? `${supplier.bankBranch} · ` : ''}A/C {supplier.bankAccountNumber}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not added</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-32">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full',
                              complete
                                ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                            )}
                          >
                            {documentCount} / {DOCUMENT_FIELDS.length} attached
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-28 text-sm">{formatDate(supplier.createdAt)}</TableCell>
                        <TableCell className="min-w-32">
                          <p className="font-medium">{formatCurrency(purchaseTotal, currency)}</p>
                          <p className="text-xs text-muted-foreground">{purchaseCount} purchases</p>
                        </TableCell>
                        <TableCell className="min-w-32">
                          <p className={cn('font-medium', payable > 0 && 'text-rose-600 dark:text-rose-400')}>
                            {formatCurrency(Math.abs(payable), currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payable < 0 ? 'Paid in advance' : payable === 0 ? 'Settled' : 'Due'}
                            {pendingPayment > 0 ? ` · ${formatCurrency(pendingPayment, currency)} pending` : ''}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setViewingSupplierId(supplier.id)} aria-label={`View ${supplier.name}`}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit ? (
                              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(supplier)} aria-label={`Edit ${supplier.name}`}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {canDelete ? (
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
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
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

      <SupplierFormDialog key={formKey} open={dialogOpen} onOpenChange={setDialogOpen} supplier={editingSupplier} onSaved={setFeedback} />
      <SupplierDetailsDialog
        supplier={viewingSupplier}
        onOpenChange={(open) => (open ? null : setViewingSupplierId(null))}
        onEdit={canEdit ? openEditDialog : () => undefined}
      />
    </AdminShell>
  )
}
