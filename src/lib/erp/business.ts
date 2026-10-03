import type { BusinessEntryKind, BusinessEntryRecord, BusinessRecord } from './types'

export const BUSINESS_ENTRY_LABELS: Record<BusinessEntryKind, string> = {
  capital: 'Capital in',
  stock_purchase: 'Stock purchase',
  sale: 'Sale',
  deposit: 'Deposit received',
  payment: 'Payment made',
  expense: 'Expense',
  withdrawal: 'Owner withdrawal',
  stock_adjustment: 'Stock adjustment',
}

/** What each kind asks for on the entry form. */
export const BUSINESS_ENTRY_HELP: Record<BusinessEntryKind, string> = {
  capital: 'Cash the owner puts into the business.',
  stock_purchase: 'Goods bought. Amount: cash paid now. Stock value: what the goods are worth.',
  sale: 'Goods sold. Amount: cash received. Stock value: what the sold goods cost.',
  deposit: 'Money received from a client or party.',
  payment: 'Money paid to a supplier or other party.',
  expense: 'Rent, salaries, transport and other running costs.',
  withdrawal: 'Cash the owner takes out.',
  stock_adjustment: 'Correct the stock value (damage, count difference). Use a negative amount to reduce it.',
}

/** How an entry moves cash and stock value. */
export function entryEffect(entry: Pick<BusinessEntryRecord, 'kind' | 'amount' | 'stockValue'>) {
  switch (entry.kind) {
    case 'capital':
    case 'deposit':
      return { cash: entry.amount, stock: 0 }
    case 'payment':
    case 'expense':
    case 'withdrawal':
      return { cash: -entry.amount, stock: 0 }
    case 'stock_purchase':
      return { cash: -entry.amount, stock: entry.stockValue }
    case 'sale':
      return { cash: entry.amount, stock: -entry.stockValue }
    case 'stock_adjustment':
      return { cash: 0, stock: entry.amount }
  }
}

export type BusinessBalanceSheet = {
  stockValue: number
  cash: number
  /** Stock value + cash: what the business holds. */
  totalAssets: number
  capital: number
  deposits: number
  payments: number
  expenses: number
  withdrawals: number
  purchases: number
  sales: number
  /** Sales less the cost of the goods sold. */
  grossProfit: number
  /** Gross profit less expenses. */
  netProfit: number
}

/** The balance sheet of a sub business up to `asOf` (inclusive), from its approved entries. */
export function businessBalanceSheet(business: BusinessRecord, entries: BusinessEntryRecord[], asOf?: string): BusinessBalanceSheet {
  const booked = entries.filter(
    (entry) => entry.businessId === business.id && entry.status === 'approved' && (!asOf || entry.date.slice(0, 10) <= asOf)
  )
  const sum = (kind: BusinessEntryKind, field: 'amount' | 'stockValue' = 'amount') =>
    booked.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry[field], 0)

  let cash = business.openingCash
  let stockValue = business.openingStockValue
  for (const entry of booked) {
    const effect = entryEffect(entry)
    cash += effect.cash
    stockValue += effect.stock
  }

  const sales = sum('sale')
  const costOfSales = sum('sale', 'stockValue')
  const expenses = sum('expense')
  const grossProfit = sales - costOfSales

  return {
    stockValue,
    cash,
    totalAssets: stockValue + cash,
    capital: business.openingCash + business.openingStockValue + sum('capital'),
    deposits: sum('deposit'),
    payments: sum('payment'),
    expenses,
    withdrawals: sum('withdrawal'),
    purchases: sum('stock_purchase', 'stockValue'),
    sales,
    grossProfit,
    netProfit: grossProfit - expenses,
  }
}

/** The business's day book: approved entries, oldest first, with running cash and stock value. */
export function businessDayBook(business: BusinessRecord, entries: BusinessEntryRecord[]) {
  let cash = business.openingCash
  let stock = business.openingStockValue
  return entries
    .filter((entry) => entry.businessId === business.id && entry.status === 'approved')
    .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
    .map((entry) => {
      const effect = entryEffect(entry)
      cash += effect.cash
      stock += effect.stock
      return { entry, cashIn: Math.max(effect.cash, 0), cashOut: Math.max(-effect.cash, 0), stockChange: effect.stock, cash, stock }
    })
}
