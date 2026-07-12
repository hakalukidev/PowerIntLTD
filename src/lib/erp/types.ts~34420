export type PermissionDefinition = {
  id: string
  label: string
  description: string
}

export type RoleRecord = {
  id: string
  name: string
  description: string
  permissions: string[]
}

export type UserRecord = {
  id: string
  name: string
  loginId: string
  email: string
  phone: string
  password: string
  roleId: string
  title: string
  status: 'active' | 'inactive'
}

export type WarehouseRecord = {
  id: string
  name: string
  location: string
}

export type SupplierRecord = {
  id: string
  name: string
  company: string
  phone: string
  email: string
  location: string
  supplierType: 'local' | 'foreign' | 'importer'
  country: string
  lcNumber: string
  lcStatus: 'not-required' | 'pending' | 'opened' | 'released' | 'closed'
  productCost: number
  shippingCost: number
  customsDuty: number
  otherCost: number
  currency: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type CustomerRecord = {
  id: string
  name: string
  company: string
  phone: string
  location: string
  due: number
  supportStatus: 'none' | 'needed' | 'in-progress' | 'resolved'
  supportNote: string
  createdAt: string
  updatedAt: string
}

export type ProductStatus = 'active' | 'low-stock' | 'out-of-stock'

export type ProductRecord = {
  id: string
  name: string
  category: string
  brand: string
  sku: string
  warehouseId: string
  supplierId: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice: number
  stockQty: number
  minStock: number
  maxStock: number
  status: ProductStatus
  description: string
  imageUrl?: string
  imagePublicId?: string
  createdAt: string
  updatedAt: string
}

export type OrderStatus = 'pending' | 'ready' | 'shipped' | 'completed' | 'hold'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export type OrderItem = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  purchasePrice: number
}

export type OrderRecord = {
  id: string
  customerId: string
  customerName: string
  salesPersonId: string
  salesPersonName: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  paid: number
  due: number
  deliveryDate: string
  createdAt: string
  items: OrderItem[]
}

export type PurchaseRecord = {
  id: string
  productId: string
  productName: string
  supplierId: string
  supplierName: string
  quantity: number
  unitCost: number
  currency: string
  total: number
  status: 'pending' | 'received'
  createdAt: string
}

export type TaskStatus = 'pending' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export type TaskRecord = {
  id: string
  title: string
  description: string
  module: 'inventory' | 'sales' | 'support' | 'warehouse'
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string
  assigneeName: string
  dueDate: string
  createdBy: string
  createdAt: string
}

export type NotificationRecord = {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  read: boolean
  createdAt: string
  roles?: string[]
}

export type ActivityRecord = {
  id: string
  action: string
  module: string
  message: string
  userId: string
  userName: string
  createdAt: string
}

export type SettingsRecord = {
  companyName: string
  currency: string
  timezone: string
}

export type ERPData = {
  permissions: Record<string, PermissionDefinition>
  roles: Record<string, RoleRecord>
  users: Record<string, UserRecord>
  warehouses: Record<string, WarehouseRecord>
  suppliers: Record<string, SupplierRecord>
  customers: Record<string, CustomerRecord>
  products: Record<string, ProductRecord>
  orders: Record<string, OrderRecord>
  purchases: Record<string, PurchaseRecord>
  tasks: Record<string, TaskRecord>
  notifications: Record<string, NotificationRecord>
  activities: Record<string, ActivityRecord>
  settings: SettingsRecord
  meta: {
    seededAt: string
    version: string
  }
}

export type ProductInput = {
  name: string
  category?: string
  brand?: string
  sku: string
  warehouseId: string
  supplierId?: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  stockQty: number
  minStock: number
  maxStock: number
  description?: string
  imageUrl?: string
  imagePublicId?: string
}

export type WarehouseInput = {
  name: string
  location: string
}

export type CustomerInput = {
  name: string
  company?: string
  phone: string
  location?: string
  due?: number
  supportStatus?: CustomerRecord['supportStatus']
  supportNote?: string
}

export type SupplierInput = {
  name: string
  company?: string
  phone: string
  email?: string
  location?: string
  supplierType?: SupplierRecord['supplierType']
  country?: string
  lcNumber?: string
  lcStatus?: SupplierRecord['lcStatus']
  productCost?: number
  shippingCost?: number
  customsDuty?: number
  otherCost?: number
  currency?: string
  notes?: string
}

export type PurchaseInput = {
  productId: string
  quantity: number
  unitCost: number
  supplierId: string
  currency: string
}

export type OrderInput = {
  customerId: string
  productId: string
  quantity: number
  paid: number
  deliveryDate: string
}

export type TaskInput = {
  title: string
  description: string
  module: TaskRecord['module']
  priority: TaskPriority
  assigneeId: string
  dueDate: string
}

export type UserInput = {
  name: string
  loginId: string
  phone: string
  password: string
  roleId: string
  title: string
}

