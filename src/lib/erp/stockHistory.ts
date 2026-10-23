import { endAt, endBefore, get, limitToLast, orderByChild, query, ref, startAt } from 'firebase/database'

import { database } from '@/lib/firebase/config'

import type { StockMovementRecord, StockMovementType } from './types'

/**
 * The stock history lives at `stockMovements`, outside `erp`, so it is not loaded with the rest of
 * the data: it is read here, a page at a time, only when a screen showing it is open. Rows are
 * written by `planStockMoves` (src/lib/erp/stock.ts) in the same update as the stock change.
 */
export const STOCK_HISTORY_PATH = 'stockMovements'

export const STOCK_MOVEMENT_TYPES: Record<StockMovementType, string> = {
  starting_balance: 'Starting balance',
  purchase: 'Purchase',
  opening: 'Opening stock',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  sale: 'Sale',
  return: 'Return',
  adjustment: 'Adjustment',
  damage: 'Damage',
}

/** Empty strings mean "any"; `from` and `to` are `YYYY-MM-DD`, both included. */
export type StockHistoryFilter = {
  productId: string
  warehouseId: string
  type: StockMovementType | ''
  from: string
  to: string
}

/** Where the next (older) page starts: the oldest row read so far, by its index value and key. */
export type StockHistoryCursor = { value: string; key: string }

/** Rows read per query. A page shown may hold more, when filters left some out. */
const QUERY_SIZE = 100

/**
 * The index that serves the filter, and its range. One product's or one warehouse's rows are read
 * in date order through `productDay` / `warehouseDay` (`id|YYYY-MM-DD`); the rest is filtered here.
 * Rows of the same day come in key order, which is the order they were written.
 */
function indexFor(filter: StockHistoryFilter) {
  const from = filter.from || '0000-00-00'
  const to = filter.to || '9999-99-99'
  if (filter.productId) return { field: 'productDay' as const, low: `${filter.productId}|${from}`, high: `${filter.productId}|${to}` }
  if (filter.warehouseId) return { field: 'warehouseDay' as const, low: `${filter.warehouseId}|${from}`, high: `${filter.warehouseId}|${to}` }
  return { field: 'date' as const, low: from, high: to }
}

function matches(row: StockMovementRecord, filter: StockHistoryFilter) {
  return (
    (!filter.productId || row.productId === filter.productId) &&
    (!filter.warehouseId || row.warehouseId === filter.warehouseId) &&
    (!filter.type || row.type === filter.type) &&
    (!filter.from || row.date >= filter.from) &&
    (!filter.to || row.date <= filter.to)
  )
}

/**
 * One page of the history, newest first, starting below `after` (or at the newest row). `next` is
 * null once there is nothing older in the range.
 */
export async function fetchStockHistory(
  filter: StockHistoryFilter,
  after: StockHistoryCursor | null,
  pageSize = 50
): Promise<{ rows: StockMovementRecord[]; next: StockHistoryCursor | null }> {
  if (!database) {
    throw new Error('Firebase Realtime Database is only available in the browser.')
  }
  const index = indexFor(filter)
  const rows: StockMovementRecord[] = []
  let cursor = after
  for (;;) {
    const snapshot = await get(
      query(
        ref(database, STOCK_HISTORY_PATH),
        orderByChild(index.field),
        startAt(index.low),
        cursor ? endBefore(cursor.value, cursor.key) : endAt(index.high),
        limitToLast(QUERY_SIZE)
      )
    )
    const batch: StockMovementRecord[] = []
    snapshot.forEach((child) => {
      batch.push({ ...(child.val() as StockMovementRecord), id: child.key ?? '' })
    })
    batch.reverse()
    rows.push(...batch.filter((row) => matches(row, filter)))
    if (batch.length < QUERY_SIZE) return { rows, next: null }
    const oldest = batch[batch.length - 1]
    cursor = { value: oldest[index.field], key: oldest.id }
    if (rows.length >= pageSize) return { rows, next: cursor }
  }
}

/** Every row the filter matches, newest first, for the Excel export. */
export async function fetchAllStockHistory(filter: StockHistoryFilter) {
  const rows: StockMovementRecord[] = []
  let cursor: StockHistoryCursor | null = null
  do {
    const page: Awaited<ReturnType<typeof fetchStockHistory>> = await fetchStockHistory(filter, cursor, 1000)
    rows.push(...page.rows)
    cursor = page.next
  } while (cursor)
  return rows
}
