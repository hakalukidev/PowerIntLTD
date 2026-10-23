"use client"

import { useDeferredValue, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeftRight,
  History,
  PencilLine,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { InventoryManagersCard } from './InventoryManagersCard'
import { ProductDetailsDialog } from './inventory/ProductDetailsDialog'
import { ProductImage, statusBadgeClass, statusLabel, unitsLabel } from './inventory/productDisplay'
import { StockHistory } from './inventory/StockHistory'
import { StockAdjustmentDialog, StockTransferDialog } from './inventory/StockMovementDialogs'
import { allocatedTotal, allocationLines, newAllocationRow, WarehouseAllocationRows, type AllocationRow } from './inventory/WarehouseAllocationRows'
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
import { DateInput } from '@/components/ui/date-input'
import { todayInput } from '@/components/admin/approvals/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { formatCurrency, formatDateTime, formatTableAmount, getProductStatus, toArray, userRoleIds } from '@/lib/erp/utils'
import { formatWarehouseSplit, onHandTotal, stockInWarehouse, warehouseSplit } from '@/lib/erp/stock'
import { uploadImageToCloudinary, deleteCloudinaryImage } from '@/lib/cloudinary'

const SUPPLIER_NONE = '__none__'
const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']
const PRODUCT_IMAGE_FOLDER = process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER || 'inventory'

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
  /** Opening stock by warehouse; only on Add product. */
  openingRows: AllocationRow[]
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
  /** `YYYY-MM-DD` the goods were received; the purchase is posted on this date. */
  date: string
  /** Where the quantity goes; must add up to it. */
  allocations: AllocationRow[]
}

type WarehouseFormState = {
  name: string
  location: string
}

type InventoryView = 'products' | 'warehouses' | 'low-stock' | 'purchases' | 'history'

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
    openingRows: [newAllocationRow(warehouseId)],
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
    date: todayInput(),
    allocations: [newAllocationRow()],
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
    openingRows: [],
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
    currentUser,
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
  const [transferOpen, setTransferOpen] = useState(false)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  // The product a row's Transfer / Adjust button was pressed on.
  const [movementProductId, setMovementProductId] = useState('')
  // The product whose row was clicked, shown in the details dialog.
  const [detailsProductId, setDetailsProductId] = useState<string | null>(null)
  const [historyWarehouseId, setHistoryWarehouseId] = useState<string | null>(null)

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
  const canCreateInventory = hasPermission('inventory.create')
  const canManageInventory = hasPermission('inventory.edit')
  const canDeleteInventory = hasPermission('inventory.delete')
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const currency = data?.settings.currency ?? 'BDT'

  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedWarehouseFilter !== 'all') {
      result = result.filter((product) => stockInWarehouse(product, selectedWarehouseFilter) !== 0 || product.warehouseId === selectedWarehouseFilter)
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
        const warehouseName = [data?.warehouses[product.warehouseId]?.name ?? '', ...warehouseSplit(product, data?.warehouses).map((entry) => entry.name)].join(' ')
        const supplierName = data?.suppliers[product.supplierId]?.name ?? ''
        return [product.name, product.sku, product.category, warehouseName, supplierName].join(' ').toLowerCase().includes(query)
      })
    }

    return result
  }, [data?.suppliers, data?.warehouses, deferredSearch, products, selectedWarehouseFilter, selectedSupplierFilter])

  const lowStockProducts = useMemo(() => products.filter((product) => product.stockQty <= product.minStock), [products])
  // Units on the shelves (held for orders included) at purchase cost, as in the warehouse report and
  // the product details; the selling-price total on the same units is shown alongside for comparison.
  const totalInventoryValue = useMemo(() => products.reduce((sum, product) => sum + product.purchasePrice * onHandTotal(product), 0), [products])
  const totalSellingValue = useMemo(() => products.reduce((sum, product) => sum + product.sellingPrice * onHandTotal(product), 0), [products])
  // Units on the shelves, as valued above; the available / held split is shown under it.
  const totalUnits = useMemo(() => products.reduce((sum, product) => sum + onHandTotal(product), 0), [products])
  const availableUnits = useMemo(() => products.reduce((sum, product) => sum + product.stockQty, 0), [products])
  const heldUnits = useMemo(() => products.reduce((sum, product) => sum + (product.reservedQty ?? 0), 0), [products])
  const editingProduct = editingProductId ? data?.products[editingProductId] ?? null : null
  const selectedPurchaseProduct = useMemo(() => products.find((product) => product.id === purchaseForm.productId) ?? null, [products, purchaseForm.productId])
  const purchaseTotal = parseAmount(purchaseForm.unitCost) * parseAmount(purchaseForm.quantity)

  const warehouseSummaries = useMemo(() => {
    return warehouses.map((warehouse) => {
      // Units on the shelves here, including those held for approved orders not yet delivered.
      const warehouseProducts = products.filter((product) => stockInWarehouse(product, warehouse.id) !== 0)
      const warehouseUnits = warehouseProducts.reduce((sum, product) => sum + stockInWarehouse(product, warehouse.id), 0)
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

  function openMovement(kind: 'transfer' | 'adjustment', productId = '') {
    setMovementProductId(productId)
    setFeedback(null)
    if (kind === 'transfer') setTransferOpen(true)
    else setAdjustmentOpen(true)
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
        const uploadResult = await uploadImageToCloudinary(productImageFile, PRODUCT_IMAGE_FOLDER)
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
          openingStock: editingProductId ? undefined : allocationLines(productForm.openingRows),
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

      const hasOpening = !editingProductId && allocatedTotal(productForm.openingRows) > 0
      setFeedback(
        editingProductId
          ? 'Product updated successfully.'
          : hasOpening
            ? 'Product added. Its opening stock is sent for approval and shows once the Authorizer and the Chairman approve it.'
            : 'Product added to inventory successfully.'
      )
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
        date: new Date(purchaseForm.date || todayInput()).toISOString(),
        allocations: allocationLines(purchaseForm.allocations),
      })

      setFeedback('Purchase sent for approval. Stock and the supplier balance update after the final approval.')
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
                <Button className="rounded-xl" onClick={openCreateProductDialog} disabled={!canCreateInventory || warehouses.length === 0}>
                  Add product
                </Button>
                <Button variant="secondary" className="rounded-xl" onClick={openReceivePurchaseDialog} disabled={!canCreateInventory || products.length === 0}>
                  Receive purchase
                </Button>
                <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => openMovement('transfer')} disabled={!canManageInventory || products.length === 0 || warehouses.length < 2}>
                  <ArrowLeftRight className="h-4 w-4" />
                  Transfer stock
                </Button>
                <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => openMovement('adjustment')} disabled={!canManageInventory || products.length === 0}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Stock adjustment
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={openCreateWarehouseDialog} disabled={!canCreateInventory}>
                  Add warehouse
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Products</p><p className="mt-1 break-words text-lg font-semibold tracking-tight sm:text-2xl">{products.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4" data-stat="units">
                <p className="text-sm text-muted-foreground">Units in stock</p>
                <p className="mt-1 break-words text-lg font-semibold tracking-tight sm:text-2xl" data-value="on-shelves">{totalUnits}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground" data-value="split">{availableUnits} available · {heldUnits} held</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4" data-stat="inventory-value">
                <p className="text-sm text-muted-foreground">Inventory value (purchase cost)</p>
                <p className="mt-1 break-words text-base font-semibold tracking-tight sm:text-2xl" data-value="purchase-cost">{formatCurrency(totalInventoryValue, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Units on shelves (incl. held for orders) × purchase cost</p>
                <p className="break-words text-xs text-muted-foreground" data-value="selling-price">At selling price: {formatCurrency(totalSellingValue, currency)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Low stock</p><p className="mt-1 break-words text-lg font-semibold tracking-tight sm:text-2xl">{lowStockProducts.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Warehouses</p><p className="mt-1 break-words text-lg font-semibold tracking-tight sm:text-2xl">{warehouses.length}</p></div>
              <div className="rounded-2xl border border-border/70 bg-card px-4 py-4"><p className="text-sm text-muted-foreground">Suppliers</p><p className="mt-1 break-words text-lg font-semibold tracking-tight sm:text-2xl">{suppliers.length}</p></div>
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
                  {activeInventoryView === 'products' ? 'Inventory list' : activeInventoryView === 'warehouses' ? 'Warehouse control' : activeInventoryView === 'low-stock' ? 'Low stock focus' : activeInventoryView === 'history' ? 'Stock history' : 'Recent purchases'}
                </CardTitle>
                <CardDescription>
                  {activeInventoryView === 'products'
                    ? 'Search by product, model, category, warehouse, or supplier. Click a product for full details; edit and delete actions are in each row.'
                    : activeInventoryView === 'warehouses'
                      ? 'Add, edit, and clean up warehouse locations from one place.'
                      : activeInventoryView === 'low-stock'
                        ? 'Products that need replenishment soon. Click a product for full details.'
                        : activeInventoryView === 'history'
                          ? 'Every stock change in each warehouse, newest first: purchases, transfers, sales, adjustments and damage.'
                          : 'Latest stock receipts recorded in the system.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={activeInventoryView === 'products' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('products')}>Products</Button>
                <Button variant={activeInventoryView === 'warehouses' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('warehouses')}>Warehouse control</Button>
                <Button variant={activeInventoryView === 'low-stock' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('low-stock')}>Low stock focus</Button>
                <Button variant={activeInventoryView === 'purchases' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('purchases')}>Recent purchases</Button>
                <Button variant={activeInventoryView === 'history' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('history')}>Stock history</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeInventoryView === 'history' ? <StockHistory /> : <>
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

              {activeInventoryView === 'warehouses' && canCreateInventory ? <Button variant="outline" size="sm" className="rounded-lg" onClick={openCreateWarehouseDialog}>Add warehouse</Button> : null}
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
                      const split = warehouseSplit(product, data?.warehouses)

                      return (
                        <TableRow
                          key={product.id}
                          tabIndex={0}
                          aria-label={`View details ${product.name}`}
                          data-product-row={product.id}
                          onClick={() => setDetailsProductId(product.id)}
                          onKeyDown={(event) => {
                            // Only the focused row itself; keys inside its controls keep their own meaning.
                            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              setDetailsProductId(product.id)
                            }
                          }}
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <TableCell><div className="flex items-center gap-3"><ProductImage src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-xl text-[10px]" /><div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.category || 'General equipment'}</p></div></div></TableCell>
                          <TableCell className="font-medium"><p>{product.sku}</p>{product.serialNumber ? <p className="text-xs font-normal text-muted-foreground">SN: {product.serialNumber}</p> : null}{product.warrantyMonths ? <p className="text-xs font-normal text-muted-foreground">{product.warrantyMonths}mo warranty</p> : null}</TableCell>
                          <TableCell>
                            <div data-warehouse-split>
                              {split.length ? (
                                split.map((entry) => (
                                  <p key={entry.id} className="whitespace-nowrap">
                                    <span className="font-medium">{entry.name}</span> <span className="tabular-nums text-muted-foreground">{entry.quantity}</span>
                                  </p>
                                ))
                              ) : (
                                <p className="font-medium">{warehouse?.name ?? 'Unknown warehouse'}</p>
                              )}
                              <p className="text-xs text-muted-foreground">Main: {warehouse?.name ?? 'none'}</p>
                            </div>
                          </TableCell>
                          <TableCell><div className="flex flex-col gap-2"><span className="font-medium">{unitsLabel(product.stockQty)}</span>{product.reservedQty ? <span className="text-xs text-muted-foreground">+{product.reservedQty} held for orders</span> : null}<Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></div></TableCell>
                          <TableCell>{formatTableAmount(product.purchasePrice, currency)}</TableCell>
                          <TableCell>{formatTableAmount(product.sellingPrice, currency)}</TableCell>
                          <TableCell>{supplier?.name ?? 'Not assigned'}</TableCell>
                          <TableCell>{formatDateTime(product.updatedAt)}</TableCell>
                          <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{canManageInventory ? <div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openMovement('transfer', product.id)} disabled={warehouses.length < 2}><ArrowLeftRight className="mr-2 h-4 w-4" />Transfer</Button><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openMovement('adjustment', product.id)}><SlidersHorizontal className="mr-2 h-4 w-4" />Adjust</Button><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditProductDialog(product.id)}><PencilLine className="mr-2 h-4 w-4" />Edit</Button>{canDeleteInventory ? <Button variant="outline" size="sm" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void handleDeleteProduct(product.id)} disabled={busyProductId === product.id}><Trash2 className="mr-2 h-4 w-4" />Delete</Button> : null}</div> : <span className="text-sm text-muted-foreground">View only</span>}</TableCell>
                        </TableRow>
                      )
                    }) : activeInventoryView === 'warehouses' ? warehouseSummaries.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <TableCell className="font-semibold">{warehouse.name}</TableCell>
                        <TableCell>{warehouse.location}</TableCell>
                        <TableCell>{warehouse.productCount}</TableCell>
                        <TableCell>{warehouse.unitCount}</TableCell>
                        <TableCell>{warehouse.lowStockCount}</TableCell>
                        <TableCell><div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => setHistoryWarehouseId(warehouse.id)}><History className="mr-2 h-4 w-4" />History</Button>{canManageInventory ? <><Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditWarehouseDialog(warehouse.id)}>Edit</Button>{canDeleteInventory ? <Button variant="outline" size="sm" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void handleDeleteWarehouse(warehouse.id)} disabled={busyWarehouseId === warehouse.id}>Delete</Button> : null}</> : null}</div></TableCell>
                      </TableRow>
                    )) : activeInventoryView === 'low-stock' ? lowStockProducts.map((product) => {
                      const warehouse = data?.warehouses[product.warehouseId]
                      const status = getProductStatus(product.stockQty, product.minStock)

                      return (
                        <TableRow
                          key={product.id}
                          tabIndex={0}
                          aria-label={`View details ${product.name}`}
                          data-low-stock-row={product.id}
                          onClick={() => setDetailsProductId(product.id)}
                          onKeyDown={(event) => {
                            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              setDetailsProductId(product.id)
                            }
                          }}
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <TableCell><div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.sku}</p></div></TableCell>
                          <TableCell>{formatWarehouseSplit(product, data?.warehouses) || warehouse?.name || 'Unknown warehouse'}</TableCell>
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
                        <TableCell><p className="tabular-nums">{purchase.quantity}</p>{purchase.allocations && purchase.allocations.length > 1 ? <p className="text-xs text-muted-foreground">{purchase.allocations.map((line) => `${line.warehouseName} ${line.quantity}`).join(' · ')}</p> : purchase.allocations?.[0] ? <p className="text-xs text-muted-foreground">{purchase.allocations[0].warehouseName}</p> : null}</TableCell>
                        <TableCell>{formatTableAmount(purchase.unitCost, purchase.currency)}</TableCell>
                        <TableCell>{formatTableAmount(purchase.total, purchase.currency)}</TableCell>
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
            </>}
          </CardContent>
        </Card>

        <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProductId ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>Use the essential fields only. This form is optimized for workshop and lift inventory records.</DialogDescription>
            </DialogHeader>
            {(editingProductId ? canManageInventory : canCreateInventory) ? (
              <form className="space-y-5" onSubmit={handleSaveProduct}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product name</p><Input placeholder="Two Post Service Lift" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Model / SKU</p><Input placeholder="TLT240SB" value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Category</p><Input list="product-category-options" placeholder="Lift Series" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} /><datalist id="product-category-options">{categoryOptions.map((category) => (<option key={category} value={category} />))}</datalist></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Serial number</p><Input placeholder="SN-000123" value={productForm.serialNumber} onChange={(event) => setProductForm((current) => ({ ...current, serialNumber: event.target.value }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warranty (months)</p><Input type="number" min="0" placeholder="6" value={productForm.warrantyMonths} onChange={(event) => setProductForm((current) => ({ ...current, warrantyMonths: event.target.value }))} /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Main warehouse</p><Combobox options={warehouseOptions} value={productForm.warehouseId} onChange={(value) => setProductForm((current) => ({ ...current, warehouseId: value, openingRows: !editingProductId && current.openingRows.length === 1 && !current.openingRows[0].quantity ? [{ ...current.openingRows[0], warehouseId: value }] : current.openingRows }))} placeholder="Select warehouse" searchPlaceholder="Search warehouses..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreateWarehouseOpen(true) }} createNewLabel="Create warehouse" /></div>
                  <div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={productForm.supplierId} onChange={(value) => setProductForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreateSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Purchase cost ({currency})</p><Input type="number" min="0" step="any" placeholder="330000" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Selling price ({currency})</p><Input inputMode="numeric" placeholder="350000" value={productForm.sellingPrice} onChange={(event) => setProductForm((current) => ({ ...current, sellingPrice: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Minimum stock</p><Input type="number" min="0" value={productForm.minStock} onChange={(event) => setProductForm((current) => ({ ...current, minStock: event.target.value }))} required /></div>
                  <div className="space-y-2"><p className="text-sm font-medium text-foreground">Maximum stock <span className="font-normal text-muted-foreground">(optional)</span></p><Input type="number" min="0" placeholder="No cap" value={productForm.maxStock} onChange={(event) => setProductForm((current) => ({ ...current, maxStock: event.target.value }))} /></div>
                </div>
                {editingProduct ? (
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/30 p-4" data-stock-readonly>
                    <p className="text-sm font-medium text-foreground">Stock</p>
                    <p className="text-sm">
                      <span className="font-semibold tabular-nums">{editingProduct.stockQty}</span> available
                      {editingProduct.reservedQty ? <span className="text-muted-foreground"> · {editingProduct.reservedQty} held for orders</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatWarehouseSplit(editingProduct, data?.warehouses) || 'No stock in any warehouse.'}</p>
                    <p className="text-xs text-muted-foreground">Stock changes through Receive purchase, Transfer stock and Stock adjustment, each approved by the Authorizer and the Chairman.</p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                    <WarehouseAllocationRows
                      label="Opening stock"
                      warehouses={warehouses}
                      rows={productForm.openingRows}
                      onChange={(openingRows) => setProductForm((current) => ({ ...current, openingRows }))}
                    />
                    <p className="text-xs text-muted-foreground">Leave at 0 for none. The product is saved now with no stock; the opening stock is added once the Authorizer and the Chairman approve it.</p>
                  </div>
                )}
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
              <DialogDescription>Select a product, confirm the supplier and enter the quantity. Stock goes up once the Authorizer and the Chairman approve it.</DialogDescription>
            </DialogHeader>
            {canCreateInventory ? (
              <form className="space-y-5" onSubmit={handleReceivePurchase}>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product</p><Combobox options={purchaseProductOptions} value={purchaseForm.productId} onChange={(value) => { const product = data?.products[value]; setPurchaseForm((current) => ({ ...current, productId: value, supplierId: product?.supplierId || SUPPLIER_NONE, unitCost: product ? String(product.purchasePrice) : current.unitCost, allocations: current.allocations.length === 1 ? [{ ...current.allocations[0], warehouseId: product?.warehouseId ?? '', quantity: current.quantity }] : current.allocations })) }} placeholder="Select product" searchPlaceholder="Search products..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseProductOpen(true) }} createNewLabel="Create product" /></div>
                {selectedPurchaseProduct ? <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current stock</p><p className="mt-1 text-lg font-semibold">{selectedPurchaseProduct.stockQty} units</p></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Warehouses</p><p className="mt-1 text-sm font-semibold">{formatWarehouseSplit(selectedPurchaseProduct, data?.warehouses) || 'No stock yet'}</p></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last cost</p><p className="mt-1 text-lg font-semibold">{formatCurrency(selectedPurchaseProduct.purchasePrice, currency)}</p></div></div></div> : null}
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={purchaseForm.supplierId} onChange={(value) => setPurchaseForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Received date</p><DateInput value={purchaseForm.date} onChange={(value) => setPurchaseForm((current) => ({ ...current, date: value }))} required /></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Quantity received</p><Input type="number" min="1" value={purchaseForm.quantity} onChange={(event) => { const quantity = event.target.value; setPurchaseForm((current) => ({ ...current, quantity, allocations: current.allocations.length === 1 ? [{ ...current.allocations[0], quantity }] : current.allocations })) }} required /></div><div className="space-y-2"><p className="text-sm font-medium text-foreground">Unit cost</p><Input type="number" min="0" step="any" placeholder="330000" value={purchaseForm.unitCost} onChange={(event) => setPurchaseForm((current) => ({ ...current, unitCost: event.target.value }))} required /></div></div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <WarehouseAllocationRows
                    label="Received into"
                    warehouses={warehouses}
                    rows={purchaseForm.allocations}
                    total={parseAmount(purchaseForm.quantity)}
                    onChange={(allocations) => setPurchaseForm((current) => ({ ...current, allocations }))}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Currency</p><Select value={purchaseForm.currency} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, currency: value }))}><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger><SelectContent>{currencyOptions.map((currencyOption) => (<SelectItem key={currencyOption} value={currencyOption}>{currencyOption}</SelectItem>))}</SelectContent></Select></div><div className="space-y-2 rounded-2xl border border-border/70 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Purchase total</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(purchaseTotal, purchaseForm.currency)}</p><p className="mt-1 text-sm text-muted-foreground">Stock after approval: {(selectedPurchaseProduct?.stockQty ?? 0) + parseAmount(purchaseForm.quantity)} units</p></div></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setReceivePurchaseOpen(false)}>Cancel</Button><Button type="submit" variant="secondary" disabled={isReceivingPurchase}>{isReceivingPurchase ? 'Sending...' : 'Send for approval'}</Button></DialogFooter>
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
            {(editingWarehouseId ? canManageInventory : canCreateInventory) ? (
              <form className="space-y-5" onSubmit={handleSaveWarehouse}>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warehouse name</p><Input placeholder="Dhaka Main Warehouse" value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Location</p><Input placeholder="Mirpur, Dhaka" value={warehouseForm.location} onChange={(event) => setWarehouseForm((current) => ({ ...current, location: event.target.value }))} required /></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setWarehouseOpen(false)}>Cancel</Button><Button type="submit" disabled={isSavingWarehouse}>{isSavingWarehouse ? 'Saving...' : editingWarehouseId ? 'Update warehouse' : 'Save warehouse'}</Button></DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role cannot manage warehouse records.</p>}
          </DialogContent>
        </Dialog>

        {isAdmin ? <InventoryManagersCard /> : null}
        {loading ? <Card className="border-border/70 shadow-sm"><CardContent className="p-4 text-sm text-muted-foreground">Loading inventory...</CardContent></Card> : null}
      </div>

      <ProductDetailsDialog
        productId={detailsProductId}
        open={detailsProductId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsProductId(null)
        }}
        onEdit={canManageInventory ? (productId) => {
          setDetailsProductId(null)
          openEditProductDialog(productId)
        } : undefined}
      />
      <Dialog open={historyWarehouseId !== null} onOpenChange={(open) => { if (!open) setHistoryWarehouseId(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" data-warehouse-history>
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{historyWarehouseId ? `${data?.warehouses[historyWarehouseId]?.name ?? 'Warehouse'} stock history` : 'Stock history'}</DialogTitle>
            <DialogDescription>Every stock change in this warehouse, newest first.</DialogDescription>
          </DialogHeader>
          {historyWarehouseId ? <StockHistory warehouseId={historyWarehouseId} /> : null}
        </DialogContent>
      </Dialog>
      <StockTransferDialog open={transferOpen} onOpenChange={setTransferOpen} productId={movementProductId} onDone={setFeedback} />
      <StockAdjustmentDialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen} productId={movementProductId} onDone={setFeedback} />
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
