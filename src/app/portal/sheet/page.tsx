"use client"

import { useState } from 'react'
import { FileImage, FileText, Printer, RefreshCw } from 'lucide-react'

import { buildLedgerDocument, ledgerFileSlug } from '@/components/admin/credit-sheet/ledgerDocument'
import { downloadDocumentJpg, downloadDocumentPdf, openPrintWindow } from '@/components/admin/credit-sheet/printSheet'
import { usePortal } from '@/components/portal/PortalShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { balanceSide } from '@/lib/erp/ledger'
import { formatCurrency, formatDate } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

export default function PortalSheetPage() {
  const { overview, refresh } = usePortal()
  const [busy, setBusy] = useState<'pdf' | 'jpg' | 'refresh' | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  if (!overview) return null

  const { company, party, ledger, replacements } = overview
  const money = (amount: number) => formatCurrency(amount, company.currency)
  const fileName = `statement-${ledgerFileSlug(party.name)}`

  function documentHtml(autoPrint: boolean) {
    return buildLedgerDocument({
      party,
      rows: ledger.rows,
      totals: ledger.totals,
      currency: company.currency,
      replacementHistory: replacements,
      autoPrint,
    })
  }

  async function run(kind: 'pdf' | 'jpg' | 'refresh') {
    setFeedback(null)
    setBusy(kind)
    try {
      if (kind === 'pdf') await downloadDocumentPdf(documentHtml(false), `${fileName}.pdf`)
      else if (kind === 'jpg') await downloadDocumentJpg(documentHtml(false), `${fileName}.jpg`)
      else await refresh()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const infoLabel = 'border border-border px-3 py-2 font-semibold whitespace-nowrap'
  const infoValue = 'border border-border px-3 py-2'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My sheet</h1>
          <p className="text-sm text-muted-foreground">Every bill, payment, and entry on your account, with the running balance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void run('refresh')} disabled={busy !== null}>
            <RefreshCw className={cn('h-4 w-4', busy === 'refresh' && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFeedback(openPrintWindow(documentHtml(true)) ? null : 'Allow popups to print your sheet.')}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => void run('pdf')} disabled={busy !== null}>
            <FileText className="h-4 w-4" />
            {busy === 'pdf' ? 'Preparing...' : 'PDF'}
          </Button>
          <Button size="sm" onClick={() => void run('jpg')} disabled={busy !== null}>
            <FileImage className="h-4 w-4" />
            {busy === 'jpg' ? 'Preparing...' : 'JPG'}
          </Button>
        </div>
      </div>

      {feedback ? <p className="text-sm text-rose-600 dark:text-rose-400">{feedback}</p> : null}

      <Card className="border-border/70 shadow-sm">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <tbody>
                <tr>
                  <td className={infoLabel}>Account of</td>
                  <td className={cn(infoValue, 'text-center')}>{party.name}</td>
                  <td className={infoLabel}>Owner Name</td>
                  <td className={cn(infoValue, 'text-center')} colSpan={3}>
                    {party.ownerName || 'N/A'}
                  </td>
                </tr>
                <tr>
                  <td className={infoLabel}>Add</td>
                  <td className={infoValue}>{party.address || 'N/A'}</td>
                  <td className={infoLabel}>{overview.account.partyKind === 'customer' ? 'Zone' : 'Country'}</td>
                  <td className={infoValue}>{party.zoneName || 'N/A'}</td>
                  <td className={infoLabel}>SL. No.</td>
                  <td className={cn(infoValue, 'text-center')}>{party.serial || ''}</td>
                </tr>
                <tr>
                  <td className={infoLabel}>Contact No.</td>
                  <td className={infoValue}>{party.phone || 'N/A'}</td>
                  <td className={infoLabel}>Email</td>
                  <td className={infoValue}>{party.email || 'N/A'}</td>
                  <td className={infoLabel}>ID</td>
                  <td className={cn(infoValue, 'text-center')}>{party.code || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                  <TableHead>Bill No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Dr/Cr</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.billNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell>{row.particulars}</TableCell>
                    <TableCell className="text-right">{row.qty ?? ''}</TableCell>
                    <TableCell className="text-right">{row.unitPrice ? money(row.unitPrice) : ''}</TableCell>
                    <TableCell className="text-right">{row.debit ? money(row.debit) : ''}</TableCell>
                    <TableCell className="text-right">{row.credit ? money(row.credit) : ''}</TableCell>
                    <TableCell>{balanceSide(row.balance)}</TableCell>
                    <TableCell className="text-right font-medium">{money(Math.abs(row.balance))}</TableCell>
                  </TableRow>
                ))}
                {ledger.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                      No entries on your sheet yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
              {ledger.rows.length > 0 ? (
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{ledger.totals.qty}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{money(ledger.totals.debit)}</TableCell>
                    <TableCell className="text-right">{money(ledger.totals.credit)}</TableCell>
                    <TableCell>{balanceSide(ledger.totals.balance)}</TableCell>
                    <TableCell className="text-right">{money(Math.abs(ledger.totals.balance))}</TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Replacement history</CardTitle>
          <CardDescription>
            {overview.account.partyKind === 'customer'
              ? 'Products you sent for replacement and replaced products returned, with their status.'
              : 'Replacements of the products you supply, with their status.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  {overview.account.partyKind === 'supplier' ? <TableHead>Dealer</TableHead> : null}
                  <TableHead>Product</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {replacements.map((row) => (
                  <TableRow key={`${row.type}-${row.id}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                    <TableCell>{row.type === 'replacement' ? 'Replacement' : 'Return'}</TableCell>
                    {overview.account.partyKind === 'supplier' ? <TableCell>{row.customerName}</TableCell> : null}
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.serialNumber || '-'}</TableCell>
                    <TableCell className="max-w-xs">{row.details || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border-transparent capitalize', STATUS_STYLES[row.status])}>
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {replacements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                      No replacements yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
