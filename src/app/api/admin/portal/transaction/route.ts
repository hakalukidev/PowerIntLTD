import { NextResponse } from 'next/server'

import type {
  CreditLedgerEntryRecord,
  OrderRecord,
  PortalPartyKind,
  PortalTransactionKind,
  PurchaseRecord,
  SupplierPaymentRecord,
} from '@/lib/erp/types'
import { formatCurrency } from '@/lib/erp/utils'
import { companyInfo, deliverPortalMessage, loadParty, loadPartyLedger, PORTAL_ALERTED_PATH } from '@/lib/firebase/portal'
import { transactionAlertText } from '@/lib/firebase/portalMessages'
import { AuthorizationError, requireSignedIn } from '@/lib/firebase/requireAdmin'

export const runtime = 'nodejs'

const SOURCES: Record<PortalTransactionKind, string> = {
  order: 'erp/orders',
  ledger_entry: 'erp/creditLedgerEntries',
  purchase: 'erp/purchases',
  supplier_payment: 'erp/supplierPayments',
}

type Alert = { partyKind: PortalPartyKind; partyId: string; date: string; lines: string[] }

/** What the new row says, read from the saved record so the alert matches the sheet. */
function describe(kind: PortalTransactionKind, record: unknown, money: (amount: number) => string): Alert | null {
  switch (kind) {
    case 'order': {
      const order = record as OrderRecord
      const items = (order.items ?? []).map((item) => `${item.productName} x${item.quantity}`).join(', ')
      return {
        partyKind: 'customer',
        partyId: order.customerId,
        date: order.createdAt,
        lines: [`Bill: ${order.billNumber}`, `Goods: ${items}`, `Credit: ${money(order.total)}`, ...(order.paid > 0 ? [`Debit (paid): ${money(order.paid)}`] : [])],
      }
    }
    case 'ledger_entry': {
      const entry = record as CreditLedgerEntryRecord
      return {
        partyKind: 'customer',
        partyId: entry.customerId,
        date: entry.date,
        lines: [entry.particulars, ...(entry.debit ? [`Debit: ${money(entry.debit)}`] : []), ...(entry.credit ? [`Credit: ${money(entry.credit)}`] : [])],
      }
    }
    case 'purchase': {
      const purchase = record as PurchaseRecord
      return {
        partyKind: 'supplier',
        partyId: purchase.supplierId,
        date: purchase.createdAt,
        lines: [`Goods received: ${purchase.productName} x${purchase.quantity}`, `Credit: ${money(purchase.total)}`],
      }
    }
    case 'supplier_payment': {
      const payment = record as SupplierPaymentRecord
      // Only approved payments are on the supplier's sheet.
      if (payment.status !== 'approved') return null
      return {
        partyKind: 'supplier',
        partyId: payment.supplierId,
        date: payment.date || payment.createdAt,
        lines: [
          `Payment sent (${payment.method === 'bank' ? payment.sendingType || 'Bank' : 'Cash'})`,
          ...(payment.purpose ? [payment.purpose] : []),
          `Debit: ${money(payment.amount)}`,
        ],
      }
    }
  }
}

/**
 * Sends the dealer or supplier a bank-style alert for a row just added to their sheet, to
 * their portal inbox and WhatsApp. The caller only names the row; the server reads it, so the
 * alert always matches what was saved, and each row alerts once.
 */
export async function POST(request: Request) {
  try {
    const { db, caller } = await requireSignedIn(request)
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; id?: unknown }
    const kind = body.kind as PortalTransactionKind
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!SOURCES[kind] || !/^[\w-]+$/.test(id)) throw new Error('Unknown sheet row.')

    const record = (await db.ref(`${SOURCES[kind]}/${id}`).get()).val()
    if (!record) throw new Error('Sheet row not found.')

    const company = await companyInfo(db)
    const alert = describe(kind, record, (amount) => formatCurrency(amount, company.currency))
    if (!alert) return NextResponse.json({ skipped: true })

    const party = await loadParty(db, alert.partyKind, alert.partyId)
    if (!party) return NextResponse.json({ skipped: true })

    // Claim the row first so two calls for the same row cannot both send.
    const claim = await db.ref(`${PORTAL_ALERTED_PATH}/${kind}__${id}`).transaction((current) => (current ? undefined : true))
    if (!claim.committed) return NextResponse.json({ skipped: true })

    const { totals } = await loadPartyLedger(db, alert.partyKind, alert.partyId)
    const message = await deliverPortalMessage(db, {
      partyKind: alert.partyKind,
      partyId: alert.partyId,
      phone: party.phone,
      kind: 'transaction',
      title: `${company.name}: account update`,
      body: transactionAlertText({ companyName: company.name, partyName: party.name, date: alert.date, lines: alert.lines, balance: totals.balance, currency: company.currency }),
      createdByName: caller.name,
    })

    return NextResponse.json({ message })
  } catch (reason) {
    if (reason instanceof AuthorizationError) {
      return NextResponse.json({ error: reason.message }, { status: reason.status })
    }
    const message = reason instanceof Error ? reason.message : 'Unable to send the alert.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
