import type { CustomerRecord, DepotRecord, PriceTier, ProductRecord, SaleType, ZoneRecord } from './types'

/**
 * Where a dealer's price for a product came from, from most to least specific. `tier` is a
 * quantity price; `cash` is the cash price of a cash sale.
 */
export type PriceSource = 'cash' | 'dealer' | 'depot' | 'zone' | 'tier' | 'general'

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  cash: 'Cash price',
  dealer: 'Dealer price',
  depot: 'Depot price',
  zone: 'Zone price',
  tier: 'Quantity price',
  general: 'General price',
}

/** The price every dealer pays unless a more specific price is set: wholesale, else retail. */
export function generalPrice(product: Pick<ProductRecord, 'wholesalePrice' | 'sellingPrice'>) {
  return product.wholesalePrice || product.sellingPrice || 0
}

/** A product's cash price, or null when it has none. */
export function cashPriceOf(product: Pick<ProductRecord, 'cashPrice'>) {
  return typeof product.cashPrice === 'number' && product.cashPrice >= 0 ? product.cashPrice : null
}

export const SALE_TYPE_LABELS: Record<SaleType, string> = { credit: 'Credit', cash: 'Cash' }

/** Orders and requests from before the sale type was asked were credit sales. */
export function saleTypeOf(record: { saleType?: SaleType }): SaleType {
  return record.saleType === 'cash' ? 'cash' : 'credit'
}

/** A product's quantity prices, lowest minimum first; empty when it has none (one row is just the general price). */
export function priceTiersOf(product: Pick<ProductRecord, 'priceTiers'>): PriceTier[] {
  // The database can hand an array back as an object keyed by index.
  const tiers: PriceTier[] = Array.isArray(product.priceTiers) ? product.priceTiers : Object.values((product.priceTiers ?? {}) as Record<string, PriceTier>)
  const sorted = tiers.filter((tier) => tier && tier.minQty >= 1 && tier.price >= 0).sort((left, right) => left.minQty - right.minQty)
  return sorted.length > 1 ? sorted : []
}

/** The tier a quantity falls in: the highest minimum that is not above it. */
export function tierFor(tiers: PriceTier[], quantity: number) {
  let match: PriceTier | null = null
  for (const tier of tiers) if (tier.minQty <= quantity) match = tier
  return match
}

/**
 * Whether a line counts as quantity-priced (label, badge, stored flag): only from the second step
 * up. Below it the minimum-1 price is the normal general price, so the line is a normal price.
 */
export function isQuantityPrice(resolved: { source?: PriceSource; tierMinQty?: number } | null | undefined) {
  return resolved?.source === 'tier' && (resolved.tierMinQty ?? 0) > 1
}

/** Why a list of quantity prices cannot be saved, or null when it can. */
export function validateTiers(tiers: PriceTier[]): string | null {
  if (!tiers.length) return 'Add at least one price.'
  if (tiers[0].minQty !== 1) return 'The first quantity price must start at 1.'
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index]
    if (!Number.isInteger(tier.minQty) || tier.minQty < 1) return 'Every minimum quantity must be a whole number of at least 1.'
    if (!Number.isFinite(tier.price) || tier.price < 0) return 'Every price must be 0 or more.'
    if (index > 0 && tier.minQty <= tiers[index - 1].minQty) return 'Minimum quantities must be different and go up row by row.'
  }
  return null
}

/** "1+ 13,400 · 5+ 13,200 · 10+ 13,000". */
export function formatTiers(tiers: PriceTier[]) {
  return tiers.map((tier) => `${tier.minQty}+ ${tier.price.toLocaleString('en-US')}`).join(' · ')
}

/**
 * How a line is priced. Options rather than positional arguments so new ones (such as a cash or
 * credit sale type) can be added without touching the call sites.
 */
export type PriceOptions = {
  /** The line's quantity; picks the quantity price. Defaults to 1. */
  quantity?: number
  /** The order form's "Use quantity prices" switch. Defaults to on. */
  useTiers?: boolean
  /** A cash sale takes the cash price and never a quantity price. Defaults to credit. */
  saleType?: SaleType
}

export type PriceContext = {
  customer?: Pick<CustomerRecord, 'id' | 'prices' | 'pricesUpdatedAt'> | null
  zone?: Pick<ZoneRecord, 'id' | 'priceExcludedCustomerIds'> | null
  depot?: Pick<DepotRecord, 'prices' | 'pricesUpdatedAt'> | null
}

export type ResolvedPrice = {
  price: number
  source: PriceSource
  /** The minimum quantity of the quantity price used, when `source` is `tier`. */
  tierMinQty?: number
  /** A cash sale of a product without a cash price: `price` is the normal price instead. */
  noCashPrice?: boolean
}

/** True when a dealer, depot or zone price was saved after the quantity prices; one without a date is older. */
function savedAfterTiers(updatedAt: string | undefined, tiersUpdatedAt: string | undefined) {
  if (!updatedAt) return false
  if (!tiersUpdatedAt) return true
  return updatedAt > tiersUpdatedAt
}

/**
 * The price a dealer pays for a product. Prices change at three levels: one dealer, one zone
 * (where some of its dealers can be left out and keep the general price), or every dealer (the
 * general price). The most specific one set wins; a depot's price sits between dealer and zone.
 *
 * Quantity prices (tiers) apply to every dealer, unless a dealer, depot or zone price for that
 * product was saved after the tiers were last saved: then that newer price wins for its dealers.
 *
 * A cash sale takes the product's one cash price, the same for every dealer. A product without
 * one falls back to the normal price without quantity prices, marked `noCashPrice`.
 * The order form, the approval screen and the dealer portal all price through this.
 */
export function dealerPrice(product: ProductRecord, context: PriceContext, options: PriceOptions = {}): ResolvedPrice {
  if (options.saleType === 'cash') {
    const cash = cashPriceOf(product)
    if (cash !== null) return { price: cash, source: 'cash' }
    return { ...dealerPrice(product, context, { quantity: options.quantity, useTiers: false }), noCashPrice: true }
  }

  const { customer, zone, depot } = context
  const quantity = Math.max(options.quantity ?? 1, 0)
  const tiers = options.useTiers === false ? [] : priceTiersOf(product)

  let specific: (ResolvedPrice & { updatedAt?: string }) | null = null
  const own = customer?.prices?.[product.id]
  const depotPrice = depot?.prices?.[product.id]
  const excluded = Boolean(customer && zone?.priceExcludedCustomerIds?.includes(customer.id))
  const zonePrice = zone && !excluded ? product.zonePrices?.[zone.id] : undefined
  if (typeof own === 'number') specific = { price: own, source: 'dealer', updatedAt: customer?.pricesUpdatedAt?.[product.id] }
  else if (typeof depotPrice === 'number') specific = { price: depotPrice, source: 'depot', updatedAt: depot?.pricesUpdatedAt?.[product.id] }
  else if (typeof zonePrice === 'number') specific = { price: zonePrice, source: 'zone', updatedAt: zone ? product.zonePricesUpdatedAt?.[zone.id] : undefined }

  if (tiers.length && (!specific || !savedAfterTiers(specific.updatedAt, product.priceTiersUpdatedAt))) {
    const tier = tierFor(tiers, Math.max(quantity, 1))
    if (tier) return { price: tier.price, source: 'tier', tierMinQty: tier.minQty }
  }
  if (specific) return { price: specific.price, source: specific.source }
  return { price: generalPrice(product), source: 'general' }
}
