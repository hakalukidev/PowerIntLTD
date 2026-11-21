"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ExternalLink, FileText, Plus, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, documentFileProblem, uploadDocumentToCloudinary, type UploadProgress } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { ERPData, SupplierDocumentCategory, SupplierDocumentRecord, SupplierRecord } from '@/lib/erp/types'
import { formatDate, toArray } from '@/lib/erp/utils'

const SUPPLIER_LIBRARY_FOLDER = 'suppliers/documents'

export const supplierDocumentCategoryLabels: Record<SupplierDocumentCategory, string> = {
  agreement: 'Agreement / contract',
  lc: 'LC document',
  invoice: 'Invoice / bill',
  shipping: 'Shipping / B/L',
  customs: 'Customs / duty',
  license: 'License / certificate',
  other: 'Other',
}

/** The profile photos and copies stored on the supplier record itself. */
const PROFILE_DOCUMENT_FIELDS = [
  'supplierPhotoUrl',
  'bankDocumentUrl',
  'nidCopyUrl',
  'tradeLicenseCopyUrl',
  'passportPhotoUrl',
  'signatureUrl',
] as const satisfies ReadonlyArray<keyof SupplierRecord>

/** Per supplier: every document on file, profile copies plus the document library. */
export function computeSupplierDocumentCounts(data: ERPData | null) {
  const counts: Record<string, number> = {}
  toArray(data?.suppliers).forEach((supplier) => {
    counts[supplier.id] = PROFILE_DOCUMENT_FIELDS.filter((field) => supplier[field]).length
  })
  toArray(data?.supplierDocuments).forEach((item) => {
    counts[item.supplierId] = (counts[item.supplierId] ?? 0) + 1
  })
  return counts
}

function isPdf(item: Pick<SupplierDocumentRecord, 'url' | 'fileName'>) {
  return /\.pdf($|\?)/i.test(item.url) || /\.pdf$/i.test(item.fileName)
}

function SupplierDocumentUploadDialog({ supplierId, onOpenChange }: { supplierId: string; onOpenChange: (open: boolean) => void }) {
  const { saveSupplierDocument } = useERP()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SupplierDocumentCategory>('agreement')
  const [documentDate, setDocumentDate] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = progress !== null

  function handleFile(next: File | null) {
    setError(next ? documentFileProblem(next) : null)
    setFile(next)
    // The file name is a good starting point for the document name.
    if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/, ''))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!file) {
      setError('Choose a photo or PDF to upload.')
      return
    }
    if (!title.trim()) {
      setError('Enter the document name.')
      return
    }

    try {
      const uploaded = await uploadDocumentToCloudinary(file, SUPPLIER_LIBRARY_FOLDER, setProgress)
      await saveSupplierDocument({
        supplierId,
        title,
        category,
        url: uploaded.imageUrl,
        publicId: uploaded.imagePublicId,
        fileName: file.name,
        documentDate,
        note,
      })
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to upload the document.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (busy ? null : onOpenChange(open))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add supplier document</DialogTitle>
          <DialogDescription>
            Upload a photo or PDF (up to {DOCUMENT_MAX_BYTES / 1024 / 1024} MB): agreement, LC copy, invoice, shipping papers, customs, or any other file.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              File<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input type="file" accept={DOCUMENT_ACCEPT} onChange={(event) => handleFile(event.target.files?.[0] ?? null)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Document name<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Supply agreement 2026" disabled={busy} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Type</p>
              <Select value={category} onValueChange={(value) => setCategory(value as SupplierDocumentCategory)} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(supplierDocumentCategoryLabels) as SupplierDocumentCategory[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {supplierDocumentCategoryLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Document date <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <DateInput value={documentDate} onChange={setDocumentDate} disabled={busy} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Reference number, validity, remarks" disabled={busy} />
          </div>
          {progress ? (
            <p className="text-xs text-muted-foreground">
              {progress.stage === 'compressing' ? 'Preparing file...' : `Uploading... ${progress.percent}%`}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={busy}>
              {busy ? 'Uploading...' : 'Save document'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A supplier's document library on the supplier details dialog: add, search, open, and delete files. */
export function SupplierDocumentLibrary({ supplierId }: { supplierId: string }) {
  const { data, deleteSupplierDocument, hasPermission } = useERP()
  const canAdd = hasPermission('suppliers.edit') || hasPermission('suppliers.create')
  const canDelete = hasPermission('suppliers.delete')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<SupplierDocumentCategory | 'all'>('all')
  const [uploadKey, setUploadKey] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const documents = useMemo(
    () =>
      toArray(data?.supplierDocuments)
        .filter((item) => item.supplierId === supplierId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.supplierDocuments, supplierId]
  )
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return documents.filter(
      (item) =>
        (categoryFilter === 'all' || item.category === categoryFilter) &&
        (!normalized || [item.title, item.note, item.fileName].join(' ').toLowerCase().includes(normalized))
    )
  }, [categoryFilter, documents, query])

  async function handleDelete(item: SupplierDocumentRecord) {
    if (!window.confirm(`Delete "${item.title}"? The file will be removed permanently.`)) return
    setError(null)
    setDeletingId(item.id)
    try {
      await deleteSupplierDocument(item.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the document.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Document library ({documents.length})</p>
        {canAdd ? (
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setUploadKey(Date.now())}>
            <Plus className="mr-1 h-4 w-4" />
            Add document
          </Button>
        ) : null}
      </div>

      {documents.length > 3 ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search documents" />
          </div>
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as typeof categoryFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(supplierDocumentCategoryLabels) as SupplierDocumentCategory[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {supplierDocumentCategoryLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {visible.length ? (
        <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
          {visible.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Open ${item.title}`}>
                {isPdf(item) ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                    <FileText className="h-5 w-5 text-rose-600" />
                  </div>
                ) : (
                  <img src={item.url} alt={item.title} className="h-12 w-12 rounded-lg border border-border/70 object-cover" />
                )}
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="rounded-full text-[11px]">
                    {supplierDocumentCategoryLabels[item.category] ?? 'Other'}
                  </Badge>
                  {item.documentDate ? <span>Dated {formatDate(item.documentDate)}</span> : null}
                  <span>
                    Added {formatDate(item.createdAt)} by {item.createdByName}
                  </span>
                </div>
                {item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {documents.length ? 'No documents match the search.' : 'No other documents yet. Add agreements, LC copies, invoices, or any supplier file.'}
        </p>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {uploadKey !== null ? <SupplierDocumentUploadDialog key={uploadKey} supplierId={supplierId} onOpenChange={(open) => (open ? null : setUploadKey(null))} /> : null}
    </div>
  )
}
