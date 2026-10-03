"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, Undo2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { DepositStatus, ReplacementReturnRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function ReplacementReturnPage() {
  const { data, currentUser, submitReplacementReturn, reviewReplacementReturn, hasPermission } = useERP()
  const { zones, customers } = useZoneAccess()

  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [date, setDate] = useState(todayInput)
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [courierName, setCourierName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false
  const canEdit = hasPermission('customers.edit')

  const dealerOptions = useMemo<ComboboxOption[]>(
    () =>
      [...customers]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: `${item.name} (${partyCode(item)})`, sublabel: item.phone })),
    [customers]
  )
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: item.name, sublabel: [item.brand, item.sku].filter(Boolean).join(' · ') })),
    [data?.products]
  )

  const customer = customerId ? data?.customers[customerId] ?? null : null
  const product = productId ? data?.products[productId] ?? null : null
  const returns = useMemo(() => sortByCreatedAtDesc(toArray(data?.replacementReturns)), [data?.replacementReturns])
  const visibleReturns = statusFilter === 'all' ? returns : returns.filter((item) => item.status === statusFilter)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!customer) return setFeedback({ tone: 'error', text: 'Select a dealer.' })
    if (!product) return setFeedback({ tone: 'error', text: 'Select a product.' })
    if (!date) return setFeedback({ tone: 'error', text: 'Enter the return date.' })

    setIsSaving(true)
    try {
      await submitReplacementReturn({ customerId: customer.id, productId: product.id, date, note, quantity: Number(quantity), courierName })
      setFeedback({ tone: 'success', text: `Return of ${product.name} (${customer.name}) sent for approval.` })
      setCustomerId('')
      setProductId('')
      setDate(todayInput())
      setNote('')
      setQuantity('1')
      setCourierName('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the return.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(item: ReplacementReturnRecord, decision: 'approve' | 'reject') {
    setReviewingId(item.id)
    try {
      await reviewReplacementReturn(item.id, decision)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the return.' })
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <AdminShell active="Replacement Return">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>New replacement return</CardTitle>
              <CardDescription>A replaced product the dealer sends back; an admin approves the return.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dealer name / ID<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={dealerOptions} value={customerId} onChange={setCustomerId} placeholder="Select dealer" searchPlaceholder="Search name, ID or phone..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Product name<span className="ml-0.5 text-rose-500">*</span></p>
                  <Combobox options={productOptions} value={productId} onChange={setProductId} placeholder="Select product" searchPlaceholder="Search product..." />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Date<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Quantity<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Courier <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="e.g. Sundarban Courier" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Reason for return, condition of the product" rows={3} />
                </div>
                {feedback ? (
                  <p
                    className={cn(
                      'rounded-lg border px-4 py-3 text-sm sm:col-span-2',
                      feedback.tone === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    )}
                  >
                    {feedback.text}
                  </p>
                ) : null}
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={!canEdit || isSaving} className="w-full sm:w-auto">
                    {isSaving ? 'Submitting...' : 'Submit for approval'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Undo2 className="h-4 w-4" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {customer || product ? (
                  <dl className="space-y-1.5">
                    {customer ? (
                      <>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Dealer</dt>
                          <dd className="text-right font-medium">{customer.name}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">ID · Zone</dt>
                          <dd className="text-right">
                            {partyCode(customer)} · {customerZoneName(customer, zones)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Phone</dt>
                          <dd>{customer.phone || '—'}</dd>
                        </div>
                      </>
                    ) : null}
                    {product ? (
                      <>
                        <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                          <dt className="text-muted-foreground">Product</dt>
                          <dd className="text-right font-medium">{product.name}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">SKU</dt>
                          <dd>{product.sku || '—'}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                ) : (
                  <p className="text-muted-foreground">Select a dealer and product to see their details.</p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Replacement returns</CardTitle>
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
            {visibleReturns.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No replacement returns here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReturns.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{item.customerName}</span>
                        <span className="block text-xs text-muted-foreground">ID {partyCode(data?.customers[item.customerId] ?? { id: item.customerId })}</span>
                      </TableCell>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity ?? 1}</TableCell>
                      <TableCell>{item.courierName || '—'}</TableCell>
                      <TableCell className="max-w-56 truncate" title={item.note}>
                        {item.note || '—'}
                      </TableCell>
                      <TableCell>{item.submittedByName}</TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[item.status])}>{item.status}</span>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {item.status === 'pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" className="gap-1" disabled={reviewingId === item.id} onClick={() => void handleReview(item, 'approve')}>
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" disabled={reviewingId === item.id} onClick={() => void handleReview(item, 'reject')}>
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{item.reviewedByName ?? ''}</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
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
