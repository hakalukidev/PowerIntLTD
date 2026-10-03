"use client"

import { useCallback } from 'react'

import { buildLedgerDocument, customerDocumentParty, supplierDocumentParty } from '@/components/admin/credit-sheet/ledgerDocument'
import {
  buildCustomerLedger,
  buildReplacementHistory,
  buildSupplierLedger,
  ledgerTotalsOf,
  withRunningBalance,
} from '@/lib/erp/ledger'
import { useERP } from '@/lib/erp/provider'
import type { PortalPartyKind } from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'
import { customerZoneId, customerZoneName } from '@/lib/erp/zones'

/**
 * Builds a dealer's or supplier's statement: the same ledger the credit sheet prints and the
 * dealer sees in their portal, with their replacement history. Used for the statement image
 * the office sends.
 */
export function usePartyStatement() {
  const { data } = useERP()

  return useCallback(
    (kind: PortalPartyKind, partyId: string) => {
      if (!data) return null
      const replacementHistory = buildReplacementHistory(
        { kind, id: partyId },
        toArray(data.replacements),
        toArray(data.replacementReturns),
        data.products
      )

      if (kind === 'customer') {
        const customer = data.customers[partyId]
        if (!customer) return null
        const zones = toArray(data.zones)
        const zoneId = customerZoneId(customer, zones)
        const serial =
          toArray(data.customers)
            .filter((candidate) => customerZoneId(candidate, zones) === zoneId)
            .sort((left, right) => left.name.localeCompare(right.name))
            .findIndex((candidate) => candidate.id === customer.id) + 1
        const rows = withRunningBalance(buildCustomerLedger(partyId, toArray(data.orders), toArray(data.creditLedgerEntries)))
        const totals = ledgerTotalsOf(rows)
        return {
          name: customer.name,
          phone: customer.phone,
          totals,
          html: buildLedgerDocument({
            party: customerDocumentParty(customer, customerZoneName(customer, zones), serial),
            rows,
            totals,
            currency: data.settings.currency,
            replacementHistory,
            autoPrint: false,
          }),
        }
      }

      const supplier = data.suppliers[partyId]
      if (!supplier) return null
      const rows = withRunningBalance(
        buildSupplierLedger(partyId, toArray(data.purchases), toArray(data.supplierPayments), {
          amount: Number(supplier.openingDue ?? 0),
          date: supplier.createdAt,
        })
      )
      const totals = ledgerTotalsOf(rows)
      return {
        name: supplier.name,
        phone: supplier.phone,
        totals,
        html: buildLedgerDocument({
          party: supplierDocumentParty(supplier),
          rows,
          totals,
          currency: data.settings.currency,
          replacementHistory,
          autoPrint: false,
        }),
      }
    },
    [data]
  )
}
