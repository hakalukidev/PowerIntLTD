"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, RefreshCcw } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { DepositStatus, ReplacementRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

export default function ReplacementPage() {
  const { data, currentUser, submitReplacement, reviewReplacement, hasPermission } = useERP()
  const { zones, customers } = useZoneAccess()

  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [guaranteeDate, setGuaranteeDate] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [problem, setProblem] = useState('')
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
  const replacements = useMemo(() => sortByCreatedAtDesc(toArray(data?.replacements)), [data?.replacements])
  const visibleReplacements = statusFilter === 'all' ? replacements : replacements.filter((item) => item.status === statusFilter)
  const guaranteeExpired = guaranteeDate ? guaranteeDate < new Date().toISOString().slice(0, 10) : false

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!customer) return setFeedback({ tone: 'error', text: 'Select a dealer.' })
    if (!product) return setFeedback({ tone: 'error', text: 'Select a product.' })
    if (!guaranteeDate) return setFeedback({ tone: 'error', text: 'Enter the guarantee date.' })
    if (!problem.trim()) return setFeedback({ tone: 'error', text: 'Describe the problem.' })

    setIsSaving(true)
    try {
      await submitReplacement({ customerId: customer.id, productId: product.id, guaranteeDate, serialNumber, problem, note, quantity: Number(quantity), courierName })
      setFeedback({ tone: 'success', text: `Replacement for ${product.name} (${customer.name}) sent for approval.` })
      setCustomerId('')
      setProductId('')
      setGuaranteeDate('')
      setSerialNumber('')
      setProblem('')
      setNote('')
      setQuantity('1')
      setCourierName('')
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the replacement.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(replacement: ReplacementRecord, decision: 'approve' | 'reject') {
    setReviewingId(replacement.id)
    try {
      await reviewReplacement(replacement.id, decision)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the replacement.' })
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <AdminShell active="Replacement Form">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>New replacement</CardTitle>
              <CardDescription>Raised by the SR; the product is replaced once an admin approves it.</CardDescription>
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
                  <p className="text-sm font-medium">Guarantee date<span className="ml-0.5 text-rose-500">*</span></p>
                  <Input type="date" value={guaranteeDate} onChange={(event) => setGuaranteeDate(event.target.value)} required />
                  {guaranteeExpired ? <p className="text-xs text-amber-600 dark:text-amber-400">This guarantee date has already passed.</p> : null}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Product SL No. <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="e.g. PI-2026-00123" />
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
                  <p className="text-sm font-medium">Problem<span className="ml-0.5 text-rose-500">*</span></p>
                  <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="What is wrong with the product?" rows={3} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
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
                  <RefreshCcw className="h-4 w-4" />
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
                          <dt className="text-muted-foreground">Warranty</dt>
                          <dd>{product.warrantyMonths ? `${product.warrantyMonths} months` : '—'}</dd>
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
            <CardTitle>Replacements</CardTitle>
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
            {visibleReplacements.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No replacements here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Guarantee date</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReplacements.map((replacement) => (
                    <TableRow key={replacement.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(replacement.createdAt)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{replacement.customerName}</span>
                        <span className="block text-xs text-muted-foreground">ID {partyCode(data?.customers[replacement.customerId] ?? { id: replacement.customerId })}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block font-medium">{replacement.productName}</span>
                        {replacement.serialNumber ? <span className="block text-xs text-muted-foreground">SL {replacement.serialNumber}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{replacement.quantity ?? 1}</TableCell>
                      <TableCell>{replacement.courierName || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(replacement.guaranteeDate)}</TableCell>
                      <TableCell className="max-w-56 truncate" title={replacement.problem}>
                        {replacement.problem}
                      </TableCell>
                      <TableCell className="max-w-48 truncate" title={replacement.note}>
                        {replacement.note || '—'}
                      </TableCell>
                      <TableCell>{replacement.submittedByName}</TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[replacement.status])}>
                          {replacement.status}
                        </span>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {replacement.status === 'pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="gap-1"
                                disabled={reviewingId === replacement.id}
                                onClick={() => void handleReview(replacement, 'approve')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewingId === replacement.id}
                                onClick={() => void handleReview(replacement, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{replacement.reviewedByName ?? ''}</span>
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
