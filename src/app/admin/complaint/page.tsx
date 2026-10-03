"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Check, MessageSquareWarning } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { ComplaintRecord, DepositStatus } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatDate, partyCode, sortByCreatedAtDesc, toArray, userRoleIds } from '@/lib/erp/utils'
import { customerZoneName } from '@/lib/erp/zones'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

function Label({ text, optional }: { text: string; optional?: boolean }) {
  return (
    <p className="text-sm font-medium">
      {text}
      {optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : <span className="ml-0.5 text-rose-500">*</span>}
    </p>
  )
}

export default function ComplaintPage() {
  const { data, currentUser, submitComplaint, reviewComplaint } = useERP()
  const { zones, customers } = useZoneAccess()

  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [guaranteeDate, setGuaranteeDate] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [problem, setProblem] = useState('')
  const [endCustomerName, setEndCustomerName] = useState('')
  const [endCustomerPhone, setEndCustomerPhone] = useState('')
  const [endCustomerAddress, setEndCustomerAddress] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<DepositStatus | 'all'>('pending')
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const isAdmin = currentUser ? userRoleIds(currentUser).includes('admin') : false

  const sortedCustomers = useMemo(() => [...customers].sort((left, right) => left.name.localeCompare(right.name)), [customers])
  const nameOptions = useMemo<ComboboxOption[]>(
    () => sortedCustomers.map((item) => ({ value: item.id, label: item.name, sublabel: `ID ${partyCode(item)} · ${item.phone}` })),
    [sortedCustomers]
  )
  const idOptions = useMemo<ComboboxOption[]>(
    () => sortedCustomers.map((item) => ({ value: item.id, label: partyCode(item), sublabel: `${item.name} · ${item.phone}` })),
    [sortedCustomers]
  )
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      toArray(data?.products)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => ({ value: item.id, label: item.name, sublabel: [item.brand, item.sku].filter(Boolean).join(' · ') })),
    [data?.products]
  )

  const customer = customerId ? data?.customers[customerId] ?? null : null
  const complaints = useMemo(() => sortByCreatedAtDesc(toArray(data?.complaints)), [data?.complaints])
  const visibleComplaints = statusFilter === 'all' ? complaints : complaints.filter((complaint) => complaint.status === statusFilter)
  const dealerAddress = customer ? [customer.location, customer.thana, customer.district].filter(Boolean).join(', ') : ''

  function resetForm() {
    setCustomerId('')
    setProductId('')
    setGuaranteeDate('')
    setSerialNumber('')
    setProblem('')
    setEndCustomerName('')
    setEndCustomerPhone('')
    setEndCustomerAddress('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!customer) return setFeedback({ tone: 'error', text: 'Select a dealer.' })
    if (!productId) return setFeedback({ tone: 'error', text: 'Select a product.' })
    if (!problem.trim()) return setFeedback({ tone: 'error', text: 'Describe the problem.' })
    if (!endCustomerName.trim() || !endCustomerPhone.trim()) {
      return setFeedback({ tone: 'error', text: 'Enter the customer name and phone number.' })
    }

    setIsSaving(true)
    try {
      await submitComplaint({
        customerId: customer.id,
        productId,
        guaranteeDate: guaranteeDate ? new Date(guaranteeDate).toISOString() : '',
        serialNumber,
        problem,
        endCustomerName,
        endCustomerPhone,
        endCustomerAddress,
      })
      setFeedback({ tone: 'success', text: `Complaint for ${customer.name} sent for approval.` })
      resetForm()
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not submit the complaint.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReview(complaint: ComplaintRecord, decision: 'approve' | 'reject') {
    setReviewingId(complaint.id)
    try {
      await reviewComplaint(complaint.id, decision)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not review the complaint.' })
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <AdminShell active="Complain Form">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>New complaint</CardTitle>
              <CardDescription>Filed by an SR or on behalf of a customer. An admin approves it before service starts.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label text="Dealer name" />
                  <Combobox options={nameOptions} value={customerId} onChange={setCustomerId} placeholder="Select dealer" searchPlaceholder="Search name or phone..." />
                </div>
                <div className="space-y-2">
                  <Label text="Dealer ID" />
                  <Combobox options={idOptions} value={customerId} onChange={setCustomerId} placeholder="Select ID" searchPlaceholder="Search ID..." />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label text="Product name" />
                  <Combobox options={productOptions} value={productId} onChange={setProductId} placeholder="Select product" searchPlaceholder="Search product..." />
                </div>
                <div className="space-y-2">
                  <Label text="Guarantee date" optional />
                  <Input type="date" value={guaranteeDate} onChange={(event) => setGuaranteeDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label text="Product SL No." optional />
                  <Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="e.g. SN-123456" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label text="Problem" />
                  <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="What is wrong with the product?" rows={3} required />
                </div>
                <div className="space-y-2">
                  <Label text="Customer name" />
                  <Input value={endCustomerName} onChange={(event) => setEndCustomerName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label text="Customer phone no." />
                  <Input type="tel" value={endCustomerPhone} onChange={(event) => setEndCustomerPhone(event.target.value)} placeholder="01XXXXXXXXX" required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label text="Customer address" optional />
                  <Textarea value={endCustomerAddress} onChange={(event) => setEndCustomerAddress(event.target.value)} rows={2} />
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
                  <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? 'Submitting...' : 'Submit for approval'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquareWarning className="h-4 w-4" />
                  Dealer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {customer ? (
                  <>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ID {partyCode(customer)} · {customerZoneName(customer, zones)}
                      </p>
                    </div>
                    <dl className="space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd>{customer.phone || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="shrink-0 text-muted-foreground">Address</dt>
                        <dd className="text-right">{dealerAddress || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                        <dt className="text-muted-foreground">Open complaints</dt>
                        <dd className="tabular-nums">
                          {complaints.filter((complaint) => complaint.customerId === customer.id && complaint.status === 'pending').length}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a dealer to see their details.</p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Complaints</CardTitle>
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
            {visibleComplaints.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No complaints here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleComplaints.map((complaint) => (
                    <TableRow key={complaint.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(complaint.createdAt)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{complaint.customerName}</span>
                        <span className="block text-xs text-muted-foreground">ID {partyCode(data?.customers[complaint.customerId] ?? { id: complaint.customerId })}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block">{complaint.productName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[complaint.serialNumber && `SL ${complaint.serialNumber}`, complaint.guaranteeDate && `Guarantee ${formatDate(complaint.guaranteeDate)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-56 truncate" title={complaint.problem}>
                        {complaint.problem}
                      </TableCell>
                      <TableCell>
                        <span className="block">{complaint.endCustomerName}</span>
                        <span className="block text-xs text-muted-foreground" title={complaint.endCustomerAddress}>
                          {complaint.endCustomerPhone}
                        </span>
                      </TableCell>
                      <TableCell>{complaint.submittedByName}</TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[complaint.status])}>
                          {complaint.status}
                        </span>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          {complaint.status === 'pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="gap-1"
                                disabled={reviewingId === complaint.id}
                                onClick={() => void handleReview(complaint, 'approve')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reviewingId === complaint.id}
                                onClick={() => void handleReview(complaint, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{complaint.reviewedByName ?? ''}</span>
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
