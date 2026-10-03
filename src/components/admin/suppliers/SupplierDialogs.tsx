"use client"

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Edit, FileSignature, ImageDown, Package, Plus, X } from 'lucide-react'

import { downloadDocumentJpg, downloadDocumentPdf } from '@/components/admin/credit-sheet/printSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { SupplierInput, SupplierRecord } from '@/lib/erp/types'
import { computeSupplierPayables, escapeHtml, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const SUPPLIER_DOCUMENT_FOLDER = 'suppliers'

type DocumentKey = 'signature' | 'supplierPhoto' | 'bankDocument' | 'nidCopy' | 'tradeLicenseCopy' | 'passportPhoto'

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
    supplierPhoto: { file: null, preview: null, pendingDeleteId: null },
    signature: { file: null, preview: null, pendingDeleteId: null },
  }
}

const documentFieldLabels: Record<DocumentKey, { title: string; helper: string }> = {
  nidCopy: { title: 'NID copy', helper: 'National ID card copy' },
  tradeLicenseCopy: { title: 'Trade license copy', helper: 'Trade license copy' },
  passportPhoto: { title: 'Passport size photo', helper: '1 copy passport size photo' },
  bankDocument: { title: 'Bank cheque / document', helper: 'Photo of signed cheque or bank document' },
  supplierPhoto: { title: 'Supplier photo', helper: 'Photo of the supplier who filled up the form' },
  signature: { title: 'Upload signature', helper: 'Photo or scan of the supplier signature' },
}

/** A supplier name made safe for a file name, keeping Bangla letters. */
function supplierFileSlug(name: string) {
  return name.trim().replace(/[^\w\u0980-\u09FF]+/g, '-').replace(/^-+|-+$/g, '') || 'supplier'
}

type SupplierFormState = {
  name: string
  company: string
  phone: string
  email: string
  location: string
  supplierType: SupplierRecord['supplierType']
  country: string
  lcNumber: string
  lcStatus: SupplierRecord['lcStatus']
  productCost: string
  shippingCost: string
  customsDuty: string
  otherCost: string
  currency: string
  notes: string
  suppliedProducts: string[]
  openingDue: string
  bankAccountName: string
  bankAccountNumber: string
  bankName: string
  bankBranch: string
  bankRoutingNumber: string
  bankSwiftCode: string
  mobileBankingNumber: string
  nid: string
  tradeLicenseNo: string
  nomineeName: string
  nomineeNid: string
  chequeNumber: string
  supplierPhotoUrl: string
  supplierPhotoPublicId: string
  bankDocumentUrl: string
  bankDocumentPublicId: string
  nidCopyUrl: string
  nidCopyPublicId: string
  tradeLicenseCopyUrl: string
  tradeLicenseCopyPublicId: string
  passportPhotoUrl: string
  passportPhotoPublicId: string
  signatureUrl: string
  signaturePublicId: string
}

const emptySupplierForm: SupplierFormState = {
  name: '',
  company: '',
  phone: '',
  email: '',
  location: '',
  supplierType: 'local',
  country: 'Bangladesh',
  lcNumber: '',
  lcStatus: 'not-required',
  productCost: '0',
  shippingCost: '0',
  customsDuty: '0',
  otherCost: '0',
  currency: 'BDT',
  notes: '',
  suppliedProducts: [],
  openingDue: '0',
  bankAccountName: '',
  bankAccountNumber: '',
  bankName: '',
  bankBranch: '',
  bankRoutingNumber: '',
  bankSwiftCode: '',
  mobileBankingNumber: '',
  nid: '',
  tradeLicenseNo: '',
  nomineeName: '',
  nomineeNid: '',
  chequeNumber: '',
  supplierPhotoUrl: '',
  supplierPhotoPublicId: '',
  bankDocumentUrl: '',
  bankDocumentPublicId: '',
  nidCopyUrl: '',
  nidCopyPublicId: '',
  tradeLicenseCopyUrl: '',
  tradeLicenseCopyPublicId: '',
  passportPhotoUrl: '',
  passportPhotoPublicId: '',
  signatureUrl: '',
  signaturePublicId: '',
}

export const supplierTypeLabels: Record<SupplierRecord['supplierType'], string> = {
  local: 'Local supplier',
  foreign: 'Foreign supplier',
  importer: 'Importer',
}

export const lcStatusLabels: Record<SupplierRecord['lcStatus'], string> = {
  'not-required': 'No LC',
  pending: 'LC pending',
  opened: 'LC opened',
  released: 'Released',
  closed: 'Closed',
}

const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']
const commonCountries = ['Bangladesh', 'China', 'India', 'United States', 'United Arab Emirates']

export function typeToneClass(type: SupplierRecord['supplierType']) {
  if (type === 'foreign') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }

  if (type === 'importer') {
    return 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300'
  }

  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

export function lcToneClass(status: SupplierRecord['lcStatus']) {
  if (status === 'pending') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  if (status === 'opened' || status === 'released') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }

  if (status === 'closed') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }

  return 'border-border bg-muted text-muted-foreground'
}

function formFromSupplier(supplier: SupplierRecord): SupplierFormState {
  return {
    name: supplier.name,
    company: supplier.company,
    phone: supplier.phone,
    email: supplier.email,
    location: supplier.location,
    supplierType: supplier.supplierType,
    country: supplier.country,
    lcNumber: supplier.lcNumber,
    lcStatus: supplier.lcStatus,
    productCost: String(supplier.productCost),
    shippingCost: String(supplier.shippingCost),
    customsDuty: String(supplier.customsDuty),
    otherCost: String(supplier.otherCost),
    currency: supplier.currency,
    notes: supplier.notes,
    suppliedProducts: supplier.suppliedProducts,
    openingDue: String(supplier.openingDue),
    bankAccountName: supplier.bankAccountName,
    bankAccountNumber: supplier.bankAccountNumber,
    bankName: supplier.bankName,
    bankBranch: supplier.bankBranch,
    bankRoutingNumber: supplier.bankRoutingNumber,
    bankSwiftCode: supplier.bankSwiftCode,
    mobileBankingNumber: supplier.mobileBankingNumber,
    nid: supplier.nid,
    tradeLicenseNo: supplier.tradeLicenseNo,
    nomineeName: supplier.nomineeName,
    nomineeNid: supplier.nomineeNid,
    chequeNumber: supplier.chequeNumber,
    supplierPhotoUrl: supplier.supplierPhotoUrl,
    supplierPhotoPublicId: supplier.supplierPhotoPublicId,
    bankDocumentUrl: supplier.bankDocumentUrl,
    bankDocumentPublicId: supplier.bankDocumentPublicId,
    nidCopyUrl: supplier.nidCopyUrl,
    nidCopyPublicId: supplier.nidCopyPublicId,
    tradeLicenseCopyUrl: supplier.tradeLicenseCopyUrl,
    tradeLicenseCopyPublicId: supplier.tradeLicenseCopyPublicId,
    passportPhotoUrl: supplier.passportPhotoUrl,
    passportPhotoPublicId: supplier.passportPhotoPublicId,
    signatureUrl: supplier.signatureUrl,
    signaturePublicId: supplier.signaturePublicId,
  }
}

function buildSupplierFormHtml(
  form: SupplierFormState,
  uploads: Record<DocumentKey, DocumentUploadState>,
  signatureDataUrl: string | null,
  companyName: string
) {
  const documentPreview = (key: DocumentKey) => uploads[key].preview ?? form[`${key}Url`]
  const logoUrl = `${window.location.origin}/power-logo.png`
  const supplierPhotoSrc = documentPreview('supplierPhoto') || documentPreview('passportPhoto')
  const field = (label: string, value: string, wide = false) =>
    `<div class="field${wide ? ' wide' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || 'N/A')}</strong></div>`
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
        <title>Supplier Information - ${escapeHtml(form.name || 'Supplier')}</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4; margin: 0; }
          body { color: #111827; font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 0; padding: 12mm 12mm 14mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .header { align-items: center; border-bottom: 3px solid #1d4f91; display: flex; gap: 16px; justify-content: space-between; padding-bottom: 12px; }
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
          <div class="brand"><img src="${logoUrl}" alt="${escapeHtml(companyName)}" /></div>
          <div class="form-title">
            <h1>Supplier Information Form</h1>
            <p>${escapeHtml(companyName)}</p>
          </div>
          <div class="photo-frame">
            ${supplierPhotoSrc ? `<img src="${supplierPhotoSrc}" alt="Supplier photo" />` : '<span>Supplier photo</span>'}
          </div>
        </div>

        <div class="section">
          <h2>Supplier details</h2>
          <div class="grid">
            ${field('Supplier name', form.name)}
            ${field('Owner / company', form.company)}
            ${field('Mobile No', form.phone)}
            ${field('Email', form.email)}
            ${field('NID No', form.nid)}
            ${field('Trade License No', form.tradeLicenseNo)}
            ${field('Nominee name', form.nomineeName)}
            ${field('Nominee NID', form.nomineeNid)}
            ${field('Supplier type', supplierTypeLabels[form.supplierType])}
            ${field('Country', form.country)}
            ${field('Address', form.location, true)}
            ${field('Products supplied', form.suppliedProducts.join(', '), true)}
          </div>
        </div>

        <div class="section">
          <h2>Bank details</h2>
          <div class="grid three">
            ${field('Account name', form.bankAccountName)}
            ${field('Account number', form.bankAccountNumber)}
            ${field('Bank name', form.bankName)}
            ${field('Branch', form.bankBranch)}
            ${field('Routing number', form.bankRoutingNumber)}
            ${field('SWIFT / BIC', form.bankSwiftCode)}
            ${field('Cheque number', form.chequeNumber)}
            ${field('bKash / Nagad', form.mobileBankingNumber)}
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

        <div class="signature-area">
          <div class="signature-box">
            ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature" />` : ''}
            <div class="signature-line">Supplier Signature</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Date</div>
          </div>
        </div>

        <p class="print-date">${formatDate(new Date().toISOString())}</p>
      </body>
    </html>
  `
}

async function exportSupplierForm(html: string, supplierName: string, format: 'pdf' | 'jpg'): Promise<string | null> {
  try {
    const filename = `supplier-form-${supplierFileSlug(supplierName)}.${format}`
    await (format === 'pdf' ? downloadDocumentPdf(html, filename) : downloadDocumentJpg(html, filename))
    return null
  } catch (reason) {
    return reason instanceof Error ? reason.message : `Unable to create the ${format.toUpperCase()}.`
  }
}

/**
 * The supplier form, laid out like the dealer form: details, bank details and documents,
 * trade type, and a signature with PDF/JPG export. Mount it with a fresh `key` each time
 * it opens so it starts from the supplier being edited (or an empty form).
 */
export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier: editingSupplier,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: SupplierRecord | null
  onSaved: (message: string) => void
}) {
  const { data, saveSupplier, changesNeedApproval } = useERP()
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const currency = data?.settings.currency
  const companyName = data?.settings.companyName ?? 'Power International BD'
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(() =>
    editingSupplier ? formFromSupplier(editingSupplier) : emptySupplierForm
  )
  const [productDraft, setProductDraft] = useState('')
  const [documentUploads, setDocumentUploads] = useState<Record<DocumentKey, DocumentUploadState>>(emptyDocumentUploads)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const signaturePadRef = useRef<SignaturePadHandle>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const countryOptions = useMemo(
    () => Array.from(new Set([...commonCountries, ...suppliers.map((supplier) => supplier.country)].filter(Boolean))),
    [suppliers]
  )

  const productNameOptions = useMemo(
    () =>
      Array.from(
        new Set([...products.map((product) => product.name), ...suppliers.flatMap((supplier) => supplier.suppliedProducts)].filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [products, suppliers]
  )

  function addSuppliedProduct() {
    const name = productDraft.trim()
    if (!name) {
      return
    }

    setSupplierForm((current) =>
      current.suppliedProducts.some((existing) => existing.toLowerCase() === name.toLowerCase())
        ? current
        : { ...current, suppliedProducts: [...current.suppliedProducts, name] }
    )
    setProductDraft('')
  }

  function removeSuppliedProduct(name: string) {
    setSupplierForm((current) => ({ ...current, suppliedProducts: current.suppliedProducts.filter((existing) => existing !== name) }))
  }

  const previewLandedCost =
    Number(supplierForm.productCost || 0) +
    Number(supplierForm.shippingCost || 0) +
    Number(supplierForm.customsDuty || 0) +
    Number(supplierForm.otherCost || 0)

  function handleDocumentFileChange(key: DocumentKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return

    setDocumentUploads((current) => ({
      ...current,
      [key]: {
        file,
        preview: URL.createObjectURL(file),
        pendingDeleteId: current[key].pendingDeleteId || supplierForm[`${key}PublicId`] || null,
      },
    }))
    setSupplierForm((current) => ({ ...current, [`${key}Url`]: '', [`${key}PublicId`]: '' }))
  }

  function handleRemoveDocument(key: DocumentKey) {
    setDocumentUploads((current) => ({
      ...current,
      [key]: {
        file: null,
        preview: null,
        pendingDeleteId: current[key].pendingDeleteId || supplierForm[`${key}PublicId`] || null,
      },
    }))
    setSupplierForm((current) => ({ ...current, [`${key}Url`]: '', [`${key}PublicId`]: '' }))
  }

  function renderDocumentUpload(key: DocumentKey) {
    const { title, helper } = documentFieldLabels[key]
    const upload = documentUploads[key]
    const previewSrc = upload.preview ?? supplierForm[`${key}Url`]

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setIsSaving(true)

    try {
      const uploadedFields: Partial<SupplierFormState> = {}
      const deletions: string[] = []

      for (const key of Object.keys(documentUploads) as DocumentKey[]) {
        const upload = documentUploads[key]
        if (upload.file) {
          const result = await uploadImageToCloudinary(upload.file, SUPPLIER_DOCUMENT_FOLDER)
          uploadedFields[`${key}Url`] = result.imageUrl
          uploadedFields[`${key}PublicId`] = result.imagePublicId
          if (upload.pendingDeleteId) deletions.push(upload.pendingDeleteId)
        } else if (upload.pendingDeleteId) {
          deletions.push(upload.pendingDeleteId)
        }
      }

      const finalForm = { ...supplierForm, ...uploadedFields }

      const input: SupplierInput = {
        name: finalForm.name,
        company: finalForm.company,
        phone: finalForm.phone,
        email: finalForm.email,
        location: finalForm.location,
        supplierType: finalForm.supplierType,
        country: finalForm.country,
        lcNumber: finalForm.lcNumber,
        lcStatus: finalForm.lcStatus,
        productCost: Number(finalForm.productCost),
        shippingCost: Number(finalForm.shippingCost),
        customsDuty: Number(finalForm.customsDuty),
        otherCost: Number(finalForm.otherCost),
        currency: finalForm.currency,
        notes: finalForm.notes,
        // A product typed but not yet added with the button still counts.
        suppliedProducts: [...finalForm.suppliedProducts, productDraft],
        openingDue: Number(finalForm.openingDue) || 0,
        bankAccountName: finalForm.bankAccountName,
        bankAccountNumber: finalForm.bankAccountNumber,
        bankName: finalForm.bankName,
        bankBranch: finalForm.bankBranch,
        bankRoutingNumber: finalForm.bankRoutingNumber,
        bankSwiftCode: finalForm.bankSwiftCode,
        mobileBankingNumber: finalForm.mobileBankingNumber,
        nid: finalForm.nid,
        tradeLicenseNo: finalForm.tradeLicenseNo,
        nomineeName: finalForm.nomineeName,
        nomineeNid: finalForm.nomineeNid,
        chequeNumber: finalForm.chequeNumber,
        supplierPhotoUrl: finalForm.supplierPhotoUrl,
        supplierPhotoPublicId: finalForm.supplierPhotoPublicId,
        bankDocumentUrl: finalForm.bankDocumentUrl,
        bankDocumentPublicId: finalForm.bankDocumentPublicId,
        nidCopyUrl: finalForm.nidCopyUrl,
        nidCopyPublicId: finalForm.nidCopyPublicId,
        tradeLicenseCopyUrl: finalForm.tradeLicenseCopyUrl,
        tradeLicenseCopyPublicId: finalForm.tradeLicenseCopyPublicId,
        passportPhotoUrl: finalForm.passportPhotoUrl,
        passportPhotoPublicId: finalForm.passportPhotoPublicId,
        signatureUrl: finalForm.signatureUrl,
        signaturePublicId: finalForm.signaturePublicId,
      }

      await saveSupplier(input, editingSupplier?.id)

      // A change waiting for approval still needs the files the supplier has now.
      if (!changesNeedApproval) {
        await Promise.all(deletions.map((publicId) => deleteCloudinaryImage(publicId).catch(() => undefined)))
      }

      onSaved(
        changesNeedApproval
          ? `${editingSupplier ? 'Supplier changes' : 'New supplier'} sent to an admin for approval.`
          : editingSupplier
            ? 'Supplier details updated.'
            : 'New supplier added.'
      )
      onOpenChange(false)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save supplier.')
    } finally {
      setIsSaving(false)
    }
  }

  // Returns undefined when the form is not ready to export.
  function prepareFormSignature(): string | null | undefined {
    setPdfError(null)

    if (!supplierForm.name.trim() || !supplierForm.phone.trim()) {
      setPdfError('Fill in the supplier name and phone number before generating the PDF or JPG.')
      return undefined
    }

    const drawnSignature =
      signaturePadRef.current && !signaturePadRef.current.isEmpty() ? signaturePadRef.current.toDataUrl() : null
    return drawnSignature ?? (documentUploads.signature.preview || supplierForm.signatureUrl || null)
  }

  async function exportForm(html: string, format: 'pdf' | 'jpg') {
    const setBusy = format === 'pdf' ? setIsExportingPdf : setIsExportingImage
    setBusy(true)
    try {
      return await exportSupplierForm(html, supplierForm.name, format)
    } finally {
      setBusy(false)
    }
  }

  async function handleExportForm(format: 'pdf' | 'jpg') {
    const signatureDataUrl = prepareFormSignature()
    if (signatureDataUrl === undefined) return

    setPdfError(await exportForm(buildSupplierFormHtml(supplierForm, documentUploads, signatureDataUrl, companyName), format))
  }

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Edit supplier' : 'Add new supplier'}</DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Update supplier/importer details, LC tracking, and cost estimates.'
                : 'Supplier details, bank details and documents, and trade type — LC tracking and cost estimates are optional and can be refined later.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Supplier name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Shenzhen Auto Parts Co." required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Phone number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 01711-000000" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Owner / company <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.company} onChange={(event) => setSupplierForm((current) => ({ ...current, company: event.target.value }))} placeholder="Owner or trade name, if different" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    NID No <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.nid} onChange={(event) => setSupplierForm((current) => ({ ...current, nid: event.target.value }))} placeholder="e.g. 1234567890" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Trade License No <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.tradeLicenseNo} onChange={(event) => setSupplierForm((current) => ({ ...current, tradeLicenseNo: event.target.value }))} placeholder="e.g. TRAD/12345/2025" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Nominee name <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.nomineeName} onChange={(event) => setSupplierForm((current) => ({ ...current, nomineeName: event.target.value }))} placeholder="e.g. Md. Karim Uddin" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Nominee NID <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.nomineeNid} onChange={(event) => setSupplierForm((current) => ({ ...current, nomineeNid: event.target.value }))} placeholder="Nominee national ID" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Email <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Location <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.location} onChange={(event) => setSupplierForm((current) => ({ ...current, location: event.target.value }))} placeholder="City / address" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Country</p>
                  <Input
                    list="supplier-country-options"
                    value={supplierForm.country}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, country: event.target.value }))}
                    placeholder="Bangladesh"
                  />
                  <datalist id="supplier-country-options">
                    {countryOptions.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank details &amp; documents</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Where payments to this supplier are sent (foreign suppliers also need a SWIFT code). Collect a signed bank cheque or bank
                  document, NID copy, trade license copy, 1 passport size photo, and a photo of the supplier.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Account name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.bankAccountName} onChange={(event) => setSupplierForm((current) => ({ ...current, bankAccountName: event.target.value }))} placeholder="Name on the bank account" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Account number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.bankAccountNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, bankAccountNumber: event.target.value }))} placeholder="e.g. 1234 5678 9012" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Bank name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.bankName} onChange={(event) => setSupplierForm((current) => ({ ...current, bankName: event.target.value }))} placeholder="e.g. Dutch-Bangla Bank" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Branch<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={supplierForm.bankBranch} onChange={(event) => setSupplierForm((current) => ({ ...current, bankBranch: event.target.value }))} placeholder="e.g. Motijheel" required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Routing number <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.bankRoutingNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, bankRoutingNumber: event.target.value }))} placeholder="9-digit routing number" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    SWIFT / BIC code <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.bankSwiftCode} onChange={(event) => setSupplierForm((current) => ({ ...current, bankSwiftCode: event.target.value }))} placeholder="e.g. DBBLBDDH" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    bKash / Nagad number <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.mobileBankingNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, mobileBankingNumber: event.target.value }))} placeholder="Mobile wallet number" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Cheque number <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input value={supplierForm.chequeNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, chequeNumber: event.target.value }))} placeholder="e.g. 0123456" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {renderDocumentUpload('supplierPhoto')}
                {renderDocumentUpload('bankDocument')}
                {renderDocumentUpload('nidCopy')}
                {renderDocumentUpload('tradeLicenseCopy')}
                {renderDocumentUpload('passportPhoto')}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Products supplied <span className="font-normal normal-case">(optional)</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Pick an existing product or type a new name, then press Add.</p>
              </div>
              <div className="flex gap-2">
                <Input
                  list="supplier-product-options"
                  value={productDraft}
                  onChange={(event) => setProductDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addSuppliedProduct()
                    }
                  }}
                  placeholder="e.g. 12V Car Battery"
                />
                <datalist id="supplier-product-options">
                  {productNameOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <Button type="button" variant="outline" className="rounded-xl" onClick={addSuppliedProduct} disabled={!productDraft.trim()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              {supplierForm.suppliedProducts.length ? (
                <div className="flex flex-wrap gap-2">
                  {supplierForm.suppliedProducts.map((name) => (
                    <Badge key={name} variant="outline" className="gap-1 rounded-full py-1 pl-2.5 pr-1 text-sm font-normal">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      {name}
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => removeSuppliedProduct(name)}
                        aria-label={`Remove ${name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trade type &amp; currency</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Supplier type</p>
                  <Select value={supplierForm.supplierType} onValueChange={(value) => setSupplierForm((current) => ({ ...current, supplierType: value as SupplierRecord['supplierType'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local supplier</SelectItem>
                      <SelectItem value="foreign">Foreign supplier</SelectItem>
                      <SelectItem value="importer">Importer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Billing currency</p>
                  <Select value={supplierForm.currency} onValueChange={(value) => setSupplierForm((current) => ({ ...current, currency: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">
                    Opening due <span className="font-normal text-muted-foreground">(what we already owe them)</span>
                  </p>
                  <Input type="number" min="0" value={supplierForm.openingDue} onChange={(event) => setSupplierForm((current) => ({ ...current, openingDue: event.target.value }))} placeholder="0" />
                </div>
              </div>

              {supplierForm.supplierType !== 'local' ? (
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Letter of Credit (LC) tracking
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">LC status</p>
                      <Select value={supplierForm.lcStatus} onValueChange={(value) => setSupplierForm((current) => ({ ...current, lcStatus: value as SupplierRecord['lcStatus'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-required">No LC</SelectItem>
                          <SelectItem value="pending">LC pending</SelectItem>
                          <SelectItem value="opened">LC opened</SelectItem>
                          <SelectItem value="released">Released</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        LC number <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <Input value={supplierForm.lcNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, lcNumber: event.target.value }))} placeholder="Bank LC reference" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <details className="group space-y-4 rounded-2xl border border-border/70 p-4">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                + Initial cost estimate <span className="font-normal normal-case">(optional — exact costs are recorded per purchase)</span>
              </summary>
              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Typical product cost</p>
                  <Input type="number" min="0" value={supplierForm.productCost} onChange={(event) => setSupplierForm((current) => ({ ...current, productCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Shipping cost</p>
                  <Input type="number" min="0" value={supplierForm.shippingCost} onChange={(event) => setSupplierForm((current) => ({ ...current, shippingCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Customs duty</p>
                  <Input type="number" min="0" value={supplierForm.customsDuty} onChange={(event) => setSupplierForm((current) => ({ ...current, customsDuty: event.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Other cost</p>
                  <Input type="number" min="0" value={supplierForm.otherCost} onChange={(event) => setSupplierForm((current) => ({ ...current, otherCost: event.target.value }))} placeholder="0" />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-border/70 bg-card p-4">
                  <p className="text-sm text-muted-foreground">Calculated landed cost</p>
                  <p className="mt-1 text-2xl font-semibold">{formatCurrency(previewLandedCost, supplierForm.currency || currency)}</p>
                </div>
              </div>
            </details>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} placeholder="LC, shipment, customs, or importer notes" rows={4} />
            </div>
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
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void handleExportForm('pdf')} disabled={isExportingPdf}>
                    <FileSignature className="mr-1.5 h-4 w-4" />
                    {isExportingPdf ? 'Preparing PDF...' : 'Download PDF'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void handleExportForm('jpg')} disabled={isExportingImage}>
                    <ImageDown className="mr-1.5 h-4 w-4" />
                    {isExportingImage ? 'Preparing JPG...' : 'Download JPG'}
                  </Button>
                </div>
              </div>
              {pdfError ? <p className="text-xs text-destructive">{pdfError}</p> : null}
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

              <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingSupplier ? 'Update supplier' : 'Save supplier'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  )
}

export function SupplierDetailsDialog({
  supplier,
  onOpenChange,
  onEdit,
}: {
  supplier: SupplierRecord | null
  onOpenChange: (open: boolean) => void
  onEdit: (supplier: SupplierRecord) => void
}) {
  const { data } = useERP()
  const companyName = data?.settings.companyName ?? 'Power International BD'
  const currency = data?.settings.currency
  const payables = useMemo(() => computeSupplierPayables(data), [data])
  const [detailsExportError, setDetailsExportError] = useState<string | null>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  async function handleExportSavedSupplier(supplier: SupplierRecord, format: 'pdf' | 'jpg') {
    setDetailsExportError(null)
    const setBusy = format === 'pdf' ? setIsExportingPdf : setIsExportingImage
    setBusy(true)
    try {
      const html = buildSupplierFormHtml(formFromSupplier(supplier), emptyDocumentUploads(), supplier.signatureUrl || null, companyName)
      setDetailsExportError(await exportSupplierForm(html, supplier.name, format))
    } finally {
      setBusy(false)
    }
  }

  if (!supplier) {
    return <Dialog open={false} onOpenChange={onOpenChange} />
  }

  const photo = supplier.supplierPhotoUrl || supplier.passportPhotoUrl
  const payable = payables[supplier.id]
  const field = ([label, value]: [string, string]) => (
    <div key={label}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-medium">{value || 'N/A'}</p>
    </div>
  )
  const fields: [string, string][] = [
    ['Owner / company', supplier.company],
    ['Mobile No', supplier.phone],
    ['Email', supplier.email],
    ['NID No', supplier.nid],
    ['Trade License No', supplier.tradeLicenseNo],
    ['Nominee name', supplier.nomineeName],
    ['Nominee NID', supplier.nomineeNid],
    ['Country', supplier.country],
  ]
  const bankFields: [string, string][] = [
    ['Account name', supplier.bankAccountName],
    ['Account number', supplier.bankAccountNumber],
    ['Bank name', supplier.bankName],
    ['Branch', supplier.bankBranch],
    ['Routing number', supplier.bankRoutingNumber],
    ['SWIFT / BIC', supplier.bankSwiftCode],
    ['Cheque number', supplier.chequeNumber],
    ['bKash / Nagad', supplier.mobileBankingNumber],
  ]
  const documents: [string, string][] = [
    ['Supplier photo', supplier.supplierPhotoUrl],
    ['Bank cheque / document', supplier.bankDocumentUrl],
    ['NID copy', supplier.nidCopyUrl],
    ['Trade license copy', supplier.tradeLicenseCopyUrl],
    ['Passport size photo', supplier.passportPhotoUrl],
    ['Signature', supplier.signatureUrl],
  ]

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
    <div className="space-y-5">
      <DialogHeader>
        <div className="flex items-center gap-4">
          {photo ? (
            <img src={photo} alt={supplier.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0 text-left">
            <DialogTitle className="truncate">{supplier.name}</DialogTitle>
            <DialogDescription>{supplierTypeLabels[supplier.supplierType]}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier details</p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {fields.map(field)}
          <div className="sm:col-span-2">{field(['Address', supplier.location])}</div>
          <div className="sm:col-span-2">{field(['Products supplied', supplier.suppliedProducts.join(', ')])}</div>
        </div>
      </div>

      {payable ? (
        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payable</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {field(['Opening due', formatCurrency(payable.openingDue, currency)])}
            {field(['Purchases', formatCurrency(payable.purchaseTotal, currency)])}
            {field(['Paid (approved)', formatCurrency(payable.paid, currency)])}
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{payable.payable < 0 ? 'Advance' : 'Due'}</p>
              <p className={cn('mt-0.5 font-semibold', payable.payable > 0 && 'text-rose-600 dark:text-rose-400')}>
                {formatCurrency(Math.abs(payable.payable), currency)}
              </p>
            </div>
          </div>
          {payable.pendingPayment > 0 ? (
            <p className="text-xs text-muted-foreground">{formatCurrency(payable.pendingPayment, currency)} in payments awaiting approval.</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank details</p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">{bankFields.map(field)}</div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {documents.map(([label, url]) => (
            <div key={label} className="space-y-1.5">
              <p className="text-xs font-medium">{label}</p>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  <img src={url} alt={label} className="h-28 w-full rounded-xl border border-border/70 bg-muted/30 object-contain transition hover:opacity-80" />
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

      {detailsExportError ? <p className="text-xs text-destructive">{detailsExportError}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => void handleExportSavedSupplier(supplier, 'pdf')} disabled={isExportingPdf}>
          <FileSignature className="mr-1.5 h-4 w-4" />
          {isExportingPdf ? 'Preparing PDF...' : 'Download PDF'}
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={() => void handleExportSavedSupplier(supplier, 'jpg')} disabled={isExportingImage}>
          <ImageDown className="mr-1.5 h-4 w-4" />
          {isExportingImage ? 'Preparing JPG...' : 'Download JPG'}
        </Button>
        <Button className="rounded-xl" onClick={() => onEdit(supplier)}>
          <Edit className="mr-1.5 h-4 w-4" />
          Edit
        </Button>
      </div>
    </div>
      </DialogContent>
    </Dialog>
  )
}
