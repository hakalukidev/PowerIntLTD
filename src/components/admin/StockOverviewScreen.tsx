"use client"

import { useDeferredValue, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  PencilLine,
  Search,
  Trash2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { QuickCreateProductDialog } from './quick-create/QuickCreateProductDialog'
import { QuickCreateSupplierDialog } from './quick-create/QuickCreateSupplierDialog'
import { QuickCreateWarehouseDialog } from './quick-create/QuickCreateWarehouseDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { formatCurrency, formatDateTime, getProductStatus, toArray } from '@/lib/erp/utils'

const SUPPLIER_NONE = '__none__'
const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']

type ProductFormState = {
  name: string
  sku: string
  category: string
  serialNumber: string
  warrantyMonths: string
  warehouseId: string
  supplierId: string
  purchasePrice: string
  sellingPrice: string
  stockQty: string
  minStock: string
  maxStock: string
  imageUrl: string
  imagePublicId: string
}

type PurchaseFormState = {
  productId: string
  supplierId: string
  quantity: string
  unitCost: string
  currency: string
}

type WarehouseFormState = {
  name: string
  location: string
}

type InventoryView = 'products' | 'warehouses' | 'low-stock' | 'purchases'

type ProductImageUploadResult = {
  imageUrl: string
  imagePublicId: string
}

function createEmptyProductForm(warehouseId = ''): ProductFormState {
  return {
    name: '',
    sku: '',
    category: '',
    serialNumber: '',
    warrantyMonths: '0',
    warehouseId,
    supplierId: SUPPLIER_NONE,
    purchasePrice: '',
    sellingPrice: '',
    stockQty: '0',
    minStock: '0',
    maxStock: '0',
    imageUrl: '',
    imagePublicId: '',
  }
}

function createEmptyPurchaseForm(currency = 'BDT'): PurchaseFormState {
  return {
    productId: '',
    supplierId: SUPPLIER_NONE,
    quantity: '1',
    unitCost: '',
    currency,
  }
}

function createEmptyWarehouseForm(): WarehouseFormState {
  return {
    name: '',
    location: '',
  }
}

function parseAmount(value: string) {
  const normalized = value.replaceAll(',', '').trim()
  return normalized ? Number(normalized) : 0
}

function productToForm(product: {
  name: string
  sku: string
  category: string
  serialNumber?: string
  warrantyMonths?: number
  warehouseId: string
  supplierId: string
  purchasePrice: number
  sellingPrice: number
  stockQty: number
  minStock: number
  maxStock: number
  imageUrl?: string
  imagePublicId?: string
}): ProductFormState {
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    serialNumber: product.serialNumber ?? '',
    warrantyMonths: String(product.warrantyMonths ?? 0),
    warehouseId: product.warehouseId,
    supplierId: product.supplierId || SUPPLIER_NONE,
    purchasePrice: String(product.purchasePrice),
    sellingPrice: String(product.sellingPrice),
    stockQty: String(product.stockQty),
    minStock: String(product.minStock),
    maxStock: String(product.maxStock),
    imageUrl: product.imageUrl || '',
    imagePublicId: product.imagePublicId || '',
  }
}

function warehouseToForm(warehouse: { name: string; location: string }): WarehouseFormState {
  return {
    name: warehouse.name,
    location: warehouse.location,
  }
}

function statusBadgeClass(status: ReturnType<typeof getProductStatus>) {
  if (status === 'active') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700'
  }

  if (status === 'low-stock') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700'
  }

  return 'border-rose-200 bg-rose-500/10 text-rose-700'
}

function statusLabel(status: ReturnType<typeof getProductStatus>) {
  return status.replace('-', ' ')
}
async function uploadProductImage(file: File): Promise<ProductImageUploadResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  const folder = process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER || 'inventory'

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary upload configuration is missing.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  formData.append('folder', folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Unable to upload product image.')
  }

  const result = (await response.json()) as { secure_url?: string; public_id?: string }
  if (!result.secure_url || !result.public_id) {
    throw new Error('Cloudinary did not return a valid image response.')
  }

  return {
    imageUrl: result.secure_url,
    imagePublicId: result.public_id,
  }
}

async function deleteCloudinaryImage(publicId: string) {
  const response = await fetch('/api/cloudinary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicId }),
  })

  if (!response.ok) {
    throw new Error('Unable to delete product image.')
  }
}

export function StockOverviewScreen() {
  const {
    data,
    hasPermission,
    saveProduct,
    deleteProduct,
    saveWarehouse,
    deleteWarehouse,
    recordPurchase,
    loading,
  } = useERP()

  const products = useMemo(
    () => [...toArray(data?.products)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [data?.products]
  )
  const purchases = useMemo(
    () => [...toArray(data?.purchases)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchases]
  )
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const warehouses = useMemo(() => toArray(data?.warehouses), [data?.warehouses])
  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(),
    [products]
  )

  const [search, setSearch] = useState('')
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('all')
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(() => createEmptyProductForm())
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => createEmptyPurchaseForm())
  const [warehouseForm, setWarehouseForm] = useState<WarehouseFormState>(() => createEmptyWarehouseForm())
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [receivePurchaseOpen, setReceivePurchaseOpen] = useState(false)
  const [warehouseOpen, setWarehouseOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false)
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false)
  const [quickCreateWarehouseOpen, setQuickCreateWarehouseOpen] = useState(false)
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false)
  const [quickCreatePurchaseSupplierOpen, setQuickCreatePurchaseSupplierOpen] = useState(false)
  const [quickCreatePurchaseProductOpen, setQuickCreatePurchaseProductOpen] = useState(false)
  const [pendingSearchText, setPendingSearchText] = useState('')

  const warehouseOptions: ComboboxOption[] = useMemo(
    () => warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name, sublabel: warehouse.location })),
    [warehouses]
  )

  const supplierOptions: ComboboxOption[] = useMemo(
    () => [
      { value: SUPPLIER_NONE, label: 'Not assigned' },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, sublabel: supplier.phone })),
    ],
    [suppliers]
  )

  const purchaseProductOptions: ComboboxOption[] = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.name, sublabel: `stock ${product.stockQty}` })),
    [products]
  )
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [busyWarehouseId, setBusyWarehouseId] = useState<string | null>(null)
  const [activeInventoryView, setActiveInventoryView] = useState<InventoryView>('products')
  const [productImageFile, setProductImageFile] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const [pendingImageDeleteId, setPendingImageDeleteId] = useState<string | null>(null)

  const deferredSearch = useDeferredValue(search)
  const canManageInventory = hasPermission('manage_products')
  const currency = data?.settings.currency ?? 'BDT'

  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedWarehouseFilter !== 'all') {
      result = result.filter((product) => product.warehouseId === selectedWarehouseFilter)
    }

    if (selectedSupplierFilter !== 'all') {
      result = result.filter((product) => {
        const prodSupplierId = product.supplierId || SUPPLIER_NONE
        return prodSupplierId === selectedSupplierFilter
      })
    }

    const query = deferredSearch.trim().toLowerCase()
    if (query) {
      result = result.filter((product) => {
        const warehouseName = data?.warehouses[product.warehouseId]?.name ?? ''
        const supplierName = data?.suppliers[product.supplierId]?.name ?? ''
        return [product.name, product.sku, product.category, warehouseName, supplierName].join(' ').toLowerCase().includes(query)
      })
    }

    return result
  }, [data?.suppliers, data?.warehouses, deferredSearch, products, selectedWarehouseFilter, selectedSupplierFilter])

  const lowStockProducts = useMemo(() => products.filter((product) => product.stockQty <= product.minStock), [products])
  const totalInventoryValue = useMemo(() => products.reduce((sum, product) => sum + product.purchasePrice * product.stockQty, 0), [products])
  const totalUnits = useMemo(() => products.reduce((sum, product) => sum + product.stockQty, 0), [products])
  const selectedPurchaseProduct = useMemo(() => products.find((product) => product.id === purchaseForm.productId) ?? null, [products, purchaseForm.productId])
  const purchaseTotal = parseAmount(purchaseForm.unitCost) * parseAmount(purchaseForm.quantity)

  const warehouseSummaries = useMemo(() => {
    return warehouses.map((warehouse) => {
      const warehouseProducts = products.filter((product) => product.warehouseId === warehouse.id)
      const warehouseUnits = warehouseProducts.reduce((sum, product) => sum + product.stockQty, 0)
      const warehouseLowStock = warehouseProducts.filter((product) => product.stockQty <= product.minStock).length

      return {
        ...warehouse,
        productCount: warehouseProducts.length,
        unitCount: warehouseUnits,
        lowStockCount: warehouseLowStock,
      }
    })
  }, [products, warehouses])

  function resetProductEditor() {
    setEditingProductId(null)
    setProductForm(createEmptyProductForm(warehouses[0]?.id ?? ''))
    setProductImageFile(null)
    setProductImagePreview(null)
    setPendingImageDeleteId(null)
  }

  function resetPurchaseEditor() {
    setPurchaseForm(createEmptyPurchaseForm(currency))
  }

  function resetWarehouseEditor() {
    setEditingWarehouseId(null)
    setWarehouseForm(createEmptyWarehouseForm())
  }

  function openCreateProductDialog() {
    resetProductEditor()
    setFeedback(null)
    setAddProductOpen(true)
  }

  function openEditProductDialog(productId: string) {
    const product = data?.products[productId]
    if (!product) {
      return
    }

    setEditingProductId(productId)
    setProductForm(productToForm(product))
    setProductImageFile(null)
    setProductImagePreview(product.imageUrl ?? null)
    setPendingImageDeleteId(null)
    setFeedback(null)
    setAddProductOpen(true)
  }

  function openReceivePurchaseDialog() {
    resetPurchaseEditor()
    setFeedback(null)
    setReceivePurchaseOpen(true)
  }

  function openCreateWarehouseDialog() {
    resetWarehouseEditor()
    setFeedback(null)
    setWarehouseOpen(true)
  }

  function openEditWarehouseDialog(warehouseId: string) {
    const warehouse = data?.warehouses[warehouseId]
    if (!warehouse) {
      return
    }

    setEditingWarehouseId(warehouseId)
    setWarehouseForm(warehouseToForm(warehouse))
    setFeedback(null)
    setWarehouseOpen(true)
  }

  function handleProductImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    setProductImageFile(file)
    setProductImagePreview(URL.createObjectURL(file))
    setProductForm((current) => ({
      ...current,
      imageUrl: '',
      imagePublicId: '',
    }))

    if (editingProductId && data?.products[editingProductId]?.imagePublicId) {
      setPendingImageDeleteId(data.products[editingProductId].imagePublicId ?? null)
    }
  }

  function handleRemoveProductImage() {
    setProductImageFile(null)
    setProductImagePreview(null)

    if (productForm.imagePublicId) {
      setPendingImageDeleteId(productForm.imagePublicId)
    }

    setProductForm((current) => ({
      ...current,
      imageUrl: '',
      imagePublicId: '',
    }))
  }
  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSavingProduct(true)

    try {
      let nextImageUrl = productForm.imageUrl
      let nextImagePublicId = productForm.imagePublicId

      if (productImageFile) {
        const uploadResult = await uploadProductImage(productImageFile)
        nextImageUrl = uploadResult.imageUrl
        nextImagePublicId = uploadResult.imagePublicId
      }

      await saveProduct(
        {
          name: productForm.name,
          sku: productForm.sku,
          category: productForm.category,
          serialNumber: productForm.serialNumber,
          warrantyMonths: parseAmount(productForm.warrantyMonths),
          warehouseId: productForm.warehouseId,
          supplierId: productForm.supplierId === SUPPLIER_NONE ? '' : productForm.supplierId,
          purchasePrice: parseAmount(productForm.purchasePrice),
          sellingPrice: parseAmount(productForm.sellingPrice),
          wholesalePrice: parseAmount(productForm.sellingPrice),
          stockQty: parseAmount(productForm.stockQty),
          minStock: parseAmount(productForm.minStock),
          maxStock: parseAmount(productForm.maxStock),
          imageUrl: nextImageUrl,
          imagePublicId: nextImagePublicId,
        },
        editingProductId ?? undefined
      )

      if (pendingImageDeleteId && pendingImageDeleteId !== nextImagePublicId) {
        await deleteCloudinaryImage(pendingImageDeleteId)
      }

      setFeedback(editingProductId ? 'Product updated successfully.' : 'Product added to inventory successfully.')
      setAddProductOpen(false)
      resetProductEditor()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save product.')
    } finally {
      setIsSavingProduct(false)
    }
  }

  async function handleDeleteProduct(productId: string) {
    const product = data?.products[productId]
    if (!product) {
      return
    }

    if (!window.confirm(`Delete ${product.name} from inventory?`)) {
      return
    }

    setFeedback(null)
    setBusyProductId(productId)

    try {
      if (product.imagePublicId) {
        await deleteCloudinaryImage(product.imagePublicId)
      }

      await deleteProduct(productId)
      setFeedback(`${product.name} was deleted from inventory.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete product.')
    } finally {
      setBusyProductId(null)
    }
  }

  async function handleReceivePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsReceivingPurchase(true)

    try {
      if (!purchaseForm.productId) {
        throw new Error('Select a product before receiving stock.')
      }

      if (purchaseForm.supplierId === SUPPLIER_NONE) {
        throw new Error('Select a supplier for this purchase.')
      }

      await recordPurchase({
        productId: purchaseForm.productId,
        supplierId: purchaseForm.supplierId,
        quantity: parseAmount(purchaseForm.quantity),
        unitCost: parseAmount(purchaseForm.unitCost),
        currency: purchaseForm.currency,
      })

      setFeedback('Purchase received and inventory updated successfully.')
      setReceivePurchaseOpen(false)
      resetPurchaseEditor()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to receive purchase.')
    } finally {
      setIsReceivingPurchase(false)
    }
  }

  async function handleSaveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSavingWarehouse(true)

    try {
      await saveWarehouse(
        {
          name: warehouseForm.name,
          location: warehouseForm.location,
        },
        editingWarehouseId ?? undefined
      )

      setFeedback(editingWarehouseId ? 'Warehouse updated successfully.' : 'Warehouse added successfully.')
      setWarehouseOpen(false)
      resetWarehouseEditor()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save warehouse.')
    } finally {
      setIsSavingWarehouse(false)
    }
  }

  async function handleDeleteWarehouse(warehouseId: string) {
    const warehouse = data?.warehouses[warehouseId]
    if (!warehouse) {
      return
    }

    if (!window.confirm(`Delete ${warehouse.name}?`)) {
      return
    }

    setFeedback(null)
    setBusyWarehouseId(warehouseId)

    try {
      await deleteWarehouse(warehouseId)
      setFeedback(`${warehouse.name} was deleted.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete warehouse.')
    } finally {
      setBusyWarehouseId(null)
    }
  }

  return (
    <AdminShell active="Inventory / Stock">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap gap-3 xl:justify-end">
                <Button className="rounded-xl" onClick={openCreateProductDialog} disabled={!canManageInventory || warehouses.length === 0}>
                  Add product
                </Button>
                <Button variant="secondary" className="rounded-xl" onClick={openReceivePurchaseDialog} disabled={!canManageInventory || products.length === 0}>
                  Receive purchase
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={openCreateWarehouseDialog} disabled={!canManageInventory}>
                  Add warehouse
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Products</p><p className="mt-1 text-2xl font-semibold tracking-tight">{products.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Units in stock</p><p className="mt-1 text-2xl font-semibold tracking-tight">{totalUnits}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Inventory value</p><p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(totalInventoryValue, currency)}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Low stock</p><p className="mt-1 text-2xl font-semibold tracking-tight">{lowStockProducts.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Warehouses</p><p className="mt-1 text-2xl font-semibold tracking-tight">{warehouses.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Suppliers</p><p className="mt-1 text-2xl font-semibold tracking-tight">{suppliers.length}</p></div>
            </div>
          </CardContent>
        </Card>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>
                  {activeInventoryView === 'products' ? 'Inventory list' : activeInventoryView === 'warehouses' ? 'Warehouse control' : activeInventoryView === 'low-stock' ? 'Low stock focus' : 'Recent purchases'}
                </CardTitle>
                <CardDescription>
                  {activeInventoryView === 'products'
                    ? 'Search by product, model, category, warehouse, or supplier. Edit and delete actions are available in each row.'
                    : activeInventoryView === 'warehouses'
                      ? 'Add, edit, and clean up warehouse locations from one place.'
                      : activeInventoryView === 'low-stock'
                        ? 'Products that need replenishment soon.'
                        : 'Latest stock receipts recorded in the system.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={activeInventoryView === 'products' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('products')}>Products</Button>
                <Button variant={activeInventoryView === 'warehouses' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('warehouses')}>Warehouse control</Button>
                <Button variant={activeInventoryView === 'low-stock' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('low-stock')}>Low stock focus</Button>
                <Button variant={activeInventoryView === 'purchases' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('purchases')}>Recent purchases</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {activeInventoryView === 'products' ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full lg:max-w-3xl">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search inventory..." />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select value={selectedWarehouseFilter} onValueChange={setSelectedWarehouseFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Warehouses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Warehouses</SelectItem>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-48">
                    <Select value={selectedSupplierFilter} onValueChange={setSelectedSupplierFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Suppliers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Suppliers</SelectItem>
                        <SelectItem value={SUPPLIER_NONE}>Not assigned</SelectItem>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : <div />}

              {activeInventoryView === 'warehouses' && canManageInventory ? <Button variant="outline" size="sm" className="rounded-lg" onClick={openCreateWarehouseDialog}>Add warehouse</Button> : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {activeInventoryView === 'products' ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Model / SKU</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Sell price</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    ) : activeInventoryView === 'warehouses' ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead>Units</TableHead>
                        <TableHead>Low stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    ) : activeInventoryView === 'low-stock' ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Minimum</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit cost</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Received</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {activeInventoryView === 'products' ? filteredProducts.map((product) => {
                      const warehouse = data?.warehouses[product.warehouseId]
                      const supplier = data?.suppliers[product.supplierId]
                      const status = getProductStatus(product.stockQty, product.minStock)

                      return (
                        <TableRow key={product.id}>
                          <TableCell><div className="flex items-center gap-3">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-xl border border-border/70 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">No image</div>}<div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.category || 'General equipment'}</p></div></div></TableCell>
                          <TableCell className="font-medium"><p>{product.sku}</p>{product.serialNumber ? <p className="text-xs font-normal text-muted-foreground">SN: {product.serialNumber}</p> : null}{product.warrantyMonths ? <p className="text-xs font-normal text-muted-foreground">{product.warrantyMonths}mo warranty</p> : null}</TableCell>
                          <TableCell><div><p className="font-medium">{warehouse?.name ?? 'Unknown warehouse'}</p><p className="text-xs text-muted-foreground">{warehouse?.location ?? 'Location unavailable'}</p></div></TableCell>
                          <TableCell><div className="flex flex-col gap-2"><span className="font-medium">{product.stockQty} units</span><Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></div></TableCell>
                          <TableCell>{formatCurrency(product.purchasePrice, currency)}</TableCell>
                          <TableCell>{formatCurrency(product.sellingPrice, currency)}</TableCell>
                          <TableCell>{supplier?.name ?? 'Not assigned'}</TableCell>
                          <TableCell>{formatDateTime(product.updatedAt)}</TableCell>
                          <TableCell>{canManageInventory ? <div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditProductDialog(product.id)}><PencilLine className="mr-2 h-4 w-4" />Edit</Button><Button variant="outline" size="sm" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void handleDeleteProduct(product.id)} disabled={busyProductId === product.id}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div> : <span className="text-sm text-muted-foreground">View only</span>}</TableCell>
                        </TableRow>
                      )
                    }) : activeInventoryView === 'warehouses' ? warehouseSummaries.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <TableCell className="font-semibold">{warehouse.name}</TableCell>
                        <TableCell>{warehouse.location}</TableCell>
                        <TableCell>{warehouse.productCount}</TableCell>
                        <TableCell>{warehouse.unitCount}</TableCell>
                        <TableCell>{warehouse.lowStockCount}</TableCell>
                        <TableCell>{canManageInventory ? <div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditWarehouseDialog(warehouse.id)}>Edit</Button><Button variant="outline" size="sm" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void handleDeleteWarehouse(warehouse.id)} disabled={busyWarehouseId === warehouse.id}>Delete</Button></div> : <span className="text-sm text-muted-foreground">View only</span>}</TableCell>
                      </TableRow>
                    )) : activeInventoryView === 'low-stock' ? lowStockProducts.map((product) => {
                      const warehouse = data?.warehouses[product.warehouseId]
                      const status = getProductStatus(product.stockQty, product.minStock)

                      return (
                        <TableRow key={product.id}>
                          <TableCell><div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.sku}</p></div></TableCell>
                          <TableCell>{warehouse?.name ?? 'Unknown warehouse'}</TableCell>
                          <TableCell>{product.stockQty}</TableCell>
                          <TableCell>{product.minStock}</TableCell>
                          <TableCell><Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></TableCell>
                          <TableCell>{formatDateTime(product.updatedAt)}</TableCell>
                        </TableRow>
                      )
                    }) : purchases.slice(0, 10).map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell className="font-semibold">{purchase.productName}</TableCell>
                        <TableCell>{purchase.supplierName}</TableCell>
                        <TableCell>{purchase.quantity}</TableCell>
                        <TableCell>{formatCurrency(purchase.unitCost, purchase.currency)}</TableCell>
                        <TableCell>{formatCurrency(purchase.total, purchase.currency)}</TableCell>
                        <TableCell>{formatDateTime(purchase.createdAt)}</TableCell>
                      </TableRow>
                    ))}

                    {activeInventoryView === 'products' && !filteredProducts.length ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">No products matched your search.</TableCell></TableRow> : null}
                    {activeInventoryView === 'warehouses' && !warehouseSummaries.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No warehouses yet. Add one before creating products.</TableCell></TableRow> : null}
                    {activeInventoryView === 'low-stock' && !lowStockProducts.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No low-stock products right now.</TableCell></TableRow> : null}
                    {activeInventoryView === 'purchases' && !purchases.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No purchase receipts yet.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProductId ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>Use the essential fields only. This form is optimized for workshop and lift inventory records.</DialogDescription>
            </DialogHeader>
            {canManageInventory ? (
              <form className="space-y-5" onSubmit={handleSaveProduct}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product name</p><Input placeholder="Two Post Service Lift" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Model / SKU</p><Input placeholder="TLT240SB" value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Category</p><Input list="product-category-options" placeholder="Lift Series" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} /><datalist id="product-category-options">{categoryOptions.map((category) => (<option key={category} value={category} />))}</datalist></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Serial number</p><Input placeholder="SN-000123" value={productForm.serialNumber} onChange={(event) => setProductForm((current) => ({ ...current, serialNumber: event.target.value }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warranty (months)</p><Input type="number" min="0" placeholder="6" value={productForm.warrantyMonths} onChange={(event) => setProductForm((current) => ({ ...current, warrantyMonths: event.target.value }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warehouse</p><Combobox options={warehouseOptions} value={productForm.warehouseId} onChange={(value) => setProductForm((current) => ({ ...current, warehouseId: value }))} placeholder="Select warehouse" searchPlaceholder="Search warehouses..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreateWarehouseOpen(true) }} createNewLabel="Create warehouse" /></div>
                  <div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={productForm.supplierId} onChange={(value) => setProductForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreateSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Purchase cost ({currency})</p><Input inputMode="numeric" placeholder="330000" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Selling price ({currency})</p><Input inputMode="numeric" placeholder="350000" value={productForm.sellingPrice} onChange={(event) => setProductForm((current) => ({ ...current, sellingPrice: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Opening stock</p><Input type="number" min="0" value={productForm.stockQty} onChange={(event) => setProductForm((current) => ({ ...current, stockQty: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Minimum stock</p><Input type="number" min="0" value={productForm.minStock} onChange={(event) => setProductForm((current) => ({ ...current, minStock: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Maximum stock <span className="font-normal text-muted-foreground">(optional)</span></p><Input type="number" min="0" placeholder="No cap" value={productForm.maxStock} onChange={(event) => setProductForm((current) => ({ ...current, maxStock: event.target.value }))} /></div>
                </div>
                <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Product image</p>
                      <p className="text-xs text-muted-foreground">Upload one thumbnail for the product list and editor.</p>
                    </div>
                    {(productImagePreview || productForm.imageUrl) ? <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleRemoveProductImage}>Delete image</Button> : null}
                  </div>
                  {(productImagePreview || productForm.imageUrl) ? <img src={productImagePreview ?? productForm.imageUrl} alt={productForm.name || 'Product preview'} className="h-32 w-32 rounded-2xl border border-border/70 object-cover" /> : <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-xs uppercase tracking-[0.2em] text-muted-foreground">No image</div>}
                  <Input type="file" accept="image/*" onChange={handleProductImageChange} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddProductOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSavingProduct}>{isSavingProduct ? 'Saving...' : editingProductId ? 'Update product' : 'Save product'}</Button>
                </DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role can view stock but cannot create or edit products.</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={receivePurchaseOpen} onOpenChange={setReceivePurchaseOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Receive purchase</DialogTitle>
              <DialogDescription>Select a product, confirm the supplier, and post the incoming quantity to stock.</DialogDescription>
            </DialogHeader>
            {canManageInventory ? (
              <form className="space-y-5" onSubmit={handleReceivePurchase}>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product</p><Combobox options={purchaseProductOptions} value={purchaseForm.productId} onChange={(value) => { const product = data?.products[value]; setPurchaseForm((current) => ({ ...current, productId: value, supplierId: product?.supplierId || SUPPLIER_NONE, unitCost: product ? String(product.purchasePrice) : current.unitCost })) }} placeholder="Select product" searchPlaceholder="Search products..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseProductOpen(true) }} createNewLabel="Create product" /></div>
                {selectedPurchaseProduct ? <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current stock</p><p className="mt-1 text-lg font-semibold">{selectedPurchaseProduct.stockQty} units</p></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Warehouse</p><p className="mt-1 text-lg font-semibold">{data?.warehouses[selectedPurchaseProduct.warehouseId]?.name ?? 'Unknown'}</p></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last cost</p><p className="mt-1 text-lg font-semibold">{formatCurrency(selectedPurchaseProduct.purchasePrice, currency)}</p></div></div></div> : null}
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={purchaseForm.supplierId} onChange={(value) => setPurchaseForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Quantity received</p><Input type="number" min="1" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm((current) => ({ ...current, quantity: event.target.value }))} required /></div><div className="space-y-2"><p className="text-sm font-medium text-foreground">Unit cost</p><Input inputMode="numeric" placeholder="330000" value={purchaseForm.unitCost} onChange={(event) => setPurchaseForm((current) => ({ ...current, unitCost: event.target.value }))} required /></div></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Currency</p><Select value={purchaseForm.currency} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, currency: value }))}><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger><SelectContent>{currencyOptions.map((currencyOption) => (<SelectItem key={currencyOption} value={currencyOption}>{currencyOption}</SelectItem>))}</SelectContent></Select></div><div className="space-y-2 rounded-2xl border border-border/70 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Purchase total</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(purchaseTotal, purchaseForm.currency)}</p><p className="mt-1 text-sm text-muted-foreground">Stock after receive: {(selectedPurchaseProduct?.stockQty ?? 0) + parseAmount(purchaseForm.quantity)} units</p></div></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setReceivePurchaseOpen(false)}>Cancel</Button><Button type="submit" variant="secondary" disabled={isReceivingPurchase}>{isReceivingPurchase ? 'Posting...' : 'Receive stock'}</Button></DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role cannot record inbound purchases.</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={warehouseOpen} onOpenChange={setWarehouseOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingWarehouseId ? 'Edit warehouse' : 'Add warehouse'}</DialogTitle>
              <DialogDescription>Keep storage names and locations clean so product assignment stays clear for the team.</DialogDescription>
            </DialogHeader>
            {canManageInventory ? (
              <form className="space-y-5" onSubmit={handleSaveWarehouse}>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warehouse name</p><Input placeholder="Dhaka Main Warehouse" value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Location</p><Input placeholder="Mirpur, Dhaka" value={warehouseForm.location} onChange={(event) => setWarehouseForm((current) => ({ ...current, location: event.target.value }))} required /></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setWarehouseOpen(false)}>Cancel</Button><Button type="submit" disabled={isSavingWarehouse}>{isSavingWarehouse ? 'Saving...' : editingWarehouseId ? 'Update warehouse' : 'Save warehouse'}</Button></DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role cannot manage warehouse records.</p>}
          </DialogContent>
        </Dialog>

        {loading ? <Card className="border-border/70 shadow-sm"><CardContent className="p-4 text-sm text-muted-foreground">Loading inventory...</CardContent></Card> : null}
      </div>

      <QuickCreateWarehouseDialog
        open={quickCreateWarehouseOpen}
        onOpenChange={setQuickCreateWarehouseOpen}
        initialName={pendingSearchText}
        onCreated={(warehouseId) => setProductForm((current) => ({ ...current, warehouseId }))}
      />
      <QuickCreateSupplierDialog
        open={quickCreateSupplierOpen}
        onOpenChange={setQuickCreateSupplierOpen}
        initialName={pendingSearchText}
        onCreated={(supplierId) => setProductForm((current) => ({ ...current, supplierId }))}
      />
      <QuickCreateSupplierDialog
        open={quickCreatePurchaseSupplierOpen}
        onOpenChange={setQuickCreatePurchaseSupplierOpen}
        initialName={pendingSearchText}
        onCreated={(supplierId) => setPurchaseForm((current) => ({ ...current, supplierId }))}
      />
      <QuickCreateProductDialog
        open={quickCreatePurchaseProductOpen}
        onOpenChange={setQuickCreatePurchaseProductOpen}
        initialName={pendingSearchText}
        onCreated={(productId) => {
          const product = data?.products[productId]
          setPurchaseForm((current) => ({
            ...current,
            productId,
            supplierId: product?.supplierId || SUPPLIER_NONE,
            unitCost: product ? String(product.purchasePrice) : current.unitCost,
          }))
        }}
      />
    </AdminShell>
  )
}
