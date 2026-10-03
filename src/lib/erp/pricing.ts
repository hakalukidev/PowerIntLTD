import type { CustomerRecord, DepotRecord, ProductRecord, ZoneRecord } from './types'

/** Where a dealer's price for a product came from, from most to least specific. */
export type PriceSource = 'dealer' | 'depot' | 'zone' | 'general'

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  dealer: 'Dealer price',
  depot: 'Depot price',
  zone: 'Zone price',
  general: 'General price',
}

/** The price every dealer pays unless a more specific price is set: wholesale, else retail. */
export function generalPrice(product: Pick<ProductRecord, 'wholesalePrice' | 'sellingPrice'>) {
  return product.wholesalePrice || product.sellingPrice || 0
}

/**
 * The price a dealer pays for a product. Prices change at three levels: one dealer, one zone
 * (where some of its dealers can be left out and keep the general price), or every dealer (the
 * general price). The most specific one set wins; a depot's price sits between dealer and zone.
 * The order form, the approval screen and the dealer portal all price through this.
 */
export function dealerPrice(
  product: ProductRecord,
  context: { customer?: Pick<CustomerRecord, 'id' | 'prices'> | null; zone?: Pick<ZoneRecord, 'id' | 'priceExcludedCustomerIds'> | null; depot?: Pick<DepotRecord, 'prices'> | null }
): { price: number; source: PriceSource } {
  const { customer, zone, depot } = context

  const own = customer?.prices?.[product.id]
  if (typeof own === 'number') return { price: own, source: 'dealer' }

  const depotPrice = depot?.prices?.[product.id]
  if (typeof depotPrice === 'number') return { price: depotPrice, source: 'depot' }

  const excluded = Boolean(customer && zone?.priceExcludedCustomerIds?.includes(customer.id))
  const zonePrice = zone && !excluded ? product.zonePrices?.[zone.id] : undefined
  if (typeof zonePrice === 'number') return { price: zonePrice, source: 'zone' }

  return { price: generalPrice(product), source: 'general' }
}
