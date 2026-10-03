import type { CustomerRecord, DepotRecord, ERPData, RoleRecord, UserRecord, ZoneRecord } from './types'
import { effectiveRole } from './utils'

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
 * What a limited user may see: whole zones, single areas (sub-zones) inside a zone, and the
 * users whose officer records (employee profile, targets, salary) are theirs to see.
 */
export type AccessScope = {
  /** Zones the user sees completely. */
  zoneIds: Set<string>
  /** Areas the user sees, as `subZoneKeyFor` keys. */
  areaKeys: Set<string>
  /** The user and everyone who reports to them, directly or further down. */
  userIds: Set<string>
  /** Depots owned by the user or their team; their dealers are visible. */
  depotIds: Set<string>
}

/** The user and everyone below them in the reporting chain. */
export function teamUserIds(userId: string, users: UserRecord[]) {
  const team = new Set([userId])
  // Walk down level by level; the `team` check also stops a reporting loop.
  let frontier = [userId]
  while (frontier.length) {
    const next = users.filter((user) => user.reportsTo && frontier.includes(user.reportsTo) && !team.has(user.id))
    next.forEach((user) => team.add(user.id))
    frontier = next.map((user) => user.id)
  }
  return team
}

/**
 * The scope the user is limited to, or `null` when they see everything. Admins always see
 * everything. Anyone else is limited when their role is limited to zones, their role's data
 * scope is `assigned`, or zones or areas are assigned to them (directly, or by being a zone's
 * manager), or they own a depot. A limited user sees their own territory plus that of everyone who
 * reports to them. A depot owner sees their depot's dealers once the depot is saved, not before.
 */
export function accessScopeFor(
  user: UserRecord | null,
  zones: ZoneRecord[],
  role: RoleRecord | null | undefined,
  users: UserRecord[] = [],
  depots: DepotRecord[] = []
): AccessScope | null {
  if (!user || user.roleId === 'admin') return null

  const userIds = teamUserIds(user.id, users.some((other) => other.id === user.id) ? users : [...users, user])
  const zoneIds = new Set(role?.zoneIds ?? [])
  const areaKeys = new Set<string>()
  for (const member of userIds) {
    const record = member === user.id ? user : users.find((other) => other.id === member)
    record?.zoneIds?.forEach((zoneId) => zoneIds.add(zoneId))
    record?.areaKeys?.forEach((key) => areaKeys.add(key))
    zones.filter((zone) => zone.managerIds?.includes(member)).forEach((zone) => zoneIds.add(zone.id))
  }

  const depotIds = new Set(depots.filter((depot) => depot.ownerUserId && userIds.has(depot.ownerUserId)).map((depot) => depot.id))

  // A zone-limited role stays limited even if its zones were later deleted.
  const limited =
    role?.dataScope === 'assigned' || (role?.zoneIds?.length ?? 0) > 0 || zoneIds.size > 0 || areaKeys.size > 0 || depotIds.size > 0
  return limited ? { zoneIds, areaKeys, userIds, depotIds } : null
}

export function customerInScope(customer: CustomerRecord, zones: ZoneRecord[], scope: AccessScope) {
  return (
    scope.zoneIds.has(customerZoneId(customer, zones)) ||
    (scope.areaKeys.size > 0 && scope.areaKeys.has(subZoneKey(customer, zones))) ||
    Boolean(customer.depotId && scope.depotIds.has(customer.depotId))
  )
}

/** Zones the user sees at least part of: their whole zones plus the zones of their areas. */
export function scopeZoneIds(scope: AccessScope) {
  return new Set([...scope.zoneIds, ...Array.from(scope.areaKeys, (key) => key.split('|')[0])])
}

/**
 * Zone ids the user may see at least part of, or `null` when they are not limited to any zone.
 */
export function visibleZoneIdsFor(
  user: UserRecord | null,
  zones: ZoneRecord[],
  role?: RoleRecord | null,
  users: UserRecord[] = [],
  depots: DepotRecord[] = []
): Set<string> | null {
  const scope = accessScopeFor(user, zones, role, users, depots)
  return scope ? scopeZoneIds(scope) : null
}

export function filterCustomersForUser(
  customers: CustomerRecord[],
  user: UserRecord | null,
  zones: ZoneRecord[],
  role?: RoleRecord | null,
  users: UserRecord[] = [],
  depots: DepotRecord[] = []
) {
  const scope = accessScopeFor(user, zones, role, users, depots)
  if (!scope) return customers
  return customers.filter((customer) => customerInScope(customer, zones, scope))
}

function pickRecords<T>(records: Record<string, T>, keep: (record: T, id: string) => boolean) {
  return Object.fromEntries(Object.entries(records ?? {}).filter(([id, record]) => keep(record, id)))
}

/**
 * The ERP data as a limited user may see it: only their territory's customers, the orders,
 * credit ledger entries, and courier parcels of those customers (plus orders their team booked),
 * their zones' damage reports, their team's and zones' leads, and the officer records (employee profile, sales targets,
 * salary, attendance) of themselves and the people who report to them. Users who are not limited get the
 * data unchanged.
 */
export function scopeDataToUserZones(data: ERPData, user: UserRecord | null): ERPData {
  const zones = Object.values(data.zones ?? {})
  const scope = accessScopeFor(
    user,
    zones,
    user ? effectiveRole(data.roles, user) : null,
    Object.values(data.users ?? {}),
    Object.values(data.depots ?? {})
  )
  if (!scope) return data

  const visibleZones = scopeZoneIds(scope)
  const customers = pickRecords(data.customers, (customer) => customerInScope(customer, zones, scope))
  const zoneNames = new Set(zones.filter((zone) => visibleZones.has(zone.id)).map((zone) => normalizeName(zone.name)))
  const customerNames = new Set(Object.values(customers).map((customer) => customer.name.trim().toLowerCase()))
  const employees = pickRecords(data.employees, (employee) => Boolean(employee.userId && scope.userIds.has(employee.userId)))

  return {
    ...data,
    customers,
    // Depots the user owns, plus those in their zones or holding dealers they see.
    depots: pickRecords(
      data.depots,
      (depot, id) =>
        scope.depotIds.has(id) || visibleZones.has(depot.zoneId) || Object.values(customers).some((customer) => customer.depotId === id)
    ),
    orders: pickRecords(data.orders, (order) => Boolean(customers[order.customerId]) || scope.userIds.has(order.salesPersonId)),
    creditLedgerEntries: pickRecords(data.creditLedgerEntries, (entry) => Boolean(customers[entry.customerId])),
    deposits: pickRecords(data.deposits, (deposit) => Boolean(customers[deposit.customerId])),
    ledgerEntryRequests: pickRecords(data.ledgerEntryRequests, (request) => Boolean(customers[request.customerId]) || scope.userIds.has(request.submittedById)),
    orderRequests: pickRecords(data.orderRequests, (request) => Boolean(customers[request.customerId]) || scope.userIds.has(request.submittedById)),
    complaints: pickRecords(data.complaints, (complaint) => Boolean(customers[complaint.customerId]) || scope.userIds.has(complaint.submittedById)),
    replacements: pickRecords(data.replacements, (replacement) => Boolean(customers[replacement.customerId]) || scope.userIds.has(replacement.submittedById)),
    replacementReturns: pickRecords(data.replacementReturns, (item) => Boolean(customers[item.customerId]) || scope.userIds.has(item.submittedById)),
    batteryReports: pickRecords(data.batteryReports, (report) => Boolean(customers[report.customerId]) || scope.userIds.has(report.checkedById)),
    // Older parcels were saved with only the customer's name.
    couriers: pickRecords(data.couriers, (courier) =>
      courier.customerId ? Boolean(customers[courier.customerId]) : customerNames.has(courier.customerName.trim().toLowerCase())
    ),
    // Damage reports name their zone rather than linking to it.
    damageProducts: pickRecords(data.damageProducts, (record) => zoneNames.has(normalizeName(record.zone ?? ''))),
    // Leads are seen by the team that collected them and by whoever covers their zone.
    leads: pickRecords(data.leads, (lead) => scope.userIds.has(lead.createdById) || Boolean(lead.zoneId && visibleZones.has(lead.zoneId))),
    employees,
    salesTargets: pickRecords(data.salesTargets, (target) => Boolean(employees[target.employeeId])),
    salaries: pickRecords(data.salaries, (salary) => Boolean(employees[salary.employeeId])),
    advanceRequests: pickRecords(data.advanceRequests, (request) => Boolean(employees[request.employeeId]) || scope.userIds.has(request.submittedById)),
    attendance: Object.fromEntries(
      Object.entries(data.attendance ?? {}).map(([day, marks]) => [day, pickRecords(marks, (_, employeeId) => Boolean(employees[employeeId]))])
    ),
  }
}
