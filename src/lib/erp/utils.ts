import type {
  ActivityRecord,
  CustomerCommitment,
  EmployeeRecord,
  EmploymentStatus,
  ERPData,
  NotificationRecord,
  OrderRecord,
  ProductRecord,
  SalaryHoldStatus,
  RoleRecord,
  SalaryPaymentEntry,
  SalaryRecord,
  SalesTargetRecord,
  UserRecord,
  ZoneRecord,
} from '@/lib/erp/types'

export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function toArray<T extends { id: string }>(record?: Record<string, T> | null) {
  return record ? Object.values(record) : []
}

export function formatCurrency(value: number, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Plain grouped amount with no currency label, for sheets where the unit is implied. */
export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(value)
}

/** Amount for table cells: the base BDT is implied, so only a foreign currency keeps its code. */
export function formatTableAmount(value: number, currency?: string) {
  return !currency || currency === 'BDT' ? formatAmount(value) : formatCurrency(value, currency)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function isSameCalendarDay(value: string, target = new Date()) {
  const date = new Date(value)

  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  )
}

export function getProductStatus(stockQty: number, minStock: number): ProductRecord['status'] {
  if (stockQty <= 0) {
    return 'out-of-stock'
  }

  if (stockQty <= minStock) {
    return 'low-stock'
  }

  return 'active'
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Expenses from the expense form only count once approved; older entries have no status. */
export function isApprovedExpense(expense: { status?: string }) {
  return !expense.status || expense.status === 'approved'
}

export const TA_CATEGORY = 'TA'

/** Standard expense categories; admins can add more through settings but not remove these. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Office Expense',
  'Courier',
  'Delivery',
  'Transport',
  'Salary',
  'Commission',
  'Employee Expense',
  'Dealer Expense',
  TA_CATEGORY,
  'DA',
]

/** Categories paid to a specific employee, so the form requires picking who it is for. */
export const EMPLOYEE_EXPENSE_CATEGORIES = ['Salary', 'Commission', TA_CATEGORY, 'DA']

export function isDefaultExpenseCategory(category: string) {
  return DEFAULT_EXPENSE_CATEGORIES.some((item) => item.toLowerCase() === category.trim().toLowerCase())
}

/** The standard categories followed by the admin-added ones, without duplicates. */
export function getExpenseCategories(extra: string[] = []) {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...extra.filter((item) => item.trim() && !isDefaultExpenseCategory(item))]
}

/** The short ID staff read out and search by: the random tail of a record id, e.g. `AB12CD`. */
export function shortRecordId(id: string) {
  return (id.split('_').pop() || id).toUpperCase()
}

export const CUSTOMER_CODE_PREFIX = 'PIL-CUS-'
export const SUPPLIER_CODE_PREFIX = 'PIL-SUP-'

/** The next free system code after the highest one already given (`PIL-CUS-0007` → `PIL-CUS-0008`). */
export function nextPartyCode(records: Array<{ code?: string }>, prefix: string) {
  const highest = records.reduce((max, record) => {
    const match = record.code?.startsWith(prefix) ? record.code.match(/(\d+)$/) : null
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/** A client's or supplier's ID as staff see it: their system code, or the record id for records not yet coded. */
export function partyCode(record: { id: string; code?: string } | null | undefined) {
  if (!record) return ''
  return record.code || shortRecordId(record.id)
}

/**
 * A phone number reduced to its local digits, so +8801711-000000, 8801711000000, and
 * 01711000000 all compare equal. Used for duplicate checks and for signing in by phone.
 */
export function normalizePhone(value: unknown) {
  const digits = typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : ''
  return digits ? digits.replace(/^(?:880|88|0)+/, '') : ''
}

/** A Bangladeshi number in international digits, e.g. 01711-000000 → 8801711000000. Empty when there is no number. */
export function internationalPhone(value: unknown) {
  const local = normalizePhone(value)
  return local ? `880${local}` : ''
}

/** A WhatsApp chat with the message typed in, ready to send. Empty without a phone number. */
export function whatsappLink(phone: unknown, text: string) {
  const digits = internationalPhone(phone)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : ''
}

/** The phone's SMS app with the message typed in. Empty without a phone number. */
export function smsLink(phone: unknown, text: string) {
  const digits = internationalPhone(phone)
  return digits ? `sms:+${digits}?body=${encodeURIComponent(text)}` : ''
}

/**
 * The user's main role and every additional role an admin approved. Roles still waiting
 * for approval are not included, so they grant nothing.
 */
export function userRoleIds(user: Pick<UserRecord, 'roleId' | 'extraRoleIds'>) {
  return Array.from(new Set([user.roleId, ...(user.extraRoleIds ?? [])].filter(Boolean)))
}

export function userRoleNames(roles: Record<string, RoleRecord> | undefined, user: Pick<UserRecord, 'roleId' | 'extraRoleIds'>) {
  return userRoleIds(user)
    .map((roleId) => roles?.[roleId]?.name ?? roleId)
    .join(', ')
}

/**
 * One role that grants what all of the user's roles grant together: every permission of each,
 * the widest data scope, and approval only when every role needs it. A role that is not limited to zones or to the user's own territory
 * makes the combination unlimited too.
 */
export function effectiveRole(roles: Record<string, RoleRecord> | undefined, user: Pick<UserRecord, 'roleId' | 'extraRoleIds'>): RoleRecord | null {
  const held = userRoleIds(user)
    .map((roleId) => roles?.[roleId])
    .filter((role): role is RoleRecord => Boolean(role))
  if (!held.length) return null
  if (held.length === 1) return held[0]

  const isLimited = (role: RoleRecord) => role.dataScope === 'assigned' || (role.zoneIds?.length ?? 0) > 0
  const allLimited = held.every(isLimited)
  return {
    id: held[0].id,
    name: held.map((role) => role.name).join(', '),
    description: '',
    permissions: Array.from(new Set(held.flatMap((role) => role.permissions ?? []))),
    zoneIds: allLimited ? Array.from(new Set(held.flatMap((role) => role.zoneIds ?? []))) : [],
    dataScope: allLimited && held.some((role) => role.dataScope === 'assigned') ? 'assigned' : 'all',
    // Like the data scope, the freer role wins: approval is only needed when every role needs it.
    requiresApproval: held.every((role) => role.requiresApproval),
  }
}

/** Whether the user's changes to dealers, suppliers, credit sheet entries and expenses wait for an admin. */
export function changesNeedApproval(roles: Record<string, RoleRecord> | undefined, user: UserRecord | null) {
  if (!user || userRoleIds(user).includes('admin')) return false
  return Boolean(effectiveRole(roles, user)?.requiresApproval)
}

/**
 * Whether the user is in charge of a zone: they hold the Zonal Manager role or an admin made
 * them a zone's manager. They may see their zone's client data but not change any of it.
 */
export function isZoneInCharge(user: Pick<UserRecord, 'id' | 'roleId' | 'extraRoleIds'> | null, zones: Pick<ZoneRecord, 'managerIds'>[]) {
  if (!user || userRoleIds(user).includes('admin')) return false
  return userRoleIds(user).includes('zone_manager') || zones.some((zone) => zone.managerIds?.includes(user.id))
}

/** A commitment counts once it is approved; one still waiting or rejected does not. */
export function isCommitmentApproved(commitment: Pick<CustomerCommitment, 'approvalStage'>) {
  return !commitment.approvalStage || commitment.approvalStage === 'approved'
}

/** A zone in charge only keeps the `.view` grants of their roles; everyone else keeps them all. */
export function zoneInChargePermissions(permissions: string[], user: UserRecord | null, zones: Pick<ZoneRecord, 'managerIds'>[]) {
  return isZoneInCharge(user, zones) ? permissions.filter((permission) => permission.endsWith('.view')) : permissions
}

export function getPermissions(data: ERPData | null, user: UserRecord | null) {
  if (!data || !user) {
    return []
  }

  return zoneInChargePermissions(effectiveRole(data.roles, user)?.permissions ?? [], user, toArray(data.zones))
}

export function hasPermission(data: ERPData | null, user: UserRecord | null, permission: string) {
  return getPermissions(data, user).includes(permission)
}

export function buildDashboardSnapshot(data: ERPData | null, roleIds?: string[]) {
  const orders = sortByCreatedAtDesc(toArray(data?.orders))
  const purchases = sortByCreatedAtDesc(toArray(data?.purchases))
  const products = toArray(data?.products)
  const tasks = toArray(data?.tasks)
  const rawNotifications = sortByCreatedAtDesc(toArray(data?.notifications))
  const notifications = rawNotifications.filter((item) => {
    if (!roleIds) return true
    if (roleIds.includes('admin')) return true
    if (!item.roles || item.roles.length === 0) return true
    return item.roles.some((role) => roleIds.includes(role))
  })
  const activities = sortByCreatedAtDesc(toArray(data?.activities))

  const todayOrders = orders.filter((order) => isSameCalendarDay(order.createdAt))
  const todayPurchases = purchases.filter((purchase) => isSameCalendarDay(purchase.createdAt))
  const todaySales = todayOrders.reduce((total, order) => total + order.total, 0)
  const todayPurchase = todayPurchases.reduce((total, purchase) => total + purchase.total, 0)
  const todayCost = todayOrders.reduce(
    (total, order) =>
      total +
      order.items.reduce((sum, item) => {
        return sum + item.purchasePrice * item.quantity
      }, 0),
    0
  )
  const lowStock = products.filter((product) => product.stockQty <= product.minStock)
  const topProducts = products
    .map((product) => {
      const sold = orders.reduce((sum, order) => {
        const item = order.items.find((entry) => entry.productId === product.id)
        return sum + (item?.quantity ?? 0)
      }, 0)

      return {
        id: product.id,
        name: product.name,
        stockQty: product.stockQty,
        sold,
        revenue: orders.reduce((sum, order) => {
          const item = order.items.find((entry) => entry.productId === product.id)
          return sum + (item ? item.unitPrice * item.quantity : 0)
        }, 0),
      }
    })
    .sort((left, right) => right.sold - left.sold)
    .slice(0, 5)

  const orderStatusCounts = orders.reduce<Record<string, number>>((result, order) => {
    result[order.status] = (result[order.status] ?? 0) + 1
    return result
  }, {})

  const monthlyRevenue = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() - (5 - index))
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString('en-BD', { month: 'short' })
    const monthOrders = orders.filter((order) => {
      const orderDate = new Date(order.createdAt)
      return `${orderDate.getFullYear()}-${orderDate.getMonth()}` === key
    })
    const revenue = monthOrders.reduce((sum, order) => sum + order.total, 0)
    const expense = purchases
      .filter((purchase) => {
        const purchaseDate = new Date(purchase.createdAt)
        return `${purchaseDate.getFullYear()}-${purchaseDate.getMonth()}` === key
      })
      .reduce((sum, purchase) => sum + purchase.total, 0)

    return {
      month: label,
      revenue,
      expense,
      orders: monthOrders.length,
    }
  })

  return {
    metrics: {
      todaySales,
      todayPurchase,
      todayProfit: todaySales - todayCost,
      todayExpense: todayPurchase,
      pendingDelivery: orders.filter((order) => ['pending', 'ready'].includes(order.status)).length,
      pendingPayment: orders.filter((order) => order.due > 0).length,
      todaysOrders: todayOrders.length,
      lowStockCount: lowStock.length,
      activeWarrantyClaims: tasks.filter((task) => task.module === 'support' && task.status !== 'done').length,
    },
    topProducts,
    orderStatusCounts,
    lowStock,
    notifications,
    activities,
    monthlyRevenue,
  }
}

export const REVENUE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
] as const

export type RevenueRange = (typeof REVENUE_RANGE_OPTIONS)[number]['value']

export function revenueRangeStartDate(range: RevenueRange) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)

  if (range === '7d') date.setDate(date.getDate() - 6)
  else if (range === '30d') date.setDate(date.getDate() - 29)
  else if (range === '3m') date.setMonth(date.getMonth() - 3)
  else if (range === '12m') date.setMonth(date.getMonth() - 12)
  else date.setMonth(date.getMonth() - 6)

  return date
}

export function buildCategoryRevenue(data: ERPData | null, range: RevenueRange) {
  const orders = toArray(data?.orders)
  const products = toArray(data?.products)
  const categoryByProductId = new Map(products.map((product) => [product.id, product.category || 'Uncategorized']))
  const start = revenueRangeStartDate(range)

  const totals = orders
    .filter((order) => new Date(order.createdAt) >= start)
    .reduce<Record<string, number>>((result, order) => {
      order.items.forEach((item) => {
        const category = categoryByProductId.get(item.productId) ?? 'Uncategorized'
        result[category] = (result[category] ?? 0) + item.unitPrice * item.quantity
      })
      return result
    }, {})

  return Object.entries(totals)
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8)
}

export function buildPaymentStatusCounts(data: ERPData | null) {
  const orders = toArray(data?.orders)

  return orders.reduce<Record<string, number>>((result, order) => {
    result[order.paymentStatus] = (result[order.paymentStatus] ?? 0) + 1
    return result
  }, {})
}

export function buildRevenueSeries(data: ERPData | null, range: RevenueRange) {
  const orders = toArray(data?.orders)
  const purchases = toArray(data?.purchases)

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30
    return Array.from({ length: days }).map((_, index) => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (days - 1 - index))
      const key = date.toDateString()
      const label = date.toLocaleDateString('en-BD', { day: 'numeric', month: 'short' })

      const dayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === key)
      const dayPurchases = purchases.filter((purchase) => new Date(purchase.createdAt).toDateString() === key)

      return {
        month: label,
        revenue: dayOrders.reduce((sum, order) => sum + order.total, 0),
        expense: dayPurchases.reduce((sum, purchase) => sum + purchase.total, 0),
        orders: dayOrders.length,
      }
    })
  }

  const months = range === '3m' ? 3 : range === '12m' ? 12 : 6
  return Array.from({ length: months }).map((_, index) => {
    const date = new Date()
    date.setMonth(date.getMonth() - (months - 1 - index))
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString('en-BD', { month: 'short', year: months > 6 ? '2-digit' : undefined })

    const monthOrders = orders.filter((order) => {
      const orderDate = new Date(order.createdAt)
      return `${orderDate.getFullYear()}-${orderDate.getMonth()}` === key
    })
    const monthPurchases = purchases.filter((purchase) => {
      const purchaseDate = new Date(purchase.createdAt)
      return `${purchaseDate.getFullYear()}-${purchaseDate.getMonth()}` === key
    })

    return {
      month: label,
      revenue: monthOrders.reduce((sum, order) => sum + order.total, 0),
      expense: monthPurchases.reduce((sum, purchase) => sum + purchase.total, 0),
      orders: monthOrders.length,
    }
  })
}

export function buildUserReport(data: ERPData | null) {
  const users = toArray(data?.users)
  const orders = toArray(data?.orders)

  return users.map((user) => {
    const userOrders = orders.filter((order) => order.salesPersonId === user.id)

    return {
      id: user.id,
      name: user.name,
      role: userRoleNames(data?.roles, user),
      totalOrders: userOrders.length,
      pendingOrders: userOrders.filter((order) => order.status === 'pending').length,
      completedOrders: userOrders.filter((order) => order.status === 'completed').length,
      revenue: userOrders.reduce((sum, order) => sum + order.total, 0),
      due: userOrders.reduce((sum, order) => sum + order.due, 0),
    }
  })
}

export function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

export function computeCustomerTotals(data: ERPData | null) {
  const orders = toArray(data?.orders)

  return orders.reduce<Record<string, number>>((totals, order) => {
    totals[order.customerId] = (totals[order.customerId] ?? 0) + order.total
    return totals
  }, {})
}

export type SupplierPayable = {
  openingDue: number
  purchaseTotal: number
  paid: number
  pendingPayment: number
  /** Opening due + purchases - approved payments. Negative means we paid in advance. */
  payable: number
}

/** What the company owes each supplier, keyed by supplier id. Only approved payments reduce it. */
export function computeSupplierPayables(data: ERPData | null) {
  const payables: Record<string, SupplierPayable> = {}
  const entry = (supplierId: string) =>
    (payables[supplierId] ??= {
      openingDue: data?.suppliers[supplierId]?.openingDue ?? 0,
      purchaseTotal: 0,
      paid: 0,
      pendingPayment: 0,
      payable: 0,
    })

  toArray(data?.suppliers).forEach((supplier) => entry(supplier.id))
  toArray(data?.purchases).forEach((purchase) => {
    entry(purchase.supplierId).purchaseTotal += purchase.total
  })
  toArray(data?.supplierPayments).forEach((payment) => {
    if (payment.status === 'approved') entry(payment.supplierId).paid += payment.amount
    if (payment.status === 'pending') entry(payment.supplierId).pendingPayment += payment.amount
  })
  Object.values(payables).forEach((row) => {
    row.payable = row.openingDue + row.purchaseTotal - row.paid
  })

  return payables
}

export async function exportXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}

export async function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: rows.length && headers.length > 6 ? 'landscape' : 'portrait' })

  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((value) => String(value))),
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.save(filename)
}

export function notificationToneClass(notification: NotificationRecord) {
  if (notification.level === 'critical') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
  }

  if (notification.level === 'warning') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
}

export function activitySummary(activity: ActivityRecord) {
  return `${activity.userName} · ${activity.message}`
}

export function getReadableOrderState(order: OrderRecord) {
  return order.status.replace('-', ' ')
}

// ---- Employee / Sales Target / Salary helpers ----

export const DEFAULT_PROBATION_MONTHS = 2
export const DEFAULT_MONTHLY_UNIT_TARGET = 300
export const DEFAULT_MONTHLY_AMOUNT_TARGET = 4_100_000
export const DEFAULT_COMMISSION_PER_UNIT = 30
export const TARGET_ACHIEVEMENT_HOLD_THRESHOLD = 80

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** A local calendar day as `YYYY-MM-DD`, the key attendance is stored under. */
export function dayKey(date = new Date()) {
  return `${currentMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

/** Every day of a `YYYY-MM` month as `dayKey`s. */
export function monthDayKeys(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return []
  const days = new Date(year, monthNumber, 0).getDate()
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

/** An employee's attendance for a month and the DA it earns: present days × their DA per day. */
export function monthlyAttendance(attendance: ERPData['attendance'] | undefined, employee: Pick<EmployeeRecord, 'id' | 'daPerDay'>, month: string) {
  let present = 0
  let absent = 0
  for (const day of monthDayKeys(month)) {
    const status = attendance?.[day]?.[employee.id]?.status
    if (status === 'present') present += 1
    if (status === 'absent') absent += 1
  }
  return { present, absent, daAmount: present * (employee.daPerDay ?? 0) }
}

export function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return new Intl.DateTimeFormat('en-BD', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1)
  )
}

export function getRecentMonthKeys(count = 6, now = new Date()) {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return currentMonthKey(date)
  })
}

export function addMonthsToDate(date: Date, months: number) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

export type ProbationStatus = {
  confirmationStatus: 'probation' | 'confirmed'
  probationEndDate: Date
  daysRemaining: number
}

/** Confirmation status is always derived from joining date + probation length — never stored, so it auto-flips the moment probation ends. */
export function getProbationStatus(employee: Pick<EmployeeRecord, 'joiningDate' | 'probationMonths'>, now = new Date()): ProbationStatus {
  const joiningDate = new Date(employee.joiningDate)
  const probationEndDate = addMonthsToDate(joiningDate, employee.probationMonths ?? DEFAULT_PROBATION_MONTHS)
  const msRemaining = probationEndDate.getTime() - now.getTime()
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))

  return {
    confirmationStatus: msRemaining <= 0 ? 'confirmed' : 'probation',
    probationEndDate,
    daysRemaining: Math.max(daysRemaining, 0),
  }
}

export function employmentStatusLabel(status: EmploymentStatus) {
  if (status === 'resigned') return 'Resigned'
  if (status === 'terminated') return 'Terminated'
  return 'Active'
}

/** Achievement counts the employee's better route to target, since the target is "300 units OR BDT 4,100,000". */
export function getTargetAchievement(target: Pick<SalesTargetRecord, 'unitsSold' | 'unitTarget' | 'amountSold' | 'amountTarget'>) {
  const unitProgress = target.unitTarget > 0 ? target.unitsSold / target.unitTarget : 0
  const amountProgress = target.amountTarget > 0 ? target.amountSold / target.amountTarget : 0
  const achievementRatio = Math.max(unitProgress, amountProgress)

  return {
    achievementPercent: Math.round(achievementRatio * 1000) / 10,
    progressPercent: Math.min(Math.round(achievementRatio * 1000) / 10, 100),
    unitProgressPercent: Math.min(Math.round(unitProgress * 1000) / 10, 100),
    amountProgressPercent: Math.min(Math.round(amountProgress * 1000) / 10, 100),
  }
}

export function getSalaryHoldStatus(achievementPercent: number): SalaryHoldStatus {
  return achievementPercent >= TARGET_ACHIEVEMENT_HOLD_THRESHOLD ? 'released' : 'hold'
}

export function computeCommission(unitsSold: number, commissionPerUnit: number) {
  return Math.max(unitsSold, 0) * Math.max(commissionPerUnit, 0)
}

export type SalaryFigureOptions = {
  /** Advances taken during the month, deducted from the pay. */
  advanceAmount?: number
  /** The owner approved commission although the target was missed. */
  ownerAuthorized?: boolean
}

/**
 * A month's pay. Commission is earned per unit sold, but only paid when the employee reached
 * 80% of their target (or the owner authorized it), and then only for the share of their sales
 * they collected the money for. Advances taken during the month come off the net pay.
 */
export function computeSalaryFigures(
  employee: Pick<EmployeeRecord, 'baseSalary' | 'commissionPerUnit'> &
    Partial<Pick<EmployeeRecord, 'taDa' | 'houseRent' | 'mobileBill'>>,
  target: (Pick<SalesTargetRecord, 'unitsSold' | 'unitTarget' | 'amountSold' | 'amountTarget'> & { amountCollected?: number }) | null,
  options: SalaryFigureOptions = {}
) {
  const unitsSold = target?.unitsSold ?? 0
  const amountSold = target?.amountSold ?? 0
  const amountCollected = Math.max(target?.amountCollected ?? 0, 0)
  const { achievementPercent } = target
    ? getTargetAchievement(target)
    : { achievementPercent: 0 }
  const commissionEarned = computeCommission(unitsSold, employee.commissionPerUnit)
  const targetReached = achievementPercent >= TARGET_ACHIEVEMENT_HOLD_THRESHOLD
  const ownerAuthorized = !targetReached && Boolean(options.ownerAuthorized)
  const commissionEligible = targetReached || ownerAuthorized
  // Sales recorded without an amount have nothing to collect.
  const collectionRatio = amountSold > 0 ? Math.min(amountCollected / amountSold, 1) : 1
  const commissionAmount = commissionEligible ? Math.round(commissionEarned * collectionRatio) : 0
  const holdStatus: SalaryHoldStatus = commissionEligible ? 'released' : 'hold'
  const allowances = (employee.taDa ?? 0) + (employee.houseRent ?? 0) + (employee.mobileBill ?? 0)
  const fixedPay = employee.baseSalary + allowances
  const grossPayable = fixedPay + commissionAmount
  const advanceAmount = Math.max(options.advanceAmount ?? 0, 0)
  const netPayable = Math.max(grossPayable - advanceAmount, 0)

  return {
    unitsSold,
    amountSold,
    amountCollected,
    collectionPercent: Math.round(collectionRatio * 1000) / 10,
    achievementPercent,
    commissionEarned,
    commissionEligible,
    ownerAuthorized,
    commissionAmount,
    holdStatus,
    fixedPay,
    grossPayable,
    advanceAmount,
    netPayable,
  }
}

/** Everything about one employee's pay for a month, worked out from the live records. */
export function computeMonthlyPay(
  data: Pick<ERPData, 'salesTargets' | 'salaries' | 'employeeAdvances' | 'commissionAuthorizations'> | null | undefined,
  employee: EmployeeRecord,
  month: string
) {
  const target = Object.values(data?.salesTargets ?? {}).find((entry) => entry.employeeId === employee.id && entry.month === month) ?? null
  const salary = Object.values(data?.salaries ?? {}).find((entry) => entry.employeeId === employee.id && entry.month === month) ?? null
  const advances = Object.values(data?.employeeAdvances ?? {})
    .filter((advance) => advance.employeeId === employee.id && advance.month === month)
    .sort((left, right) => left.date.localeCompare(right.date))
  const authorizations = Object.values(data?.commissionAuthorizations ?? {})
    .filter((request) => request.employeeId === employee.id && request.month === month)
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
  const authorization = authorizations.find((request) => request.status === 'approved') ?? authorizations[0] ?? null
  const figures = computeSalaryFigures(employee, target, {
    advanceAmount: advances.reduce((sum, advance) => sum + advance.amount, 0),
    ownerAuthorized: authorization?.status === 'approved',
  })
  const paidAmount = salary?.paidAmount ?? 0
  const dueAmount = Math.max(figures.netPayable - paidAmount, 0)
  const paymentStatus: SalaryRecord['paymentStatus'] = dueAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
  const paid = paidByKind(salary?.payments ?? [])
  // Advances come off the salary first; whatever they exceed comes off the commission.
  const salaryPayable = Math.max(figures.fixedPay - figures.advanceAmount, 0)
  const commissionPayable = Math.max(figures.netPayable - salaryPayable, 0)

  return {
    ...figures,
    month,
    target,
    salary,
    advances,
    authorization,
    unitTarget: target?.unitTarget ?? employee.monthlyUnitTarget,
    amountTarget: target?.amountTarget ?? employee.monthlyAmountTarget,
    paidAmount,
    dueAmount,
    paymentStatus,
    payments: salary?.payments ?? [],
    salaryPayable,
    commissionPayable,
    salaryDue: Math.max(salaryPayable - paid.salary, 0),
    commissionDue: Math.max(commissionPayable - paid.commission, 0),
    schedule: payrollSchedule(month),
  }
}

/** The month after `month` (`YYYY-MM`). */
function nextMonthKey(month: string) {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(year, value, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Commission and the like are paid between these days of the month after it was earned. */
export const COMMISSION_PAY_WINDOW = { from: 16, to: 20 }

/**
 * When a payroll month is paid: the salary at the start of the next month, commission (and
 * the like) on the 16th–20th of the next month. Dates are `YYYY-MM-DD`.
 */
export function payrollSchedule(month: string) {
  const next = nextMonthKey(month)
  const day = (value: number) => `${next}-${String(value).padStart(2, '0')}`
  return { salaryDate: day(1), commissionFrom: day(COMMISSION_PAY_WINDOW.from), commissionTo: day(COMMISSION_PAY_WINDOW.to) }
}

/** Whether `date` (`YYYY-MM-DD`) falls in the commission window of `month`. */
export function inCommissionWindow(month: string, date: string) {
  const { commissionFrom, commissionTo } = payrollSchedule(month)
  return date >= commissionFrom && date <= commissionTo
}

/** A month's payments split into what went to salary and what went to commission. */
export function paidByKind(payments: SalaryPaymentEntry[]) {
  return payments.reduce(
    (totals, payment) => {
      if (payment.kind === 'commission') totals.commission += payment.amount
      else totals.salary += payment.amount
      return totals
    },
    { salary: 0, commission: 0 }
  )
}

export const EMPLOYEE_CODE_PREFIX = 'PIL-EMP-'

/** The next staff id after the highest one given so far: PIL-EMP-0001, PIL-EMP-0002, ... */
export function nextEmployeeCode(employees: Array<Pick<EmployeeRecord, 'employeeCode'>>) {
  const highest = employees.reduce((max, employee) => {
    const match = employee.employeeCode?.match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${EMPLOYEE_CODE_PREFIX}${String(highest + 1).padStart(4, '0')}`
}

/** The owner decides on commission requests; an admin can act for the owner. */
export function canAuthorizeCommission(user: Pick<UserRecord, 'roleId' | 'extraRoleIds'> | null | undefined) {
  if (!user) return false
  const roles = userRoleIds(user)
  return roles.includes('owner') || roles.includes('admin')
}

export type ApprovalStage = 'authorizer' | 'chairman'

/**
 * Deposits and order-form orders go to the zone's Authorizer first and, once accepted, to the
 * Chairman for final approval. `null` once the record is approved or rejected.
 */
export function approvalStage(record: { status?: string; authorizedAt?: string }): ApprovalStage | null {
  if (record.status !== 'pending') return null
  return record.authorizedAt ? 'chairman' : 'authorizer'
}

/** Whether the user may act at that approval stage. An admin can act at either stage. */
export function canActAtStage(user: Pick<UserRecord, 'roleId' | 'extraRoleIds'> | null | undefined, stage: ApprovalStage | null) {
  if (!user || !stage) return false
  const roles = userRoleIds(user)
  return roles.includes('admin') || roles.includes(stage)
}

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  authorizer: 'Waiting for Authorizer',
  chairman: 'Waiting for Chairman',
}
