"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, FileSpreadsheet, FileText, Plus, Printer, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { divisionList, districtsForDivision, findDivisionForDistrict, thanasForDistrict } from '@/lib/data/bangladeshLocations'
import { useERP } from '@/lib/erp/provider'
import type { CreditLedgerEntryInput, CustomerRecord } from '@/lib/erp/types'
import { escapeHtml, exportPdf, exportXlsx, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'

type LedgerRow = {
  id: string
  date: string
  particulars: string
  qty: number | null
  unitPrice: number | null
  debit: number
  credit: number
  removable: boolean
}

type LedgerEntryFormState = {
  date: string
  particulars: string
  qty: string
  unitPrice: string
  debit: string
  credit: string
}

function emptyLedgerEntryForm(): LedgerEntryFormState {
  return {
    date: new Date().toISOString().slice(0, 10),
    particulars: '',
    qty: '',
    unitPrice: '',
    debit: '0',
    credit: '0',
  }
}

function zoneOf(customer: CustomerRecord) {
  return findDivisionForDistrict(customer.district) || 'Unassigned zone'
}

export default function CreditSheetPage() {
  const { data, recordCreditLedgerEntry, deleteCreditLedgerEntry } = useERP()
  const currency = data?.settings.currency
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const creditLedgerEntries = useMemo(() => toArray(data?.creditLedgerEntries), [data?.creditLedgerEntries])

  const [query, setQuery] = useState('')
  const [filterDivision, setFilterDivision] = useState('all')
  const [filterDistrict, setFilterDistrict] = useState('all')
  const [filterThana, setFilterThana] = useState('all')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [entryForm, setEntryForm] = useState<LedgerEntryFormState>(emptyLedgerEntryForm)
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [ledgerFeedback, setLedgerFeedback] = useState<string | null>(null)

  const filterDistrictOptions = useMemo(
    () => (filterDivision === 'all' ? [] : districtsForDivision(filterDivision)),
    [filterDivision]
  )
  const filterThanaOptions = useMemo(
    () => (filterDivision === 'all' || filterDistrict === 'all' ? [] : thanasForDistrict(filterDivision, filterDistrict)),
    [filterDivision, filterDistrict]
  )

  const customerRows = useMemo(() => {
    return customers.map((customer) => {
      const customerOrders = orders.filter((order) => order.customerId === customer.id)
      const purchaseTotal = customerOrders.reduce((sum, order) => sum + order.total, 0)
      return { customer, purchaseTotal }
    })
  }, [customers, orders])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const minPrice = priceMin.trim() ? Number(priceMin) : null
    const maxPrice = priceMax.trim() ? Number(priceMax) : null
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo) : null
    if (to) to.setHours(23, 59, 59, 999)

    return customerRows.filter(({ customer, purchaseTotal }) => {
      const matchesSearch =
        !normalizedQuery ||
        [customer.name, customer.company, customer.phone, customer.location].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesDivision = filterDivision === 'all' || zoneOf(customer) === filterDivision
      const matchesDistrict = filterDistrict === 'all' || customer.district === filterDistrict
      const matchesThana = filterThana === 'all' || customer.thana === filterThana
      const matchesMinPrice = minPrice === null || Number.isNaN(minPrice) || purchaseTotal >= minPrice
      const matchesMaxPrice = maxPrice === null || Number.isNaN(maxPrice) || purchaseTotal <= maxPrice
      const joinedDate = new Date(customer.createdAt)
      const matchesFrom = !from || joinedDate >= from
      const matchesTo = !to || joinedDate <= to

      return (
        matchesSearch &&
        matchesDivision &&
        matchesDistrict &&
        matchesThana &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesFrom &&
        matchesTo
      )
    })
  }, [customerRows, query, filterDivision, filterDistrict, filterThana, priceMin, priceMax, dateFrom, dateTo])

  const creditSheetGroups = useMemo(() => {
    const groups = new Map<string, typeof filteredRows>()

    for (const row of filteredRows) {
      const zone = zoneOf(row.customer)
      const rowsForZone = groups.get(zone) ?? []
      rowsForZone.push(row)
      groups.set(zone, rowsForZone)
    }

    return Array.from(groups.entries())
      .map(([zone, rows]) => ({
        zone,
        rows: [...rows].sort((left, right) => left.customer.name.localeCompare(right.customer.name)),
      }))
      .sort((left, right) => left.zone.localeCompare(right.zone))
  }, [filteredRows])

  const metrics = useMemo(() => {
    return {
      totalDealers: filteredRows.length,
      purchaseTotal: filteredRows.reduce((sum, row) => sum + row.purchaseTotal, 0),
      dueTotal: filteredRows.reduce((sum, row) => sum + row.customer.due, 0),
    }
  }, [filteredRows])

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId]
  )

  const selectedCustomerSerial = useMemo(() => {
    if (!selectedCustomer) return 0
    const zone = zoneOf(selectedCustomer)
    const zoneCustomers = customers
      .filter((customer) => zoneOf(customer) === zone)
      .sort((left, right) => left.name.localeCompare(right.name))
    return zoneCustomers.findIndex((customer) => customer.id === selectedCustomer.id) + 1
  }, [customers, selectedCustomer])

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!selectedCustomerId) return []
    const rows: LedgerRow[] = []

    for (const order of orders.filter((entry) => entry.customerId === selectedCustomerId)) {
      for (const item of order.items) {
        rows.push({
          id: `${order.id}-${item.productId}`,
          date: order.createdAt,
          particulars: item.productName,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          debit: 0,
          credit: item.quantity * item.unitPrice,
          removable: false,
        })
      }
      if (order.paid > 0) {
        rows.push({
          id: `${order.id}-payment`,
          date: order.createdAt,
          particulars: `Payment received (${order.billNumber})`,
          qty: null,
          unitPrice: null,
          debit: order.paid,
          credit: 0,
          removable: false,
        })
      }
    }

    for (const entry of creditLedgerEntries.filter((item) => item.customerId === selectedCustomerId)) {
      rows.push({
        id: entry.id,
        date: entry.date,
        particulars: entry.particulars,
        qty: entry.qty || null,
        unitPrice: entry.unitPrice || null,
        debit: entry.debit,
        credit: entry.credit,
        removable: true,
      })
    }

    return rows.sort((left, right) => left.date.localeCompare(right.date))
  }, [orders, creditLedgerEntries, selectedCustomerId])

  const ledgerWithBalance = useMemo(() => {
    let balance = 0
    return ledgerRows.map((row) => {
      balance += row.credit - row.debit
      return { ...row, balance }
    })
  }, [ledgerRows])

  const ledgerTotals = useMemo(() => {
    return {
      qty: ledgerRows.reduce((sum, row) => sum + (row.qty ?? 0), 0),
      debit: ledgerRows.reduce((sum, row) => sum + row.debit, 0),
      credit: ledgerRows.reduce((sum, row) => sum + row.credit, 0),
      balance: ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].balance : 0,
    }
  }, [ledgerRows, ledgerWithBalance])

  function handleExportXlsx() {
    let serial = 0
    void exportXlsx(
      'credit-sheet.xlsx',
      'Credit Sheet',
      ['SL', 'Zone', 'Dealer', 'Mobile', 'Total purchase', 'Paid', 'Due (credit)'],
      creditSheetGroups.flatMap(({ zone, rows }) =>
        rows.map(({ customer, purchaseTotal }) => {
          serial += 1
          return [serial, zone, customer.name, customer.phone, purchaseTotal, purchaseTotal - customer.due, customer.due]
        })
      )
    )
  }

  function handleExportPdf() {
    let serial = 0
    void exportPdf(
      'credit-sheet.pdf',
      'Credit Sheet',
      ['SL', 'Zone', 'Dealer', 'Mobile', 'Total purchase', 'Paid', 'Due (credit)'],
      creditSheetGroups.flatMap(({ zone, rows }) =>
        rows.map(({ customer, purchaseTotal }) => {
          serial += 1
          return [
            serial,
            zone,
            customer.name,
            customer.phone,
            formatCurrency(purchaseTotal, currency),
            formatCurrency(purchaseTotal - customer.due, currency),
            formatCurrency(customer.due, currency),
          ]
        })
      )
    )
  }

  function openEntryDialog() {
    setEntryForm(emptyLedgerEntryForm())
    setLedgerFeedback(null)
    setEntryDialogOpen(true)
  }

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomerId) return
    setLedgerFeedback(null)
    setIsSavingEntry(true)

    try {
      const input: CreditLedgerEntryInput = {
        customerId: selectedCustomerId,
        date: entryForm.date,
        particulars: entryForm.particulars,
        qty: entryForm.qty ? Number(entryForm.qty) : undefined,
        unitPrice: entryForm.unitPrice ? Number(entryForm.unitPrice) : undefined,
        debit: Number(entryForm.debit || 0),
        credit: Number(entryForm.credit || 0),
      }
      await recordCreditLedgerEntry(input)
      setEntryDialogOpen(false)
      setEntryForm(emptyLedgerEntryForm())
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to save ledger entry.')
    } finally {
      setIsSavingEntry(false)
    }
  }

  async function handleDeleteEntry(entryId: string) {
    setLedgerFeedback(null)
    try {
      await deleteCreditLedgerEntry(entryId)
    } catch (reason) {
      setLedgerFeedback(reason instanceof Error ? reason.message : 'Unable to delete ledger entry.')
    }
  }

  function handlePrintLedger() {
    if (!selectedCustomer) return

    const rows = ledgerWithBalance
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(formatDate(row.date))}</td>
            <td>${escapeHtml(row.particulars)}</td>
            <td class="numeric">${row.qty ?? ''}</td>
            <td class="numeric">${row.unitPrice ? formatCurrency(row.unitPrice, currency) : ''}</td>
            <td class="numeric">${row.debit ? formatCurrency(row.debit, currency) : ''}</td>
            <td class="numeric">${row.credit ? formatCurrency(row.credit, currency) : ''}</td>
            <td>${row.balance >= 0 ? 'Cr' : 'Dr'}</td>
            <td class="numeric">${formatCurrency(Math.abs(row.balance), currency)}</td>
          </tr>
        `
      )
      .join('')

    const zone = zoneOf(selectedCustomer)
    const generatedAt = new Intl.DateTimeFormat('en-BD', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Ledger - ${escapeHtml(selectedCustomer.name)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { margin: 0; }
            body { color: #111827; font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; }
            .top-row { display: flex; justify-content: space-between; font-size: 11px; color: #4b5563; }
            .brand { align-items: center; display: flex; gap: 14px; justify-content: center; margin-top: 12px; }
            .brand h1 { font-size: 26px; letter-spacing: .02em; margin: 0; }
            .ledger-title { font-size: 15px; font-weight: 700; letter-spacing: .1em; margin: 10px 0 16px; text-align: center; text-transform: uppercase; }
            table.info { border-collapse: collapse; margin-bottom: 18px; width: 100%; }
            table.info td { border: 1px solid #9ca3af; font-size: 12px; padding: 6px 10px; }
            table.info td.label { background: #f3f4f6; font-weight: 700; width: 14%; }
            table.ledger { border-collapse: collapse; margin-top: 6px; width: 100%; }
            table.ledger th, table.ledger td { border: 1px solid #9ca3af; font-size: 11px; padding: 6px 8px; }
            table.ledger th { background: #eef2ff; text-transform: uppercase; }
            .numeric { text-align: right; }
            tfoot td { background: #dbeafe; font-weight: 700; }
            .print-date { color: #6b7280; font-size: 10px; margin-top: 18px; text-align: right; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="top-row">
            <span>${escapeHtml(zone)} Zone_Power Int.</span>
            <span>${escapeHtml(selectedCustomer.name)}</span>
          </div>
          <div class="brand">
            <h1>POWER INTERNATIONAL BD</h1>
          </div>
          <p class="ledger-title">Leadger</p>

          <table class="info">
            <tr>
              <td class="label">Account of</td>
              <td>${escapeHtml(selectedCustomer.name)}</td>
              <td class="label">Owner Name</td>
              <td>${escapeHtml(selectedCustomer.company || 'N/A')}</td>
            </tr>
            <tr>
              <td class="label">Address</td>
              <td>${escapeHtml(selectedCustomer.location || 'N/A')}</td>
              <td class="label">SL. No.</td>
              <td>${selectedCustomerSerial}</td>
            </tr>
            <tr>
              <td class="label">Contact No.</td>
              <td>${escapeHtml(selectedCustomer.phone || 'N/A')}</td>
              <td class="label">Email</td>
              <td>${escapeHtml(selectedCustomer.email || 'N/A')}</td>
            </tr>
          </table>

          <table class="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th class="numeric">Qty</th>
                <th class="numeric">Unit Price</th>
                <th class="numeric">Debit</th>
                <th class="numeric">Credit</th>
                <th>Dr/Cr</th>
                <th class="numeric">Balance</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2">Total</td>
                <td class="numeric">${ledgerTotals.qty}</td>
                <td></td>
                <td class="numeric">${formatCurrency(ledgerTotals.debit, currency)}</td>
                <td class="numeric">${formatCurrency(ledgerTotals.credit, currency)}</td>
                <td>${ledgerTotals.balance >= 0 ? 'Cr' : 'Dr'}</td>
                <td class="numeric">${formatCurrency(Math.abs(ledgerTotals.balance), currency)}</td>
              </tr>
            </tfoot>
          </table>

          <p class="print-date">${escapeHtml(generatedAt)}</p>
          <script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `

    const popup = window.open('', '_blank', 'width=1000,height=760')
    if (!popup) {
      setLedgerFeedback('Allow popups to print or save the ledger as PDF.')
      return
    }

    popup.document.open()
    popup.document.write(html)
    popup.document.close()
  }

  if (selectedCustomer) {
    return (
      <AdminShell active="Credit Sheet">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setSelectedCustomerId(null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to credit sheet
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handlePrintLedger}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print / PDF ledger
              </Button>
              <Button type="button" size="sm" className="rounded-lg" onClick={openEntryDialog}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add ledger entry
              </Button>
            </div>
          </div>

          {ledgerFeedback ? (
            <Card className="border-border/70 bg-primary/5 shadow-sm">
              <CardContent className="p-4 text-sm text-primary">{ledgerFeedback}</CardContent>
            </Card>
          ) : null}

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>{selectedCustomer.name}</CardTitle>
              <CardDescription>Full account statement (ledger) and contact details for this dealer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-border/70 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">SL. No.</p>
                  <p className="font-medium">{selectedCustomerSerial}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Owner Name</p>
                  <p className="font-medium">{selectedCustomer.company || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Zone</p>
                  <p className="font-medium">
                    {[selectedCustomer.thana, selectedCustomer.district, zoneOf(selectedCustomer)].filter(Boolean).join(', ') || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contact No.</p>
                  <p className="font-medium">{selectedCustomer.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedCustomer.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{selectedCustomer.location || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">NID No</p>
                  <p className="font-medium">{selectedCustomer.nid || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trade License No</p>
                  <p className="font-medium">{selectedCustomer.tradeLicenseNo || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank</p>
                  <p className="font-medium">
                    {selectedCustomer.bankName || 'N/A'}
                    {selectedCustomer.branchName ? ` (${selectedCustomer.branchName})` : ''}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Dr/Cr</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerWithBalance.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>{row.particulars}</TableCell>
                        <TableCell className="text-right">{row.qty ?? ''}</TableCell>
                        <TableCell className="text-right">{row.unitPrice ? formatCurrency(row.unitPrice, currency) : ''}</TableCell>
                        <TableCell className="text-right">{row.debit ? formatCurrency(row.debit, currency) : ''}</TableCell>
                        <TableCell className="text-right">{row.credit ? formatCurrency(row.credit, currency) : ''}</TableCell>
                        <TableCell>{row.balance >= 0 ? 'Cr' : 'Dr'}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Math.abs(row.balance), currency)}</TableCell>
                        <TableCell className="text-right">
                          {row.removable ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => void handleDeleteEntry(row.id)}
                              aria-label="Delete ledger entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {ledgerWithBalance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                          No ledger entries yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                  {ledgerWithBalance.length > 0 ? (
                    <TableFooter>
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{ledgerTotals.qty}</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{formatCurrency(ledgerTotals.debit, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(ledgerTotals.credit, currency)}</TableCell>
                        <TableCell>{ledgerTotals.balance >= 0 ? 'Cr' : 'Dr'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Math.abs(ledgerTotals.balance), currency)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add ledger entry</DialogTitle>
              <DialogDescription>
                Record a deposit, delivery fee, return, or any other manual entry for {selectedCustomer.name}.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={handleEntrySubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={entryForm.date}
                    onChange={(event) => setEntryForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Particulars<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={entryForm.particulars}
                    onChange={(event) => setEntryForm((current) => ({ ...current, particulars: event.target.value }))}
                    placeholder="e.g. Deposit (DBBL), Delivery Fee, Return"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Qty <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.qty}
                    onChange={(event) => setEntryForm((current) => ({ ...current, qty: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Unit price <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.unitPrice}
                    onChange={(event) => setEntryForm((current) => ({ ...current, unitPrice: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Debit ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.debit}
                    onChange={(event) => setEntryForm((current) => ({ ...current, debit: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Payments, deposits, or returns that reduce the balance.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Credit ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={entryForm.credit}
                    onChange={(event) => setEntryForm((current) => ({ ...current, credit: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Goods taken or charges that increase the balance.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEntryDialogOpen(false)} disabled={isSavingEntry}>
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl" disabled={isSavingEntry}>
                  {isSavingEntry ? 'Saving...' : 'Save entry'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </AdminShell>
    )
  }

  return (
    <AdminShell active="Credit Sheet">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Dealers', metrics.totalDealers.toLocaleString('en-BD'), 'Matching current filters'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From sales history'],
            ['Due (credit)', formatCurrency(metrics.dueTotal, currency), 'Outstanding across dealers'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Credit sheet</CardTitle>
              <CardDescription>Grouped by name and zone — every dealer&apos;s running account.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleExportXlsx}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                Export XLSX
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleExportPdf}>
                <FileText className="mr-1.5 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <div className="space-y-1.5 xl:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Search</p>
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Division</p>
                <Select
                  value={filterDivision}
                  onValueChange={(value) => {
                    setFilterDivision(value)
                    setFilterDistrict('all')
                    setFilterThana('all')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All divisions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All divisions</SelectItem>
                    {divisionList.map((division) => (
                      <SelectItem key={division} value={division}>
                        {division}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">District</p>
                <Select
                  value={filterDistrict}
                  disabled={filterDivision === 'all'}
                  onValueChange={(value) => {
                    setFilterDistrict(value)
                    setFilterThana('all')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All districts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All districts</SelectItem>
                    {filterDistrictOptions.map((district) => (
                      <SelectItem key={district} value={district}>
                        {district}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Thana</p>
                <Select value={filterThana} disabled={filterDistrict === 'all'} onValueChange={setFilterThana}>
                  <SelectTrigger>
                    <SelectValue placeholder="All thanas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All thanas</SelectItem>
                    {filterThanaOptions.map((thana) => (
                      <SelectItem key={thana} value={thana}>
                        {thana}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Min purchase</p>
                <Input type="number" min="0" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Max purchase</p>
                <Input type="number" min="0" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="No limit" />
              </div>
            </div>

            {creditSheetGroups.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No customers match the current filters.</p>
            ) : (
              <div className="space-y-6">
                {creditSheetGroups.map(({ zone, rows }) => (
                  <div key={zone} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{zone}</p>
                    <div className="overflow-x-auto rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>SL</TableHead>
                            <TableHead>Dealer</TableHead>
                            <TableHead>Mobile</TableHead>
                            <TableHead className="text-right">Total purchase</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Due (credit)</TableHead>
                            <TableHead className="text-right">Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map(({ customer, purchaseTotal }, index) => (
                            <TableRow key={customer.id}>
                              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>{customer.phone}</TableCell>
                              <TableCell className="text-right">{formatCurrency(purchaseTotal, currency)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(purchaseTotal - customer.due, currency)}</TableCell>
                              <TableCell className="text-right font-medium text-amber-700 dark:text-amber-400">
                                {formatCurrency(customer.due, currency)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setSelectedCustomerId(customer.id)}
                                  aria-label={`View ${customer.name} details`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
