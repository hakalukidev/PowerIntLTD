import type { LedgerDocumentParty } from '@/components/admin/credit-sheet/ledgerDocument'
import type { LedgerRowWithBalance, LedgerTotals, ReplacementHistoryRow } from './ledger'
import type { PortalMessageRecord, PortalPartyKind } from './types'

/** Everything a dealer or supplier sees in their portal, as the portal API returns it. */
export type PortalOverview = {
  company: { name: string; currency: string }
  account: { name: string; email: string; phone: string; partyKind: PortalPartyKind }
  party: LedgerDocumentParty & { creditLimit: number }
  ledger: { rows: LedgerRowWithBalance[]; totals: LedgerTotals }
  replacements: ReplacementHistoryRow[]
  messages: PortalMessageRecord[]
}

/** A product on the portal's product page, with the price this dealer pays. */
export type PortalProduct = {
  id: string
  name: string
  category: string
  brand: string
  description: string
  imageUrl: string
  warrantyMonths: number
  /** The dealer's price; null for suppliers, who do not buy at dealer prices. */
  price: number | null
  inStock: boolean
}

export const PORTAL_MESSAGE_KIND_LABELS: Record<PortalMessageRecord['kind'], string> = {
  transaction: 'Account alert',
  payment_reminder: 'Payment reminder',
  statement: 'Statement',
  notice: 'Notice',
}

export const PORTAL_DELIVERY_LABELS: Record<PortalMessageRecord['whatsapp'], string> = {
  sent: 'Sent on WhatsApp',
  failed: 'WhatsApp failed',
  not_configured: 'Portal only (WhatsApp not set up)',
  no_phone: 'Portal only (no phone number)',
}

/**
 * Firebase logins need an email address. A dealer registered with only a phone number gets a
 * stand-in address on this domain; they sign in with their phone and never see it.
 */
export const PORTAL_PLACEHOLDER_EMAIL_DOMAIN = 'portal.powerint.local'

export function isPlaceholderEmail(email: string) {
  return email.toLowerCase().endsWith(`@${PORTAL_PLACEHOLDER_EMAIL_DOMAIN}`)
}
