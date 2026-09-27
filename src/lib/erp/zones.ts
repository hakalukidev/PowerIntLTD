import type { CustomerRecord, ERPData, RoleRecord, UserRecord, ZoneRecord } from './types'

export const UNASSIGNED_ZONE_ID = 'unassigned'
export const UNASSIGNED_ZONE_NAME = 'Unassigned zone'

export const NO_SUB_ZONE_NAME = 'No sub-zone'

/**
 * A dealer's zone is the one they were explicitly assigned to; otherwise the
 * zone that has the dealer's sub-zone (or, for older zones, covers the whole
 * district saved on older dealers).
 */
export function resolveCustomerZone(customer: CustomerRecord, zones: ZoneRecord[]): ZoneRecord | null {
  if (customer.zoneId) {
    const assigned = zones.find((zone) => zone.id === customer.zoneId)
    if (assigned) return assigned
  }

  if (customer.thana) {
    const thana = customer.thana.trim().toLowerCase()
    // Sub-zones typed in by hand have no district, so they match on the thana name alone.
    const byThana = zones.find((zone) =>
      zone.thanas.some((area) =>
        area.district ? area.district === customer.district && area.thana === customer.thana : area.thana.trim().toLowerCase() === thana
      )
    )
    if (byThana) return byThana
  }
  if (!customer.district) return null
  return zones.find((zone) => zone.districts.includes(customer.district)) ?? null
}

const normalizeName = (name: string) => name.trim().toLowerCase()

/** The sub-zone names an admin set up for a zone, in the order they were added. */
export function zoneSubZones(zone: ZoneRecord | null | undefined): string[] {
  const seen = new Set<string>()
  return (zone?.thanas ?? [])
    .map((area) => area.thana.trim())
    .filter((name) => name && !seen.has(normalizeName(name)) && seen.add(normalizeName(name)))
}

/**
 * Key of a dealer's sub-zone. The same sub-zone name can exist in two zones, so the
 * zone is part of the key. Dealers are stored with the sub-zone name in `thana`.
 */
export function subZoneKey(customer: CustomerRecord, zones: ZoneRecord[]) {
  return customer.thana ? subZoneKeyFor(customerZoneId(customer, zones), customer.thana) : ''
}

export function subZoneKeyFor(zoneId: string, subZone: string) {
  return `${zoneId}|${normalizeName(subZone)}`
}

export function subZoneLabel(customer: CustomerRecord) {
  return customer.thana?.trim() || NO_SUB_ZONE_NAME
}

export function customerZoneId(customer: CustomerRecord, zones: ZoneRecord[]) {
  return resolveCustomerZone(customer, zones)?.id ?? UNASSIGNED_ZONE_ID
}

export function customerZoneName(customer: CustomerRecord, zones: ZoneRecord[]) {
  return resolveCustomerZone(customer, zones)?.name ?? UNASSIGNED_ZONE_NAME
}

/**
 * Zone ids the user may see, or `null` when they are not limited to any zone.
 * Admins always see everything. Anyone else whose role is limited to zones, or
 * who is responsible for at least one zone, only sees the customers of those zones.
 */
export function visibleZoneIdsFor(user: UserRecord | null, zones: ZoneRecord[], role?: RoleRecord | null): Set<string> | null {
  if (!user || user.roleId === 'admin') return null

  const roleZoneIds = role?.zoneIds ?? []
  const managed = zones.filter((zone) => zone.managerIds.includes(user.id)).map((zone) => zone.id)
  // A zone-limited role stays limited even if its zones were later deleted.
  return roleZoneIds.length || managed.length ? new Set([...roleZoneIds, ...managed]) : null
}

export function filterCustomersForUser(
  customers: CustomerRecord[],
  user: UserRecord | null,
  zones: ZoneRecord[],
  role?: RoleRecord | null
) {
  const visible = visibleZoneIdsFor(user, zones, role)
  if (!visible) return customers
  return customers.filter((customer) => visible.has(customerZoneId(customer, zones)))
}

function pickRecords<T>(records: Record<string, T>, keep: (record: T) => boolean) {
  return Object.fromEntries(Object.entries(records ?? {}).filter(([, record]) => keep(record)))
}

/**
 * The ERP data as a zone-limited user may see it: only their zones' customers,
 * the orders, credit ledger entries, and courier parcels of those customers,
 * and their zones' damage reports. Users who are not limited to zones get the data unchanged.
 */
export function scopeDataToUserZones(data: ERPData, user: UserRecord | null): ERPData {
  const zones = Object.values(data.zones ?? {})
  const visible = visibleZoneIdsFor(user, zones, user ? data.roles[user.roleId] : null)
  if (!visible) return data

  const customers = pickRecords(data.customers, (customer) => visible.has(customerZoneId(customer, zones)))
  const zoneNames = new Set(zones.filter((zone) => visible.has(zone.id)).map((zone) => normalizeName(zone.name)))
  const customerNames = new Set(Object.values(customers).map((customer) => customer.name.trim().toLowerCase()))

  return {
    ...data,
    customers,
    orders: pickRecords(data.orders, (order) => Boolean(customers[order.customerId])),
    creditLedgerEntries: pickRecords(data.creditLedgerEntries, (entry) => Boolean(customers[entry.customerId])),
    // Older parcels were saved with only the customer's name.
    couriers: pickRecords(data.couriers, (courier) =>
      courier.customerId ? Boolean(customers[courier.customerId]) : customerNames.has(courier.customerName.trim().toLowerCase())
    ),
    // Damage reports name their zone rather than linking to it.
    damageProducts: pickRecords(data.damageProducts, (record) => zoneNames.has(normalizeName(record.zone ?? ''))),
  }
}
