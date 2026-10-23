import { increment } from 'firebase/database'

import type { ProductRecord, StockAdjustmentReason, StockMovementRecord, StockMovementType, WarehouseQty, WarehouseRecord } from './types'
import { getProductStatus } from './utils'

/**
 * Stock is kept per warehouse. For each product:
 * - `stockByWarehouse[w]`: units on the shelf in warehouse `w`;
 * - `reservedQty`: units in approved orders not yet posted for delivery (sold, still on a shelf);
 * - `stockQty`: units that can still be sold, `sum(stockByWarehouse) − reservedQty`.
 *
 * Every change to any of them is a `StockMove`, turned into one database update by
 * `planStockMoves`, which also writes the stock history: one `StockMovementRecord` for each move
 * that changes a warehouse's count.
 */
export type StockMoveKind =
  /** A received purchase, into a warehouse. */
  | 'purchase'
  /** A new product's opening stock, into a warehouse. */
  | 'opening'
  /** A count correction, damage, loss or other change by hand, + or −. */
  | 'adjustment'
  | 'transfer_out'
  | 'transfer_in'
  /** An order's final approval: held against the product's total, no warehouse yet. */
  | 'reserve'
  /** An order posted for delivery: leaves its warehouse, and is no longer held. */
  | 'delivery'
  /**
   * A posted delivery moved to another warehouse: back into the one it was taken from and held for
   * the order again, followed by a `delivery` from the new one.
   */
  | 'delivery_reversed'
  /** An order called off before delivery: what it held can be sold again. */
  | 'release'

export const STOCK_ADJUSTMENT_REASONS: Record<StockAdjustmentReason, string> = {
  opening: 'Opening stock',
  count_correction: 'Count correction',
  damage: 'Damage',
  lost: 'Lost',
  other: 'Other',
}

export type StockMoveRef = { kind: 'purchase' | 'order' | 'transfer' | 'adjustment'; id: string; label: string }

export type StockMove = {
  kind: StockMoveKind
  productId: string
  /** The warehouse whose shelf count changes; empty for `reserve` and `release`. */
  warehouseId: string
  /** Change to the shelf count in `warehouseId`. */
  onHand: number
  /** Change to `reservedQty`. */
  reserved: number
  /** The business date of the movement (received date, delivery date…), not when it was approved. */
  date: string
  ref: StockMoveRef
  /** An adjustment's reason; a damage shows as such in the stock history. */
  reason?: StockAdjustmentReason
}

/**
 * One movement of `quantity` units. `quantity` is how many move, always positive, except for an
 * `adjustment`, which is the signed change.
 */
export function stockMove(
  kind: StockMoveKind,
  productId: string,
  quantity: number,
  options: { warehouseId?: string; date: string; ref: StockMoveRef; reason?: StockAdjustmentReason }
): StockMove {
  const effect: Record<StockMoveKind, { onHand: number; reserved: number }> = {
    purchase: { onHand: quantity, reserved: 0 },
    opening: { onHand: quantity, reserved: 0 },
    adjustment: { onHand: quantity, reserved: 0 },
    transfer_in: { onHand: quantity, reserved: 0 },
    delivery_reversed: { onHand: quantity, reserved: quantity },
    transfer_out: { onHand: -quantity, reserved: 0 },
    delivery: { onHand: -quantity, reserved: -quantity },
    reserve: { onHand: 0, reserved: quantity },
    release: { onHand: 0, reserved: -quantity },
  }
  const warehouseId = options.warehouseId ?? ''
  if (effect[kind].onHand && !warehouseId) {
    throw new Error(`A ${kind.replace('_', ' ')} needs a warehouse.`)
  }
  return { kind, productId, warehouseId, ...effect[kind], date: options.date, ref: options.ref, ...(options.reason ? { reason: options.reason } : {}) }
}

/** How a move shows in the stock history. `reserve` and `release` change no warehouse, so they have no row. */
function movementType(move: StockMove): StockMovementType {
  switch (move.kind) {
    case 'delivery':
      return 'sale'
    case 'delivery_reversed':
      return 'return'
    case 'adjustment':
      return move.reason === 'damage' ? 'damage' : 'adjustment'
    case 'reserve':
    case 'release':
      throw new Error(`A ${move.kind} changes no warehouse.`)
    default:
      return move.kind
  }
}

/** `YYYY-MM-DD` of a stored date in local time; a bare `YYYY-MM-DD` as it is. */
export function businessDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/**
 * Ids that sort in the order the rows were written (the history lists rows of the same day in key
 * order). scripts/stock-history-starting-balance.mjs makes the same shape.
 */
function movementId(time: number, sequence: number) {
  return `stockmove_${time}_${String(sequence).padStart(3, '0')}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Changes under `erp/` and stock history rows (kept outside `erp`) as one update at the database
 * root, so a stock change and its history are written together or not at all.
 */
export function withStockHistory(erpChanges: Record<string, unknown>, movements: Record<string, StockMovementRecord>) {
  const changes: Record<string, unknown> = {}
  Object.entries(erpChanges).forEach(([path, value]) => {
    changes[`erp/${path}`] = value
  })
  Object.entries(movements).forEach(([id, row]) => {
    changes[`stockMovements/${id}`] = row
  })
  return changes
}

/**
 * Units on the shelf in each warehouse. A product not yet migrated has no `stockByWarehouse`: its
 * shelf stock (`stockQty`, as nothing was reserved before) is all in its main warehouse.
 */
export function warehouseStock(product: Pick<ProductRecord, 'stockByWarehouse' | 'warehouseId' | 'stockQty' | 'reservedQty'>): Record<string, number> {
  if (product.stockByWarehouse) {
    return Object.fromEntries(Object.entries(product.stockByWarehouse).map(([id, qty]) => [id, Number(qty) || 0]))
  }
  const legacy = (product.stockQty ?? 0) + (product.reservedQty ?? 0)
  return product.warehouseId ? { [product.warehouseId]: legacy } : {}
}

/** Units of the product on the shelf in one warehouse. */
export function stockInWarehouse(product: Parameters<typeof warehouseStock>[0], warehouseId: string) {
  return warehouseStock(product)[warehouseId] ?? 0
}

/** Units on all shelves together, including those held for approved orders. */
export function onHandTotal(product: Parameters<typeof warehouseStock>[0]) {
  return Object.values(warehouseStock(product)).reduce((sum, qty) => sum + qty, 0)
}

/** The warehouses holding the product, largest first: `[{ id, name, quantity }]`, zero counts left out. */
export function warehouseSplit(product: Parameters<typeof warehouseStock>[0], warehouses: Record<string, WarehouseRecord> | undefined) {
  return Object.entries(warehouseStock(product))
    .filter(([, quantity]) => quantity !== 0)
    .map(([id, quantity]) => ({ id, name: warehouses?.[id]?.name ?? 'Unknown warehouse', quantity }))
    .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name))
}

/** "Dhaka 12 · Chattogram 8", or "" when the product has no stock anywhere. */
export function formatWarehouseSplit(product: Parameters<typeof warehouseStock>[0], warehouses: Record<string, WarehouseRecord> | undefined) {
  return warehouseSplit(product, warehouses)
    .map((entry) => `${entry.name} ${entry.quantity}`)
    .join(' · ')
}

/**
 * Checks a warehouse split (Warehouse | Qty rows) and names each warehouse. Rows must use distinct,
 * existing warehouses with a whole quantity; `positive` rejects zero and negative rows; `total`,
 * when given, is what the rows must add up to.
 */
export function resolveWarehouseLines(
  lines: Array<{ warehouseId: string; quantity: number }>,
  warehouses: Record<string, WarehouseRecord>,
  options: { positive: boolean; total?: number }
): WarehouseQty[] {
  if (!lines.length) {
    throw new Error('Add at least one warehouse.')
  }
  const seen = new Set<string>()
  const resolved = lines.map((line) => {
    const warehouse = warehouses[line.warehouseId]
    if (!warehouse) {
      throw new Error('Choose a warehouse on every row.')
    }
    if (seen.has(warehouse.id)) {
      throw new Error(`${warehouse.name} is on more than one row.`)
    }
    seen.add(warehouse.id)
    if (!Number.isInteger(line.quantity) || (options.positive ? line.quantity <= 0 : line.quantity === 0)) {
      throw new Error(`Enter a whole quantity${options.positive ? ' above zero' : ' other than zero'} for ${warehouse.name}.`)
    }
    return { warehouseId: warehouse.id, warehouseName: warehouse.name, quantity: line.quantity }
  })
  const sum = resolved.reduce((total, line) => total + line.quantity, 0)
  if (options.total !== undefined && sum !== options.total) {
    throw new Error(`The warehouses add up to ${sum}, but the quantity is ${options.total}.`)
  }
  return resolved
}

export type StockAfter = { stockQty: number; reservedQty: number; byWarehouse: Record<string, number> }

/**
 * Turns movements into one multi-path update under `erp/`, to be written together with whatever
 * caused them (the approval, the order, the delivery). Counts are `increment()`s, so stock moved by
 * someone else meanwhile is not overwritten.
 *
 * `movements` are the stock history rows, one per move that changes a warehouse's count, to be
 * written in the same update (`withStockHistory`). Reserve and release make none.
 *
 * Throws, before anything is written, when a move would take a warehouse below zero or the units
 * that can be sold below zero. Moves that only add are never refused.
 *
 * A product not yet migrated gets its warehouse counts written in full the first time (its old
 * single count goes to its main warehouse), so its total stays the same.
 *
 * `after` is each product's stock once the update lands, judged from the snapshot in `products`.
 */
export function planStockMoves(
  products: Record<string, ProductRecord>,
  moves: StockMove[],
  context: { now: string; warehouses: Record<string, WarehouseRecord>; by: { id: string; name: string } }
): { updates: Record<string, unknown>; after: Map<string, StockAfter>; movements: Record<string, StockMovementRecord> } {
  const updates: Record<string, unknown> = {}
  const after = new Map<string, StockAfter>()
  const movements: Record<string, StockMovementRecord> = {}
  const writtenAt = Date.parse(context.now) || Date.now()
  const byProduct = new Map<string, StockMove[]>()
  moves.forEach((move) => byProduct.set(move.productId, [...(byProduct.get(move.productId) ?? []), move]))
  const warehouseName = (id: string) => context.warehouses[id]?.name ?? 'that warehouse'

  byProduct.forEach((productMoves, productId) => {
    const product = products[productId]
    if (!product) {
      throw new Error('Product not found.')
    }
    const before = warehouseStock(product)
    const onHandDelta = new Map<string, number>()
    let reservedDelta = 0
    productMoves.forEach((move) => {
      if (move.onHand) onHandDelta.set(move.warehouseId, (onHandDelta.get(move.warehouseId) ?? 0) + move.onHand)
      reservedDelta += move.reserved
    })

    const byWarehouse = { ...before }
    onHandDelta.forEach((delta, warehouseId) => {
      const next = (before[warehouseId] ?? 0) + delta
      if (delta < 0 && next < 0) {
        throw new Error(`Only ${before[warehouseId] ?? 0} of ${product.name} in ${warehouseName(warehouseId)}.`)
      }
      byWarehouse[warehouseId] = next
    })
    const reservedQty = Math.max((product.reservedQty ?? 0) + reservedDelta, 0)
    const availableDelta = [...onHandDelta.values()].reduce((sum, delta) => sum + delta, 0) - reservedDelta
    const stockQty = product.stockQty + availableDelta
    if (availableDelta < 0 && stockQty < 0) {
      throw new Error(`Only ${product.stockQty} of ${product.name} available.`)
    }

    const path = `products/${productId}`
    if (onHandDelta.size) {
      if (product.stockByWarehouse) {
        onHandDelta.forEach((delta, warehouseId) => {
          if (delta) updates[`${path}/stockByWarehouse/${warehouseId}`] = increment(delta)
        })
      } else {
        // Not migrated yet: write every count in full, the main warehouse's included.
        Object.entries(byWarehouse).forEach(([warehouseId, qty]) => {
          updates[`${path}/stockByWarehouse/${warehouseId}`] = qty
        })
      }
    }
    if (reservedDelta) updates[`${path}/reservedQty`] = increment(reservedDelta)
    if (availableDelta) updates[`${path}/stockQty`] = increment(availableDelta)
    updates[`${path}/status`] = getProductStatus(stockQty, product.minStock)
    updates[`${path}/updatedAt`] = context.now

    // The balance is judged from this snapshot, like the checks above. The counts themselves are
    // increments, so they stay right if someone else moves the same stock at the same moment, but
    // then one of the two rows' balance misses the other's change. Accepted: it needs two people
    // moving the same product in the same warehouse within the same second.
    const running = { ...before }
    productMoves.forEach((move) => {
      if (!move.onHand) return
      running[move.warehouseId] = (running[move.warehouseId] ?? 0) + move.onHand
      const id = movementId(writtenAt, Object.keys(movements).length)
      const date = businessDay(move.date) || businessDay(context.now)
      movements[id] = {
        id,
        date,
        productId,
        productName: product.name,
        warehouseId: move.warehouseId,
        warehouseName: context.warehouses[move.warehouseId]?.name ?? '',
        type: movementType(move),
        change: move.onHand,
        balance: running[move.warehouseId],
        refKind: move.ref.kind,
        refId: move.ref.id,
        refLabel: move.ref.label,
        byId: context.by.id,
        byName: context.by.name,
        createdAt: context.now,
        productDay: `${productId}|${date}`,
        warehouseDay: `${move.warehouseId}|${date}`,
      }
    })
    after.set(productId, { stockQty, reservedQty, byWarehouse })
  })

  return { updates, after, movements }
}
