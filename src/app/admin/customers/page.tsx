"use client"

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { BellRing, Check, Edit, Eye, FileSignature, ImageDown, Handshake, MapPin, Phone, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  divisionList,
  districtsForDivision,
  findDivisionForDistrict,
  thanasForDistrict,
} from '@/lib/data/bangladeshLocations'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { CustomerCommitment, CustomerInput, CustomerRecord } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { customerZoneId } from '@/lib/erp/zones'
import { escapeHtml, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'

const CUSTOMER_DOCUMENT_FOLDER = 'customers'

type DocumentKey = 'signature' | 'dealerPhoto' | 'bankDocument' | 'nidCopy' | 'tradeLicenseCopy' | 'passportPhoto'

type CustomerFormState = {
  name: string
  company: string
  phone: string
  email: string
  location: string
  due: string
  nid: string
  tradeLicenseNo: string
  nomineeName: string
  nomineeNid: string
  division: string
  thana: string
  district: string
  zoneId: string
  chequeNumber: string
  bankName: string
  branchName: string
  nidCopyUrl: string
  nidCopyPublicId: string
  tradeLicenseCopyUrl: string
  tradeLicenseCopyPublicId: string
  passportPhotoUrl: string
  passportPhotoPublicId: string
  bankDocumentUrl: string
  bankDocumentPublicId: string
  dealerPhotoUrl: string
  dealerPhotoPublicId: string
  signatureUrl: string
  signaturePublicId: string
}

type DocumentUploadState = {
  file: File | null
  preview: string | null
  pendingDeleteId: string | null
}

function emptyDocumentUploads(): Record<DocumentKey, DocumentUploadState> {
  return {
    nidCopy: { file: null, preview: null, pendingDeleteId: null },
    tradeLicenseCopy: { file: null, preview: null, pendingDeleteId: null },
    passportPhoto: { file: null, preview: null, pendingDeleteId: null },
    bankDocument: { file: null, preview: null, pendingDeleteId: null },
    dealerPhoto: { file: null, preview: null, pendingDeleteId: null },
    signature: { file: null, preview: null, pendingDeleteId: null },
  }
}

const documentFieldLabels: Record<DocumentKey, { title: string; helper: string }> = {
  nidCopy: { title: 'NID copy', helper: 'National ID card copy' },
  tradeLicenseCopy: { title: 'Trade license copy', helper: 'Trade license copy' },
  passportPhoto: { title: 'Passport size photo', helper: '1 copy passport size photo' },
  bankDocument: { title: 'Bank cheque / document', helper: 'Photo of signed cheque or bank document' },
  dealerPhoto: { title: 'Dealer photo', helper: 'Photo of the dealer who filled up the form' },
  signature: { title: 'Upload signature', helper: 'Photo or scan of the dealer signature' },
}

const emptyCustomerForm: CustomerFormState = {
  name: '',
  company: '',
  phone: '',
  email: '',
  location: '',
  due: '0',
  nid: '',
  tradeLicenseNo: '',
  nomineeName: '',
  nomineeNid: '',
  division: '',
  thana: '',
  district: '',
  zoneId: '',
  chequeNumber: '',
  bankName: '',
  branchName: '',
  nidCopyUrl: '',
  nidCopyPublicId: '',
  tradeLicenseCopyUrl: '',
  tradeLicenseCopyPublicId: '',
  passportPhotoUrl: '',
  passportPhotoPublicId: '',
  bankDocumentUrl: '',
  bankDocumentPublicId: '',
  dealerPhotoUrl: '',
  dealerPhotoPublicId: '',
  signatureUrl: '',
  signaturePublicId: '',
}

function formFromCustomer(customer: CustomerRecord): CustomerFormState {
  return {
    name: customer.name,
    company: customer.company,
    phone: customer.phone,
    email: customer.email,
    location: customer.location,
    due: String(customer.due),
    nid: customer.nid,
    tradeLicenseNo: customer.tradeLicenseNo,
    nomineeName: customer.nomineeName,
    nomineeNid: customer.nomineeNid,
    division: findDivisionForDistrict(customer.district) ?? '',
    thana: customer.thana,
    district: customer.district,
    zoneId: customer.zoneId ?? '',
    chequeNumber: customer.chequeNumber,
    bankName: customer.bankName,
    branchName: customer.branchName,
    nidCopyUrl: customer.nidCopyUrl,
    nidCopyPublicId: customer.nidCopyPublicId,
    tradeLicenseCopyUrl: customer.tradeLicenseCopyUrl,
    tradeLicenseCopyPublicId: customer.tradeLicenseCopyPublicId,
    passportPhotoUrl: customer.passportPhotoUrl,
    passportPhotoPublicId: customer.passportPhotoPublicId,
    bankDocumentUrl: customer.bankDocumentUrl,
    bankDocumentPublicId: customer.bankDocumentPublicId,
    dealerPhotoUrl: customer.dealerPhotoUrl,
    dealerPhotoPublicId: customer.dealerPhotoPublicId,
    signatureUrl: customer.signatureUrl,
    signaturePublicId: customer.signaturePublicId,
  }
}

function customerInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function sortedCommitments(customer: CustomerRecord): CustomerCommitment[] {
  return Object.values(customer.commitments ?? {}).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'pending' ? -1 : 1
    return right.createdAt.localeCompare(left.createdAt)
  })
}

function withFallbackOption(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}

export default function CustomersPage() {
  const { data, saveCustomer, deleteCustomer, saveCustomerCommitment, deleteCustomerCommitment } = useERP()
  const currency = data?.settings.currency
  // Zone managers and zone-limited roles only see the dealers of their zones.
  const { zones, zoneOptions, visibleZoneIds, customers } = useZoneAccess()
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const [query, setQuery] = useState('')
  const [reminderOnly, setReminderOnly] = useState(false)
  const [filterDivision, setFilterDivision] = useState('all')
  const [filterDistrict, setFilterDistrict] = useState('all')
  const [filterThana, setFilterThana] = useState('all')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null)
  const [viewingCustomerId, setViewingCustomerId] = useState<string | null>(null)
  const viewingCustomer = viewingCustomerId ? (data?.customers[viewingCustomerId] ?? null) : null
  const [commitmentsOnly, setCommitmentsOnly] = useState(false)
  const [commitmentNote, setCommitmentNote] = useState('')
  const [commitmentDueDate, setCommitmentDueDate] = useState('')
  const [commitmentBusy, setCommitmentBusy] = useState(false)
  const [commitmentError, setCommitmentError] = useState<string | null>(null)
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm)
  const [documentUploads, setDocumentUploads] = useState<Record<DocumentKey, DocumentUploadState>>(emptyDocumentUploads)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const signaturePadRef = useRef<SignaturePadHandle>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [detailsExportError, setDetailsExportError] = useState<string | null>(null)

  const districtOptions = useMemo(
    () => withFallbackOption(districtsForDivision(customerForm.division), customerForm.district),
    [customerForm.division, customerForm.district]
  )
  const thanaOptions = useMemo(
    () => withFallbackOption(thanasForDistrict(customerForm.division, customerForm.district), customerForm.thana),
    [customerForm.division, customerForm.district, customerForm.thana]
  )

  const filterDistrictOptions = useMemo(
    () => (filterDivision === 'all' ? [] : districtsForDivision(filterDivision)),
    [filterDivision]
  )
  const filterThanaOptions = useMemo(
    () => (filterDivision === 'all' || filterDistrict === 'all' ? [] : thanasForDistrict(filterDivision, filterDistrict)),
    [filterDivision, filterDistrict]
  )

  const customerRows = useMemo(() => {
    return customers
      .map((customer) => {
        const customerOrders = orders.filter((order) => order.customerId === customer.id)
        const purchaseTotal = customerOrders.reduce((sum, order) => sum + order.total, 0)
        const lastOrder = [...customerOrders].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]

        return {
          customer,
          orderCount: customerOrders.length,
          purchaseTotal,
          dueTotal: customerOrders.reduce((sum, order) => sum + order.due, 0),
          lastPurchaseDate: lastOrder?.createdAt ?? customer.updatedAt,
          hasOrders: customerOrders.length > 0,
        }
      })
      .sort((left, right) => right.purchaseTotal - left.purchaseTotal)
  }, [customers, orders])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const minPrice = priceMin.trim() ? Number(priceMin) : null
    const maxPrice = priceMax.trim() ? Number(priceMax) : null
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo) : null
    if (to) to.setHours(23, 59, 59, 999)

    return customerRows.filter(({ customer, hasOrders, purchaseTotal }) => {
      const matchesSearch =
        !normalizedQuery ||
        [customer.name, customer.company, customer.phone, customer.location]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesReminder = !reminderOnly || (customer.reminderCustomer && !hasOrders)
      const matchesDivision = filterDivision === 'all' || findDivisionForDistrict(customer.district) === filterDivision
      const matchesDistrict = filterDistrict === 'all' || customer.district === filterDistrict
      const matchesThana = filterThana === 'all' || customer.thana === filterThana
      const matchesMinPrice = minPrice === null || Number.isNaN(minPrice) || purchaseTotal >= minPrice
      const matchesMaxPrice = maxPrice === null || Number.isNaN(maxPrice) || purchaseTotal <= maxPrice
      const joinedDate = new Date(customer.createdAt)
      const matchesFrom = !from || joinedDate >= from
      const matchesTo = !to || joinedDate <= to

      return (
        matchesSearch &&
        matchesReminder &&
        matchesDivision &&
        matchesDistrict &&
        matchesThana &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesFrom &&
        matchesTo
      )
    })
  }, [
    customerRows,
    query,
    reminderOnly,
    filterDivision,
    filterDistrict,
    filterThana,
    priceMin,
    priceMax,
    dateFrom,
    dateTo,
  ])

  const metrics = useMemo(() => {
    return {
      totalCustomers: customers.length,
      purchaseTotal: customerRows.reduce((sum, row) => sum + row.purchaseTotal, 0),
      dueTotal: customers.reduce((sum, customer) => sum + customer.due, 0),
    }
  }, [customerRows, customers])

  function openCreateDialog() {
    setEditingCustomer(null)
    // A zone-limited user's new dealer goes into their zone, or it would vanish from their list.
    setCustomerForm(visibleZoneIds ? { ...emptyCustomerForm, zoneId: zoneOptions[0]?.id ?? '' } : emptyCustomerForm)
    setDocumentUploads(emptyDocumentUploads())
    setFeedback(null)
    setPdfError(null)
    signaturePadRef.current?.clear()
    setDialogOpen(true)
  }

  function openEditDialog(customer: CustomerRecord) {
    setEditingCustomer(customer)
    const form = formFromCustomer(customer)
    setCustomerForm(visibleZoneIds && !form.zoneId ? { ...form, zoneId: customerZoneId(customer, zones) } : form)
    setDocumentUploads(emptyDocumentUploads())
    setFeedback(null)
    setPdfError(null)
    signaturePadRef.current?.clear()
    setDialogOpen(true)
  }

  function handleDocumentFileChange(key: DocumentKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return

    setDocumentUploads((current) => ({
      ...current,
      [key]: {
        file,
        preview: URL.createObjectURL(file),
        pendingDeleteId: current[key].pendingDeleteId || customerForm[`${key}PublicId`] || null,
      },
    }))
    setCustomerForm((current) => ({ ...current, [`${key}Url`]: '', [`${key}PublicId`]: '' }))
  }

  function handleRemoveDocument(key: DocumentKey) {
    setDocumentUploads((current) => ({
      ...current,
      [key]: {
        file: null,
        preview: null,
        pendingDeleteId: current[key].pendingDeleteId || customerForm[`${key}PublicId`] || null,
      },
    }))
    setCustomerForm((current) => ({ ...current, [`${key}Url`]: '', [`${key}PublicId`]: '' }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (visibleZoneIds && !customerForm.zoneId) {
      setFeedback('Choose one of your zones for this dealer.')
      return
    }
    setIsSaving(true)

    try {
      const documentKeys = Object.keys(documentUploads) as DocumentKey[]
      const uploadedFields: Partial<CustomerFormState> = {}
      const deletions: string[] = []

      for (const key of documentKeys) {
        const upload = documentUploads[key]
        if (upload.file) {
          const result = await uploadImageToCloudinary(upload.file, CUSTOMER_DOCUMENT_FOLDER)
          uploadedFields[`${key}Url`] = result.imageUrl
          uploadedFields[`${key}PublicId`] = result.imagePublicId
          if (upload.pendingDeleteId) deletions.push(upload.pendingDeleteId)
        } else if (upload.pendingDeleteId) {
          deletions.push(upload.pendingDeleteId)
        }
      }

      const finalForm = { ...customerForm, ...uploadedFields }

      const input: CustomerInput = {
        name: finalForm.name,
        company: finalForm.company,
        phone: finalForm.phone,
        email: finalForm.email,
        location: finalForm.location,
        due: Number(finalForm.due),
        nid: finalForm.nid,
        tradeLicenseNo: finalForm.tradeLicenseNo,
        nomineeName: finalForm.nomineeName,
        nomineeNid: finalForm.nomineeNid,
        thana: finalForm.thana,
        district: finalForm.district,
        zoneId: finalForm.zoneId,
        chequeNumber: finalForm.chequeNumber,
        bankName: finalForm.bankName,
        branchName: finalForm.branchName,
        nidCopyUrl: finalForm.nidCopyUrl,
        nidCopyPublicId: finalForm.nidCopyPublicId,
        tradeLicenseCopyUrl: finalForm.tradeLicenseCopyUrl,
        tradeLicenseCopyPublicId: finalForm.tradeLicenseCopyPublicId,
        passportPhotoUrl: finalForm.passportPhotoUrl,
        passportPhotoPublicId: finalForm.passportPhotoPublicId,
        bankDocumentUrl: finalForm.bankDocumentUrl,
        bankDocumentPublicId: finalForm.bankDocumentPublicId,
        dealerPhotoUrl: finalForm.dealerPhotoUrl,
        dealerPhotoPublicId: finalForm.dealerPhotoPublicId,
        signatureUrl: finalForm.signatureUrl,
        signaturePublicId: finalForm.signaturePublicId,
      }

      await saveCustomer(input, editingCustomer?.id)

      await Promise.all(deletions.map((publicId) => deleteCloudinaryImage(publicId).catch(() => undefined)))

      setDialogOpen(false)
      setCustomerForm(emptyCustomerForm)
      setDocumentUploads(emptyDocumentUploads())
      setEditingCustomer(null)
      setFeedback(editingCustomer ? 'Customer details updated.' : 'New customer added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save customer.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(customer: CustomerRecord) {
    setFeedback(null)

    try {
      await deleteCustomer(customer.id)
      setFeedback(`${customer.name} removed from customer list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete customer.')
    }
  }

  function renderDocumentUpload(key: DocumentKey) {
    const { title, helper } = documentFieldLabels[key]
    const upload = documentUploads[key]
    const previewSrc = upload.preview ?? customerForm[`${key}Url`]

    return (
      <div key={key} className="space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {previewSrc ? (
          <div className="flex items-center gap-3">
            <img
              src={previewSrc}
              alt={title}
              className={`h-20 rounded-xl border border-border/70 ${key === 'signature' ? 'w-48 bg-white object-contain' : 'w-20 object-cover'}`}
            />
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => handleRemoveDocument(key)}>
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{helper}</p>
        )}
        <Input type="file" accept="image/*" onChange={(event) => handleDocumentFileChange(key, event)} />
      </div>
    )
  }

  function openDetailsDialog(customerId: string, onlyCommitments = false) {
    setViewingCustomerId(customerId)
    setCommitmentsOnly(onlyCommitments)
    setDetailsExportError(null)
    setCommitmentNote('')
    setCommitmentDueDate('')
    setCommitmentError(null)
  }

  async function runCommitmentAction(action: () => Promise<void>) {
    setCommitmentError(null)
    setCommitmentBusy(true)
    try {
      await action()
    } catch (reason) {
      setCommitmentError(reason instanceof Error ? reason.message : 'Unable to update commitment.')
    } finally {
      setCommitmentBusy(false)
    }
  }

  function handleAddCommitment(customerId: string) {
    void runCommitmentAction(async () => {
      await saveCustomerCommitment(customerId, { note: commitmentNote, dueDate: commitmentDueDate })
      setCommitmentNote('')
      setCommitmentDueDate('')
    })
  }

  function renderCommitments(customer: CustomerRecord) {
    const commitments = sortedCommitments(customer)
    const today = new Date().toISOString().slice(0, 10)

    return (
      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra commitments</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Record any extra promise made to this client (gift, discount, free delivery, service, etc.).
          </p>
        </div>

        {commitments.length ? (
          <div className="space-y-2">
            {commitments.map((commitment) => {
              const fulfilled = commitment.status === 'fulfilled'
              const overdue = !fulfilled && Boolean(commitment.dueDate) && commitment.dueDate < today
              return (
                <div
                  key={commitment.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${fulfilled ? 'border-border/50 bg-muted/30' : 'border-border/70'}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={`whitespace-pre-wrap break-words text-sm ${fulfilled ? 'text-muted-foreground line-through' : ''}`}>
                      {commitment.note}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {fulfilled ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">Fulfilled</Badge>
                      ) : overdue ? (
                        <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/15 dark:text-red-300">Overdue</Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">Pending</Badge>
                      )}
                      {commitment.dueDate ? <span>Due {formatDate(commitment.dueDate)}</span> : null}
                      <span>
                        · Added {formatDate(commitment.createdAt)}
                        {commitment.createdBy ? ` by ${commitment.createdBy}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={commitmentBusy}
                      onClick={() =>
                        void runCommitmentAction(() =>
                          saveCustomerCommitment(
                            customer.id,
                            { note: commitment.note, status: fulfilled ? 'pending' : 'fulfilled' },
                            commitment.id
                          )
                        )
                      }
                      aria-label={fulfilled ? 'Mark as pending' : 'Mark as fulfilled'}
                      title={fulfilled ? 'Mark as pending' : 'Mark as fulfilled'}
                    >
                      {fulfilled ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={commitmentBusy}
                      onClick={() => void runCommitmentAction(() => deleteCustomerCommitment(customer.id, commitment.id))}
                      aria-label="Delete commitment"
                      title="Delete commitment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No commitments recorded.</p>
        )}

        <div className="space-y-2 rounded-xl bg-muted/30 p-3">
          <Textarea
            value={commitmentNote}
            onChange={(event) => setCommitmentNote(event.target.value)}
            placeholder="e.g. 2% extra discount on next order, free delivery until December"
            rows={2}
          />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Due date (optional)</p>
              <Input
                type="date"
                value={commitmentDueDate}
                onChange={(event) => setCommitmentDueDate(event.target.value)}
                className="h-9 w-44"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              disabled={commitmentBusy || !commitmentNote.trim()}
              onClick={() => handleAddCommitment(customer.id)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add commitment
            </Button>
          </div>
          {commitmentError ? <p className="text-xs text-destructive">{commitmentError}</p> : null}
        </div>
      </div>
    )
  }

  function renderCustomerDetails(customer: CustomerRecord) {
    const customerOrders = orders
      .filter((order) => order.customerId === customer.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const purchaseTotal = customerOrders.reduce((sum, order) => sum + order.total, 0)
    const paidTotal = customerOrders.reduce((sum, order) => sum + order.paid, 0)
    const orderDue = customerOrders.reduce((sum, order) => sum + order.due, 0)
    const photo = customer.dealerPhotoUrl || customer.passportPhotoUrl
    const address = [customer.location, customer.thana, customer.district, findDivisionForDistrict(customer.district)]
      .filter(Boolean)
      .join(', ')

    const fields: [string, string][] = [
      ['Owner', customer.company],
      ['Mobile No', customer.phone],
      ['Email', customer.email],
      ['NID No', customer.nid],
      ['Trade License No', customer.tradeLicenseNo],
      ['Nominee name', customer.nomineeName],
      ['Nominee NID', customer.nomineeNid],
      ['Joined', formatDate(customer.createdAt)],
    ]
    const bankFields: [string, string][] = [
      ['Cheque number', customer.chequeNumber],
      ['Bank name', customer.bankName],
      ['Branch', customer.branchName],
    ]
    const documents: [string, string][] = [
      ['Dealer photo', customer.dealerPhotoUrl],
      ['Bank cheque / document', customer.bankDocumentUrl],
      ['NID copy', customer.nidCopyUrl],
      ['Trade license copy', customer.tradeLicenseCopyUrl],
      ['Passport size photo', customer.passportPhotoUrl],
      ['Signature', customer.signatureUrl],
    ]

    const field = ([label, value]: [string, string]) => (
      <div key={label}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words font-medium">{value || 'N/A'}</p>
      </div>
    )

    return (
      <div className="space-y-5">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0 rounded-xl">
              {photo ? <AvatarImage src={photo} alt={customer.name} className="object-cover" /> : null}
              <AvatarFallback className="rounded-xl bg-muted text-lg text-muted-foreground">
                {customerInitials(customer.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{customer.name}</DialogTitle>
              <DialogDescription>{customer.company || 'Retail'}</DialogDescription>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs font-normal">
                  {customer.leadSource === 'facebook' ? 'From Facebook' : 'From Local Marketing'}
                </Badge>
                {customer.reminderCustomer && customerOrders.length === 0 ? (
                  <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">Reminder</Badge>
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Orders', customerOrders.length.toLocaleString('en-BD')],
            ['Purchase', formatCurrency(purchaseTotal, currency)],
            ['Paid', formatCurrency(paidTotal, currency)],
            ['Due', formatCurrency(customer.due || orderDue, currency)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {renderCommitments(customer)}

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dealer details</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {fields.map(field)}
            <div className="sm:col-span-2">{field(['Address', address])}</div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank cheque</p>
          <div className="grid gap-3 text-sm sm:grid-cols-3">{bankFields.map(field)}</div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {documents.map(([label, url]) => (
              <div key={label} className="space-y-1.5">
                <p className="text-xs font-medium">{label}</p>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={url}
                      alt={label}
                      className="h-28 w-full rounded-xl border border-border/70 bg-muted/30 object-contain transition hover:opacity-80"
                    />
                  </a>
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground">
                    Not attached
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent orders</p>
          {customerOrders.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerOrders.slice(0, 10).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.billNumber}</TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell className="capitalize">{order.status}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.total, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.due, currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}
        </div>

        {detailsExportError ? <p className="text-right text-xs text-destructive">{detailsExportError}</p> : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => void handleExportSavedCustomer(customer, 'pdf')}
          >
            <FileSignature className="mr-1.5 h-4 w-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => void handleExportSavedCustomer(customer, 'jpg')}
            disabled={isExportingImage}
          >
            <ImageDown className="mr-1.5 h-4 w-4" />
            {isExportingImage ? 'Preparing JPG...' : 'JPG'}
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setViewingCustomerId(null)}>
            Close
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => {
              setViewingCustomerId(null)
              openEditDialog(customer)
            }}
          >
            <Edit className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>
    )
  }

  function buildCustomerAgreementHtml(
    form: CustomerFormState,
    uploads: Record<DocumentKey, DocumentUploadState>,
    signatureDataUrl: string | null,
    autoPrint = true
  ) {
    const documentPreview = (key: DocumentKey) => uploads[key].preview ?? form[`${key}Url`]
    const addressParts = [form.location, form.thana, form.district, form.division].filter(Boolean)
    const companyName = data?.settings.companyName ?? 'Power International BD'
    const logoUrl = `${window.location.origin}/power-logo.png`
    const dealerPhotoSrc = documentPreview('dealerPhoto') || documentPreview('passportPhoto')
    const documentRow = (label: string, key: DocumentKey) => {
      const src = documentPreview(key)
      return `
        <div class="document">
          <h3>${escapeHtml(label)}</h3>
          ${src ? `<img src="${src}" alt="${escapeHtml(label)}" />` : '<p class="missing">Not attached</p>'}
        </div>
      `
    }

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Customer Information - ${escapeHtml(form.name || 'Customer')}</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: A4; margin: 0; }
            body { color: #111827; font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 0; padding: 12mm 12mm 14mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .header { align-items: center; border-bottom: 3px solid #1d4f91; display: flex; gap: 16px; justify-content: space-between; padding-bottom: 12px; }
            .brand { align-items: center; display: flex; gap: 14px; }
            .brand img { height: 64px; object-fit: contain; }
            .form-title { flex: 1; text-align: center; }
            .form-title h1 { color: #1d4f91; font-size: 17px; letter-spacing: .04em; margin: 0; text-transform: uppercase; }
            .form-title p { color: #f28c1b; font-size: 11px; font-weight: 600; letter-spacing: .08em; margin: 4px 0 0; }
            .photo-frame { align-items: center; border: 1.5px solid #1d4f91; border-radius: 6px; display: flex; flex-shrink: 0; height: 120px; justify-content: center; overflow: hidden; width: 100px; }
            .photo-frame img { height: 100%; object-fit: cover; width: 100%; }
            .photo-frame span { color: #9ca3af; font-size: 10px; padding: 6px; text-align: center; }
            .section { margin-top: 16px; }
            .section h2 { border-bottom: 1px solid #d1d5db; color: #1d4f91; font-size: 12px; letter-spacing: .06em; margin: 0; padding-bottom: 5px; text-transform: uppercase; }
            .grid { display: grid; gap: 10px 20px; grid-template-columns: 1fr 1fr; margin-top: 10px; }
            .grid.three { grid-template-columns: 1fr 1fr 1fr; }
            .field span { color: #6b7280; display: block; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
            .field strong { display: block; font-size: 13px; margin-top: 2px; }
            .field.wide { grid-column: 1 / -1; }
            .documents { display: grid; gap: 12px; grid-template-columns: repeat(4, 1fr); margin-top: 10px; }
            .document { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
            .document h3 { color: #374151; font-size: 11px; margin: 0 0 6px; }
            .document img { background: #f9fafb; border-radius: 4px; display: block; height: 110px; object-fit: contain; width: 100%; }
            .document .missing { align-items: center; background: #f9fafb; border-radius: 4px; color: #9ca3af; display: flex; font-size: 11px; height: 110px; justify-content: center; margin: 0; }
            .declaration { background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f28c1b; border-radius: 6px; font-size: 12.5px; line-height: 1.7; margin-top: 18px; padding: 12px 14px; }
            .signature-area { display: flex; justify-content: space-between; margin-top: 40px; }
            .signature-box { text-align: center; width: 240px; }
            .signature-box img { height: 64px; object-fit: contain; }
            .signature-line { border-top: 1px solid #111827; font-size: 12px; margin-top: 60px; padding-top: 6px; }
            .signature-box img + .signature-line { margin-top: 8px; }
            .print-date { color: #6b7280; font-size: 10px; margin-top: 24px; text-align: right; }
            @media screen { body { margin: 0 auto; max-width: 210mm; padding: 32px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <img src="${logoUrl}" alt="${escapeHtml(companyName)}" />
            </div>
            <div class="form-title">
              <h1>Dealer Information Form</h1>
              <p>${escapeHtml(companyName)}</p>
            </div>
            <div class="photo-frame">
              ${dealerPhotoSrc ? `<img src="${dealerPhotoSrc}" alt="Dealer photo" />` : '<span>Dealer photo</span>'}
            </div>
          </div>

          <div class="section">
            <h2>Dealer details</h2>
            <div class="grid">
              <div class="field"><span>Dealer name</span><strong>${escapeHtml(form.name || 'N/A')}</strong></div>
              <div class="field"><span>Owner</span><strong>${escapeHtml(form.company || 'N/A')}</strong></div>
              <div class="field"><span>Mobile No</span><strong>${escapeHtml(form.phone || 'N/A')}</strong></div>
              <div class="field"><span>Email</span><strong>${escapeHtml(form.email || 'N/A')}</strong></div>
              <div class="field"><span>NID No</span><strong>${escapeHtml(form.nid || 'N/A')}</strong></div>
              <div class="field"><span>Trade License No</span><strong>${escapeHtml(form.tradeLicenseNo || 'N/A')}</strong></div>
              <div class="field"><span>Nominee name</span><strong>${escapeHtml(form.nomineeName || 'N/A')}</strong></div>
              <div class="field"><span>Nominee NID</span><strong>${escapeHtml(form.nomineeNid || 'N/A')}</strong></div>
              <div class="field wide"><span>Address</span><strong>${escapeHtml(addressParts.join(', ') || 'N/A')}</strong></div>
            </div>
          </div>

          <div class="section">
            <h2>Bank cheque</h2>
            <div class="grid three">
              <div class="field"><span>Cheque number</span><strong>${escapeHtml(form.chequeNumber || 'N/A')}</strong></div>
              <div class="field"><span>Bank name</span><strong>${escapeHtml(form.bankName || 'N/A')}</strong></div>
              <div class="field"><span>Branch</span><strong>${escapeHtml(form.branchName || 'N/A')}</strong></div>
            </div>
          </div>

          <div class="section">
            <h2>Attached documents</h2>
            <div class="documents">
              ${documentRow('Bank cheque / document', 'bankDocument')}
              ${documentRow('NID copy', 'nidCopy')}
              ${documentRow('Trade license copy', 'tradeLicenseCopy')}
              ${documentRow('Passport size photo', 'passportPhoto')}
            </div>
          </div>

          <div class="declaration">
            ব্যাংক হিসাবের একটি স্বাক্ষরকৃত ব্যাংক চেক (চেক নম্বর: ${escapeHtml(form.chequeNumber || '.......')},
            ব্যাংক: ${escapeHtml(form.bankName || '.......')}, শাখা: ${escapeHtml(form.branchName || '.......')}),
            জাতীয় পরিচয়পত্র ও ট্রেড লাইসেন্সের কপি এবং ১ কপি পাসপোর্ট সাইজের ছবি কোম্পানির নিকট জমা প্রদান করিতে হইবে।
          </div>

          <div class="signature-area">
            <div class="signature-box">
              ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature" />` : ''}
              <div class="signature-line">Customer Signature</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Date</div>
            </div>
          </div>

          <p class="print-date">${formatDate(new Date().toISOString())}</p>
          ${
            autoPrint
              ? `<script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>`
              : ''
          }
        </body>
      </html>
    `
  }

  // Returns undefined when the form is not ready to export.
  function prepareAgreementSignature(): string | null | undefined {
    setPdfError(null)

    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setPdfError('Fill in the dealer name and mobile number before generating the PDF or JPG.')
      return undefined
    }

    const drawnSignature =
      signaturePadRef.current && !signaturePadRef.current.isEmpty() ? signaturePadRef.current.toDataUrl() : null
    return drawnSignature ?? (documentUploads.signature.preview || customerForm.signatureUrl || null)
  }

  // Opens the agreement in a new window and triggers the print dialog (Save as PDF).
  function openAgreementPdf(html: string): string | null {
    const popup = window.open('', '_blank', 'width=920,height=720')
    if (!popup) {
      return 'Allow popups to generate or save the document as PDF.'
    }

    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    return null
  }

  async function downloadAgreementJpg(html: string, dealerName: string) {
    // A4 width at 96 DPI, rendered off-screen so the page layout is not disturbed.
    const pageWidth = 794
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageWidth}px;height:1123px;border:0;`
    document.body.appendChild(iframe)

    try {
      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve()
        iframe.srcdoc = html
      })

      const frameDocument = iframe.contentDocument
      if (!frameDocument) throw new Error('Unable to prepare the image.')

      await frameDocument.fonts?.ready
      await Promise.all(
        Array.from(frameDocument.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.onload = () => resolve()
                image.onerror = () => resolve()
              })
        )
      )

      const { toJpeg } = await import('html-to-image')
      const body = frameDocument.body
      const dataUrl = await toJpeg(body, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: pageWidth,
        height: body.scrollHeight,
      })

      const slug = dealerName.trim().replace(/[^\w\u0980-\u09FF]+/g, '-').replace(/^-+|-+$/g, '') || 'dealer'
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `dealer-form-${slug}.jpg`
      link.click()
    } finally {
      iframe.remove()
    }
  }

  async function handleDownloadJpg() {
    const signatureDataUrl = prepareAgreementSignature()
    if (signatureDataUrl === undefined) return

    setIsExportingImage(true)
    try {
      await downloadAgreementJpg(
        buildCustomerAgreementHtml(customerForm, documentUploads, signatureDataUrl, false),
        customerForm.name
      )
    } catch (reason) {
      setPdfError(reason instanceof Error ? reason.message : 'Unable to create the JPG image.')
    } finally {
      setIsExportingImage(false)
    }
  }

  function handleGeneratePdf() {
    const signatureDataUrl = prepareAgreementSignature()
    if (signatureDataUrl === undefined) return

    setPdfError(openAgreementPdf(buildCustomerAgreementHtml(customerForm, documentUploads, signatureDataUrl)))
  }

  async function handleExportSavedCustomer(customer: CustomerRecord, format: 'pdf' | 'jpg') {
    setDetailsExportError(null)
    const form = formFromCustomer(customer)
    const uploads = emptyDocumentUploads()
    const signature = customer.signatureUrl || null

    if (format === 'pdf') {
      setDetailsExportError(openAgreementPdf(buildCustomerAgreementHtml(form, uploads, signature)))
      return
    }

    setIsExportingImage(true)
    try {
      await downloadAgreementJpg(buildCustomerAgreementHtml(form, uploads, signature, false), customer.name)
    } catch (reason) {
      setDetailsExportError(reason instanceof Error ? reason.message : 'Unable to create the JPG image.')
    } finally {
      setIsExportingImage(false)
    }
  }

  return (
    <AdminShell active="Customers (CRM)">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Customers', metrics.totalCustomers.toLocaleString('en-BD'), 'Active CRM records'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From sales history'],
            ['Due balance', metrics.dueTotal.toLocaleString('en-BD', { maximumFractionDigits: 0 }), 'Customer ledger due'],
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
              <CardTitle>Customer data table</CardTitle>
              <CardDescription>Search by name, phone, company, or location.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by name or phone"
                />
              </div>
              <Button
                variant={reminderOnly ? 'default' : 'outline'}
                className="h-10 rounded-xl"
                onClick={() => setReminderOnly((current) => !current)}
              >
                <BellRing className="mr-2 h-4 w-4" />
                Reminder customers
              </Button>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add customer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-7">
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
                <p className="text-xs font-medium text-muted-foreground">Min purchase</p>
                <Input
                  type="number"
                  min="0"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Max purchase</p>
                <Input
                  type="number"
                  min="0"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value)}
                  placeholder="No limit"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">From date</p>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">To date</p>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ customer, orderCount, purchaseTotal, dueTotal, lastPurchaseDate, hasOrders }) => (
                    <TableRow key={customer.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            {customer.dealerPhotoUrl || customer.passportPhotoUrl ? (
                              <AvatarImage
                                src={customer.dealerPhotoUrl || customer.passportPhotoUrl}
                                alt={customer.name}
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              {customerInitials(customer.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{customer.company || 'Retail'}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-xs font-normal">
                                {customer.leadSource === 'facebook' ? 'From Facebook' : 'From Local Marketing'}
                              </Badge>
                              {customer.reminderCustomer && !hasOrders ? (
                                <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">
                                  Reminder
                                </Badge>
                              ) : null}
                              {(() => {
                                const pending = sortedCommitments(customer).filter((item) => item.status === 'pending').length
                                return pending ? (
                                  <button type="button" onClick={() => openDetailsDialog(customer.id, true)}>
                                    <Badge className="gap-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300">
                                      <Handshake className="h-3 w-3" />
                                      {pending} commitment{pending > 1 ? 's' : ''}
                                    </Badge>
                                  </button>
                                ) : null
                              })()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{customer.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{customer.location || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-32">{formatDate(customer.createdAt)}</TableCell>
                      <TableCell className="min-w-44">
                        <p className="font-medium">{formatCurrency(purchaseTotal, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {orderCount} orders, last {formatDate(lastPurchaseDate)}
                        </p>
                      </TableCell>
                      <TableCell>{formatCurrency(customer.due || dueTotal, currency)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => openDetailsDialog(customer.id)}
                            aria-label={`View ${customer.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-amber-600 hover:text-amber-700 dark:text-amber-400"
                            onClick={() => openDetailsDialog(customer.id, true)}
                            aria-label={`Commitments for ${customer.name}`}
                            title="Extra commitments"
                          >
                            <Handshake className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(customer)} aria-label={`Edit ${customer.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(customer)}
                            disabled={hasOrders}
                            aria-label={`Delete ${customer.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No customers found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={viewingCustomer !== null} onOpenChange={(open) => (open ? null : setViewingCustomerId(null))}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          {viewingCustomer ? (
            commitmentsOnly ? (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Extra commitments</DialogTitle>
                  <DialogDescription>
                    {viewingCustomer.name} · {viewingCustomer.company || 'Retail'}
                  </DialogDescription>
                </DialogHeader>
                {renderCommitments(viewingCustomer)}
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCommitmentsOnly(false)}>
                    <Eye className="mr-1.5 h-4 w-4" />
                    Full details
                  </Button>
                  <Button type="button" className="rounded-xl" onClick={() => setViewingCustomerId(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              renderCustomerDetails(viewingCustomer)
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit customer' : 'Add new customer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Update contact details and due balance.'
                : 'Just the essentials — you can add due balance later from the customer list.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dealer details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Dealer name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={customerForm.name}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Karim Traders"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Owner <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.company}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, company: event.target.value }))}
                    placeholder="e.g. Md. Karim Uddin"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    NID No <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.nid}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, nid: event.target.value }))}
                    placeholder="e.g. 1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Trade License No <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.tradeLicenseNo}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, tradeLicenseNo: event.target.value }))}
                    placeholder="e.g. TRAD/12345/2025"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Mobile No<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={customerForm.phone}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="e.g. 01711-000000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Email <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    type="email"
                    value={customerForm.email}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="e.g. dealer@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Nominee name <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.nomineeName}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, nomineeName: event.target.value }))}
                    placeholder="e.g. Md. Karim Uddin"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Nominee NID <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.nomineeNid}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, nomineeNid: event.target.value }))}
                    placeholder="e.g. 1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Division <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Select
                    value={customerForm.division || undefined}
                    onValueChange={(value) =>
                      setCustomerForm((current) => ({ ...current, division: value, district: '', thana: '' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select division" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisionList.map((division) => (
                        <SelectItem key={division} value={division}>
                          {division}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    District <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Select
                    value={customerForm.district || undefined}
                    disabled={!customerForm.division}
                    onValueChange={(value) => setCustomerForm((current) => ({ ...current, district: value, thana: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={customerForm.division ? 'Select district' : 'Select division first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {districtOptions.map((district) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Thana <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Select
                    value={customerForm.thana || undefined}
                    disabled={!customerForm.district}
                    onValueChange={(value) => setCustomerForm((current) => ({ ...current, thana: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={customerForm.district ? 'Select thana' : 'Select district first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {thanaOptions.map((thana) => (
                        <SelectItem key={thana} value={thana}>
                          {thana}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Zone{' '}
                    {visibleZoneIds ? (
                      <span className="ml-0.5 text-rose-500">*</span>
                    ) : (
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    )}
                  </p>
                  <Select
                    value={customerForm.zoneId || 'auto'}
                    onValueChange={(value) => setCustomerForm((current) => ({ ...current, zoneId: value === 'auto' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (from district)" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleZoneIds ? null : <SelectItem value="auto">Auto (from district)</SelectItem>}
                      {zoneOptions.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Dealer area <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.location}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, location: event.target.value }))}
                    placeholder="e.g. Mirpur, Dhaka"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank cheque &amp; documents</p>
              <p className="text-xs text-muted-foreground">
                A signed bank cheque (with photo), NID copy, trade license copy, 1 passport size photo, and a photo of the dealer
                must be collected.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Cheque number <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.chequeNumber}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, chequeNumber: event.target.value }))}
                    placeholder="e.g. 0123456"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Bank name <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.bankName}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, bankName: event.target.value }))}
                    placeholder="e.g. Dutch-Bangla Bank"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Branch <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.branchName}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, branchName: event.target.value }))}
                    placeholder="e.g. Mirpur Branch"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {renderDocumentUpload('dealerPhoto')}
                {renderDocumentUpload('bankDocument')}
                {renderDocumentUpload('nidCopy')}
                {renderDocumentUpload('tradeLicenseCopy')}
                {renderDocumentUpload('passportPhoto')}
              </div>
            </div>

            {editingCustomer ? (
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due balance</p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Due balance ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={customerForm.due}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, due: event.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF &amp; signature</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign below or upload a signature image, then generate a PDF or download a JPG with all the information entered above. A
                  drawn signature is used if both are given.
                </p>
              </div>
              <SignaturePad ref={signaturePadRef} />
              {renderDocumentUpload('signature')}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => signaturePadRef.current?.clear()}>
                  Clear signature
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleGeneratePdf}>
                    <FileSignature className="mr-1.5 h-4 w-4" />
                    Generate PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => void handleDownloadJpg()}
                    disabled={isExportingImage}
                  >
                    <ImageDown className="mr-1.5 h-4 w-4" />
                    {isExportingImage ? 'Preparing JPG...' : 'Download JPG'}
                  </Button>
                </div>
              </div>
              {pdfError ? <p className="text-xs text-destructive">{pdfError}</p> : null}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingCustomer ? 'Update customer' : 'Save customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
