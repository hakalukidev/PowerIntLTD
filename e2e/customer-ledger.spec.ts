import { expect, test } from '@playwright/test'

import {
  buildCustomerLedger,
  computeCustomerBalance,
  customerBalanceBefore,
  customerBalanceSide,
  ledgerTotalsOf,
  openingDueEntryId,
  withRunningBalance,
} from '../src/lib/erp/ledger'
import type { CreditLedgerEntryRecord, OrderRecord } from '../src/lib/erp/types'
import { formatCurrency, formatDealerBalance, receivableOf } from '../src/lib/erp/utils'

/**
 * The dealer sheet's balance: the opening due and order lines raise it; the order's discount, its
 * payment and deposits (debit) lower it. Negative is an advance. Pure functions, no browser or database.
 */

const order = {
  id: 'order-1',
  billNumber: 'INV-1',
  customerId: 'dealer-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  subtotal: 10_000,
  discount: 1_000,
  total: 9_000,
  paid: 2_000,
  due: 7_000,
  items: [{ productId: 'p', productName: 'Ak Power', quantity: 2, unitPrice: 5_000, purchasePrice: 0 }],
} as OrderRecord

const deposit: CreditLedgerEntryRecord = {
  id: 'entry-1',
  customerId: 'dealer-1',
  customerName: 'Dealer',
  date: '2026-10-02T00:00:00.000Z',
  particulars: 'Deposit (DBBL)',
  qty: 0,
  unitPrice: 0,
  debit: 3_000,
  credit: 0,
  createdAt: '2026-10-02T00:00:00.000Z',
}

test('TC-L.1 the sheet lists the discount and ends on the order due less the deposit', () => {
  const rows = withRunningBalance(buildCustomerLedger('dealer-1', [order], [deposit]))
  expect(rows.map((row) => row.particulars)).toEqual(['Ak Power', 'Discount (INV-1)', 'Payment received (INV-1)', 'Deposit (DBBL)'])
  expect(rows.find((row) => row.particulars === 'Discount (INV-1)')).toMatchObject({ debit: 1_000, credit: 0 })
  expect(ledgerTotalsOf(rows).balance).toBe(order.due - deposit.debit)
})

test('TC-L.2 an order without a discount has no discount line', () => {
  const rows = buildCustomerLedger('dealer-1', [{ ...order, discount: 0, total: 10_000, due: 8_000 }], [])
  expect(rows.some((row) => row.particulars.startsWith('Discount'))).toBe(false)
  expect(ledgerTotalsOf(withRunningBalance(rows)).balance).toBe(8_000)
})

const opening: CreditLedgerEntryRecord = {
  id: openingDueEntryId('dealer-1'),
  customerId: 'dealer-1',
  customerName: 'Dealer',
  date: '2026-09-01T00:00:00.000Z',
  particulars: 'Opening due',
  qty: 0,
  unitPrice: 0,
  debit: 0,
  credit: 500,
  kind: 'opening',
  createdAt: '2026-09-01T00:00:00.000Z',
}

test('TC-L.3 the balance counts the opening due and cannot be deleted by hand', () => {
  const rows = buildCustomerLedger('dealer-1', [order], [opening, deposit])
  expect(rows[0]).toMatchObject({ particulars: 'Opening due', credit: 500, removable: false })
  // Still first when a date-only line on the same day would sort ahead of its timestamp.
  const sameDay = { ...deposit, id: 'entry-same-day', date: '2026-09-01' }
  expect(buildCustomerLedger('dealer-1', [], [sameDay, opening])[0].particulars).toBe('Opening due')
  expect(computeCustomerBalance('dealer-1', [order], [opening, deposit])).toBe(500 + order.due - deposit.debit)
})

test('TC-L.4 a dealer who paid ahead has a negative balance shown as an advance', () => {
  const advance = { ...deposit, debit: 12_000 }
  const balance = computeCustomerBalance('dealer-1', [order], [advance])
  expect(balance).toBe(order.due - 12_000)
  expect(formatDealerBalance(balance)).toBe(`Advance ${formatCurrency(5_000)}`)
  expect(formatDealerBalance(2_000)).toBe(formatCurrency(2_000))
  expect(receivableOf(balance)).toBe(0)
  expect(customerBalanceSide(balance)).toBe('Advance')
})

test('TC-L.5 previous due is everything up to the order day, without the order itself', () => {
  const later = { ...deposit, id: 'entry-later', date: '2026-10-05T00:00:00.000Z', debit: 4_000 }
  const sameDay = { ...deposit, id: 'entry-same-day', date: '2026-10-01', debit: 1_000 }
  // Opening 500 + same-day payment −1,000; the order (Oct 1) and the Oct 2 / Oct 5 deposits are left out.
  expect(customerBalanceBefore('dealer-1', order.createdAt, order.id, [order], [opening, sameDay, deposit, later])).toBe(-500)
})
