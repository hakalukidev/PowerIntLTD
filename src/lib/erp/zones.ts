import type { CustomerRecord, RoleRecord, UserRecord, ZoneRecord } from './types'

export const UNASSIGNED_ZONE_ID = 'unassigned'
export const UNASSIGNED_ZONE_NAME = 'Unassigned zone'

export const NO_SUB_ZONE_NAME = 'No thana'

/**
 * A customer's zone is the one they were explicitly assigned to; otherwise the
 * zone that has the customer's thana as a sub-zone (or, for older zones, covers
 * the whole district).
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

/** Unique key of a customer's sub-zone (thana), since thana names repeat across districts. */
export function subZoneKey(customer: CustomerRecord) {
  return customer.thana ? `${customer.district}|${customer.thana}` : ''
}

export function subZoneLabel(customer: CustomerRecord) {
  if (!customer.thana) return NO_SUB_ZONE_NAME
  return customer.district ? `${customer.thana} (${customer.district})` : customer.thana
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
