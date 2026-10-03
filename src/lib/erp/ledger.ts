import { computeMonthlyPay, currentMonthKey, formatMonthLabel, payrollSchedule } from './utils'
import type {
  CreditLedgerEntryRecord,
  EmployeeRecord,
  ERPData,
  OrderRecord,
  ProductRecord,
  PurchaseRecord,
  ReplacementRecord,
  ReplacementReturnRecord,
  SupplierPaymentRecord,
} from './types'

/**
 * One line of a dealer's or supplier's sheet. Credit is goods given (or received from a
 * supplier) and charges, which raise the balance; debit is money paid, which lowers it.
 */
export type LedgerRow = {
  id: string
  /** The bill (invoice) number the line belongs to; empty for lines without a bill. */
  billNumber: string
  date: string
  particulars: string
  qty: number | null
  unitPrice: number | null
  debit: number
  credit: number
  /** A hand-written ledger entry, which staff may delete. */
  removable: boolean
  /** The submitted delivery document, on the first line of its order. */
  documentUrl?: string
}

export type LedgerRowWithBalance = LedgerRow & { balance: number }

export type LedgerTotals = { qty: number; debit: number; credit: number; balance: number }

/** A dealer's sheet: bills and payments on orders, plus hand-written ledger entries, oldest first. */
export function buildCustomerLedger(customerId: string, orders: OrderRecord[], entries: CreditLedgerEntryRecord[]): LedgerRow[] {
  const rows: LedgerRow[] = []

  for (const order of orders.filter((entry) => entry.customerId === customerId)) {
    ;(order.items ?? []).forEach((item, index) => {
      rows.push({
        id: `${order.id}-${item.productId}`,
        billNumber: order.billNumber ?? '',
        date: order.createdAt,
        particulars: item.productName,
        qty: item.quantity,
        unitPrice: item.unitPrice,
        debit: 0,
        credit: item.quantity * item.unitPrice,
        removable: false,
        documentUrl: index === 0 && order.delivery?.status === 'submitted' ? order.delivery.documentUrl : undefined,
      })
    })
    if (order.paid > 0) {
      rows.push({
        id: `${order.id}-payment`,
        billNumber: order.billNumber ?? '',
        date: order.createdAt,
        particulars: `Payment received (${order.billNumber})`,
        qty: null,
        unitPrice: null,
        debit: order.paid,
        credit: 0,
        removable: false,
      })
    }
  }

  for (const entry of entries.filter((item) => item.customerId === customerId)) {
    rows.push({
      id: entry.id,
      billNumber: '',
      date: entry.date,
      particulars: entry.particulars,
      qty: entry.qty || null,
      unitPrice: entry.unitPrice || null,
      debit: entry.debit,
      credit: entry.credit,
      removable: true,
    })
  }

  return rows.sort((left, right) => left.date.localeCompare(right.date))
}

/**
 * A supplier's sheet: what was owed before (opening due), goods received from them, and the
 * payments to them an admin approved. Its balance matches `computeSupplierPayables`.
 */
export function buildSupplierLedger(
  supplierId: string,
  purchases: PurchaseRecord[],
  payments: SupplierPaymentRecord[],
  opening?: { amount: number; date: string }
): LedgerRow[] {
  const rows: LedgerRow[] = []

  for (const purchase of purchases.filter((entry) => entry.supplierId === supplierId)) {
    rows.push({
      id: purchase.id,
      billNumber: '',
      date: purchase.createdAt,
      particulars: purchase.productName,
      qty: purchase.quantity,
      unitPrice: purchase.unitCost,
      debit: 0,
      credit: purchase.total,
      removable: false,
    })
  }

  for (const payment of payments.filter((entry) => entry.supplierId === supplierId && entry.status === 'approved')) {
    rows.push({
      id: payment.id,
      billNumber: '',
      date: payment.date || payment.createdAt,
      particulars: [`Payment (${payment.method === 'bank' ? payment.sendingType || 'Bank' : 'Cash'})`, payment.purpose].filter(Boolean).join(' — '),
      qty: null,
      unitPrice: null,
      debit: payment.amount,
      credit: 0,
      removable: false,
    })
  }

  rows.sort((left, right) => left.date.localeCompare(right.date))
  if (opening && opening.amount > 0) {
    rows.unshift({
      id: `${supplierId}-opening`,
      billNumber: '',
      date: opening.date,
      particulars: 'Opening due',
      qty: null,
      unitPrice: null,
      debit: 0,
      credit: opening.amount,
      removable: false,
    })
  }
  return rows
}

export function withRunningBalance(rows: LedgerRow[]): LedgerRowWithBalance[] {
  let balance = 0
  return rows.map((row) => {
    balance += row.credit - row.debit
    return { ...row, balance }
  })
}

export function ledgerTotalsOf(rows: LedgerRowWithBalance[]): LedgerTotals {
  return {
    qty: rows.reduce((sum, row) => sum + (row.qty ?? 0), 0),
    debit: rows.reduce((sum, row) => sum + row.debit, 0),
    credit: rows.reduce((sum, row) => sum + row.credit, 0),
    balance: rows.length ? rows[rows.length - 1].balance : 0,
  }
}

/** The sheet's Dr/Cr mark for a running balance. */
export function balanceSide(balance: number) {
  return balance >= 0 ? 'Cr' : 'Dr'
}

/** One replacement (or the return of a replaced product) on a party's replacement history. */
export type ReplacementHistoryRow = {
  id: string
  type: 'replacement' | 'return'
  date: string
  customerName: string
  productName: string
  serialNumber: string
  details: string
  status: ReplacementRecord['status']
}

/**
 * Replacement history for a dealer (their own replacements and returns) or a supplier
 * (replacements of the products they supply), newest first.
 */
export function buildReplacementHistory(
  party: { kind: 'customer' | 'supplier'; id: string },
  replacements: ReplacementRecord[],
  returns: ReplacementReturnRecord[],
  products: Record<string, ProductRecord>
): ReplacementHistoryRow[] {
  const belongs = (record: { customerId: string; productId: string }) =>
    party.kind === 'customer' ? record.customerId === party.id : products[record.productId]?.supplierId === party.id

  const rows: ReplacementHistoryRow[] = [
    ...replacements.filter(belongs).map((record) => ({
      id: record.id,
      type: 'replacement' as const,
      date: record.createdAt,
      customerName: record.customerName,
      productName: record.productName,
      serialNumber: record.serialNumber,
      details: [record.problem, record.note].filter(Boolean).join(' — '),
      status: record.status,
    })),
    ...returns.filter(belongs).map((record) => ({
      id: record.id,
      type: 'return' as const,
      date: record.date || record.createdAt,
      customerName: record.customerName,
      productName: record.productName,
      serialNumber: '',
      details: record.note,
      status: record.status,
    })),
  ]

  return rows.sort((left, right) => right.date.localeCompare(left.date))
}

/** Payroll months from the employee's joining month up to (not including) `untilMonth`. */
function payrollMonths(joiningDate: string, untilMonth: string) {
  const months: string[] = []
  const start = /^\d{4}-\d{2}/.test(joiningDate) ? joiningDate.slice(0, 7) : untilMonth
  let [year, month] = start.split('-').map(Number)
  // A long-serving employee's sheet shows the last five years.
  for (let guard = 0; guard < 60; guard += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (key >= untilMonth) break
    months.push(key)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/**
 * An employee's sheet. Credit is pay the company owes them — each closed month's salary on the
 * 1st of the next month and its commission on the 16th; debit is what they were given —
 * payments and advances. The balance (Cr) is what is still owed to the employee.
 */
export function buildEmployeeLedger(
  employee: EmployeeRecord,
  data: Pick<ERPData, 'salesTargets' | 'salaries' | 'employeeAdvances' | 'commissionAuthorizations'>,
  untilMonth = currentMonthKey()
): LedgerRow[] {
  const rows: LedgerRow[] = []
  const line = (row: Omit<LedgerRow, 'billNumber' | 'qty' | 'unitPrice' | 'removable'>) =>
    rows.push({ ...row, billNumber: '', qty: null, unitPrice: null, removable: false })

  for (const month of payrollMonths(employee.joiningDate, untilMonth)) {
    const pay = computeMonthlyPay(data, employee, month)
    const schedule = payrollSchedule(month)
    if (pay.fixedPay > 0) {
      line({ id: `${month}-salary`, date: schedule.salaryDate, particulars: `Salary — ${formatMonthLabel(month)}`, debit: 0, credit: pay.fixedPay })
    }
    if (pay.commissionAmount > 0) {
      line({
        id: `${month}-commission`,
        date: schedule.commissionFrom,
        particulars: `Commission — ${formatMonthLabel(month)} (${pay.unitsSold} units)`,
        debit: 0,
        credit: pay.commissionAmount,
      })
    }
  }

  for (const advance of Object.values(data.employeeAdvances ?? {}).filter((item) => item.employeeId === employee.id)) {
    line({ id: advance.id, date: advance.date, particulars: `Advance${advance.note ? ` — ${advance.note}` : ''}`, debit: advance.amount, credit: 0 })
  }

  for (const salary of Object.values(data.salaries ?? {}).filter((item) => item.employeeId === employee.id)) {
    for (const payment of salary.payments ?? []) {
      line({
        id: payment.id,
        date: payment.paidAt,
        particulars: `${payment.kind === 'commission' ? 'Commission' : 'Salary'} paid — ${formatMonthLabel(salary.month)} (${payment.method})`,
        debit: payment.amount,
        credit: 0,
      })
    }
  }

  return rows.sort((left, right) => left.date.localeCompare(right.date))
}

/** One line of the replacement sheet: a replacement sent (raises what the dealer must return) or a faulty piece returned. */
export type ReplacementSheetRow = {
  id: string
  type: 'replacement' | 'return'
  date: string
  courierName: string
  customerId: string
  customerName: string
  productName: string
  qty: number
  problem: string
  /** Pieces the dealer had to return, counting this replacement. */
  totalReturnable: number
  /** Pieces returned on this line. */
  returned: number
  /** Pieces still to be returned after this line. */
  nowReturnable: number
}

/**
 * The replacement sheet: every approved replacement and return, oldest first, with each
 * dealer's running count of faulty pieces they still have to send back.
 */
export function buildReplacementSheet(replacements: ReplacementRecord[], returns: ReplacementReturnRecord[]): ReplacementSheetRow[] {
  const lines = [
    ...replacements
      .filter((record) => record.status === 'approved')
      .map((record) => ({
        id: record.id,
        type: 'replacement' as const,
        date: record.reviewedAt || record.createdAt,
        courierName: record.courierName ?? '',
        customerId: record.customerId,
        customerName: record.customerName,
        productName: record.productName,
        qty: record.quantity ?? 1,
        problem: record.problem,
      })),
    ...returns
      .filter((record) => record.status === 'approved')
      .map((record) => ({
        id: record.id,
        type: 'return' as const,
        date: record.date || record.createdAt,
        courierName: record.courierName ?? '',
        customerId: record.customerId,
        customerName: record.customerName,
        productName: record.productName,
        qty: record.quantity ?? 1,
        problem: record.note,
      })),
  ].sort((left, right) => left.date.localeCompare(right.date))

  const outstanding = new Map<string, number>()
  return lines.map((line) => {
    const before = outstanding.get(line.customerId) ?? 0
    const totalReturnable = line.type === 'replacement' ? before + line.qty : before
    const returned = line.type === 'return' ? line.qty : 0
    const nowReturnable = Math.max(totalReturnable - returned, 0)
    outstanding.set(line.customerId, nowReturnable)
    return { ...line, totalReturnable, returned, nowReturnable }
  })
}
