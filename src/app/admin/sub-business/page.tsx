"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Briefcase, Check, Plus, Printer, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { brandedDocument, openPrintWindow } from '@/components/admin/credit-sheet/printSheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { BUSINESS_ENTRY_HELP, BUSINESS_ENTRY_LABELS, businessBalanceSheet, businessDayBook } from '@/lib/erp/business'
import { useERP } from '@/lib/erp/provider'
import type { BusinessEntryKind, BusinessRecord, DepositStatus } from '@/lib/erp/types'
import { escapeHtml, formatCurrency, formatDate, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

const KINDS = Object.keys(BUSINESS_ENTRY_LABELS) as BusinessEntryKind[]

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function SubBusinessPage() {
  const { data, currentUser, saveBusiness, deleteBusiness, submitBusinessEntry, reviewBusinessEntry, deleteBusinessEntry, hasPermission } = useERP()
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canAdd = hasPermission('finance.view')
  const currency = data?.settings.currency

  const businesses = useMemo(() => toArray(data?.businesses).sort((left, right) => left.name.localeCompare(right.name)), [data?.businesses])
  const allEntries = useMemo(() => toArray(data?.businessEntries), [data?.businessEntries])
  const [businessId, setBusinessId] = useState('')
  const business = (businessId ? data?.businesses[businessId] : businesses[0]) ?? null
  const [asOf, setAsOf] = useState(todayInput)

  const [setupOpen, setSetupOpen] = useState(false)
  const [setupEditing, setSetupEditing] = useState<BusinessRecord | null>(null)
  const [setupForm, setSetupForm] = useState({ name: '', description: '', openingCash: '0', openingStockValue: '0' })
  const [setupError, setSetupError] = useState<string | null>(null)

  const [entryForm, setEntryForm] = useState({ kind: 'deposit' as BusinessEntryKind, date: todayInput(), amount: '', stockValue: '', party: '', particulars: '' })
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const sheet = business ? businessBalanceSheet(business, allEntries, asOf) : null
  const dayBook = useMemo(() => (business ? businessDayBook(business, allEntries) : []), [allEntries, business])
  const pending = useMemo(
    () => sortByCreatedAtDesc(allEntries.filter((entry) => entry.businessId === business?.id && entry.status !== 'approved')),
    [allEntries, business?.id]
  )

  function openSetup(record: BusinessRecord | null) {
    setSetupEditing(record)
    setSetupError(null)
    setSetupForm({
      name: record?.name ?? '',
      description: record?.description ?? '',
      openingCash: String(record?.openingCash ?? 0),
      openingStockValue: String(record?.openingStockValue ?? 0),
    })
    setSetupOpen(true)
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSetupError(null)
    setBusy(true)
    try {
      const id = await saveBusiness(
        { name: setupForm.name, description: setupForm.description, openingCash: Number(setupForm.openingCash), openingStockValue: Number(setupForm.openingStockValue) },
        setupEditing?.id
      )
      setBusinessId(id)
      setSetupOpen(false)
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not save the business.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteBusiness() {
    if (!business || !window.confirm(`Remove ${business.name}?`)) return
    try {
      await deleteBusiness(business.id)
      setBusinessId('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not remove the business.' })
    }
  }

  async function handleEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!business) return
    setFeedback(null)
    setBusy(true)
    try {
      await submitBusinessEntry({
        businessId: business.id,
        kind: entryForm.kind,
        date: entryForm.date,
        amount: Number(entryForm.amount),
        stockValue: Number(entryForm.stockValue),
        party: entryForm.party,
        particulars: entryForm.particulars,
      })
      setFeedback({ tone: 'success', text: isAdmin ? 'Entry booked.' : 'Entry sent to an admin for approval.' })
      setEntryForm((current) => ({ ...current, amount: '', stockValue: '', party: '', particulars: '' }))
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the entry.' })
    } finally {
      setBusy(false)
    }
  }

  async function act(action: () => Promise<void>) {
    setFeedback(null)
    try {
      await action()
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Something went wrong.' })
    }
  }

  const balanceLines = sheet
    ? [
        { section: 'Assets', items: [['Stock value', sheet.stockValue], ['Cash', sheet.cash]] as const, total: ['Total assets', sheet.totalAssets] as const },
        {
          section: 'Money movement',
          items: [
            ['Capital invested', sheet.capital],
            ['Deposits received', sheet.deposits],
            ['Payments made', sheet.payments],
            ['Expenses', sheet.expenses],
            ['Owner withdrawals', sheet.withdrawals],
          ] as const,
        },
        {
          section: 'Trading',
          items: [
            ['Stock purchased', sheet.purchases],
            ['Sales', sheet.sales],
            ['Gross profit', sheet.grossProfit],
          ] as const,
          total: ['Net profit (after expenses)', sheet.netProfit] as const,
        },
      ]
    : []

  function handlePrint() {
    if (!business || !sheet) return
    const money = (value: number) => escapeHtml(formatCurrency(value, currency))
    const body = `
      <p class="section-title">${escapeHtml(business.name)} — as of ${escapeHtml(formatDate(asOf))}</p>
      <table>
        ${balanceLines
          .map(
            (group) => `
          <tr><th colspan="2">${escapeHtml(group.section)}</th></tr>
          ${group.items.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td class="numeric">${money(value)}</td></tr>`).join('')}
          ${group.total ? `<tr class="grand"><td>${escapeHtml(group.total[0])}</td><td class="numeric">${money(group.total[1])}</td></tr>` : ''}`
          )
          .join('')}
      </table>
      <p class="section-title">Day book</p>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Particulars</th><th class="numeric">Cash in</th><th class="numeric">Cash out</th><th class="numeric">Stock ±</th><th class="numeric">Cash</th><th class="numeric">Stock value</th></tr></thead>
        <tbody>
          ${dayBook
            .filter((line) => line.entry.date.slice(0, 10) <= asOf)
            .map(
              (line) => `<tr>
                <td>${escapeHtml(formatDate(line.entry.date))}</td>
                <td>${escapeHtml(BUSINESS_ENTRY_LABELS[line.entry.kind])}</td>
                <td>${escapeHtml([line.entry.party, line.entry.particulars].filter(Boolean).join(' — '))}</td>
                <td class="numeric">${line.cashIn ? money(line.cashIn) : ''}</td>
                <td class="numeric">${line.cashOut ? money(line.cashOut) : ''}</td>
                <td class="numeric">${line.stockChange ? money(line.stockChange) : ''}</td>
                <td class="numeric">${money(line.cash)}</td>
                <td class="numeric">${money(line.stock)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `
    const html = brandedDocument({ title: `${business.name} balance sheet`, heading: 'Balance sheet', badge: business.name, body })
    if (!openPrintWindow(html)) setFeedback({ tone: 'error', text: 'Allow popups to print the balance sheet.' })
  }

  const stockKinds: BusinessEntryKind[] = ['stock_purchase', 'sale']

  return (
    <AdminShell active="Sub Businesses">
      <div className="space-y-6">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Sub businesses
              </CardTitle>
              <CardDescription>
                Each sub business keeps its own books. Entries go through approval like the main trade and appear in the Daily Audit; the
                balance sheet shows stock value, cash, deposits, payments and expenses.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {businesses.length ? (
                <Select value={business?.id ?? ''} onValueChange={setBusinessId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select business" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {isAdmin ? (
                <Button type="button" className="gap-1.5" onClick={() => openSetup(null)}>
                  <Plus className="h-4 w-4" />
                  New business
                </Button>
              ) : null}
            </div>
          </CardHeader>
          {business ? (
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">{business.description || 'No description.'}</p>
              {isAdmin ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openSetup(business)}>
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void handleDeleteBusiness()}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </CardContent>
          ) : (
            <CardContent>
              <p className="py-6 text-center text-sm text-muted-foreground">
                {isAdmin ? 'No sub business yet. Start one with “New business”.' : 'No sub business has been set up yet.'}
              </p>
            </CardContent>
          )}
        </Card>

        {business && sheet ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Stock value', sheet.stockValue],
                ['Cash', sheet.cash],
                ['Deposits', sheet.deposits],
                ['Payments', sheet.payments],
                ['Expenses', sheet.expenses],
              ].map(([label, value]) => (
                <Card key={label as string}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(value as number, currency)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">Balance sheet</CardTitle>
                  <div className="flex gap-2">
                    <Input type="date" className="w-auto" value={asOf} onChange={(event) => setAsOf(event.target.value || todayInput())} />
                    <Button type="button" variant="outline" className="gap-1.5" onClick={handlePrint}>
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {balanceLines.map((group) => (
                        <FragmentGroup key={group.section} title={group.section}>
                          {group.items.map(([label, value]) => (
                            <TableRow key={label}>
                              <TableCell>{label}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(value, currency)}</TableCell>
                            </TableRow>
                          ))}
                          {group.total ? (
                            <TableRow className="bg-muted/50 font-semibold">
                              <TableCell>{group.total[0]}</TableCell>
                              <TableCell className={cn('text-right tabular-nums', group.total[1] < 0 && 'text-rose-600')}>{formatCurrency(group.total[1], currency)}</TableCell>
                            </TableRow>
                          ) : null}
                        </FragmentGroup>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="lg:self-start">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">New entry</CardTitle>
                  <CardDescription>{BUSINESS_ENTRY_HELP[entryForm.kind]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleEntry} className="space-y-3">
                    <Select value={entryForm.kind} onValueChange={(value) => setEntryForm((current) => ({ ...current, kind: value as BusinessEntryKind }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {BUSINESS_ENTRY_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={entryForm.date} onChange={(event) => setEntryForm((current) => ({ ...current, date: event.target.value }))} required />
                    <div className={cn('grid gap-2', stockKinds.includes(entryForm.kind) && 'grid-cols-2')}>
                      <Input
                        type="number"
                        step="any"
                        placeholder={entryForm.kind === 'stock_adjustment' ? 'Stock value change' : 'Amount (cash)'}
                        value={entryForm.amount}
                        onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))}
                      />
                      {stockKinds.includes(entryForm.kind) ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder={entryForm.kind === 'sale' ? 'Cost of goods sold' : 'Stock value'}
                          value={entryForm.stockValue}
                          onChange={(event) => setEntryForm((current) => ({ ...current, stockValue: event.target.value }))}
                        />
                      ) : null}
                    </div>
                    <Input placeholder="Party (optional)" value={entryForm.party} onChange={(event) => setEntryForm((current) => ({ ...current, party: event.target.value }))} />
                    <Textarea placeholder="Particulars" rows={2} value={entryForm.particulars} onChange={(event) => setEntryForm((current) => ({ ...current, particulars: event.target.value }))} required />
                    {feedback ? (
                      <p className={cn('text-sm', feedback.tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>{feedback.text}</p>
                    ) : null}
                    <Button type="submit" className="w-full" disabled={!canAdd || busy}>
                      {busy ? 'Saving...' : isAdmin ? 'Book entry' : 'Submit for approval'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {pending.length ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Waiting for approval / rejected</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Particulars</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Submitted by</TableHead>
                        <TableHead>Status</TableHead>
                        {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                          <TableCell>{BUSINESS_ENTRY_LABELS[entry.kind]}</TableCell>
                          <TableCell>{[entry.party, entry.particulars].filter(Boolean).join(' — ')}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                          <TableCell>{entry.submittedByName}</TableCell>
                          <TableCell>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[entry.status])}>{entry.status}</span>
                          </TableCell>
                          {isAdmin ? (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                {entry.status === 'pending' ? (
                                  <>
                                    <Button size="sm" className="gap-1" onClick={() => void act(() => reviewBusinessEntry(entry.id, 'approve'))}>
                                      <Check className="h-3.5 w-3.5" />
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => void act(() => reviewBusinessEntry(entry.id, 'reject'))}>
                                      Reject
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete entry" onClick={() => void act(() => deleteBusinessEntry(entry.id))}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Day book</CardTitle>
                <CardDescription>Approved entries with the running cash and stock value.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800 hover:bg-slate-800 [&>th]:text-white">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="text-right">Cash in</TableHead>
                      <TableHead className="text-right">Cash out</TableHead>
                      <TableHead className="text-right">Stock ±</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Stock value</TableHead>
                      {isAdmin ? <TableHead /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="text-muted-foreground">
                      <TableCell colSpan={6}>Opening</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(business.openingCash, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(business.openingStockValue, currency)}</TableCell>
                      {isAdmin ? <TableCell /> : null}
                    </TableRow>
                    {dayBook.map((line) => (
                      <TableRow key={line.entry.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(line.entry.date)}</TableCell>
                        <TableCell>{BUSINESS_ENTRY_LABELS[line.entry.kind]}</TableCell>
                        <TableCell>{[line.entry.party, line.entry.particulars].filter(Boolean).join(' — ')}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.cashIn ? formatCurrency(line.cashIn, currency) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.cashOut ? formatCurrency(line.cashOut, currency) : ''}</TableCell>
                        <TableCell className="text-right tabular-nums">{line.stockChange ? formatCurrency(line.stockChange, currency) : ''}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(line.cash, currency)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(line.stock, currency)}</TableCell>
                        {isAdmin ? (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Delete entry"
                              onClick={() => window.confirm('Delete this entry?') && void act(() => deleteBusinessEntry(line.entry.id))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{setupEditing ? `Edit ${setupEditing.name}` : 'New sub business'}</DialogTitle>
            <DialogDescription>The cash and stock it starts with open its balance sheet.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetup} className="space-y-3">
            <Input placeholder="Business name" value={setupForm.name} onChange={(event) => setSetupForm((current) => ({ ...current, name: event.target.value }))} required />
            <Textarea placeholder="What it does (optional)" rows={2} value={setupForm.description} onChange={(event) => setSetupForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Opening cash</p>
                <Input type="number" min={0} value={setupForm.openingCash} onChange={(event) => setSetupForm((current) => ({ ...current, openingCash: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Opening stock value</p>
                <Input type="number" min={0} value={setupForm.openingStockValue} onChange={(event) => setSetupForm((current) => ({ ...current, openingStockValue: event.target.value }))} />
              </div>
            </div>
            {setupError ? <p className="text-sm text-destructive">{setupError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSetupOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

function FragmentGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </TableCell>
      </TableRow>
      {children}
    </>
  )
}
