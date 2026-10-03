import { NextResponse } from 'next/server'

import { customerDocumentParty, supplierDocumentParty } from '@/components/admin/credit-sheet/ledgerDocument'
import type { PortalOverview } from '@/lib/erp/portal'
import type { CustomerRecord, SupplierRecord, ZoneRecord } from '@/lib/erp/types'
import { customerZoneId, customerZoneName } from '@/lib/erp/zones'
import {
  companyInfo,
  loadMessages,
  loadParty,
  loadPartyLedger,
  loadReplacementHistory,
  requirePortalAccount,
} from '@/lib/firebase/portal'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

/** The signed-in dealer's or supplier's own sheet, replacement history, and inbox. Nobody else's. */
export async function GET(request: Request) {
  try {
    const { db, account } = await requirePortalAccount(request)
    const party = await loadParty(db, account.partyKind, account.partyId)
    if (!party) {
      throw new AuthorizationError('Your account record was removed. Please contact the office.', 404)
    }

    let documentParty
    if (account.partyKind === 'customer') {
      const customer = party as CustomerRecord
      const zones = Object.values(((await db.ref('erp/zones').get()).val() as Record<string, ZoneRecord> | null) ?? {})
      const customers = Object.values(((await db.ref('erp/customers').get()).val() as Record<string, CustomerRecord> | null) ?? {})
      // Same SL. No. as on the office's printed ledger: position within the zone, A-Z.
      const zoneId = customerZoneId(customer, zones)
      const serial =
        customers
          .filter((candidate) => customerZoneId(candidate, zones) === zoneId)
          .sort((left, right) => left.name.localeCompare(right.name))
          .findIndex((candidate) => candidate.id === customer.id) + 1
      documentParty = { ...customerDocumentParty(customer, customerZoneName(customer, zones), serial), creditLimit: customer.creditLimit ?? 0 }
    } else {
      documentParty = { ...supplierDocumentParty(party as SupplierRecord), creditLimit: 0 }
    }

    const overview: PortalOverview = {
      company: await companyInfo(db),
      account: { name: account.name, email: account.email, phone: account.phone, partyKind: account.partyKind },
      party: documentParty,
      ledger: await loadPartyLedger(db, account.partyKind, account.partyId),
      replacements: await loadReplacementHistory(db, account.partyKind, account.partyId),
      messages: await loadMessages(db, account.partyKind, account.partyId),
    }

    return NextResponse.json(overview)
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    console.error('Portal overview failed:', reason)
    return NextResponse.json({ error: 'Unable to load your account right now.' }, { status: 500 })
  }
}
