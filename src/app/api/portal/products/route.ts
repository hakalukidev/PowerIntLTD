import { NextResponse } from 'next/server'

import type { PortalProduct } from '@/lib/erp/portal'
import type { CustomerRecord, DepotRecord, ProductRecord, ZoneRecord } from '@/lib/erp/types'
import { dealerPrice } from '@/lib/erp/pricing'
import { customerZoneId } from '@/lib/erp/zones'
import { loadParty, requirePortalAccount } from '@/lib/firebase/portal'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/** The product catalogue. Dealers see their own price (dealer, depot, zone, then general), never costs or stock counts. */
export async function GET(request: Request) {
  try {
    const { db, account } = await requirePortalAccount(request)
    const products = Object.values(((await db.ref('erp/products').get()).val() as Record<string, ProductRecord> | null) ?? {})

    let priceOf: (product: ProductRecord) => number | null = () => null
    if (account.partyKind === 'customer') {
      const customer = (await loadParty(db, 'customer', account.partyId)) as CustomerRecord | null
      if (customer) {
        const zones = Object.values(((await db.ref('erp/zones').get()).val() as Record<string, ZoneRecord> | null) ?? {})
        const zoneId = customerZoneId(customer, zones)
        const depot = customer.depotId ? ((await db.ref(`erp/depots/${customer.depotId}`).get()).val() as DepotRecord | null) : null
        const zone = zones.find((item) => item.id === zoneId) ?? null
        // The same rule as the order form: dealer, depot, zone (unless left out), general price.
        priceOf = (product) => dealerPrice(product, { customer, zone, depot }).price || null
      }
    }

    const catalogue: PortalProduct[] = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category ?? '',
        brand: product.brand ?? '',
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? '',
        warrantyMonths: product.warrantyMonths ?? 0,
        price: priceOf(product),
        inStock: (product.stockQty ?? 0) > 0,
      }))
      .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name))

    return NextResponse.json({ products: catalogue })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    console.error('Portal products failed:', reason)
    return NextResponse.json({ error: 'Unable to load products right now.' }, { status: 500 })
  }
}
