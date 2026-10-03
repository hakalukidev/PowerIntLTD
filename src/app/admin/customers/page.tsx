"use client"

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { BellRing, Check, Edit, Eye, FileSignature, ImageDown, ImagePlus, Handshake, MapPin, Phone, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { CommitmentApprovalBadge, CommitmentReviewActions } from '@/components/admin/credit-sheet/CommitmentApproval'
import { downloadDocumentJpg, downloadDocumentPdf } from '@/components/admin/credit-sheet/printSheet'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { CustomerCommitment, CustomerInput, CustomerRecord, DocumentPhoto } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { groupRemindersByDate, localToday, pendingCommitmentReminders } from '@/lib/erp/commitmentReminders'
import { customerZoneId, subZoneKey, subZoneKeyFor, UNASSIGNED_ZONE_ID, UNASSIGNED_ZONE_NAME, zoneSubZones } from '@/lib/erp/zones'
import { escapeHtml, formatCurrency, formatDate, isCommitmentApproved, isZoneInCharge, partyCode, toArray } from '@/lib/erp/utils'

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
  /** The dealer's sub-zone, one of its zone's sub-zones. Older dealers have a thana here. */
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

const DOCUMENT_KEYS: DocumentKey[] = ['signature', 'dealerPhoto', 'bankDocument', 'nidCopy', 'tradeLicenseCopy', 'passportPhoto']

/** A photo already saved (`url` + `publicId`) or picked and waiting to upload (`file`, with a local preview `url`). */
type DocumentPhotoItem = DocumentPhoto & { file: File | null }

type DocumentUploadState = {
  photos: DocumentPhotoItem[]
  /** Saved photos taken off the form, deleted from storage once the dealer is saved. */
  removedIds: string[]
}

function emptyDocumentUploads(): Record<DocumentKey, DocumentUploadState> {
  return Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, { photos: [], removedIds: [] }])) as Record<DocumentKey, DocumentUploadState>
}

/** The photos a saved dealer has for each document: the main one first, then the extras. */
function documentUploadsFromCustomer(customer: CustomerRecord): Record<DocumentKey, DocumentUploadState> {
  return Object.fromEntries(
    DOCUMENT_KEYS.map((key) => {
      const main: DocumentPhoto[] = customer[`${key}Url`] ? [{ url: customer[`${key}Url`], publicId: customer[`${key}PublicId`] }] : []
      const photos = [...main, ...(customer.extraPhotos?.[key] ?? [])].map((photo) => ({ ...photo, file: null }))
      return [key, { photos, removedIds: [] }]
    })
  ) as Record<DocumentKey, DocumentUploadState>
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

/** A dealer name made safe for a file name, keeping Bangla letters. */
function dealerFileSlug(name: string) {
  return name.trim().replace(/[^\w\u0980-\u09FF]+/g, '-').replace(/^-+|-+$/g, '') || 'dealer'
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
  const { data, currentUser, saveCustomer, deleteCustomer, saveCustomerCommitment, deleteCustomerCommitment, changesNeedApproval, hasPermission } =
    useERP()
  const canEdit = hasPermission('customers.edit')
  // A zone in charge cannot change client data, but may add a commitment; it then goes to the Authorizer and the Chairman.
  const zoneInCharge = useMemo(() => isZoneInCharge(currentUser, toArray(data?.zones)), [currentUser, data?.zones])
  const canAddCommitment = canEdit || zoneInCharge
  const canDelete = hasPermission('customers.delete')
  const currency = data?.settings.currency
  // Zone managers and zone-limited roles only see the dealers of their zones.
  const { zones, zoneOptions, visibleZoneIds, customers } = useZoneAccess()
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const [query, setQuery] = useState('')
  const [reminderOnly, setReminderOnly] = useState(false)
  // The notification bell links here with ?reminders=1 to open the date-wise commitment reminders.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reminders') === '1') setReminderOnly(true)
  }, [])
  const commitmentReminderGroups = useMemo(() => groupRemindersByDate(pendingCommitmentReminders(customers)), [customers])
  const [filterZone, setFilterZone] = useState('all')
  const [filterSubZone, setFilterSubZone] = useState('all')
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
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [detailsExportError, setDetailsExportError] = useState<string | null>(null)

  // Sub-zones of the zone picked on the form, keeping an older dealer's thana selectable.
  const subZoneOptions = useMemo(
    () => withFallbackOption(zoneSubZones(zones.find((zone) => zone.id === customerForm.zoneId)), customerForm.thana),
    [zones, customerForm.zoneId, customerForm.thana]
  )

  // Sub-zones to filter by: the chosen zone's, or every visible zone's (named with their zone).
  const filterSubZoneOptions = useMemo(() => {
    const shownZones = filterZone === 'all' ? zoneOptions : zoneOptions.filter((zone) => zone.id === filterZone)
    return shownZones.flatMap((zone) =>
      zoneSubZones(zone).map((name) => ({
        key: subZoneKeyFor(zone.id, name),
        label: filterZone === 'all' ? `${name} (${zone.name})` : name,
      }))
    )
  }, [filterZone, zoneOptions])

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
        [partyCode(customer), customer.name, customer.company, customer.phone, customer.location]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesReminder =
        !reminderOnly ||
        (customer.reminderCustomer && !hasOrders) ||
        Object.values(customer.commitments ?? {}).some((item) => item.status === 'pending' && isCommitmentApproved(item))
      const matchesZone = filterZone === 'all' || customerZoneId(customer, zones) === filterZone
      const matchesSubZone = filterSubZone === 'all' || subZoneKey(customer, zones) === filterSubZone
      const matchesMinPrice = minPrice === null || Number.isNaN(minPrice) || purchaseTotal >= minPrice
      const matchesMaxPrice = maxPrice === null || Number.isNaN(maxPrice) || purchaseTotal <= maxPrice
      const joinedDate = new Date(customer.createdAt)
      const matchesFrom = !from || joinedDate >= from
      const matchesTo = !to || joinedDate <= to

      return (
        matchesSearch &&
        matchesReminder &&
        matchesZone &&
        matchesSubZone &&
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
    filterZone,
    zones,
    filterSubZone,
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
    setDialogOpen(true)
  }

  function openEditDialog(customer: CustomerRecord) {
    setEditingCustomer(customer)
    const form = formFromCustomer(customer)
    // Show the zone the dealer is actually in, even when it came from their sub-zone rather than being picked.
    const resolvedZoneId = customerZoneId(customer, zones)
    setCustomerForm(!form.zoneId && resolvedZoneId !== UNASSIGNED_ZONE_ID ? { ...form, zoneId: resolvedZoneId } : form)
    setDocumentUploads(documentUploadsFromCustomer(customer))
    setFeedback(null)
    setPdfError(null)
    setDialogOpen(true)
  }

  function handleDocumentFileChange(key: DocumentKey, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Lets the same file be picked again after it was removed.
    event.target.value = ''
    if (!files.length) return

    const added = files.map((file) => ({ url: URL.createObjectURL(file), publicId: '', file }))
    setDocumentUploads((current) => {
      const upload = current[key]
      // The signature holds one image, so a new one replaces it.
      if (key === 'signature') {
        const replacedIds = upload.photos.map((photo) => photo.publicId).filter(Boolean)
        return { ...current, [key]: { photos: added.slice(0, 1), removedIds: [...upload.removedIds, ...replacedIds] } }
      }
      return { ...current, [key]: { ...upload, photos: [...upload.photos, ...added] } }
    })
  }

  function handleRemoveDocument(key: DocumentKey, index: number) {
    setDocumentUploads((current) => {
      const upload = current[key]
      const removed = upload.photos[index]
      if (!removed) return current
      return {
        ...current,
        [key]: {
          photos: upload.photos.filter((_, photoIndex) => photoIndex !== index),
          removedIds: removed.publicId ? [...upload.removedIds, removed.publicId] : upload.removedIds,
        },
      }
    })
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
      const uploadedFields: Partial<CustomerFormState> = {}
      const extraPhotos: Record<string, DocumentPhoto[]> = {}
      const deletions: string[] = []

      for (const key of DOCUMENT_KEYS) {
        const upload = documentUploads[key]
        const photos: DocumentPhoto[] = []
        for (const photo of upload.photos) {
          if (photo.file) {
            const result = await uploadImageToCloudinary(photo.file, CUSTOMER_DOCUMENT_FOLDER)
            photos.push({ url: result.imageUrl, publicId: result.imagePublicId })
          } else {
            photos.push({ url: photo.url, publicId: photo.publicId })
          }
        }
        // The first photo stays in the document's own field; the rest are extras.
        uploadedFields[`${key}Url`] = photos[0]?.url ?? ''
        uploadedFields[`${key}PublicId`] = photos[0]?.publicId ?? ''
        if (photos.length > 1) extraPhotos[key] = photos.slice(1)
        deletions.push(...upload.removedIds)
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
        extraPhotos,
      }

      await saveCustomer(input, editingCustomer?.id)

      // A change waiting for approval still needs the files the dealer has now.
      if (!changesNeedApproval) {
        await Promise.all(deletions.map((publicId) => deleteCloudinaryImage(publicId).catch(() => undefined)))
      }

      setDialogOpen(false)
      setCustomerForm(emptyCustomerForm)
      setDocumentUploads(emptyDocumentUploads())
      setEditingCustomer(null)
      setFeedback(
        changesNeedApproval
          ? `${editingCustomer ? 'Dealer changes' : 'New dealer'} sent to an admin for approval.`
          : editingCustomer
            ? 'Dealer details updated.'
            : 'New dealer added.'
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save dealer.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(customer: CustomerRecord) {
    setFeedback(null)

    try {
      await deleteCustomer(customer.id)
      setFeedback(
        changesNeedApproval ? `Deleting ${customer.name} was sent to an admin for approval.` : `${customer.name} removed from dealer list.`
      )
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete dealer.')
    }
  }

  function renderDocumentUpload(key: DocumentKey) {
    const { title, helper } = documentFieldLabels[key]
    const { photos } = documentUploads[key]
    const isSignature = key === 'signature'

    return (
      <div key={key} className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {title}
          {!isSignature ? <span className="font-normal text-muted-foreground"> (multiple photos)</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">{helper}</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <div key={photo.url} className="relative">
              <img
                src={photo.url}
                alt={`${title} ${index + 1}`}
                className={`h-20 rounded-xl border border-border/70 ${isSignature ? 'w-48 bg-white object-contain' : 'w-20 object-cover'}`}
              />
              <button
                type="button"
                aria-label={`Remove ${title} ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                onClick={() => handleRemoveDocument(key, index)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label
            className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/30 px-2 text-center text-xs text-muted-foreground transition hover:border-primary hover:text-primary focus-within:border-primary ${isSignature && photos.length ? 'w-24' : 'w-20'}`}
          >
            <ImagePlus className="h-5 w-5" />
            <span>{isSignature ? (photos.length ? 'Replace' : 'Add') : photos.length ? 'Add more' : 'Add photos'}</span>
            <input
              type="file"
              accept="image/*"
              multiple={!isSignature}
              className="sr-only"
              onChange={(event) => handleDocumentFileChange(key, event)}
            />
          </label>
        </div>
        {!isSignature && photos.length ? (
          <p className="text-xs text-muted-foreground">
            {photos.length} photo{photos.length > 1 ? 's' : ''} added
          </p>
        ) : null}
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

  /** The pending commitments of every visible dealer, date-wise, so none is missed on its day. */
  function renderCommitmentReminders() {
    const today = localToday()
    const whenLabel = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', no_date: 'No due date' } as const
    const whenClass = {
      overdue: 'bg-red-500/15 text-red-700 hover:bg-red-500/15 dark:text-red-300',
      today: 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300',
      upcoming: 'bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300',
      no_date: 'bg-muted text-muted-foreground hover:bg-muted',
    } as const

    return (
      <div className="mb-4 space-y-3 rounded-2xl border border-border/70 p-3 sm:p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4" />
            Commitment reminders
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pending commitments by due date, today {formatDate(today)}.</p>
        </div>
        {commitmentError ? <p className="text-sm text-destructive">{commitmentError}</p> : null}
        {commitmentReminderGroups.length ? (
          commitmentReminderGroups.map((group) => (
            <div key={group.date || 'no-date'} className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.date ? formatDate(group.date) : 'No due date'}
                </p>
                <Badge className={whenClass[group.when]}>{whenLabel[group.when]}</Badge>
              </div>
              {group.items.map(({ customer, commitment }) => (
                <div key={commitment.id} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      {customer.name}{' '}
                      <span className="font-mono text-xs font-normal text-muted-foreground">{partyCode(customer)}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">{commitment.note}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.phone ? `${customer.phone} · ` : ''}Added {formatDate(commitment.createdAt)}
                      {commitment.createdBy ? ` by ${commitment.createdBy}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={commitmentBusy}
                        onClick={() =>
                          void runCommitmentAction(() =>
                            saveCustomerCommitment(customer.id, { note: commitment.note, status: 'fulfilled' }, commitment.id)
                          )
                        }
                        aria-label="Mark as fulfilled"
                        title="Mark as fulfilled"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openDetailsDialog(customer.id, true)}
                      aria-label={`View ${customer.name}'s commitments`}
                      title="View commitments"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No pending commitments.</p>
        )}
      </div>
    )
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
              const approved = isCommitmentApproved(commitment)
              const fulfilled = commitment.status === 'fulfilled'
              const overdue = approved && !fulfilled && Boolean(commitment.dueDate) && commitment.dueDate < today
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
                      {!approved ? (
                        <CommitmentApprovalBadge commitment={commitment} />
                      ) : fulfilled ? (
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
                  <CommitmentReviewActions customerId={customer.id} commitment={commitment} onError={setCommitmentError} />
                  {canEdit && approved ? (
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
                  ) : canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      disabled={commitmentBusy}
                      onClick={() => void runCommitmentAction(() => deleteCustomerCommitment(customer.id, commitment.id))}
                      aria-label="Delete commitment"
                      title="Delete commitment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No commitments recorded.</p>
        )}

        {canAddCommitment ? (
        <div className="space-y-2 rounded-xl bg-muted/30 p-3">
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">Your commitment goes to the Authorizer, then to the Chairman for approval.</p>
          ) : null}
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
        </div>
        ) : null}
        {commitmentError ? <p className="text-xs text-destructive">{commitmentError}</p> : null}
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
    const address = [customer.location, customer.thana, customer.district]
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
    const savedPhotos = documentUploadsFromCustomer(customer)
    const documents: [string, string[]][] = (
      [
        ['Dealer photo', 'dealerPhoto'],
        ['Bank cheque / document', 'bankDocument'],
        ['NID copy', 'nidCopy'],
        ['Trade license copy', 'tradeLicenseCopy'],
        ['Passport size photo', 'passportPhoto'],
        ['Signature', 'signature'],
      ] as const
    ).map(([label, key]) => [label, savedPhotos[key].photos.map((photo) => photo.url)])

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
            {documents.map(([label, urls]) => (
              <div key={label} className="space-y-1.5">
                <p className="text-xs font-medium">
                  {label}
                  {urls.length > 1 ? <span className="text-muted-foreground"> ({urls.length})</span> : null}
                </p>
                {urls.length ? (
                  <div className={urls.length > 1 ? 'grid grid-cols-2 gap-1.5' : ''}>
                    {urls.map((url, index) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={url}
                          alt={`${label} ${index + 1}`}
                          className={`${urls.length > 1 ? 'h-20' : 'h-28'} w-full rounded-xl border border-border/70 bg-muted/30 object-contain transition hover:opacity-80`}
                        />
                      </a>
                    ))}
                  </div>
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
            disabled={isExportingPdf}
          >
            <FileSignature className="mr-1.5 h-4 w-4" />
            {isExportingPdf ? 'Preparing PDF...' : 'PDF'}
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
          {canEdit ? (
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
          ) : null}
        </div>
      </div>
    )
  }

  function buildCustomerAgreementHtml(
    form: CustomerFormState,
    uploads: Record<DocumentKey, DocumentUploadState>,
    autoPrint = true
  ) {
    const documentPreview = (key: DocumentKey) => uploads[key].photos[0]?.url ?? ''
    const addressParts = [form.location, form.thana, form.district].filter(Boolean)
    const companyName = data?.settings.companyName ?? 'Power International BD'
    const logoUrl = `${window.location.origin}/power-logo.png`
    const dealerPhotoSrc = documentPreview('dealerPhoto') || documentPreview('passportPhoto')
    const documentRow = (label: string, key: DocumentKey) => {
      const sources = uploads[key].photos.map((photo) => photo.url)
      return `
        <div class="document">
          <h3>${escapeHtml(label)}</h3>
          ${
            sources.length
              ? `<div class="document-photos${sources.length > 1 ? ' multi' : ''}">${sources
                  .map((src, index) => `<img src="${src}" alt="${escapeHtml(`${label} ${index + 1}`)}" />`)
                  .join('')}</div>`
              : '<p class="missing">Not attached</p>'
          }
        </div>
      `
    }

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Dealer Information - ${escapeHtml(form.name || 'Dealer')}</title>
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
            .document-photos.multi { display: grid; gap: 4px; grid-template-columns: 1fr 1fr; }
            .document-photos.multi img { height: 53px; }
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
              <div class="signature-line">Dealer Signature</div>
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

  // The agreement is signed by hand after printing, so the export only leaves a blank signature line.
  function canExportAgreement(): boolean {
    setPdfError(null)

    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setPdfError('Fill in the dealer name and mobile number before generating the PDF or JPG.')
      return false
    }
    return true
  }

  // Saves the agreement as a PDF file directly, so no browser print header or footer ends up on it.
  async function downloadAgreementPdf(html: string, dealerName: string): Promise<string | null> {
    setIsExportingPdf(true)
    try {
      await downloadDocumentPdf(html, `dealer-form-${dealerFileSlug(dealerName)}.pdf`)
      return null
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Unable to create the PDF.'
    } finally {
      setIsExportingPdf(false)
    }
  }

  async function downloadAgreementJpg(html: string, dealerName: string) {
    await downloadDocumentJpg(html, `dealer-form-${dealerFileSlug(dealerName)}.jpg`)
  }

  async function handleDownloadJpg() {
    if (!canExportAgreement()) return

    setIsExportingImage(true)
    try {
      await downloadAgreementJpg(
        buildCustomerAgreementHtml(customerForm, documentUploads, false),
        customerForm.name
      )
    } catch (reason) {
      setPdfError(reason instanceof Error ? reason.message : 'Unable to create the JPG image.')
    } finally {
      setIsExportingImage(false)
    }
  }

  async function handleGeneratePdf() {
    if (!canExportAgreement()) return

    setPdfError(await downloadAgreementPdf(buildCustomerAgreementHtml(customerForm, documentUploads, false), customerForm.name))
  }

  async function handleExportSavedCustomer(customer: CustomerRecord, format: 'pdf' | 'jpg') {
    setDetailsExportError(null)
    const form = formFromCustomer(customer)
    const uploads = documentUploadsFromCustomer(customer)

    if (format === 'pdf') {
      setDetailsExportError(await downloadAgreementPdf(buildCustomerAgreementHtml(form, uploads, false), customer.name))
      return
    }

    setIsExportingImage(true)
    try {
      await downloadAgreementJpg(buildCustomerAgreementHtml(form, uploads, false), customer.name)
    } catch (reason) {
      setDetailsExportError(reason instanceof Error ? reason.message : 'Unable to create the JPG image.')
    } finally {
      setIsExportingImage(false)
    }
  }

  return (
    <AdminShell active="Dealers (CRM)">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
          {[
            ['Dealers', metrics.totalCustomers.toLocaleString('en-BD'), 'Active CRM records'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From sales history'],
            ['Due balance', metrics.dueTotal.toLocaleString('en-BD', { maximumFractionDigits: 0 }), 'Dealer ledger due'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1.5 break-words text-lg font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
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
              <CardTitle>Dealer data table</CardTitle>
              <CardDescription>Search by name, phone, company, or location.</CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative col-span-2 xl:col-span-1">
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
                Reminder dealers
              </Button>
              {canEdit ? (
                <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Add dealer
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-border/70 p-3 sm:p-4 lg:grid-cols-4 xl:grid-cols-6">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Zone</p>
                <Select
                  value={filterZone}
                  onValueChange={(value) => {
                    setFilterZone(value)
                    setFilterSubZone('all')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All zones</SelectItem>
                    {zoneOptions.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                    {visibleZoneIds ? null : <SelectItem value={UNASSIGNED_ZONE_ID}>{UNASSIGNED_ZONE_NAME}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Sub-zone</p>
                <Select value={filterSubZone} disabled={!filterSubZoneOptions.length} onValueChange={setFilterSubZone}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sub-zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sub-zones</SelectItem>
                    {filterSubZoneOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
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
            {reminderOnly ? renderCommitmentReminders() : null}
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Dealer</TableHead>
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
                            <p className="text-sm text-muted-foreground">
                              <span className="font-mono text-xs">{partyCode(customer)}</span> · {customer.company || 'Retail'}
                            </p>
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
                                const pending = sortedCommitments(customer).filter((item) => item.status === 'pending' && item.approvalStage !== 'rejected').length
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
                          {canEdit ? (
                            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(customer)} aria-label={`Edit ${customer.name}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canDelete ? (
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
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No dealers found.
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
            <DialogTitle>{editingCustomer ? 'Edit dealer' : 'Add new dealer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Update contact details and due balance.'
                : 'Just the essentials — you can add due balance later from the dealer list.'}
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
                    Zone{' '}
                    {visibleZoneIds ? (
                      <span className="ml-0.5 text-rose-500">*</span>
                    ) : (
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    )}
                  </p>
                  <Select
                    value={customerForm.zoneId || 'none'}
                    onValueChange={(value) =>
                      setCustomerForm((current) => ({ ...current, zoneId: value === 'none' ? '' : value, thana: '' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleZoneIds ? null : <SelectItem value="none">No zone</SelectItem>}
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
                    Sub-zone <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Select
                    value={customerForm.thana || 'none'}
                    disabled={!customerForm.zoneId}
                    onValueChange={(value) => setCustomerForm((current) => ({ ...current, thana: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={customerForm.zoneId ? 'Select sub-zone' : 'Select zone first'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No sub-zone</SelectItem>
                      {subZoneOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customerForm.zoneId && !subZoneOptions.length ? (
                    <p className="text-xs text-muted-foreground">This zone has no sub-zones yet. An admin can add them under Zones.</p>
                  ) : null}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generate a PDF or download a JPG with all the information entered above. Print it and have the dealer sign on the
                  signature line.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => void handleGeneratePdf()}
                    disabled={isExportingPdf}
                  >
                    <FileSignature className="mr-1.5 h-4 w-4" />
                    {isExportingPdf ? 'Preparing PDF...' : 'Download PDF'}
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
                {isSaving ? 'Saving...' : editingCustomer ? 'Update dealer' : 'Save dealer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
