'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onValue, ref, set, update } from 'firebase/database'

import { createDefaultERPData } from '@/lib/erp/defaultData'
import type {
  CourierInput,
  CourierRecord,
  CustomerInput,
  CustomerRecord,
  ERPData,
  ExpenseInput,
  InvestorInput,
  OrderInput,
  OrderRecord,
  ProductInput,
  ProductRecord,
  PurchaseInput,
  SellerInput,
  SellerTransactionInput,
  SupplierInput,
  SupplierRecord,
  TaskInput,
  TaskRecord,
  UserInput,
  UserRecord,
  WarehouseInput,
} from '@/lib/erp/types'
import {
  createId,
  getPermissions,
  getProductStatus,
  hasPermission as hasPermissionCheck,
  toArray,
} from '@/lib/erp/utils'
import { database } from '@/lib/firebase/config'

const DEFAULT_ERP_DATA = createDefaultERPData()

type ERPContextValue = {
  data: ERPData | null
  loading: boolean
  error: string | null
  users: UserRecord[]
  currentUser: UserRecord | null
  currentPermissions: string[]
  login: (identifier: string, password: string) => Promise<UserRecord>
  logout: () => void
  switchUser: (userId: string) => void
  createUser: (input: UserInput) => Promise<void>
  updateUser: (userId: string, input: UserInput) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  hasPermission: (permission: string) => boolean
  saveCustomer: (input: CustomerInput, customerId?: string) => Promise<string>
  deleteCustomer: (customerId: string) => Promise<void>
  saveSupplier: (input: SupplierInput, supplierId?: string) => Promise<string>
  deleteSupplier: (supplierId: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<string>
  deleteProduct: (productId: string) => Promise<void>
  saveWarehouse: (input: WarehouseInput, warehouseId?: string) => Promise<string>
  deleteWarehouse: (warehouseId: string) => Promise<void>
  recordPurchase: (input: PurchaseInput) => Promise<void>
  createOrder: (input: OrderInput) => Promise<void>
  updateOrderStatus: (orderId: string, status: OrderRecord['status']) => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTaskStatus: (taskId: string, status: TaskRecord['status']) => Promise<void>
  markNotificationRead: (notificationId: string) => Promise<void>
  markAllNotificationsRead: (notificationIds: string[]) => Promise<void>
  saveExpense: (input: ExpenseInput, expenseId?: string) => Promise<void>
  saveInvestor: (input: InvestorInput, investorId?: string) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  saveSeller: (input: SellerInput, sellerId?: string) => Promise<void>
  deleteSeller: (sellerId: string) => Promise<void>
  recordSellerTransaction: (input: SellerTransactionInput) => Promise<void>
  deleteSellerTransaction: (transactionId: string) => Promise<void>
  saveCourier: (input: CourierInput, courierId?: string) => Promise<void>
  updateCourierStatus: (courierId: string, status: CourierRecord['status']) => Promise<void>
  deleteCourier: (courierId: string) => Promise<void>
}

const ERPContext = createContext<ERPContextValue | undefined>(undefined)
const CURRENT_USER_STORAGE_KEY = 'ims-current-user'

function normalizeLookup(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizePhoneLookup(value: unknown) {
  const digits = typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : ''

  if (!digits) {
    return ''
  }

  return digits.replace(/^(?:880|88|0)+/, '')
}

function mergeRecordMap<T extends { id: string }>(defaults: Record<string, T>, current?: Record<string, T> | null) {
  const merged: Record<string, T> = { ...defaults }

  for (const [id, record] of Object.entries(current ?? {})) {
    const defaultRecord = merged[id]
    merged[id] = defaultRecord ? { ...defaultRecord, ...record } : record
  }

  return merged
}

function normalizeCustomerRecord(customer: CustomerRecord): CustomerRecord {
  const now = new Date().toISOString()

  return {
    ...customer,
    company: customer.company || 'Retail',
    phone: customer.phone || '',
    location: customer.location || '',
    due: Number(customer.due ?? 0),
    supportStatus: customer.supportStatus ?? 'none',
    supportNote: customer.supportNote || '',
    createdAt: customer.createdAt || now,
    updatedAt: customer.updatedAt || customer.createdAt || now,
  }
}

function normalizeCustomerMap(customers?: Record<string, CustomerRecord> | null) {
  return Object.fromEntries(
    Object.entries(customers ?? {}).map(([id, customer]) => [id, normalizeCustomerRecord(customer)])
  )
}

function normalizeSupplierRecord(supplier: SupplierRecord): SupplierRecord {
  const now = new Date().toISOString()

  return {
    ...supplier,
    company: supplier.company || supplier.name || 'Supplier',
    phone: supplier.phone || '',
    email: supplier.email || '',
    location: supplier.location || '',
    supplierType: supplier.supplierType ?? 'local',
    country: supplier.country || 'Bangladesh',
    lcNumber: supplier.lcNumber || '',
    lcStatus: supplier.lcStatus ?? 'not-required',
    productCost: Number(supplier.productCost ?? 0),
    shippingCost: Number(supplier.shippingCost ?? 0),
    customsDuty: Number(supplier.customsDuty ?? 0),
    otherCost: Number(supplier.otherCost ?? 0),
    currency: supplier.currency || 'BDT',
    notes: supplier.notes || '',
    createdAt: supplier.createdAt || now,
    updatedAt: supplier.updatedAt || supplier.createdAt || now,
  }
}

function normalizeSupplierMap(suppliers?: Record<string, SupplierRecord> | null) {
  return Object.fromEntries(
    Object.entries(suppliers ?? {}).map(([id, supplier]) => [id, normalizeSupplierRecord(supplier)])
  )
}

function normalizeProductRecord(product: ProductRecord): ProductRecord {
  return {
    ...product,
    serialNumber: product.serialNumber || '',
    warrantyMonths: Number(product.warrantyMonths ?? 0),
  }
}

function normalizeProductMap(products?: Record<string, ProductRecord> | null) {
  return Object.fromEntries(
    Object.entries(products ?? {}).map(([id, product]) => [id, normalizeProductRecord(product)])
  )
}

function normalizeOrderRecord(order: OrderRecord): OrderRecord {
  const now = new Date().toISOString()

  return {
    ...order,
    billNumber: order.billNumber || `INV-${order.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
    paymentDueDate: order.paymentDueDate || order.deliveryDate || now,
    dueReference: order.dueReference ?? '',
    overdueNotified: order.overdueNotified ?? false,
  }
}

function normalizeOrderMap(orders?: Record<string, OrderRecord> | null) {
  return Object.fromEntries(
    Object.entries(orders ?? {}).map(([id, order]) => [id, normalizeOrderRecord(order)])
  )
}

function normalizeERPData(data: ERPData | null): ERPData {
  const source = data ?? ({} as Partial<ERPData>)

  return {
    permissions: DEFAULT_ERP_DATA.permissions,
    roles: mergeRecordMap(DEFAULT_ERP_DATA.roles, source.roles),
    users: source.users ?? {},
    warehouses: source.warehouses ?? {},
    suppliers: normalizeSupplierMap(source.suppliers),
    customers: normalizeCustomerMap(source.customers),
    products: normalizeProductMap(source.products),
    orders: normalizeOrderMap(source.orders),
    purchases: source.purchases ?? {},
    tasks: source.tasks ?? {},
    notifications: source.notifications ?? {},
    activities: source.activities ?? {},
    expenses: source.expenses ?? {},
    sellers: source.sellers ?? {},
    sellerTransactions: source.sellerTransactions ?? {},
    couriers: source.couriers ?? {},
    investors: source.investors ?? {},
    settings: {
      ...DEFAULT_ERP_DATA.settings,
      ...source.settings,
    },
    meta: {
      ...DEFAULT_ERP_DATA.meta,
      ...source.meta,
    },
  }
}

function getStoredCurrentUserId() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(CURRENT_USER_STORAGE_KEY)
}

function persistCurrentUserId(userId: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (userId) {
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, userId)
    return
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
}

function getDatabaseOrThrow() {
  if (!database) {
    throw new Error('Firebase Realtime Database is only available in the browser.')
  }

  return database
}

function normalizeProductInput(input: ProductInput) {
  return {
    name: input.name.trim(),
    category: input.category?.trim() ?? '',
    brand: input.brand?.trim() ?? '',
    sku: input.sku.trim().toUpperCase(),
    serialNumber: input.serialNumber?.trim() ?? '',
    warrantyMonths: Math.max(input.warrantyMonths ?? 0, 0),
    warehouseId: input.warehouseId,
    supplierId: input.supplierId?.trim() ?? '',
    purchasePrice: input.purchasePrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? input.sellingPrice,
    stockQty: input.stockQty,
    minStock: input.minStock,
    maxStock: Math.max(input.maxStock ?? 0, 0),
    description: input.description?.trim() ?? '',
    imageUrl: input.imageUrl?.trim() ?? '',
    imagePublicId: input.imagePublicId?.trim() ?? '',
  }
}

function normalizeWarehouseInput(input: WarehouseInput) {
  return {
    name: input.name.trim(),
    location: input.location.trim(),
  }
}

function normalizeCustomerInput(input: CustomerInput) {
  return {
    name: input.name.trim(),
    company: input.company?.trim() || 'Retail',
    phone: input.phone.trim(),
    location: input.location?.trim() ?? '',
    due: Math.max(input.due ?? 0, 0),
    supportStatus: input.supportStatus ?? 'none',
    supportNote: input.supportNote?.trim() ?? '',
    isPremium: input.isPremium ?? false,
    leadSource: input.leadSource ?? 'local-marketing',
    reminderCustomer: input.reminderCustomer ?? false,
  }
}

function normalizeSupplierInput(input: SupplierInput) {
  return {
    name: input.name.trim(),
    company: input.company?.trim() || input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
    location: input.location?.trim() ?? '',
    supplierType: input.supplierType ?? 'local',
    country: input.country?.trim() || 'Bangladesh',
    lcNumber: input.lcNumber?.trim() ?? '',
    lcStatus: input.lcStatus ?? 'not-required',
    productCost: Math.max(input.productCost ?? 0, 0),
    shippingCost: Math.max(input.shippingCost ?? 0, 0),
    customsDuty: Math.max(input.customsDuty ?? 0, 0),
    otherCost: Math.max(input.otherCost ?? 0, 0),
    currency: input.currency?.trim().toUpperCase() || 'BDT',
    notes: input.notes?.trim() ?? '',
  }
}

export function ERPProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ERPData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getStoredCurrentUserId())

  useEffect(() => {
    let unsubscribe = () => undefined

    try {
      const db = getDatabaseOrThrow()
      const erpRef = ref(db, 'erp')

      unsubscribe = onValue(
        erpRef,
        (snapshot) => {
          setData(normalizeERPData(snapshot.val() as ERPData | null))
          setLoading(false)
        },
        (reason) => {
          setError(reason.message)
          setLoading(false)
        }
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Firebase Realtime Database is unavailable.')
      setLoading(false)
    }

    return () => unsubscribe()
  }, [])

  const users = useMemo(() => {
    return [...toArray(data?.users)].sort((left, right) => left.name.localeCompare(right.name))
  }, [data?.users])

  const currentUser = useMemo(
    () => users.find((user) => user.id === currentUserId) ?? null,
    [currentUserId, users]
  )

  const currentPermissions = useMemo(() => getPermissions(data, currentUser), [currentUser, data])

  useEffect(() => {
    if (!data) {
      return
    }

    const now = Date.now()
    const overdueOrders = Object.values(data.orders).filter(
      (order) => order.due > 0 && !order.overdueNotified && new Date(order.paymentDueDate).getTime() < now
    )

    if (overdueOrders.length === 0) {
      return
    }

    let cancelled = false

    async function flagOverdueOrders() {
      const db = getDatabaseOrThrow()

      for (const order of overdueOrders) {
        if (cancelled) {
          return
        }

        await update(ref(db, `erp/orders/${order.id}`), { overdueNotified: true })
        await writeNotification(
          'Payment overdue',
          `${order.customerName}'s payment of ${order.due} for ${order.billNumber} is past the due date.`,
          'critical',
          ['admin', 'accountant']
        )
      }
    }

    void flagOverdueOrders()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.orders])

  async function login(identifier: string, password: string) {
    if (!data) {
      throw new Error('Authentication data is still loading.')
    }

    const normalizedIdentifier = normalizeLookup(identifier)
    const normalizedPhoneIdentifier = normalizePhoneLookup(identifier)
    const authenticatedUser = users.find((entry) => {
      const loginIdMatches = normalizeLookup(entry.loginId) === normalizedIdentifier
      const phoneMatches = normalizePhoneLookup(entry.phone) === normalizedPhoneIdentifier

      return (loginIdMatches || phoneMatches) && entry.password === password
    })

    if (!authenticatedUser) {
      throw new Error('Invalid login ID, phone number, or password.')
    }

    if (authenticatedUser.status !== 'active') {
      throw new Error('This account is inactive.')
    }

    setCurrentUserId(authenticatedUser.id)
    persistCurrentUserId(authenticatedUser.id)

    return authenticatedUser
  }

  function logout() {
    setCurrentUserId(null)
    persistCurrentUserId(null)
  }

  async function writeActivity(action: string, module: string, message: string) {
    if (!currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const activityId = createId('activity')
    await update(ref(db, 'erp/activities'), {
      [activityId]: {
        id: activityId,
        action,
        module,
        message,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
      },
    })
  }

  async function writeNotification(
    title: string,
    body: string,
    level: 'info' | 'warning' | 'critical',
    roles?: string[]
  ) {
    const db = getDatabaseOrThrow()
    const notificationId = createId('notification')
    await update(ref(db, 'erp/notifications'), {
      [notificationId]: {
        id: notificationId,
        title,
        body,
        level,
        read: false,
        createdAt: new Date().toISOString(),
        roles: roles || null,
      },
    })
  }

  async function saveProduct(input: ProductInput, productId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeProductInput(input)

    if (!normalized.name) {
      throw new Error('Product name is required.')
    }

    if (!normalized.sku) {
      throw new Error('SKU or model code is required.')
    }

    if (!data.warehouses[normalized.warehouseId]) {
      throw new Error('Select a valid warehouse.')
    }

    if (normalized.supplierId && !data.suppliers[normalized.supplierId]) {
      throw new Error('Selected supplier was not found.')
    }

    const db = getDatabaseOrThrow()
    const existingProduct = productId ? data.products[productId] : null
    const id = existingProduct?.id ?? createId('product')
    const now = new Date().toISOString()
    const product = {
      id,
      ...normalized,
      status: getProductStatus(normalized.stockQty, normalized.minStock),
      createdAt: existingProduct?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/products'), { [id]: product })
    await writeActivity(
      existingProduct ? 'product_updated' : 'product_created',
      'inventory',
      existingProduct
        ? `Updated ${product.name} inventory details.`
        : `Added ${product.name} with ${product.stockQty} units in stock.`
    )

    if (!existingProduct) {
      await writeNotification(
        'Product added',
        `${product.name} has been added to inventory by ${currentUser?.name ?? 'Admin'}.`,
        'info',
        ['admin', 'store_manager', 'sales_person']
      )
    } else {
      if (existingProduct.stockQty !== product.stockQty) {
        await writeNotification(
          'Stock adjusted',
          `${product.name} stock level was adjusted from ${existingProduct.stockQty} to ${product.stockQty} by ${currentUser?.name ?? 'Admin'}.`,
          'warning',
          ['admin', 'store_manager']
        )
      } else {
        await writeNotification(
          'Product details updated',
          `${product.name} details were updated by ${currentUser?.name ?? 'Admin'}.`,
          'info',
          ['admin', 'store_manager']
        )
      }
    }

    if (product.stockQty <= product.minStock) {
      await writeNotification(
        'Low stock alert',
        `${product.name} is already at or below its minimum stock (${product.stockQty}/${product.minStock}).`,
        'warning',
        ['admin', 'store_manager']
      )
    }

    return id
  }

  async function deleteProduct(productId: string) {
    if (!data) {
      return
    }

    const product = data.products[productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`products/${productId}`]: null,
    })
    await writeActivity('product_deleted', 'inventory', `Deleted ${product.name} from inventory.`)
    await writeNotification(
      'Product deleted',
      `${product.name} was deleted from inventory by ${currentUser?.name ?? 'Admin'}.`,
      'warning',
      ['admin', 'store_manager']
    )
  }

  async function saveWarehouse(input: WarehouseInput, warehouseId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeWarehouseInput(input)

    if (!normalized.name) {
      throw new Error('Warehouse name is required.')
    }

    if (!normalized.location) {
      throw new Error('Warehouse location is required.')
    }

    const db = getDatabaseOrThrow()
    const existingWarehouse = warehouseId ? data.warehouses[warehouseId] : null
    const id = existingWarehouse?.id ?? createId('warehouse')
    const warehouse = {
      id,
      ...normalized,
    }

    await update(ref(db, 'erp/warehouses'), { [id]: warehouse })
    await writeActivity(
      existingWarehouse ? 'warehouse_updated' : 'warehouse_created',
      'warehouse',
      existingWarehouse
        ? `Updated ${warehouse.name} warehouse details.`
        : `Added ${warehouse.name} warehouse.`
    )

    return id
  }

  async function saveCustomer(input: CustomerInput, customerId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingCustomer = customerId ? data.customers[customerId] : null
    const normalized = normalizeCustomerInput({
      ...input,
      isPremium: input.isPremium ?? existingCustomer?.isPremium ?? false,
      leadSource: input.leadSource ?? existingCustomer?.leadSource ?? 'local-marketing',
      reminderCustomer: input.reminderCustomer ?? existingCustomer?.reminderCustomer ?? false,
    })

    if (!normalized.name) {
      throw new Error('Customer name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Customer phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingCustomer?.id ?? createId('customer')
    const now = new Date().toISOString()
    const customer = {
      id,
      ...normalized,
      createdAt: existingCustomer?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/customers'), { [id]: customer })
    await writeActivity(
      existingCustomer ? 'customer_updated' : 'customer_created',
      'customers',
      existingCustomer ? `Updated ${customer.name} CRM details.` : `Added customer ${customer.name}.`
    )

    return id
  }

  async function deleteCustomer(customerId: string) {
    if (!data) {
      return
    }

    const customer = data.customers[customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    const hasOrders = Object.values(data.orders).some((order) => order.customerId === customerId)
    if (hasOrders) {
      throw new Error('Customers with purchase history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`customers/${customerId}`]: null,
    })
    await writeActivity('customer_deleted', 'customers', `Deleted customer ${customer.name}.`)
  }

  async function saveSupplier(input: SupplierInput, supplierId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeSupplierInput(input)

    if (!normalized.name) {
      throw new Error('Supplier name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Supplier phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existingSupplier = supplierId ? data.suppliers[supplierId] : null
    const id = existingSupplier?.id ?? createId('supplier')
    const now = new Date().toISOString()
    const supplier = {
      id,
      ...normalized,
      createdAt: existingSupplier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/suppliers'), { [id]: supplier })
    await writeActivity(
      existingSupplier ? 'supplier_updated' : 'supplier_created',
      'suppliers',
      existingSupplier
        ? `Updated ${supplier.name} supplier and import details.`
        : `Added supplier ${supplier.name}.`
    )

    return id
  }

  async function deleteSupplier(supplierId: string) {
    if (!data) {
      return
    }

    const supplier = data.suppliers[supplierId]
    if (!supplier) {
      throw new Error('Supplier not found.')
    }

    const hasProducts = Object.values(data.products).some((product) => product.supplierId === supplierId)
    const hasPurchases = Object.values(data.purchases).some((purchase) => purchase.supplierId === supplierId)
    if (hasProducts || hasPurchases) {
      throw new Error('Suppliers with product or purchase history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`suppliers/${supplierId}`]: null,
    })
    await writeActivity('supplier_deleted', 'suppliers', `Deleted supplier ${supplier.name}.`)
  }

  async function deleteWarehouse(warehouseId: string) {
    if (!data) {
      return
    }

    const warehouse = data.warehouses[warehouseId]
    if (!warehouse) {
      throw new Error('Warehouse not found.')
    }

    const assignedProducts = Object.values(data.products).filter((product) => product.warehouseId === warehouseId)
    if (assignedProducts.length > 0) {
      throw new Error('Move or delete the products in this warehouse before removing it.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`warehouses/${warehouseId}`]: null,
    })
    await writeActivity('warehouse_deleted', 'warehouse', `Deleted ${warehouse.name} warehouse.`)
  }

  async function recordPurchase(input: PurchaseInput) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const product = data.products[input.productId]
    const supplier = data.suppliers[input.supplierId]
    if (!product || !supplier) {
      throw new Error('Product or supplier not found.')
    }

    const purchaseId = createId('purchase')
    const nextStock = product.stockQty + input.quantity
    const now = new Date().toISOString()

    await update(ref(db, 'erp'), {
      [`purchases/${purchaseId}`]: {
        id: purchaseId,
        productId: product.id,
        productName: product.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quantity: input.quantity,
        unitCost: input.unitCost,
        currency: input.currency,
        total: input.quantity * input.unitCost,
        status: 'received',
        createdAt: now,
      },
      [`products/${product.id}/stockQty`]: nextStock,
      [`products/${product.id}/purchasePrice`]: input.unitCost,
      [`products/${product.id}/status`]: getProductStatus(nextStock, product.minStock),
      [`products/${product.id}/updatedAt`]: now,
    })

    await writeActivity('purchase_received', 'inventory', `Restocked ${product.name} by ${input.quantity} units.`)
    await writeNotification(
      'Purchase recorded',
      `Restocked ${product.name} by ${input.quantity} units from ${supplier.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', 'store_manager', 'accountant']
    )
  }

  async function createOrder(input: OrderInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product.')
    }

    const requestedByProduct = new Map<string, number>()
    const orderItems = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (item.quantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitPrice < 0) throw new Error(`Price for ${product.name} cannot be negative.`)
      requestedByProduct.set(product.id, (requestedByProduct.get(product.id) ?? 0) + item.quantity)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product.purchasePrice,
      }
    })

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      if (product.stockQty < quantity) throw new Error(`Insufficient stock for ${product.name}.`)
    })

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal)
    const total = subtotal - discount
    if (input.paid < 0) {
      throw new Error('Paid amount cannot be negative.')
    }

    const orderId = createId('order')
    const paid = Math.min(Math.max(input.paid, 0), total)
    const due = total - paid
    const now = new Date().toISOString()
    const orderDate = input.orderDate?.trim() || now
    const defaultDueDate = new Date(orderDate)
    defaultDueDate.setDate(defaultDueDate.getDate() + 15)

    const updates: Record<string, unknown> = {
      [`orders/${orderId}`]: {
        id: orderId,
        billNumber: input.billNumber?.trim() || `INV-${Date.now().toString().slice(-8)}`,
        customerId: customer.id,
        customerName: customer.name,
        salesPersonId: currentUser.id,
        salesPersonName: currentUser.name,
        status: 'pending',
        paymentStatus: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        total,
        subtotal,
        discount,
        paid,
        due,
        deliveryDate: input.deliveryDate,
        paymentDueDate: input.paymentDueDate?.trim() || defaultDueDate.toISOString(),
        dueReference: due > 0 ? input.dueReference || 'owner' : '',
        overdueNotified: false,
        createdAt: orderDate,
        items: orderItems,
      },
      [`customers/${customer.id}/due`]: (data.customers[customer.id]?.due ?? 0) + due,
    }

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    await update(ref(db, 'erp'), updates)

    await writeActivity('order_created', 'sales', `Created order for ${customer.name} with ${orderItems.length} product line(s).`)
    await writeNotification(
      'New sales order',
      `Order ${orderId} created for ${customer.name} by ${currentUser?.name ?? 'Admin'}. Awaiting fulfillment.`,
      'info',
      ['admin', 'sales_person', 'accountant']
    )

    for (const [productId, quantity] of requestedByProduct) {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      if (nextStock > product.minStock) continue
      await writeNotification(
        'Low stock alert',
        `${product.name} needs replenishment after the latest sale (${nextStock}/${product.minStock}).`,
        'warning',
        ['admin', 'store_manager']
      )
    }
  }

  async function updateOrderStatus(orderId: string, status: OrderRecord['status']) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const order = data.orders[orderId]
    if (!order) {
      return
    }

    await update(ref(db, `erp/orders/${orderId}`), { status })
    await writeActivity('order_status_changed', 'sales', `Moved order ${orderId} to ${status}.`)
    await writeNotification(
      'Order status updated',
      `Order ${orderId} status was updated to "${status}" by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', 'sales_person', 'accountant']
    )
  }

  async function createTask(input: TaskInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const assignee = data.users[input.assigneeId]
    if (!assignee) {
      throw new Error('Assignee not found.')
    }

    const taskId = createId('task')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/tasks'), {
      [taskId]: {
        id: taskId,
        title: input.title,
        description: input.description,
        module: input.module,
        status: 'pending',
        priority: input.priority,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        dueDate: input.dueDate,
        createdBy: currentUser.id,
        createdAt: now,
      },
    })

    await writeActivity('task_created', 'operations', `Assigned "${input.title}" to ${assignee.name}.`)
    await writeNotification(
      'New task assigned',
      `Task "${input.title}" was assigned to ${assignee.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', assignee.roleId]
    )
  }

  async function createUser(input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before creating users.')
    }

    if (currentUser.roleId !== 'admin') {
      throw new Error('Only admin users can create new users.')
    }

    const normalizedLoginId = normalizeLookup(input.loginId)
    const normalizedPhone = normalizePhoneLookup(input.phone)

    const loginIdExists = users.some((user) => normalizeLookup(user.loginId) === normalizedLoginId)
    if (loginIdExists) {
      throw new Error('That login ID is already in use.')
    }

    const phoneExists = users.some((user) => normalizePhoneLookup(user.phone) === normalizedPhone)
    if (phoneExists) {
      throw new Error('That phone number is already in use.')
    }

    if (!data.roles[input.roleId]) {
      throw new Error('Selected role does not exist.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('user')
    const user: UserRecord = {
      id,
      name: input.name.trim(),
      loginId: normalizedLoginId,
      email: `${normalizedLoginId}@local`,
      phone: normalizedPhone,
      password: input.password,
      roleId: input.roleId,
      title: input.title.trim(),
      status: 'active',
    }

    await update(ref(db, 'erp/users'), { [id]: user })
    await writeActivity('user_created', 'admin', `Created user ${user.name} with ${data.roles[user.roleId]?.name ?? user.roleId} access.`)
    await writeNotification(
      'New user registered',
      `User ${user.name} was registered as ${data?.roles[user.roleId]?.name || user.roleId} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin']
    )
  }

  async function updateUser(userId: string, input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before updating users.')
    }

    if (currentUser.roleId !== 'admin') {
      throw new Error('Only admin users can update users.')
    }

    const existing = data.users[userId]
    if (!existing) {
      throw new Error('User not found.')
    }

    const normalizedLoginId = normalizeLookup(input.loginId)
    const normalizedPhone = normalizePhoneLookup(input.phone)

    const loginIdExists = users.some(
      (user) => user.id !== userId && normalizeLookup(user.loginId) === normalizedLoginId
    )
    if (loginIdExists) {
      throw new Error('That login ID is already in use.')
    }

    const phoneExists = users.some(
      (user) => user.id !== userId && normalizePhoneLookup(user.phone) === normalizedPhone
    )
    if (phoneExists) {
      throw new Error('That phone number is already in use.')
    }

    if (!data.roles[input.roleId]) {
      throw new Error('Selected role does not exist.')
    }

    const db = getDatabaseOrThrow()
    const updatedUser: UserRecord = {
      ...existing,
      name: input.name.trim(),
      loginId: normalizedLoginId,
      email: `${normalizedLoginId}@local`,
      phone: normalizedPhone,
      roleId: input.roleId,
      title: input.title.trim(),
      password: input.password ? input.password : existing.password,
    }

    await update(ref(db, `erp/users/${userId}`), updatedUser)
    await writeActivity('user_updated', 'admin', `Updated user ${updatedUser.name}.`)
  }

  async function deleteUser(userId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before deleting users.')
    }

    if (currentUser.roleId !== 'admin') {
      throw new Error('Only admin users can delete users.')
    }

    if (userId === currentUser.id) {
      throw new Error('You cannot delete your own account.')
    }

    const existing = data.users[userId]
    if (!existing) {
      throw new Error('User not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`users/${userId}`]: null,
    })
    await writeActivity('user_deleted', 'admin', `Deleted user ${existing.name}.`)
  }

  async function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/tasks/${taskId}`), { status })
    await writeActivity('task_updated', 'operations', `Updated task ${taskId} to ${status}.`)
  }

  async function markNotificationRead(notificationId: string) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/notifications/${notificationId}`), { read: true })
  }

  async function markAllNotificationsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) {
      return
    }
    const db = getDatabaseOrThrow()
    const updates: Record<string, boolean> = {}
    for (const id of notificationIds) {
      updates[`erp/notifications/${id}/read`] = true
    }
    await update(ref(db), updates)
  }

  async function saveExpense(input: ExpenseInput, expenseId?: string) {
    if (!data || !currentUser) {
      return
    }

    const category = input.category.trim()
    if (!category) {
      throw new Error('Expense category is required.')
    }

    if (input.amount <= 0) {
      throw new Error('Expense amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const existingExpense = expenseId ? data.expenses[expenseId] : null
    const id = existingExpense?.id ?? createId('expense')
    const now = new Date().toISOString()
    const expense = {
      id,
      category,
      amount: input.amount,
      note: input.note?.trim() ?? '',
      date: input.date?.trim() || now,
      createdBy: existingExpense?.createdBy ?? currentUser.id,
      createdByName: existingExpense?.createdByName ?? currentUser.name,
      createdAt: existingExpense?.createdAt ?? now,
    }

    await update(ref(db, 'erp/expenses'), { [id]: expense })
    await writeActivity(
      existingExpense ? 'expense_updated' : 'expense_created',
      'finance',
      existingExpense ? `Updated ${category} expense entry.` : `Recorded ${category} expense of ${expense.amount}.`
    )
  }

  async function saveInvestor(input: InvestorInput, investorId?: string) {
    if (!data) return
    const name = input.name.trim()
    const mobile = input.mobile.trim()
    if (!name) throw new Error('Investor name is required.')
    if (!mobile) throw new Error('Investor mobile number is required.')
    if (input.amount <= 0) throw new Error('Investment amount must be greater than zero.')

    const existing = investorId ? data.investors[investorId] : null
    const id = existing?.id ?? createId('investor')
    const now = new Date().toISOString()
    const investor = {
      id,
      name,
      location: input.location?.trim() ?? '',
      mobile,
      products: input.products?.trim() ?? '',
      amount: input.amount,
      note: input.note?.trim() ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp/investors'), { [id]: investor })
    await writeActivity(existing ? 'investor_updated' : 'investor_created', 'finance', `${existing ? 'Updated' : 'Added'} investor ${name}.`)
  }

  async function deleteExpense(expenseId: string) {
    if (!data) {
      return
    }

    const expense = data.expenses[expenseId]
    if (!expense) {
      throw new Error('Expense not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`expenses/${expenseId}`]: null })
    await writeActivity('expense_deleted', 'finance', `Deleted ${expense.category} expense entry.`)
  }

  async function saveSeller(input: SellerInput, sellerId?: string) {
    if (!data) {
      return
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Seller name is required.')
    }

    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Seller phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existingSeller = sellerId ? data.sellers[sellerId] : null
    const id = existingSeller?.id ?? createId('seller')
    const now = new Date().toISOString()
    const seller = {
      id,
      name,
      phone,
      location: input.location?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: existingSeller?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/sellers'), { [id]: seller })
    await writeActivity(
      existingSeller ? 'seller_updated' : 'seller_created',
      'sellers',
      existingSeller ? `Updated ${seller.name} seller details.` : `Added seller ${seller.name}.`
    )
  }

  async function deleteSeller(sellerId: string) {
    if (!data) {
      return
    }

    const seller = data.sellers[sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const hasTransactions = Object.values(data.sellerTransactions).some(
      (transaction) => transaction.sellerId === sellerId
    )
    if (hasTransactions) {
      throw new Error('Sellers with ledger history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellers/${sellerId}`]: null })
    await writeActivity('seller_deleted', 'sellers', `Deleted seller ${seller.name}.`)
  }

  async function recordSellerTransaction(input: SellerTransactionInput) {
    if (!data) {
      return
    }

    const seller = data.sellers[input.sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const db = getDatabaseOrThrow()
    const transactionId = createId('seller_txn')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/sellerTransactions'), {
      [transactionId]: {
        id: transactionId,
        sellerId: seller.id,
        sellerName: seller.name,
        date: input.date?.trim() || now,
        itemsTaken: input.itemsTaken?.trim() ?? '',
        takenValue: Math.max(input.takenValue ?? 0, 0),
        cashGiven: Math.max(input.cashGiven ?? 0, 0),
        goodsBroughtDescription: input.goodsBroughtDescription?.trim() ?? '',
        iReceiveAmount: Math.max(input.iReceiveAmount ?? 0, 0),
        theyReceiveAmount: Math.max(input.theyReceiveAmount ?? 0, 0),
        createdAt: now,
      },
    })

    await writeActivity('seller_transaction_recorded', 'sellers', `Recorded a ledger entry for ${seller.name}.`)
  }

  async function deleteSellerTransaction(transactionId: string) {
    if (!data) {
      return
    }

    const transaction = data.sellerTransactions[transactionId]
    if (!transaction) {
      throw new Error('Transaction not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellerTransactions/${transactionId}`]: null })
    await writeActivity(
      'seller_transaction_deleted',
      'sellers',
      `Removed a ledger entry for ${transaction.sellerName}.`
    )
  }

  async function saveCourier(input: CourierInput, courierId?: string) {
    if (!data) {
      return
    }

    const customerName = input.customerName.trim()
    if (!customerName) {
      throw new Error('Customer name is required.')
    }

    const courierName = input.courierName.trim()
    if (!courierName) {
      throw new Error('Courier name is required.')
    }

    const db = getDatabaseOrThrow()
    const existingCourier = courierId ? data.couriers[courierId] : null
    const id = existingCourier?.id ?? createId('courier')
    const now = new Date().toISOString()
    const courier = {
      id,
      customerId: input.customerId ?? existingCourier?.customerId ?? '',
      customerName,
      billNumber: input.billNumber?.trim() || existingCourier?.billNumber || `SHP-${Date.now().toString().slice(-8)}`,
      courierName,
      productDescription: input.productDescription.trim(),
      quantity: Math.max(input.quantity ?? 0, 0),
      codAmount: Math.max(input.codAmount ?? 0, 0),
      sentDate: input.sentDate?.trim() || existingCourier?.sentDate || now,
      status: existingCourier?.status ?? 'in-transit',
      createdAt: existingCourier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/couriers'), { [id]: courier })
    await writeActivity(
      existingCourier ? 'courier_updated' : 'courier_created',
      'courier',
      existingCourier
        ? `Updated courier shipment for ${courier.customerName}.`
        : `Sent ${courier.productDescription} to ${courier.customerName} via ${courier.courierName}.`
    )
  }

  async function updateCourierStatus(courierId: string, status: CourierRecord['status']) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/couriers/${courierId}`), { status, updatedAt: new Date().toISOString() })
    await writeActivity('courier_status_changed', 'courier', `Marked ${courier.customerName}'s shipment as ${status}.`)

    if (status === 'delivered' || status === 'cod-collected') {
      await writeNotification(
        'Courier update',
        `${courier.customerName}'s shipment (${courier.billNumber}) is now ${status.replace('-', ' ')}.`,
        'info',
        ['admin', 'sales_person', 'accountant']
      )
    }
  }

  async function deleteCourier(courierId: string) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      throw new Error('Courier record not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`couriers/${courierId}`]: null })
    await writeActivity('courier_deleted', 'courier', `Deleted courier shipment for ${courier.customerName}.`)
  }

  function switchUser(userId: string) {
    setCurrentUserId(userId)
    persistCurrentUserId(userId)
  }

  const value = useMemo<ERPContextValue>(
    () => ({
      data,
      loading,
      error,
      users,
      currentUser,
      currentPermissions,
      login,
      logout,
      switchUser,
      createUser,
      updateUser,
      deleteUser,
      hasPermission: (permission) => hasPermissionCheck(data, currentUser, permission),
      saveProduct,
      deleteProduct,
      saveCustomer,
      deleteCustomer,
      saveSupplier,
      deleteSupplier,
      saveWarehouse,
      deleteWarehouse,
      recordPurchase,
      createOrder,
      updateOrderStatus,
      createTask,
      updateTaskStatus,
      markNotificationRead,
      markAllNotificationsRead,
      saveExpense,
      saveInvestor,
      deleteExpense,
      saveSeller,
      deleteSeller,
      recordSellerTransaction,
      deleteSellerTransaction,
      saveCourier,
      updateCourierStatus,
      deleteCourier,
    }),
    [currentPermissions, currentUser, data, error, loading, users]
  )

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>
}

export function useERP() {
  const context = useContext(ERPContext)

  if (!context) {
    throw new Error('useERP must be used inside ERPProvider.')
  }

  return context
}
