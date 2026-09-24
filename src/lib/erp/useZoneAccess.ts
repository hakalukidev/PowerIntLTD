"use client"

import { useMemo } from 'react'

import { useERP } from './provider'
import { toArray } from './utils'
import { customerZoneId, visibleZoneIdsFor } from './zones'

/**
 * The customers and zones the signed-in user may see. Zone managers and users
 * whose role is limited to zones only get those zones' customers; everyone else
 * gets them all (`visibleZoneIds` is then `null`).
 */
export function useZoneAccess() {
  const { data, currentUser } = useERP()

  const zones = useMemo(() => toArray(data?.zones).sort((left, right) => left.name.localeCompare(right.name)), [data?.zones])
  const role = currentUser ? data?.roles[currentUser.roleId] : null
  const visibleZoneIds = useMemo(() => visibleZoneIdsFor(currentUser, zones, role), [currentUser, zones, role])

  const allCustomers = useMemo(() => toArray(data?.customers), [data?.customers])
  const customers = useMemo(
    () => (visibleZoneIds ? allCustomers.filter((customer) => visibleZoneIds.has(customerZoneId(customer, zones))) : allCustomers),
    [allCustomers, visibleZoneIds, zones]
  )
  const zoneOptions = useMemo(
    () => (visibleZoneIds ? zones.filter((zone) => visibleZoneIds.has(zone.id)) : zones),
    [visibleZoneIds, zones]
  )

  return { zones, zoneOptions, visibleZoneIds, customers }
}
