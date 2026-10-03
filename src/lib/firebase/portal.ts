import type { Database } from 'firebase-admin/database'

import {
  buildCustomerLedger,
  buildReplacementHistory,
  buildSupplierLedger,
  ledgerTotalsOf,
  withRunningBalance,
} from '@/lib/erp/ledger'
import type {
  CreditLedgerEntryRecord,
  CustomerRecord,
  OrderRecord,
  PortalAccountRecord,
  PortalMessageKind,
  PortalMessageRecord,
  PortalPartyKind,
  ProductRecord,
  PurchaseRecord,
  ReplacementRecord,
  ReplacementReturnRecord,
  SupplierPaymentRecord,
  SupplierRecord,
  ZoneRecord,
} from '@/lib/erp/types'
import { createId } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { getAdminAuth, getAdminDatabase } from '@/lib/firebase/admin'
import { AuthorizationError } from '@/lib/firebase/requireAdmin'
import { sendWhatsApp } from '@/lib/server/whatsapp'

/**
 * Portal data lives outside `erp`, which every staff account can read and write, and the
 * database rules give browsers no access to it: only these server routes touch it. A dealer
 * never reads the database directly, so they can only see what the portal routes hand them.
 */
export const PORTAL_ACCOUNTS_PATH = 'portal/accounts'
export const PORTAL_MESSAGES_PATH = 'portal/messages'
/** Sheet rows an alert was already sent for, so the same row never alerts twice. */
export const PORTAL_ALERTED_PATH = 'portal/alerted'

const MESSAGE_LIMIT = 200

export function partyKey(kind: PortalPartyKind, partyId: string) {
  return `${kind}__${partyId}`
}

export function isPartyKind(value: unknown): value is PortalPartyKind {
  return value === 'customer' || value === 'supplier'
}

async function read<T>(db: Database, path: string) {
  return ((await db.ref(path).get()).val() as T | null) ?? null
}

/** Verifies the caller's ID token belongs to an active portal login. */
export async function requirePortalAccount(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    throw new AuthorizationError('You need to be signed in.', 401)
  }

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    throw new AuthorizationError('Your session has expired. Please sign in again.', 401)
  }

  const db = getAdminDatabase()
  const account = await read<PortalAccountRecord>(db, `${PORTAL_ACCOUNTS_PATH}/${uid}`)
  if (!account) {
    throw new AuthorizationError('This login is no longer available.', 403)
  }
  if (account.status !== 'active') {
    throw new AuthorizationError('This account is inactive.', 403)
  }

  return { uid, db, account }
}

export async function loadParty(db: Database, kind: PortalPartyKind, partyId: string) {
  return kind === 'customer'
    ? await read<CustomerRecord>(db, `erp/customers/${partyId}`)
    : await read<SupplierRecord>(db, `erp/suppliers/${partyId}`)
}

export async function companyInfo(db: Database) {
  const settings = await read<{ companyName?: string; currency?: string }>(db, 'erp/settings')
  return { name: settings?.companyName || 'Power International BD', currency: settings?.currency || 'BDT' }
}

/** A party's sheet with running balance, as the office sees it on the credit sheet. */
export async function loadPartyLedger(db: Database, kind: PortalPartyKind, partyId: string) {
  const values = <T>(record: Record<string, T> | null) => Object.values(record ?? {})
  const rows =
    kind === 'customer'
      ? buildCustomerLedger(
          partyId,
          values(await read<Record<string, OrderRecord>>(db, 'erp/orders')),
          values(await read<Record<string, CreditLedgerEntryRecord>>(db, 'erp/creditLedgerEntries'))
        )
      : await (async () => {
          const supplier = await read<SupplierRecord>(db, `erp/suppliers/${partyId}`)
          return buildSupplierLedger(
            partyId,
            values(await read<Record<string, PurchaseRecord>>(db, 'erp/purchases')),
            values(await read<Record<string, SupplierPaymentRecord>>(db, 'erp/supplierPayments')),
            supplier ? { amount: Number(supplier.openingDue ?? 0), date: supplier.createdAt } : undefined
          )
        })()
  const withBalance = withRunningBalance(rows)
  return { rows: withBalance, totals: ledgerTotalsOf(withBalance) }
}

export async function loadReplacementHistory(db: Database, kind: PortalPartyKind, partyId: string) {
  const products = (await read<Record<string, ProductRecord>>(db, 'erp/products')) ?? {}
  return buildReplacementHistory(
    { kind, id: partyId },
    Object.values((await read<Record<string, ReplacementRecord>>(db, 'erp/replacements')) ?? {}),
    Object.values((await read<Record<string, ReplacementReturnRecord>>(db, 'erp/replacementReturns')) ?? {}),
    products
  )
}

export async function loadZoneName(db: Database, customer: CustomerRecord) {
  const zones = Object.values((await read<Record<string, ZoneRecord>>(db, 'erp/zones')) ?? {})
  return customerZoneName(customer, zones)
}

export async function loadMessages(db: Database, kind: PortalPartyKind, partyId: string) {
  const messages = Object.values((await read<Record<string, PortalMessageRecord>>(db, `${PORTAL_MESSAGES_PATH}/${partyKey(kind, partyId)}`)) ?? {})
  return messages.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

/**
 * Puts a message in the party's portal inbox and sends it to their WhatsApp. The inbox copy
 * is kept even when WhatsApp is not set up or fails, with the outcome stamped on it.
 */
export async function deliverPortalMessage(
  db: Database,
  input: {
    partyKind: PortalPartyKind
    partyId: string
    phone: string
    kind: PortalMessageKind
    title: string
    body: string
    imageUrl?: string
    createdByName: string
  }
) {
  const whatsapp = await sendWhatsApp(input.phone, `${input.title}\n${input.body}`, input.imageUrl)
  const id = createId('portal_message')
  const message: PortalMessageRecord = {
    id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    read: false,
    whatsapp: whatsapp.status,
    ...(whatsapp.error ? { whatsappError: whatsapp.error } : {}),
    createdAt: new Date().toISOString(),
    createdByName: input.createdByName,
  }

  const path = `${PORTAL_MESSAGES_PATH}/${partyKey(input.partyKind, input.partyId)}`
  await db.ref(`${path}/${id}`).set(message)

  // Keep the inbox to a fixed size, dropping the oldest messages.
  const keys = Object.keys((await read<Record<string, unknown>>(db, path)) ?? {}).sort()
  if (keys.length > MESSAGE_LIMIT) {
    await db.ref(path).update(Object.fromEntries(keys.slice(0, keys.length - MESSAGE_LIMIT).map((key) => [key, null])))
  }

  return message
}
