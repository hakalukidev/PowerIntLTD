import type { ERPData } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'

export type ReportFieldType = 'string' | 'number' | 'currency' | 'date' | 'boolean'

export type ReportColumn = {
  key: string
  label: string
  type: ReportFieldType
  filterable?: boolean
  searchable?: boolean
  isPrimaryDate?: boolean
}

export type ReportRow = Record<string, string | number | boolean | null | undefined>

export type ReportSource = {
  id: string
  label: string
  description: string
  rows: (data: ERPData) => ReportRow[]
  columns: ReportColumn[]
}

function col(key: string, label: string, type: ReportFieldType, extra: Partial<ReportColumn> = {}): ReportColumn {
  return { key, label, type, ...extra }
}

export const REPORT_SOURCES: ReportSource[] = [
  {
    id: 'sales',
    label: 'Sales / Orders',
    description: 'Every bill raised across all customers with payment and delivery status.',
    rows: (data) => {
      const customers = toArray(data.customers)
      return toArray(data.orders).map((order) => {
        const customer = customers.find((entry) => entry.id === order.customerId)
        return {
          billNumber: order.billNumber,
          date: order.createdAt,
          customerName: order.customerName,
          customerPhone: customer?.phone ?? '',
          salesPerson: order.salesPersonName,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          paid: order.paid,
          due: order.due,
          deliveryDate: order.deliveryDate,
          paymentDueDate: order.paymentDueDate,
          ref: order.due > 0 ? (order.dueReference === 'courier' ? 'With courier' : 'With owner') : 'Paid',
          products: order.items.map((item) => `${item.productName} x ${item.quantity}`).join(', '),
          totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        }
      })
    },
    columns: [
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('customerPhone', 'Phone', 'string', { searchable: true }),
      col('salesPerson', 'Sales Person', 'string', { filterable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('paymentStatus', 'Payment Status', 'string', { filterable: true }),
      col('total', 'Total', 'currency'),
      col('paid', 'Paid', 'currency'),
      col('due', 'Due', 'currency'),
      col('deliveryDate', 'Delivery Date', 'date'),
      col('ref', 'Due Reference', 'string', { filterable: true }),
      col('products', 'Products', 'string', { searchable: true }),
      col('totalQuantity', 'Total Qty', 'number'),
    ],
  },
  {
    id: 'stock',
    label: 'Stock / Products',
    description: 'Inventory levels, pricing, and status for every product.',
    rows: (data) => {
      const warehouses = data.warehouses
      const suppliers = data.suppliers
      return toArray(data.products).map((product) => ({
        name: product.name,
        category: product.category,
        brand: product.brand,
        sku: product.sku,
        serialNumber: product.serialNumber ?? '',
        warehouse: warehouses[product.warehouseId]?.name ?? '',
        supplier: suppliers[product.supplierId]?.name ?? '',
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        wholesalePrice: product.wholesalePrice,
        stockQty: product.stockQty,
        minStock: product.minStock,
        maxStock: product.maxStock,
        status: product.status,
        updatedAt: product.updatedAt,
      }))
    },
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('category', 'Category', 'string', { filterable: true }),
      col('brand', 'Brand', 'string', { filterable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('serialNumber', 'Serial No.', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('supplier', 'Supplier', 'string', { filterable: true }),
      col('purchasePrice', 'Purchase Price', 'currency'),
      col('sellingPrice', 'Selling Price', 'currency'),
      col('wholesalePrice', 'Wholesale Price', 'currency'),
      col('stockQty', 'Stock Qty', 'number'),
      col('minStock', 'Min Stock', 'number'),
      col('maxStock', 'Max Stock', 'number'),
      col('status', 'Status', 'string', { filterable: true }),
      col('updatedAt', 'Updated', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    description: 'Customer ledger with dues, support status, and premium flag.',
    rows: (data) =>
      toArray(data.customers).map((customer) => ({
        name: customer.name,
        company: customer.company,
        phone: customer.phone,
        location: customer.location,
        due: customer.due,
        supportStatus: customer.supportStatus,
        isPremium: customer.isPremium,
        createdAt: customer.createdAt,
      })),
    columns: [
      col('name', 'Customer', 'string', { searchable: true }),
      col('company', 'Company', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('location', 'Location', 'string', { filterable: true }),
      col('due', 'Due', 'currency'),
      col('supportStatus', 'Support Status', 'string', { filterable: true }),
      col('isPremium', 'Premium', 'boolean', { filterable: true }),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'suppliers',
    label: 'Suppliers / Imports',
    description: 'Supplier directory with LC status and landed cost breakdown.',
    rows: (data) =>
      toArray(data.suppliers).map((supplier) => ({
        name: supplier.name,
        company: supplier.company,
        phone: supplier.phone,
        supplierType: supplier.supplierType,
        country: supplier.country,
        lcNumber: supplier.lcNumber,
        lcStatus: supplier.lcStatus,
        productCost: supplier.productCost,
        shippingCost: supplier.shippingCost,
        customsDuty: supplier.customsDuty,
        otherCost: supplier.otherCost,
        landedCost: supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost,
        createdAt: supplier.createdAt,
      })),
    columns: [
      col('name', 'Supplier', 'string', { searchable: true }),
      col('company', 'Company', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('supplierType', 'Type', 'string', { filterable: true }),
      col('country', 'Country', 'string', { filterable: true }),
      col('lcNumber', 'LC No.', 'string', { searchable: true }),
      col('lcStatus', 'LC Status', 'string', { filterable: true }),
      col('productCost', 'Product Cost', 'currency'),
      col('shippingCost', 'Shipping', 'currency'),
      col('customsDuty', 'Customs', 'currency'),
      col('otherCost', 'Other', 'currency'),
      col('landedCost', 'Landed Cost', 'currency'),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    description: 'Stock purchased from suppliers, cost, and receipt status.',
    rows: (data) =>
      toArray(data.purchases).map((purchase) => ({
        productName: purchase.productName,
        supplierName: purchase.supplierName,
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        total: purchase.total,
        currency: purchase.currency,
        status: purchase.status,
        createdAt: purchase.createdAt,
      })),
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('supplierName', 'Supplier', 'string', { filterable: true }),
      col('quantity', 'Quantity', 'number'),
      col('unitCost', 'Unit Cost', 'currency'),
      col('total', 'Total', 'currency'),
      col('status', 'Status', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    description: 'Operational expenses logged by category and staff member.',
    rows: (data) =>
      toArray(data.expenses).map((expense) => ({
        category: expense.category,
        amount: expense.amount,
        note: expense.note,
        createdByName: expense.createdByName,
        date: expense.date,
      })),
    columns: [
      col('category', 'Category', 'string', { filterable: true }),
      col('amount', 'Amount', 'currency'),
      col('note', 'Note', 'string', { searchable: true }),
      col('createdByName', 'Created By', 'string', { filterable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'sellers',
    label: 'Sellers',
    description: 'External seller/agent directory.',
    rows: (data) =>
      toArray(data.sellers).map((seller) => ({
        name: seller.name,
        phone: seller.phone,
        location: seller.location,
        notes: seller.notes,
        createdAt: seller.createdAt,
      })),
    columns: [
      col('name', 'Seller', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('location', 'Location', 'string', { filterable: true }),
      col('notes', 'Notes', 'string', { searchable: true }),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'sellerTransactions',
    label: 'Seller Ledger',
    description: 'Goods taken, cash given, and receivables per seller transaction.',
    rows: (data) =>
      toArray(data.sellerTransactions).map((txn) => ({
        sellerName: txn.sellerName,
        date: txn.date,
        itemsTaken: txn.itemsTaken,
        takenValue: txn.takenValue,
        cashGiven: txn.cashGiven,
        iReceiveAmount: txn.iReceiveAmount,
        theyReceiveAmount: txn.theyReceiveAmount,
      })),
    columns: [
      col('sellerName', 'Seller', 'string', { filterable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
      col('itemsTaken', 'Items Taken', 'string', { searchable: true }),
      col('takenValue', 'Taken Value', 'currency'),
      col('cashGiven', 'Cash Given', 'currency'),
      col('iReceiveAmount', 'I Receive', 'currency'),
      col('theyReceiveAmount', 'They Receive', 'currency'),
    ],
  },
  {
    id: 'couriers',
    label: 'Couriers',
    description: 'Shipments sent via courier with COD collection status.',
    rows: (data) =>
      toArray(data.couriers).map((courier) => ({
        customerName: courier.customerName,
        billNumber: courier.billNumber,
        courierName: courier.courierName,
        productDescription: courier.productDescription,
        quantity: courier.quantity,
        codAmount: courier.codAmount,
        sentDate: courier.sentDate,
        status: courier.status,
      })),
    columns: [
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('courierName', 'Courier', 'string', { filterable: true }),
      col('productDescription', 'Product', 'string', { searchable: true }),
      col('quantity', 'Quantity', 'number'),
      col('codAmount', 'COD Amount', 'currency'),
      col('sentDate', 'Sent Date', 'date', { isPrimaryDate: true }),
      col('status', 'Status', 'string', { filterable: true }),
    ],
  },
  {
    id: 'users',
    label: 'Users / Staff',
    description: 'Internal staff accounts and roles.',
    rows: (data) =>
      toArray(data.users).map((user) => ({
        name: user.name,
        loginId: user.loginId,
        phone: user.phone,
        role: data.roles[user.roleId]?.name ?? user.roleId,
        title: user.title,
        status: user.status,
      })),
    columns: [
      col('name', 'Name', 'string', { searchable: true }),
      col('loginId', 'Login ID', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('role', 'Role', 'string', { filterable: true }),
      col('title', 'Title', 'string', { searchable: true }),
      col('status', 'Status', 'string', { filterable: true }),
    ],
  },
  {
    id: 'userPerformance',
    label: 'User Performance',
    description: 'Orders, revenue, and due amounts attributed to each sales user.',
    rows: (data) => {
      const orders = toArray(data.orders)
      return toArray(data.users).map((user) => {
        const userOrders = orders.filter((order) => order.salesPersonId === user.id)
        return {
          name: user.name,
          role: data.roles[user.roleId]?.name ?? user.roleId,
          totalOrders: userOrders.length,
          pendingOrders: userOrders.filter((order) => order.status === 'pending').length,
          completedOrders: userOrders.filter((order) => order.status === 'completed').length,
          revenue: userOrders.reduce((sum, order) => sum + order.total, 0),
          due: userOrders.reduce((sum, order) => sum + order.due, 0),
        }
      })
    },
    columns: [
      col('name', 'User', 'string', { searchable: true }),
      col('role', 'Role', 'string', { filterable: true }),
      col('totalOrders', 'Total Orders', 'number'),
      col('pendingOrders', 'Pending', 'number'),
      col('completedOrders', 'Completed', 'number'),
      col('revenue', 'Revenue', 'currency'),
      col('due', 'Due', 'currency'),
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Assigned tasks across inventory, sales, support, and warehouse.',
    rows: (data) =>
      toArray(data.tasks).map((task) => ({
        title: task.title,
        module: task.module,
        status: task.status,
        priority: task.priority,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
      })),
    columns: [
      col('title', 'Title', 'string', { searchable: true }),
      col('module', 'Module', 'string', { filterable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('priority', 'Priority', 'string', { filterable: true }),
      col('assigneeName', 'Assignee', 'string', { filterable: true }),
      col('dueDate', 'Due Date', 'date'),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'activities',
    label: 'Activity Log',
    description: 'System-wide audit trail of user actions.',
    rows: (data) =>
      toArray(data.activities).map((activity) => ({
        action: activity.action,
        module: activity.module,
        message: activity.message,
        userName: activity.userName,
        createdAt: activity.createdAt,
      })),
    columns: [
      col('action', 'Action', 'string', { filterable: true }),
      col('module', 'Module', 'string', { filterable: true }),
      col('message', 'Message', 'string', { searchable: true }),
      col('userName', 'User', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
]

export function formatReportValue(column: ReportColumn, value: unknown, currency: string) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  switch (column.type) {
    case 'currency':
      return formatCurrency(Number(value), currency)
    case 'date':
      return formatDate(String(value))
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('en-BD') : String(value)
    default:
      return String(value)
  }
}

export function reportExportValue(column: ReportColumn, value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  if (column.type === 'number' || column.type === 'currency') {
    return Number(value) || 0
  }

  if (column.type === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (column.type === 'date') {
    return value ? formatDate(String(value)) : ''
  }

  return String(value)
}
