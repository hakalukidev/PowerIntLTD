'use client'

import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { Check, FileImage, Plus, Settings2, Trash2, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { DepositStatus, ExpenseRecord, TaDailyEntry, TaType } from '@/lib/erp/types'
import {
  EMPLOYEE_EXPENSE_CATEGORIES,
  formatCurrency,
  formatDate,
  getExpenseCategories,
  isDefaultExpenseCategory,
  TA_CATEGORY,
  toArray,
  userRoleIds,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const EXPENSE_DOCUMENT_FOLDER = 'expenses'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const TA_VEHICLES = ['Bus', 'CNG', 'Rickshaw', 'Train', 'Launch', 'Office Vehicle', 'Own Bike', 'Own Car', 'Other']
/** Trips on a personal bike/car are claimed as the petrol bill. */
const OWN_VEHICLES = ['Own Bike', 'Own Car']

type TaRow = Omit<TaDailyEntry, 'date' | 'amount'> & { amount: string }

function emptyTaRow(): TaRow {
  return { from: '', to: '', reason: '', person: '', vehicle: '', amount: '' }
}

export default function ExpensePage() {
  const { data, currentUser, submitExpense, reviewExpense, updateSettings } = useERP()

  const [date, setDate] = useState(todayInput)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [expenseBy, setExpenseBy] = useState('')
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [taType, setTaType] = useState<TaType>('fixed')
  const [taRows, setTaRows] = useState<TaRow[]>(() => [emptyTaRow()])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const customCategories = data?.settings.expenseCategories ?? []
  const categories = getExpenseCategories(customCategories)
  const isTa = category === TA_CATEGORY
  const isActualTa = isTa && taType === 'actual'
  const needsEmployee = EMPLOYEE_EXPENSE_CATEGORIES.includes(category)
  const taTotal = taRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  function updateTaRow(index: number, patch: Partial<TaRow>) {
    setTaRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const expenseByOptions = useMemo<ComboboxOption[]>(() => {
    const names = new Set<string>()
    if (currentUser?.name) names.add(currentUser.name)
    toArray(data?.employees).forEach((employee) => employee.name && names.add(employee.name))
    toArray(data?.users).forEach((user) => user.name && names.add(user.name))
    return [...names].sort((left, right) => left.localeCompare(right)).map((name) => ({ value: name, label: name }))
  }, [currentUser?.name, data?.employees, data?.users])

  // Only expenses sent through this form carry a status; finance-page entries stay out of the approval list.
  const expenses = useMemo(
    () =>
      toArray(data?.expenses)
        .filter((expense): expense is ExpenseRecord & { status: DepositStatus } => Boolean(expense.status))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.expenses],
  )
  const visibleExpenses = statusFilter === 'all' ? expenses : expenses.filter((expense) => expense.status === statusFilter)
  const pendingTotal = expenses.filter((expense) => expense.status === 'pending').reduce((sum, expense) => sum + expense.amount, 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const value = isActualTa ? taTotal : Number(amount)
    if (!category) return setFeedback({ tone: 'error', text: 'Select a category.' })
    if (needsEmployee && !expenseBy)
      return setFeedback({
        tone: 'error',
        text: `Select the employee this ${category} is for.`,
      })
    if (isActualTa && date > todayInput()) return setFeedback({ tone: 'error', text: 'Daily TA cannot be submitted for a future date.' })
    if (isActualTa && taRows.some((row) => !row.from.trim() || !row.to.trim() || !row.reason.trim() || !row.vehicle || !(Number(row.amount) > 0))) {
      return setFeedback({ tone: 'error', text: 'Fill from, to, reason, vehicle and amount for every trip.' })
    }
    if (!(value > 0))
      return setFeedback({
        tone: 'error',
        text: 'Enter an amount greater than zero.',
      })
    if (!isActualTa && !note.trim())
      return setFeedback({
        tone: 'error',
        text: 'Write the reason for this expense.',
      })
    if (!documentFile) return setFeedback({ tone: 'error', text: 'Attach a picture of the voucher.' })

    setIsSaving(true)
    try {
      const uploaded = await uploadImageToCloudinary(documentFile, EXPENSE_DOCUMENT_FOLDER)
      await submitExpense({
        category,
        amount: value,
        note,
        date: new Date(date).toISOString(),
        expenseBy: expenseBy || currentUser?.name,
        documentUrl: uploaded.imageUrl,
        documentPublicId: uploaded.imagePublicId,
        ...(isTa
          ? {
              taType,
              taEntries: isActualTa
                ? taRows.map((row) => ({
                    ...row,
                    date: new Date(date).toISOString(),
                    person: row.person.trim() || expenseBy || currentUser?.name || '',
                    amount: Number(row.amount),
                  }))
                : undefined,
            }
          : {}),
      })
      setFeedback({
        tone: 'success',
        text: `${category} expense of ${formatCurrency(value)} sent for approval.`,
      })
      setDate(todayInput())
      setCategory('')
      setAmount('')
      setNote('')
      setExpenseBy('')
      setTaType('fixed')
      setTaRows([emptyTaRow()])
      setDocumentFile(null)
      setFileInputKey((key) => key + 1)
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not submit the expense.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(expense: ExpenseRecord, decision: 'approve' | 'reject') {
    setReviewingId(expense.id)
    try {
      await reviewExpense(expense.id, decision)
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not review the expense.',
      })
    } finally {
      setReviewingId(null)
    }
  }

  async function saveCategories(next: string[]) {
    try {
      await updateSettings({
        expenseCategories: next.filter((item) => !isDefaultExpenseCategory(item)),
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not save the categories.',
      })
    }
  }

  function addCategory() {
    const name = newCategory.trim()
    if (!name) return
    if (categories.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setNewCategory('')
      return
    }
    void saveCategories([...customCategories, name])
    setNewCategory('')
  }

  return (
    <AdminShell active="Expense Form">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>New expense</CardTitle>
              <CardDescription>The expense counts in finance once an admin approves it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Date<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Category<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder={categories.length ? 'Select category' : 'No categories — ask an admin'} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isTa ? (
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium">
                      TA type<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <div className="inline-flex rounded-lg border border-border p-0.5">
                      {(['fixed', 'actual'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setTaType(option)}
                          className={cn(
                            'rounded-md px-4 py-1.5 text-sm capitalize transition-colors',
                            taType === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {taType === 'fixed' ? 'A flat TA amount.' : "Fill the day's trips; the amount is their total."}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Amount<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  {isActualTa ? (
                    <Input value={formatCurrency(taTotal)} readOnly className="tabular-nums" />
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="e.g. 1500"
                      required
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {needsEmployee ? 'Employee' : 'Expense by'}
                    {needsEmployee ? <span className="ml-0.5 text-rose-500">*</span> : null}
                  </p>
                  <Combobox
                    options={expenseByOptions}
                    value={expenseBy}
                    onChange={setExpenseBy}
                    placeholder={currentUser?.name ?? 'Select person'}
                    searchPlaceholder="Search name..."
                  />
                </div>
                {isActualTa ? (
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium">
                      Daily TA form — {formatDate(date)}
                      <span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-28">From</TableHead>
                            <TableHead className="min-w-28">To</TableHead>
                            <TableHead className="min-w-36">Reason</TableHead>
                            <TableHead className="min-w-32">Person</TableHead>
                            <TableHead className="min-w-36">Vehicle</TableHead>
                            <TableHead className="min-w-24 text-right">Amount</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {taRows.map((row, index) => (
                            <TableRow key={index}>
                              <TableCell className="p-1.5">
                                <Input value={row.from} onChange={(event) => updateTaRow(index, { from: event.target.value })} placeholder="Office" />
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Input value={row.to} onChange={(event) => updateTaRow(index, { to: event.target.value })} placeholder="Gazipur" />
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Input
                                  value={row.reason}
                                  onChange={(event) => updateTaRow(index, { reason: event.target.value })}
                                  placeholder="Dealer visit"
                                />
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Input
                                  list="ta-person-options"
                                  value={row.person}
                                  onChange={(event) => updateTaRow(index, { person: event.target.value })}
                                  placeholder={expenseBy || 'Name'}
                                />
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Select value={row.vehicle} onValueChange={(value) => updateTaRow(index, { vehicle: value })}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TA_VEHICLES.map((vehicle) => (
                                      <SelectItem key={vehicle} value={vehicle}>
                                        {vehicle}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Input
                                  type="number"
                                  min={1}
                                  value={row.amount}
                                  onChange={(event) => updateTaRow(index, { amount: event.target.value })}
                                  placeholder={OWN_VEHICLES.includes(row.vehicle) ? 'Petrol bill' : undefined}
                                  className="text-right"
                                />
                              </TableCell>
                              <TableCell className="p-1.5">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Remove trip"
                                  disabled={taRows.length === 1}
                                  onClick={() => setTaRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <datalist id="ta-person-options">
                      {expenseByOptions.map((option) => (
                        <option key={option.value} value={option.value} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setTaRows((rows) => [...rows, emptyTaRow()])}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add trip
                      </Button>
                      <p className="text-xs text-muted-foreground">Submit the day&apos;s TA after finishing that day&apos;s work.</p>
                    </div>
                    {taRows.some((row) => OWN_VEHICLES.includes(row.vehicle)) ? (
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        Own bike/car: enter the petrol bill as the amount and attach the fuel pump voucher below.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Reason / Note
                    {isActualTa ? (
                      <span className="font-normal text-muted-foreground"> (optional)</span>
                    ) : (
                      <span className="ml-0.5 text-rose-500">*</span>
                    )}
                  </p>
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. CNG fare to Gazipur dealer visit"
                    rows={2}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Voucher picture<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    key={fileInputKey}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                {feedback ? (
                  <p
                    className={cn(
                      'rounded-lg border px-4 py-3 text-sm sm:col-span-2',
                      feedback.tone === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {feedback.text}
                  </p>
                ) : null}
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? 'Submitting...' : 'Submit for approval'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Awaiting approval</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{formatCurrency(pendingTotal)}</CardContent>
            </Card>

            {isAdmin ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="h-4 w-4" />
                    Expense categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((item) => (
                      <span
                        key={item}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs',
                          isDefaultExpenseCategory(item) && 'bg-muted/50',
                        )}
                      >
                        {item}
                        {isDefaultExpenseCategory(item) ? null : (
                          <button
                            type="button"
                            aria-label={`Remove ${item}`}
                            className="text-muted-foreground hover:text-rose-600"
                            onClick={() => void saveCategories(customCategories.filter((entry) => entry !== item))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Standard categories are fixed; categories you add can be removed.</p>
                  <div className="flex gap-2">
                    <Input
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addCategory()
                        }
                      }}
                      placeholder="e.g. Transport"
                    />
                    <Button type="button" size="icon" variant="outline" aria-label="Add category" onClick={addCategory}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Expenses</CardTitle>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DepositStatus | 'all')}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {visibleExpenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No expenses here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Expense by</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                        <TableCell className="font-medium">
                          {expense.category}
                          {expense.taType ? (
                            <span className="ml-1.5 text-xs font-normal capitalize text-muted-foreground">
                              {expense.taType}
                              {expense.taEntries?.length ? (
                                <button
                                  type="button"
                                  className="ml-1 text-primary hover:underline"
                                  onClick={() => setExpandedId((current) => (current === expense.id ? null : expense.id))}
                                >
                                  ({expense.taEntries.length} {expense.taEntries.length === 1 ? 'day' : 'days'})
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(expense.amount)}</TableCell>
                        <TableCell className="max-w-48 truncate" title={expense.note}>
                          {expense.note || '—'}
                        </TableCell>
                        <TableCell>{expense.expenseBy || expense.createdByName}</TableCell>
                        <TableCell>
                          {expense.documentUrl ? (
                            <a
                              href={expense.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <FileImage className="h-3.5 w-3.5" />
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{expense.createdByName}</TableCell>
                        <TableCell>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[expense.status])}>
                            {expense.status}
                          </span>
                        </TableCell>
                        {isAdmin ? (
                          <TableCell className="text-right">
                            {expense.status === 'pending' ? (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  className="gap-1"
                                  disabled={reviewingId === expense.id}
                                  onClick={() => void handleReview(expense, 'approve')}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={reviewingId === expense.id}
                                  onClick={() => void handleReview(expense, 'reject')}
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{expense.reviewedByName ?? ''}</span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                      {expandedId === expense.id && expense.taEntries?.length ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={isAdmin ? 9 : 8} className="py-2">
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="px-2 py-1 text-left font-medium">Date</th>
                                  <th className="px-2 py-1 text-left font-medium">From</th>
                                  <th className="px-2 py-1 text-left font-medium">To</th>
                                  <th className="px-2 py-1 text-left font-medium">Reason</th>
                                  <th className="px-2 py-1 text-left font-medium">Person</th>
                                  <th className="px-2 py-1 text-left font-medium">Vehicle</th>
                                  <th className="px-2 py-1 text-right font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expense.taEntries.map((entry, index) => (
                                  <tr key={index}>
                                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(entry.date)}</td>
                                    <td className="px-2 py-1">{entry.from}</td>
                                    <td className="px-2 py-1">{entry.to}</td>
                                    <td className="px-2 py-1">{entry.reason || '—'}</td>
                                    <td className="px-2 py-1">{entry.person || '—'}</td>
                                    <td className="px-2 py-1">{entry.vehicle || '—'}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(entry.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
