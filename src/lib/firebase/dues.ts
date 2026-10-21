import type { Database } from 'firebase-admin/database'

import { computeCustomerBalance } from '@/lib/erp/ledger'
import type { CreditLedgerEntryRecord, CustomerRecord, OrderRecord } from '@/lib/erp/types'

const MAX_ATTEMPTS = 5

async function customerLedger(db: Database, customerId: string) {
  const [orders, entries] = await Promise.all([
    db.ref('erp/orders').orderByChild('customerId').equalTo(customerId).get(),
    db.ref('erp/creditLedgerEntries').orderByChild('customerId').equalTo(customerId).get(),
  ])
  return {
    orders: Object.values((orders.val() ?? {}) as Record<string, OrderRecord>),
    entries: Object.values((entries.val() ?? {}) as Record<string, CreditLedgerEntryRecord>),
  }
}

/**
 * Saves the dealer's due as the balance of their ledger, read fresh from the database.
 *
 * Every write that changes a dealer's ledger also bumps `customers/{id}/ledgerRev` in the same
 * update. This reads the revision, then the ledger, and saves the due in a transaction that only
 * commits while the revision is unchanged; if another write landed in between it reads again.
 * Each writer calls this after its own write, so the last one to finish always saw every write and
 * two approvals for the same dealer can never leave a stale due behind.
 *
 * Returns the saved due, or null when the dealer no longer exists.
 */
export async function recomputeCustomerDue(db: Database, customerId: string): Promise<number | null> {
  const customerRef = db.ref(`erp/customers/${customerId}`)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const revision = Number((await customerRef.child('ledgerRev').get()).val() ?? 0)
    const { orders, entries } = await customerLedger(db, customerId)
    const due = computeCustomerBalance(customerId, orders, entries)

    let missing = false
    const result = await customerRef.transaction((current: CustomerRecord | null) => {
      // The first pass of a transaction may run on a cached null; returning it unchanged lets the
      // server send the real value and run this again.
      if (current === null) {
        missing = true
        return current
      }
      missing = false
      if (Number(current.ledgerRev ?? 0) !== revision) return undefined
      return { ...current, due }
    })

    if (missing && !result.snapshot.exists()) return null
    if (result.committed && Number(result.snapshot.child('ledgerRev').val() ?? 0) === revision) {
      return due
    }
  }
  throw new Error('The dealer ledger kept changing; the due will be recomputed on the next change.')
}
