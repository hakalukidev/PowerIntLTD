"use client"

import { useMemo } from 'react'

import { useERP } from './provider'
import { effectiveRole, toArray } from './utils'
import { accessScopeFor, customerInScope, scopeZoneIds } from './zones'

/**
 * The customers and zones the signed-in user may see. Users limited to zones or areas
 * (Zonal Managers, Area Sales Managers, SRs, zone-limited roles) only get the customers of
 * their territory and their team's, and depot owners only their depot's dealers; everyone else
 * gets them all (`visibleZoneIds` is then `null`).
 */
export function useZoneAccess() {
  const { data, currentUser } = useERP()

  const zones = useMemo(() => toArray(data?.zones).sort((left, right) => left.name.localeCompare(right.name)), [data?.zones])
  const role = useMemo(() => (currentUser ? effectiveRole(data?.roles, currentUser) : null), [currentUser, data?.roles])
  const allUsers = useMemo(() => toArray(data?.users), [data?.users])
  const depots = useMemo(() => toArray(data?.depots), [data?.depots])
  const scope = useMemo(() => accessScopeFor(currentUser, zones, role, allUsers, depots), [currentUser, zones, role, allUsers, depots])
  const visibleZoneIds = useMemo(() => (scope ? scopeZoneIds(scope) : null), [scope])

  const allCustomers = useMemo(() => toArray(data?.customers), [data?.customers])
  const customers = useMemo(
    () => (scope ? allCustomers.filter((customer) => customerInScope(customer, zones, scope)) : allCustomers),
    [allCustomers, scope, zones]
  )
  const zoneOptions = useMemo(
    () => (visibleZoneIds ? zones.filter((zone) => visibleZoneIds.has(zone.id)) : zones),
    [visibleZoneIds, zones]
  )

  return { zones, zoneOptions, visibleZoneIds, customers }
}
