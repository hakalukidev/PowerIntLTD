"use client"

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { BellRing, Edit, FileSignature, MapPin, Phone, Plus, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  divisionList,
  districtsForDivision,
  findDivisionForDistrict,
  thanasForDistrict,
} from '@/lib/data/bangladeshLocations'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { CustomerInput, CustomerRecord } from '@/lib/erp/types'
import { escapeHtml, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'

const CUSTOMER_DOCUMENT_FOLDER = 'customers'

type DocumentKey = 'nidCopy' | 'tradeLicenseCopy' | 'passportPhoto'

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
  chequeNumber: string
  bankName: string
  branchName: string
  nidCopyUrl: string
  nidCopyPublicId: string
  tradeLicenseCopyUrl: string
  tradeLicenseCopyPublicId: string
  passportPhotoUrl: string
  passportPhotoPublicId: string
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
  }
}

const documentFieldLabels: Record<DocumentKey, { title: string; helper: string }> = {
  nidCopy: { title: 'NID copy', helper: 'National ID card copy' },
  tradeLicenseCopy: { title: 'Trade license copy', helper: 'Trade license copy' },
  passportPhoto: { title: 'Passport size photo', helper: '1 copy passport size photo' },
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
  chequeNumber: '',
  bankName: '',
  branchName: '',
  nidCopyUrl: '',
  nidCopyPublicId: '',
  tradeLicenseCopyUrl: '',
  tradeLicenseCopyPublicId: '',
  passportPhotoUrl: '',
  passportPhotoPublicId: '',
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
    chequeNumber: customer.chequeNumber,
    bankName: customer.bankName,
    branchName: customer.branchName,
    nidCopyUrl: customer.nidCopyUrl,
    nidCopyPublicId: customer.nidCopyPublicId,
    tradeLicenseCopyUrl: customer.tradeLicenseCopyUrl,
    tradeLicenseCopyPublicId: customer.tradeLicenseCopyPublicId,
    passportPhotoUrl: customer.passportPhotoUrl,
    passportPhotoPublicId: customer.passportPhotoPublicId,
  }
}

function withFallbackOption(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}

export default function CustomersPage() {
  const { data, saveCustomer, deleteCustomer } = useERP()
  const currency = data?.settings.currency
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
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
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm)
  const [documentUploads, setDocumentUploads] = useState<Record<DocumentKey, DocumentUploadState>>(emptyDocumentUploads)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const signaturePadRef = useRef<SignaturePadHandle>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

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
    setCustomerForm(emptyCustomerForm)
    setDocumentUploads(emptyDocumentUploads())
    setFeedback(null)
    setPdfError(null)
    signaturePadRef.current?.clear()
    setDialogOpen(true)
  }

  function openEditDialog(customer: CustomerRecord) {
    setEditingCustomer(customer)
    setCustomerForm(formFromCustomer(customer))
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
        chequeNumber: finalForm.chequeNumber,
        bankName: finalForm.bankName,
        branchName: finalForm.branchName,
        nidCopyUrl: finalForm.nidCopyUrl,
        nidCopyPublicId: finalForm.nidCopyPublicId,
        tradeLicenseCopyUrl: finalForm.tradeLicenseCopyUrl,
        tradeLicenseCopyPublicId: finalForm.tradeLicenseCopyPublicId,
        passportPhotoUrl: finalForm.passportPhotoUrl,
        passportPhotoPublicId: finalForm.passportPhotoPublicId,
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
            <img src={previewSrc} alt={title} className="h-20 w-20 rounded-xl border border-border/70 object-cover" />
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

  function buildCustomerAgreementHtml(signatureDataUrl: string | null) {
    const form = customerForm
    const documentPreview = (key: DocumentKey) => documentUploads[key].preview ?? form[`${key}Url`]
    const addressParts = [form.location, form.thana, form.district, form.division].filter(Boolean)
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
            @page { margin: 0; }
            body { color: #111827; font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 0; padding: 14mm 12mm 18mm; }
            .header { border-bottom: 2px solid #111827; padding-bottom: 16px; }
            .header h1 { font-size: 22px; margin: 0; }
            .header p { color: #4b5563; font-size: 13px; margin: 4px 0 0; }
            .section { margin-top: 22px; }
            .section h2 { border-bottom: 1px solid #d1d5db; font-size: 13px; letter-spacing: .06em; padding-bottom: 6px; text-transform: uppercase; }
            .grid { display: grid; gap: 12px 20px; grid-template-columns: 1fr 1fr; margin-top: 12px; }
            .field span { color: #6b7280; display: block; font-size: 11px; text-transform: uppercase; }
            .field strong { display: block; font-size: 14px; margin-top: 2px; }
            .documents { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); margin-top: 12px; }
            .document h3 { font-size: 12px; margin: 0 0 8px; }
            .document img { border: 1px solid #d1d5db; border-radius: 8px; height: 110px; object-fit: cover; width: 100%; }
            .document .missing { color: #9ca3af; font-size: 12px; }
            .declaration { background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; line-height: 1.7; margin-top: 22px; padding: 14px; }
            .signature-area { display: flex; justify-content: space-between; margin-top: 48px; }
            .signature-box { text-align: center; width: 260px; }
            .signature-box img { height: 70px; object-fit: contain; }
            .signature-line { border-top: 1px solid #111827; margin-top: 60px; padding-top: 6px; }
            .signature-box img + .signature-line { margin-top: 8px; }
            .print-date { color: #6b7280; font-size: 11px; margin-top: 32px; text-align: right; }
            @media screen { body { padding: 32px; } }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(data?.settings.companyName ?? 'ERP')}</h1>
            <p>Customer / Dealer Information Form</p>
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
              <div class="field"><span>Address</span><strong>${escapeHtml(addressParts.join(', ') || 'N/A')}</strong></div>
            </div>
          </div>

          <div class="section">
            <h2>Bank cheque</h2>
            <div class="grid">
              <div class="field"><span>Cheque number</span><strong>${escapeHtml(form.chequeNumber || 'N/A')}</strong></div>
              <div class="field"><span>Bank name</span><strong>${escapeHtml(form.bankName || 'N/A')}</strong></div>
              <div class="field"><span>Branch</span><strong>${escapeHtml(form.branchName || 'N/A')}</strong></div>
            </div>
          </div>

          <div class="section">
            <h2>Attached documents</h2>
            <div class="documents">
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
          <script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `
  }

  function handleGeneratePdf() {
    setPdfError(null)

    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setPdfError('Fill in the dealer name and mobile number before generating the PDF.')
      return
    }

    const signatureDataUrl =
      signaturePadRef.current && !signaturePadRef.current.isEmpty() ? signaturePadRef.current.toDataUrl() : null

    const popup = window.open('', '_blank', 'width=920,height=720')
    if (!popup) {
      setPdfError('Allow popups to generate or save the document as PDF.')
      return
    }

    popup.document.open()
    popup.document.write(buildCustomerAgreementHtml(signatureDataUrl))
    popup.document.close()
  }

  return (
    <AdminShell active="Customers (CRM)">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Customers', metrics.totalCustomers.toLocaleString('en-BD'), 'Active CRM records'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From sales history'],
            ['Due balance', formatCurrency(metrics.dueTotal, currency), 'Customer ledger due'],
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
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              {customer.name
                                .split(' ')
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
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
                A signed bank cheque, NID copy, trade license copy, and 1 passport size photo must be collected from the
                dealer.
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
              <div className="grid gap-4 sm:grid-cols-3">
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
                  Sign below, then generate a PDF with all the information entered above.
                </p>
              </div>
              <SignaturePad ref={signaturePadRef} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => signaturePadRef.current?.clear()}>
                  Clear signature
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleGeneratePdf}>
                  <FileSignature className="mr-1.5 h-4 w-4" />
                  Generate PDF
                </Button>
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
