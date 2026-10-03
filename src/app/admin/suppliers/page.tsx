"use client"

import { useMemo, useState } from 'react'
import { Check, Edit, Eye, Landmark, MapPin, Package, Phone, Plus, Search, Ship, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import {
  lcStatusLabels,
  lcToneClass,
  SupplierDetailsDialog,
  SupplierFormDialog,
  supplierTypeLabels,
  typeToneClass,
} from '@/components/admin/suppliers/SupplierDialogs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { SupplierRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, getProductStatus, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function getLandedCost(supplier: SupplierRecord) {
  return supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost
}

const productStatusLabels: Record<ReturnType<typeof getProductStatus>, string> = {
  active: 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
}

function productStatusClass(status: ReturnType<typeof getProductStatus>) {
  if (status === 'active') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }

  if (status === 'low-stock') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
}

const MAX_PRODUCT_MATCHES = 6

export default function SuppliersPage() {
  const { data, saveSupplier, deleteSupplier, changesNeedApproval, hasPermission } = useERP()
  const canEdit = hasPermission('suppliers.edit')
  const canDelete = hasPermission('suppliers.delete')
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const purchases = useMemo(() => toArray(data?.purchases), [data?.purchases])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const currency = data?.settings.currency
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SupplierRecord['supplierType'] | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null)
  const viewingSupplier = viewingSupplierId ? (data?.suppliers[viewingSupplierId] ?? null) : null

  const supplierRows = useMemo(() => {
    return suppliers
      .map((supplier) => {
        const supplierPurchases = purchases.filter((purchase) => purchase.supplierId === supplier.id)
        const purchaseTotal = supplierPurchases.reduce((sum, purchase) => sum + purchase.total, 0)
        const lastPurchase = [...supplierPurchases].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
        const supplierProducts = products.filter((product) => product.supplierId === supplier.id)
        const assignedProducts = supplierProducts.length
        // Everything this supplier has supplied, so searching a product finds its supplier.
        const productTerms = Array.from(
          new Set([
            ...supplier.suppliedProducts,
            ...supplierProducts.flatMap((product) => [product.name, product.sku, product.brand]),
            ...supplierPurchases.map((purchase) => purchase.productName),
          ].filter(Boolean))
        )
        const productNames = Array.from(
          new Set([...supplier.suppliedProducts, ...supplierProducts.map((product) => product.name), ...supplierPurchases.map((purchase) => purchase.productName)].filter(Boolean))
        )

        return {
          supplier,
          purchaseCount: supplierPurchases.length,
          purchaseTotal,
          assignedProducts,
          productTerms,
          productNames,
          lastPurchaseDate: lastPurchase?.createdAt ?? supplier.updatedAt,
          landedCost: getLandedCost(supplier),
          hasHistory: supplierPurchases.length > 0 || assignedProducts > 0,
        }
      })
      .sort((left, right) => right.landedCost - left.landedCost)
  }, [products, purchases, suppliers])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return supplierRows.filter(({ supplier, productTerms }) => {
      const matchesSearch =
        !normalizedQuery ||
        productTerms.some((term) => term.toLowerCase().includes(normalizedQuery)) ||
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

  // Searching a product name shows that product's full details above the supplier table.
  const productMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }

    const warehouses = data?.warehouses ?? {}
    const catalogMatches = products
      .filter((product) =>
        [product.name, product.sku, product.brand, product.category, product.serialNumber ?? '']
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((product) => {
        const productName = product.name.toLowerCase()
        const productPurchases = purchases
          .filter((purchase) => purchase.productId === product.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        const supplierNames = Array.from(
          new Set(
            [
              data?.suppliers[product.supplierId]?.name,
              ...productPurchases.map((purchase) => data?.suppliers[purchase.supplierId]?.name ?? purchase.supplierName),
              ...suppliers
                .filter((supplier) => supplier.suppliedProducts.some((name) => name.toLowerCase() === productName))
                .map((supplier) => supplier.name),
            ].filter((name): name is string => Boolean(name))
          )
        )

        return {
          key: product.id,
          name: product.name,
          product,
          status: getProductStatus(product.stockQty, product.minStock),
          warehouseName: warehouses[product.warehouseId]?.name ?? '',
          supplierNames,
          purchaseCount: productPurchases.length,
          purchasedQty: productPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0),
          lastPurchase: productPurchases[0],
        }
      })

    // Products typed on a supplier's form that are not in the product list yet.
    const catalogNames = new Set(products.map((product) => product.name.toLowerCase()))
    const namedOnlyMatches = Array.from(
      suppliers
        .flatMap((supplier) => supplier.suppliedProducts.map((name) => ({ name, supplierName: supplier.name })))
        .filter(({ name }) => name.toLowerCase().includes(normalizedQuery) && !catalogNames.has(name.toLowerCase()))
        .reduce((groups, { name, supplierName }) => {
          const key = name.toLowerCase()
          const group = groups.get(key) ?? { name, supplierNames: [] as string[] }
          if (!group.supplierNames.includes(supplierName)) group.supplierNames.push(supplierName)
          return groups.set(key, group)
        }, new Map<string, { name: string; supplierNames: string[] }>())
        .values()
    ).map((group) => ({
      key: `named:${group.name.toLowerCase()}`,
      name: group.name,
      product: null,
      status: null,
      warehouseName: '',
      supplierNames: group.supplierNames,
      purchaseCount: 0,
      purchasedQty: 0,
      lastPurchase: undefined,
    }))

    return [...catalogMatches, ...namedOnlyMatches]
  }, [data?.suppliers, data?.warehouses, products, purchases, query, suppliers])

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
          suppliedProducts: supplier.suppliedProducts,
          openingDue: supplier.openingDue,
        },
        supplier.id
      )
      setFeedback(
        changesNeedApproval
          ? `Changing ${supplier.name}'s LC status to ${lcStatusLabels[lcStatus]} was sent to an admin for approval.`
          : `${supplier.name} LC status changed to ${lcStatusLabels[lcStatus]}.`
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update LC status.')
    }
  }


  return (
    <AdminShell active="Suppliers & Imports">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            ['Suppliers', metrics.suppliers.toLocaleString('en-BD'), 'Local, foreign, and importers'],
            ['Import partners', metrics.importPartners.toLocaleString('en-BD'), 'Foreign suppliers and importers'],
            ['Landed cost', formatCurrency(metrics.landedCost, currency), 'Product + shipping + duty + other'],
            ['Import charges', formatCurrency(metrics.importCharges, currency), 'Shipping, customs, and handling'],
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

        {productMatches.length ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Matching products</CardTitle>
              <CardDescription>
                {productMatches.length > MAX_PRODUCT_MATCHES
                  ? `Showing ${MAX_PRODUCT_MATCHES} of ${productMatches.length} products matching "${query.trim()}". Type more of the name to narrow it down.`
                  : `Products matching "${query.trim()}", with stock, prices, and who supplies them.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {productMatches.slice(0, MAX_PRODUCT_MATCHES).map(({ key, name, product, status, warehouseName, supplierNames, purchaseCount, purchasedQty, lastPurchase }) => (
                <div key={key} className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex items-start gap-3">
                    {product?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border/70 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{name}</p>
                        {status ? (
                          <Badge variant="outline" className={cn('rounded-full', productStatusClass(status))}>
                            {productStatusLabels[status]}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full text-muted-foreground">Not in product list</Badge>
                        )}
                      </div>
                      {product ? (
                        <p className="text-sm text-muted-foreground">
                          {[product.brand, product.category, product.sku ? `SKU ${product.sku}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {product ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      {[
                        ['Stock', `${product.stockQty.toLocaleString('en-BD')} (min ${product.minStock}, max ${product.maxStock})`],
                        ['Warehouse', warehouseName || 'N/A'],
                        ['Warranty', product.warrantyMonths ? `${product.warrantyMonths} months` : 'None'],
                        ['Purchase price', formatCurrency(product.purchasePrice, currency)],
                        ['Selling price', formatCurrency(product.sellingPrice, currency)],
                        ['Wholesale price', formatCurrency(product.wholesalePrice, currency)],
                        ['Purchases', `${purchaseCount} (${purchasedQty.toLocaleString('en-BD')} units)`],
                        [
                          'Last purchase',
                          lastPurchase
                            ? `${formatDate(lastPurchase.createdAt)} · ${formatCurrency(lastPurchase.unitCost, lastPurchase.currency)}/unit`
                            : 'None yet',
                        ],
                        ...(product.serialNumber ? [['Serial no.', product.serialNumber]] : []),
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Supplied by</p>
                    <p className="font-medium">{supplierNames.length ? supplierNames.join(', ') : 'No supplier recorded'}</p>
                  </div>
                  {product?.description ? <p className="text-xs text-muted-foreground">{product.description}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Supplier and import data table</CardTitle>
              <CardDescription>Search by supplier, product, importer, phone, country, LC number, or location.</CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(220px,1fr)_190px_auto]">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search suppliers or products"
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
              {canEdit ? (
                <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Add supplier
                </Button>
              ) : null}
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
                  {filteredRows.map(({ supplier, productNames, purchaseCount, purchaseTotal, assignedProducts, lastPurchaseDate, landedCost, hasHistory }) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="min-w-40">
                        <div>
                          <p className="font-semibold">{supplier.name}</p>
                          <p className="text-sm text-muted-foreground">{supplier.company}</p>
                          <Badge variant="outline" className={cn('mt-2 rounded-full', typeToneClass(supplier.supplierType))}>
                            {supplierTypeLabels[supplier.supplierType]}
                          </Badge>
                          {(() => {
                            const normalizedQuery = query.trim().toLowerCase()
                            const matched = normalizedQuery
                              ? productNames.filter((name) => name.toLowerCase().includes(normalizedQuery))
                              : supplier.suppliedProducts
                            return matched.length ? (
                              <p className="mt-2 max-w-64 text-xs text-primary">Supplies: {matched.join(', ')}</p>
                            ) : null
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{supplier.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{supplier.location || supplier.country}</span>
                          </div>
                          {supplier.email ? <p className="break-all text-xs text-muted-foreground">{supplier.email}</p> : null}
                          {supplier.bankName || supplier.bankAccountNumber ? (
                            <div className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                {[supplier.bankName, supplier.bankBranch].filter(Boolean).join(', ')}
                                {supplier.bankAccountNumber ? ` · A/C ${supplier.bankAccountNumber}` : ''}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-36">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={!canEdit}>
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
                      <TableCell className="min-w-40">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>Product: {formatCurrency(supplier.productCost, supplier.currency)}</p>
                          <p>Shipping: {formatCurrency(supplier.shippingCost, supplier.currency)}</p>
                          <p>Customs: {formatCurrency(supplier.customsDuty, supplier.currency)}</p>
                          <p>Other: {formatCurrency(supplier.otherCost, supplier.currency)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <p className="font-semibold">{formatCurrency(landedCost, supplier.currency)}</p>
                        <p className="text-xs text-muted-foreground">Total until warehouse</p>
                      </TableCell>
                      <TableCell className="min-w-36">
                        <p className="font-medium">{formatCurrency(purchaseTotal, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {purchaseCount} purchases, {assignedProducts} products
                        </p>
                        <p className="text-xs text-muted-foreground">Last {formatDate(lastPurchaseDate)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setViewingSupplierId(supplier.id)}
                            aria-label={`View ${supplier.name}`}
                          >
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

      <SupplierFormDialog
        key={formKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
        onSaved={setFeedback}
      />
      <SupplierDetailsDialog
        supplier={viewingSupplier}
        onOpenChange={(open) => (open ? null : setViewingSupplierId(null))}
        onEdit={canEdit ? openEditDialog : () => undefined}
      />
    </AdminShell>
  )
}
