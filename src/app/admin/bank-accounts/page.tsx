"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { BankAccountInput, BankAccountRecord, BankAccountSide } from '@/lib/erp/types'
import { partyCode, toArray, userRoleIds } from '@/lib/erp/utils'

const SIDE_LABELS: Record<BankAccountSide, string> = {
  sender: 'Sender (our account)',
  receiver: 'Receiver',
}

function emptyDraft(side: BankAccountSide): BankAccountInput {
  return { side, bankName: '', accountName: '', accountNumber: '', branch: '', routingNumber: '', supplierId: '' }
}

export default function BankAccountsPage() {
  const { data, currentUser, deleteBankAccount } = useERP()
  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false

  const [editing, setEditing] = useState<{ id?: string; draft: BankAccountInput } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accounts = useMemo(
    () => toArray(data?.bankAccounts).sort((left, right) => left.bankName.localeCompare(right.bankName)),
    [data?.bankAccounts]
  )

  async function handleDelete(account: BankAccountRecord) {
    if (!window.confirm(`Remove ${account.bankName} (${account.accountNumber})? Past payments keep their record.`)) return
    setError(null)
    try {
      await deleteBankAccount(account.id)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove the account.')
    }
  }

  function editAccount(account: BankAccountRecord) {
    setEditing({
      id: account.id,
      draft: {
        side: account.side,
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        branch: account.branch,
        routingNumber: account.routingNumber,
        supplierId: account.supplierId ?? '',
      },
    })
  }

  return (
    <AdminShell active="Bank Accounts">
      <div className="space-y-6">
        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>
        ) : null}
        {(['sender', 'receiver'] as const).map((side) => {
          const rows = accounts.filter((account) => account.side === side)
          return (
            <Card key={side}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>{side === 'sender' ? 'Sender banks' : 'Receiver banks'}</CardTitle>
                  <CardDescription>
                    {side === 'sender'
                      ? 'Company accounts payments are sent from — the “From” list on the payment form.'
                      : 'Accounts payments are sent to — the “To” list. Link one to a supplier to offer it first for them.'}
                  </CardDescription>
                </div>
                {isAdmin ? (
                  <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setEditing({ draft: emptyDraft(side) })}>
                    <Plus className="h-4 w-4" />
                    Add bank
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No {side} banks yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account holder</TableHead>
                        <TableHead>Account no.</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Routing no.</TableHead>
                        {side === 'receiver' ? <TableHead>Supplier</TableHead> : null}
                        {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">{account.bankName}</TableCell>
                          <TableCell>{account.accountName}</TableCell>
                          <TableCell className="tabular-nums">{account.accountNumber}</TableCell>
                          <TableCell>{account.branch || '—'}</TableCell>
                          <TableCell className="tabular-nums">{account.routingNumber || '—'}</TableCell>
                          {side === 'receiver' ? (
                            <TableCell>{account.supplierId ? data?.suppliers[account.supplierId]?.name ?? '—' : 'Any'}</TableCell>
                          ) : null}
                          {isAdmin ? (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button type="button" variant="ghost" size="icon" aria-label="Edit account" onClick={() => editAccount(account)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" aria-label="Remove account" onClick={() => void handleDelete(account)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {editing ? <BankAccountDialog key={editing.id ?? editing.draft.side} accountId={editing.id} initial={editing.draft} onClose={() => setEditing(null)} /> : null}
    </AdminShell>
  )
}

function BankAccountDialog({ accountId, initial, onClose }: { accountId?: string; initial: BankAccountInput; onClose: () => void }) {
  const { data, saveBankAccount } = useERP()
  const [draft, setDraft] = useState(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supplierOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Any supplier' },
      ...toArray(data?.suppliers)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((supplier) => ({ value: supplier.id, label: supplier.name, sublabel: `ID ${partyCode(supplier)} · ${supplier.phone}` })),
    ],
    [data?.suppliers]
  )

  function set<K extends keyof BankAccountInput>(key: K, value: BankAccountInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      await saveBankAccount(draft, accountId)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the account.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{accountId ? 'Edit bank account' : 'Add bank account'}</DialogTitle>
          <DialogDescription>Shown on the supplier payment form.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Type</p>
            <Select value={draft.side} onValueChange={(value) => set('side', value as BankAccountSide)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['sender', 'receiver'] as const).map((side) => (
                  <SelectItem key={side} value={side}>
                    {SIDE_LABELS[side]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Bank name<span className="ml-0.5 text-rose-500">*</span></p>
            <Input value={draft.bankName} onChange={(event) => set('bankName', event.target.value)} placeholder="e.g. UCB" required />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Account holder name<span className="ml-0.5 text-rose-500">*</span></p>
            <Input value={draft.accountName} onChange={(event) => set('accountName', event.target.value)} required />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Account no.<span className="ml-0.5 text-rose-500">*</span></p>
            <Input value={draft.accountNumber} onChange={(event) => set('accountNumber', event.target.value)} required />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Branch</p>
            <Input value={draft.branch} onChange={(event) => set('branch', event.target.value)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Routing no.</p>
            <Input value={draft.routingNumber} onChange={(event) => set('routingNumber', event.target.value)} />
          </div>
          {draft.side === 'receiver' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Supplier</p>
              <Combobox
                options={supplierOptions}
                value={draft.supplierId ?? ''}
                onChange={(value) => set('supplierId', value)}
                placeholder="Any supplier"
                searchPlaceholder="Search supplier..."
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600 sm:col-span-2">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
