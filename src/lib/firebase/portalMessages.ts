import { balanceSide } from '@/lib/erp/ledger'
import { formatCurrency, formatDate } from '@/lib/erp/utils'

/** "BDT 1,20,000 Cr", the balance as the sheet shows it; a dealer who has paid ahead reads "Advance BDT 5,000". */
export function balanceText(balance: number, currency: string, partyKind: 'customer' | 'supplier') {
  if (partyKind === 'customer' && balance < 0) return `Advance ${formatCurrency(-balance, currency)}`
  return `${formatCurrency(Math.abs(balance), currency)} ${balanceSide(balance)}`
}

/** A bank-style alert for a new row on the sheet: short, one fact per line. */
export function transactionAlertText(input: {
  companyName: string
  partyName: string
  date: string
  lines: string[]
  balance: number
  currency: string
  partyKind: 'customer' | 'supplier'
}) {
  return [
    `A/C: ${input.partyName}`,
    `Date: ${formatDate(input.date)}`,
    ...input.lines,
    `Balance: ${balanceText(input.balance, input.currency, input.partyKind)}`,
    `- ${input.companyName}`,
  ].join('\n')
}
