"use client"

import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { brandedDocument, openPrintWindow } from '@/components/admin/credit-sheet/printSheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buildReplacementSheet } from '@/lib/erp/ledger'
import { useERP } from '@/lib/erp/provider'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { escapeHtml, formatDate, partyCode, toArray } from '@/lib/erp/utils'

const ALL = ''

export default function ReplacementSheetPage() {
  const { data } = useERP()
  const { customers } = useZoneAccess()
  const [customerId, setCustomerId] = useState(ALL)
  const [feedback, setFeedback] = useState<string | null>(null)

  const sheet = useMemo(
    () => buildReplacementSheet(toArray(data?.replacements), toArray(data?.replacementReturns)),
    [data?.replacementReturns, data?.replacements]
  )
  const visibleCustomerIds = useMemo(() => new Set(customers.map((customer) => customer.id)), [customers])
  const rows = sheet.filter((row) => visibleCustomerIds.has(row.customerId) && (!customerId || row.customerId === customerId))
  const customer = customerId ? data?.customers[customerId] ?? null : null

  const totals = useMemo(() => {
    const replaced = rows.filter((row) => row.type === 'replacement').reduce((sum, row) => sum + row.qty, 0)
    const returned = rows.reduce((sum, row) => sum + row.returned, 0)
    // What each dealer still owes is their last line's "now returnable".
    const latest = new Map<string, number>()
    rows.forEach((row) => latest.set(row.customerId, row.nowReturnable))
    return { replaced, returned, outstanding: Array.from(latest.values()).reduce((sum, value) => sum + value, 0) }
  }, [rows])

  const dealerOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: ALL, label: 'All dealers' },
      ...[...customers]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: `${item.name} (${partyCode(item)})`, sublabel: item.phone })),
    ],
    [customers]
  )

  function handlePrint() {
    const body = `
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Courier</th><th>Product</th><th class="numeric">Qty</th><th>Problem</th><th>Customer</th>
            <th class="numeric">Total returnable</th><th class="numeric">Return</th><th class="numeric">Now returnable</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(formatDate(row.date))}</td>
              <td>${escapeHtml(row.courierName)}</td>
              <td>${escapeHtml(row.productName)}</td>
              <td class="numeric">${row.type === 'replacement' ? row.qty : ''}</td>
              <td>${escapeHtml(row.type === 'return' ? `Returned${row.problem ? ` — ${row.problem}` : ''}` : row.problem)}</td>
              <td>${escapeHtml(row.customerName)}</td>
              <td class="numeric">${row.totalReturnable}</td>
              <td class="numeric">${row.returned || ''}</td>
              <td class="numeric">${row.nowReturnable}</td>
            </tr>`
            )
            .join('')}
          <tr class="grand">
            <td colspan="3">Total</td>
            <td class="numeric">${totals.replaced}</td>
            <td colspan="3"></td>
            <td class="numeric">${totals.returned}</td>
            <td class="numeric">${totals.outstanding}</td>
          </tr>
        </tbody>
      </table>
    `
    const html = brandedDocument({
      title: customer ? `Replacement sheet — ${customer.name}` : 'Replacement sheet',
      heading: 'Replacement sheet',
      badge: customer ? partyCode(customer) : undefined,
      body,
    })
    setFeedback(openPrintWindow(html) ? null : 'Allow popups to print the replacement sheet.')
  }

  return (
    <AdminShell active="Replacement Sheet">
      <div className="space-y-6">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>Replacement sheet</CardTitle>
              <CardDescription>
                Every approved replacement and return. A replacement adds the faulty pieces the dealer must send back; a return takes them off.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="sm:w-72">
                <Combobox options={dealerOptions} value={customerId} onChange={setCustomerId} placeholder="All dealers" searchPlaceholder="Search name, ID or phone..." />
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={handlePrint} disabled={rows.length === 0}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Replaced', totals.replaced],
                ['Returned', totals.returned],
                ['Still returnable', totals.outstanding],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                    <TableHead>Date</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total returnable</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                    <TableHead className="text-right">Now returnable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                      <TableCell>{row.courierName || '—'}</TableCell>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.type === 'replacement' ? row.qty : ''}</TableCell>
                      <TableCell className="max-w-60 truncate" title={row.problem}>
                        {row.type === 'return' ? <span className="text-emerald-700 dark:text-emerald-300">Returned{row.problem ? ` — ${row.problem}` : ''}</span> : row.problem}
                      </TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.totalReturnable}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.returned || ''}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{row.nowReturnable}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                        No approved replacements yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                {rows.length > 0 ? (
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.replaced}</TableCell>
                      <TableCell colSpan={3} />
                      <TableCell className="text-right tabular-nums">{totals.returned}</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.outstanding}</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
