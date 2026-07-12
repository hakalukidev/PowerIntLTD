"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, MapPin, Phone, Plus, Search, Trash2 } from 'lucide-react'

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { SellerInput, SellerRecord, SellerTransactionInput } from '@/lib/erp/types'
import { exportPdf, exportXlsx, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SellerFormState = {
  name: string
  phone: string
  location: string
  notes: string
}

const emptySellerForm: SellerFormState = { name: '', phone: '', location: '', notes: '' }

type TransactionFormState = {
  sellerId: string
  date: string
  itemsTaken: string
  takenValue: string
  cashGiven: string
  goodsBroughtDescription: string
  iReceiveAmount: string
  theyReceiveAmount: string
}

function emptyTransactionForm(sellerId: string): TransactionFormState {
  return {
    sellerId,
    date: new Date().toISOString().slice(0, 10),
    itemsTaken: '',
    takenValue: '0',
    cashGiven: '0',
    goodsBroughtDescription: '',
    iReceiveAmount: '0',
    theyReceiveAmount: '0',
  }
}

function formFromSeller(seller: SellerRecord): SellerFormState {
  return {
    name: seller.name,
    phone: seller.phone,
    location: seller.location,
    notes: seller.notes,
  }
}

export default function SellerListPage() {
  const { data, saveSeller, deleteSeller, recordSellerTransaction, deleteSellerTransaction } = useERP()
  const currency = data?.settings.currency
  const sellers = useMemo(() => toArray(data?.sellers), [data?.sellers])
  const transactions = useMemo(() => toArray(data?.sellerTransactions), [data?.sellerTransactions])

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<SellerRecord | null>(null)
  const [sellerForm, setSellerForm] = useState<SellerFormState>(emptySellerForm)
  const [txnDialogOpen, setTxnDialogOpen] = useState(false)
  const [txnForm, setTxnForm] = useState<TransactionFormState>(emptyTransactionForm(''))
  const [feedback, setFeedback] = useState<string | null>(null)

  const sellerRows = useMemo(() => {
    return sellers
      .map((seller) => {
        const sellerTransactions = transactions
          .filter((txn) => txn.sellerId === seller.id)
          .sort((left, right) => right.date.localeCompare(left.date))
        const owedToMe = sellerTransactions.reduce((sum, txn) => sum + txn.iReceiveAmount, 0)
        const owedByMe = sellerTransactions.reduce((sum, txn) => sum + txn.theyReceiveAmount, 0)

        return { seller, sellerTransactions, owedToMe, owedByMe, hasTransactions: sellerTransactions.length > 0 }
      })
      .sort((left, right) => left.seller.name.localeCompare(right.seller.name))
  }, [sellers, transactions])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return sellerRows

    return sellerRows.filter(({ seller }) =>
      [seller.name, seller.phone, seller.location].join(' ').toLowerCase().includes(normalizedQuery)
    )
  }, [sellerRows, query])

  const metrics = useMemo(() => {
    return {
      totalSellers: sellers.length,
      owedToMe: sellerRows.reduce((sum, row) => sum + row.owedToMe, 0),
      owedByMe: sellerRows.reduce((sum, row) => sum + row.owedByMe, 0),
      totalTransactions: transactions.length,
    }
  }, [sellerRows, sellers.length, transactions.length])

  const ledgerRows = useMemo(() => {
    return transactions
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((txn, index) => ({ serial: transactions.length - index, txn }))
  }, [transactions])

  function openCreateDialog() {
    setEditingSeller(null)
    setSellerForm(emptySellerForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(seller: SellerRecord) {
    setEditingSeller(seller)
    setSellerForm(formFromSeller(seller))
    setFeedback(null)
    setDialogOpen(true)
  }

  function openTransactionDialog(sellerId: string) {
    setTxnForm(emptyTransactionForm(sellerId))
    setFeedback(null)
    setTxnDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: SellerInput = {
      name: sellerForm.name,
      phone: sellerForm.phone,
      location: sellerForm.location,
      notes: sellerForm.notes,
    }

    try {
      await saveSeller(input, editingSeller?.id)
      setDialogOpen(false)
      setSellerForm(emptySellerForm)
      setEditingSeller(null)
      setFeedback(editingSeller ? 'Seller details updated.' : 'New seller added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save seller.')
    }
  }

  async function handleDelete(seller: SellerRecord) {
    setFeedback(null)

    try {
      await deleteSeller(seller.id)
      setFeedback(`${seller.name} removed from seller list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete seller.')
    }
  }

  async function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: SellerTransactionInput = {
      sellerId: txnForm.sellerId,
      date: txnForm.date,
      itemsTaken: txnForm.itemsTaken,
      takenValue: Number(txnForm.takenValue),
      cashGiven: Number(txnForm.cashGiven),
      goodsBroughtDescription: txnForm.goodsBroughtDescription,
      iReceiveAmount: Number(txnForm.iReceiveAmount),
      theyReceiveAmount: Number(txnForm.theyReceiveAmount),
    }

    try {
      await recordSellerTransaction(input)
      setTxnDialogOpen(false)
      setFeedback('Ledger entry recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record ledger entry.')
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    setFeedback(null)

    try {
      await deleteSellerTransaction(transactionId)
      setFeedback('Ledger entry removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove ledger entry.')
    }
  }

  function handleExportXlsx() {
    void exportXlsx(
      'seller-ledger.xlsx',
      'Seller Ledger',
      ['Serial', 'Date', 'Seller', 'Phone', 'Taken', 'Given', 'I receive', 'They receive'],
      ledgerRows.map(({ serial, txn }) => [
        serial,
        formatDate(txn.date),
        txn.sellerName,
        sellers.find((seller) => seller.id === txn.sellerId)?.phone ?? '',
        txn.takenValue,
        txn.cashGiven,
        txn.iReceiveAmount,
        txn.theyReceiveAmount,
      ])
    )
  }

  function handleExportPdf() {
    void exportPdf(
      'seller-ledger.pdf',
      'Seller Ledger',
      ['Serial', 'Date', 'Seller', 'Taken', 'Given', 'I receive', 'They receive'],
      ledgerRows.map(({ serial, txn }) => [
        serial,
        formatDate(txn.date),
        txn.sellerName,
        txn.takenValue,
        txn.cashGiven,
        txn.iReceiveAmount,
        txn.theyReceiveAmount,
      ])
    )
  }

  return (
    <AdminShell active="Seller List">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Sellers', metrics.totalSellers.toLocaleString('en-BD'), 'Sub-dealer / consignment partners'],
            ['I receive', formatCurrency(metrics.owedToMe, currency), 'Owed to us across sellers'],
            ['They receive', formatCurrency(metrics.owedByMe, currency), 'We owe sellers'],
            ['Ledger entries', metrics.totalTransactions.toLocaleString('en-BD'), 'Recorded transactions'],
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

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Sellers</CardTitle>
              <CardDescription>Search by name, phone, or location.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search sellers"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add seller
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Seller</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>I receive</TableHead>
                    <TableHead>They receive</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ seller, owedToMe, owedByMe, hasTransactions }) => (
                    <TableRow
                      key={seller.id}
                      className={cn(owedToMe > 0 || owedByMe > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : '')}
                    >
                      <TableCell className="min-w-48">
                        <p className="font-semibold">{seller.name}</p>
                        <p className="text-xs text-muted-foreground">{seller.notes || 'No notes'}</p>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{seller.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{seller.location || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn(owedToMe > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(owedToMe, currency)}
                      </TableCell>
                      <TableCell className={cn(owedByMe > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(owedByMe, currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" className="h-9 rounded-lg px-3 text-xs" onClick={() => openTransactionDialog(seller.id)}>
                            Add entry
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(seller)} aria-label={`Edit ${seller.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(seller)}
                            disabled={hasTransactions}
                            aria-label={`Delete ${seller.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No sellers found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Ledger</CardTitle>
              <CardDescription>Serial, date, seller, taken, given, receivable and payable.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={handleExportXlsx}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={handleExportPdf}>
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Serial</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Taken</TableHead>
                    <TableHead>Given</TableHead>
                    <TableHead>I receive</TableHead>
                    <TableHead>They receive</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map(({ serial, txn }) => (
                    <TableRow
                      key={txn.id}
                      className={cn(
                        txn.iReceiveAmount > 0 || txn.theyReceiveAmount > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : ''
                      )}
                    >
                      <TableCell>{serial}</TableCell>
                      <TableCell>{formatDate(txn.date)}</TableCell>
                      <TableCell className="min-w-40">{txn.sellerName}</TableCell>
                      <TableCell className="min-w-48 text-xs text-muted-foreground">
                        {txn.itemsTaken || '-'}
                        {txn.takenValue ? <p className="font-medium text-foreground">{formatCurrency(txn.takenValue, currency)}</p> : null}
                      </TableCell>
                      <TableCell>{formatCurrency(txn.cashGiven, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.iReceiveAmount, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.theyReceiveAmount, currency)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDeleteTransaction(txn.id)}
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {ledgerRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                        No ledger entries yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSeller ? 'Edit seller' : 'Add new seller'}</DialogTitle>
            <DialogDescription>Sub-dealers and consignment partners who both buy from and sell to us.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Seller name<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={sellerForm.name}
                  onChange={(event) => setSellerForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Rahim Enterprise"
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Phone number<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={sellerForm.phone}
                  onChange={(event) => setSellerForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="e.g. 01711-000000"
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">
                  Location <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={sellerForm.location}
                  onChange={(event) => setSellerForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="e.g. Chattogram"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea
                value={sellerForm.notes}
                onChange={(event) => setSellerForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Anything worth remembering about this seller"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingSeller ? 'Update seller' : 'Save seller'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add ledger entry</DialogTitle>
            <DialogDescription>Record what was taken, given, and the resulting balances.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleTransactionSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goods</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={txnForm.date}
                    onChange={(event) => setTxnForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Products taken <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={txnForm.itemsTaken}
                    onChange={(event) => setTxnForm((current) => ({ ...current, itemsTaken: event.target.value }))}
                    placeholder="e.g. 10 x Polo Shirt"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Value of goods taken ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.takenValue}
                    onChange={(event) => setTxnForm((current) => ({ ...current, takenValue: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Goods returned by seller <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={txnForm.goodsBroughtDescription}
                    onChange={(event) =>
                      setTxnForm((current) => ({ ...current, goodsBroughtDescription: event.target.value }))
                    }
                    placeholder="e.g. 2 x Polo Shirt returned unsold"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money settlement</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Cash given to seller ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.cashGiven}
                    onChange={(event) => setTxnForm((current) => ({ ...current, cashGiven: event.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Seller owes us ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.iReceiveAmount}
                    onChange={(event) => setTxnForm((current) => ({ ...current, iReceiveAmount: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Adds to the balance the seller owes you.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">We owe seller ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.theyReceiveAmount}
                    onChange={(event) => setTxnForm((current) => ({ ...current, theyReceiveAmount: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Adds to the balance you owe the seller.</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Net effect of this entry: </span>
                {(() => {
                  const net = Number(txnForm.iReceiveAmount || 0) - Number(txnForm.theyReceiveAmount || 0)
                  if (net === 0) return <span className="font-medium">No change to balance</span>
                  return (
                    <span className="font-medium">
                      {net > 0
                        ? `Seller will owe you ${formatCurrency(net, currency)} more`
                        : `You will owe the seller ${formatCurrency(Math.abs(net), currency)} more`}
                    </span>
                  )
                })()}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setTxnDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Save entry
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
