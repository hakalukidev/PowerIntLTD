"use client"

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Edit, MapPin, MessageCircle, Phone, Plus, Search, Store, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
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
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import type { LeadBusinessType, LeadInput, LeadPotential, LeadRecord } from '@/lib/erp/types'
import { exportPdf, exportXlsx, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const LEAD_PHOTO_FOLDER = 'leads'

type PhotoKey = 'bannerPhoto' | 'visitingCard'

type PhotoUpload = {
  file: File | null
  preview: string | null
  /** The previously saved image to remove from Cloudinary once the lead is saved. */
  pendingDeleteId: string | null
}

type LeadFormState = {
  shopName: string
  ownerName: string
  businessType: LeadBusinessType
  address: string
  phone: string
  whatsapp: string
  bannerPhotoUrl: string
  bannerPhotoPublicId: string
  visitingCardUrl: string
  visitingCardPublicId: string
  reputation: string
  potential: LeadPotential
  notes: string
  zoneId: string
}

function emptyLeadForm(): LeadFormState {
  return {
    shopName: '',
    ownerName: '',
    businessType: 'retailer',
    address: '',
    phone: '',
    whatsapp: '',
    bannerPhotoUrl: '',
    bannerPhotoPublicId: '',
    visitingCardUrl: '',
    visitingCardPublicId: '',
    reputation: '',
    potential: 'medium',
    notes: '',
    zoneId: '',
  }
}

function formFromLead(lead: LeadRecord): LeadFormState {
  return {
    shopName: lead.shopName,
    ownerName: lead.ownerName,
    businessType: lead.businessType,
    address: lead.address,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    bannerPhotoUrl: lead.bannerPhotoUrl,
    bannerPhotoPublicId: lead.bannerPhotoPublicId,
    visitingCardUrl: lead.visitingCardUrl,
    visitingCardPublicId: lead.visitingCardPublicId,
    reputation: lead.reputation,
    potential: lead.potential,
    notes: lead.notes,
    zoneId: lead.zoneId ?? '',
  }
}

function emptyPhotoUploads(): Record<PhotoKey, PhotoUpload> {
  return {
    bannerPhoto: { file: null, preview: null, pendingDeleteId: null },
    visitingCard: { file: null, preview: null, pendingDeleteId: null },
  }
}

const businessTypeLabels: Record<LeadBusinessType, string> = {
  retailer: 'Retailer',
  wholesaler: 'Wholesaler',
  distributor: 'Distributor',
  other: 'Other',
}

const potentialLabels: Record<LeadPotential, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const photoLabels: Record<PhotoKey, string> = {
  bannerPhoto: 'Shop banner photo',
  visitingCard: 'Visiting card photo',
}

function potentialToneClass(potential: LeadPotential) {
  if (potential === 'high') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }
  if (potential === 'medium') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }
  return 'border-slate-200 bg-slate-500/10 text-slate-700 dark:border-slate-800 dark:text-slate-300'
}

export default function LeadsPage() {
  const { data, saveLead, deleteLead, hasPermission } = useERP()
  const leads = useMemo(() => toArray(data?.leads), [data?.leads])
  const { zones, zoneOptions } = useZoneAccess()
  const canEdit = hasPermission('leads.edit')
  const canDelete = hasPermission('leads.delete')

  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | LeadBusinessType>('all')
  const [filterPotential, setFilterPotential] = useState<'all' | LeadPotential>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null)
  const [viewingLead, setViewingLead] = useState<LeadRecord | null>(null)
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm())
  const [photoUploads, setPhotoUploads] = useState<Record<PhotoKey, PhotoUpload>>(emptyPhotoUploads())
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const zoneName = (zoneId?: string) => zones.find((zone) => zone.id === zoneId)?.name ?? '-'

  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return [...leads]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .filter((lead) => {
        const matchesQuery =
          !normalizedQuery ||
          [lead.shopName, lead.ownerName, lead.address, lead.phone, lead.whatsapp, lead.createdByName]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        const matchesType = filterType === 'all' || lead.businessType === filterType
        const matchesPotential = filterPotential === 'all' || lead.potential === filterPotential

        return matchesQuery && matchesType && matchesPotential
      })
  }, [leads, query, filterType, filterPotential])

  const metrics = useMemo(
    () => ({
      total: leads.length,
      high: leads.filter((lead) => lead.potential === 'high').length,
      medium: leads.filter((lead) => lead.potential === 'medium').length,
      low: leads.filter((lead) => lead.potential === 'low').length,
    }),
    [leads]
  )

  function updateForm<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openCreateDialog() {
    setEditingLead(null)
    setForm({ ...emptyLeadForm(), zoneId: zoneOptions.length === 1 ? zoneOptions[0].id : '' })
    setPhotoUploads(emptyPhotoUploads())
    setFeedback(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(lead: LeadRecord) {
    setEditingLead(lead)
    setForm(formFromLead(lead))
    setPhotoUploads(emptyPhotoUploads())
    setFeedback(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function handlePhotoChange(key: PhotoKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return

    setPhotoUploads((current) => ({
      ...current,
      [key]: {
        file,
        preview: URL.createObjectURL(file),
        pendingDeleteId: current[key].pendingDeleteId || form[`${key}PublicId`] || null,
      },
    }))
  }

  function handleRemovePhoto(key: PhotoKey) {
    setPhotoUploads((current) => ({
      ...current,
      [key]: { file: null, preview: null, pendingDeleteId: current[key].pendingDeleteId || form[`${key}PublicId`] || null },
    }))
    setForm((current) => ({ ...current, [`${key}Url`]: '', [`${key}PublicId`]: '' }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setFormError(null)
    setIsSaving(true)

    try {
      const finalForm = { ...form }
      const deletions: string[] = []

      for (const key of Object.keys(photoUploads) as PhotoKey[]) {
        const upload = photoUploads[key]
        if (upload.file) {
          const result = await uploadImageToCloudinary(upload.file, LEAD_PHOTO_FOLDER)
          finalForm[`${key}Url`] = result.imageUrl
          finalForm[`${key}PublicId`] = result.imagePublicId
        }
        if (upload.pendingDeleteId) deletions.push(upload.pendingDeleteId)
      }

      const input: LeadInput = {
        shopName: finalForm.shopName,
        ownerName: finalForm.ownerName,
        businessType: finalForm.businessType,
        address: finalForm.address,
        phone: finalForm.phone,
        whatsapp: finalForm.whatsapp,
        bannerPhotoUrl: finalForm.bannerPhotoUrl,
        bannerPhotoPublicId: finalForm.bannerPhotoPublicId,
        visitingCardUrl: finalForm.visitingCardUrl,
        visitingCardPublicId: finalForm.visitingCardPublicId,
        reputation: finalForm.reputation,
        potential: finalForm.potential,
        notes: finalForm.notes,
        zoneId: finalForm.zoneId,
      }

      await saveLead(input, editingLead?.id)
      await Promise.all(deletions.map((publicId) => deleteCloudinaryImage(publicId).catch(() => undefined)))

      setDialogOpen(false)
      setFeedback(editingLead ? 'Lead updated.' : 'New lead added.')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save lead.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(lead: LeadRecord) {
    setFeedback(null)

    try {
      await deleteLead(lead.id)
      const photoIds = [lead.bannerPhotoPublicId, lead.visitingCardPublicId].filter(Boolean)
      await Promise.all(photoIds.map((publicId) => deleteCloudinaryImage(publicId).catch(() => undefined)))
      setFeedback(`${lead.shopName} removed from leads.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete lead.')
    }
  }

  function exportRows() {
    return filteredLeads.map((lead) => [
      lead.shopName,
      lead.ownerName,
      businessTypeLabels[lead.businessType],
      lead.address,
      lead.phone,
      lead.whatsapp || '-',
      lead.reputation || '-',
      potentialLabels[lead.potential],
      lead.notes || '-',
      lead.createdByName || '-',
      formatDate(lead.createdAt),
    ])
  }

  const exportHeaders = ['Shop', 'Owner', 'Business type', 'Address', 'Phone', 'WhatsApp', 'Reputation', 'Potential', 'Notes', 'Visited by', 'Date']

  function renderPhotoField(key: PhotoKey) {
    const previewSrc = photoUploads[key].preview ?? form[`${key}Url`]

    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{photoLabels[key]}</p>
        {previewSrc ? (
          <div className="flex items-center gap-3">
            <img src={previewSrc} alt={photoLabels[key]} className="h-20 w-28 rounded-xl border border-border/70 object-cover" />
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => handleRemovePhoto(key)}>
              Remove
            </Button>
          </div>
        ) : null}
        <Input type="file" accept="image/*" capture="environment" onChange={(event) => handlePhotoChange(key, event)} />
      </div>
    )
  }

  return (
    <AdminShell active="Leads">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[
            ['Total leads', metrics.total.toLocaleString('en-BD'), 'Shops and areas visited'],
            ['High potential', metrics.high.toLocaleString('en-BD'), 'Most likely to work with us'],
            ['Medium potential', metrics.medium.toLocaleString('en-BD'), 'Worth a follow-up'],
            ['Low potential', metrics.low.toLocaleString('en-BD'), 'Unlikely for now'],
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
              <CardTitle>Leads</CardTitle>
              <CardDescription>Shops and areas officers visited: the pipeline for finding future customers.</CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(200px,1fr)_auto_auto_auto_auto]">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search shop, owner, phone"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as typeof filterType)}>
                <SelectTrigger className="h-10 w-full rounded-xl sm:w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(Object.keys(businessTypeLabels) as LeadBusinessType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {businessTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="rounded-xl" onClick={() => void exportXlsx('leads.xlsx', 'Leads', exportHeaders, exportRows())}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => void exportPdf('leads.pdf', 'Leads', exportHeaders, exportRows())}>
                Export PDF
              </Button>
              {canEdit ? (
                <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Add lead
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant={filterPotential === 'all' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setFilterPotential('all')}
              >
                All potential
              </Button>
              {(Object.keys(potentialLabels) as LeadPotential[]).map((potential) => (
                <Button
                  key={potential}
                  variant={filterPotential === potential ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFilterPotential(potential)}
                >
                  {potentialLabels[potential]} potential
                </Button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Shop</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Potential</TableHead>
                    <TableHead>Visited by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id} className="cursor-pointer" onClick={() => setViewingLead(lead)}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          {lead.bannerPhotoUrl ? (
                            <img src={lead.bannerPhotoUrl} alt={lead.shopName} className="h-10 w-14 rounded-lg border border-border/70 object-cover" />
                          ) : (
                            <div className="flex h-10 w-14 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30">
                              <Store className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{lead.shopName}</p>
                            <p className="text-xs text-muted-foreground">{lead.ownerName || '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{businessTypeLabels[lead.businessType]}</TableCell>
                      <TableCell className="min-w-40">
                        <p>{lead.phone}</p>
                        {lead.whatsapp ? <p className="text-xs text-muted-foreground">WhatsApp: {lead.whatsapp}</p> : null}
                      </TableCell>
                      <TableCell>{zoneName(lead.zoneId)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-medium', potentialToneClass(lead.potential))}>
                          {potentialLabels[lead.potential]}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-36">
                        <p>{lead.createdByName || '-'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</p>
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {canEdit ? (
                            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(lead)} aria-label="Edit lead">
                              <Edit className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(lead)}
                              aria-label="Delete lead"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                        {leads.length === 0 ? 'No leads yet. Add one after visiting a shop.' : 'No leads match the current filter.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !isSaving && setDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLead ? 'Edit lead' : 'Add lead'}</DialogTitle>
            <DialogDescription>Fill this in when you visit a shop or area.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {formError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
                {formError}
              </p>
            ) : null}
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shop</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Shop name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input value={form.shopName} onChange={(event) => updateForm('shopName', event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Owner name</p>
                  <Input value={form.ownerName} onChange={(event) => updateForm('ownerName', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Business type</p>
                  <Select value={form.businessType} onValueChange={(value) => updateForm('businessType', value as LeadBusinessType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(businessTypeLabels) as LeadBusinessType[]).map((type) => (
                        <SelectItem key={type} value={type}>
                          {businessTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Zone</p>
                  <Select value={form.zoneId || undefined} onValueChange={(value) => updateForm('zoneId', value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {zoneOptions.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium text-foreground">Address</p>
                  <Input value={form.address} onChange={(event) => updateForm('address', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Phone number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input type="tel" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">WhatsApp number (optional)</p>
                  <Input type="tel" value={form.whatsapp} onChange={(event) => updateForm('whatsapp', event.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {renderPhotoField('bannerPhoto')}
                {renderPhotoField('visitingCard')}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assessment</p>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Shop reputation</p>
                <Input
                  value={form.reputation}
                  onChange={(event) => updateForm('reputation', event.target.value)}
                  placeholder="e.g. Well known in the market, pays on time"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Chance of working with us</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(potentialLabels) as LeadPotential[]).map((potential) => (
                    <Button
                      key={potential}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn('rounded-full', form.potential === potential && potentialToneClass(potential))}
                      onClick={() => updateForm('potential', potential)}
                    >
                      {potentialLabels[potential]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Notes</p>
                <Textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" disabled={isSaving} onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingLead ? 'Update lead' : 'Save lead'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingLead)} onOpenChange={(open) => !open && setViewingLead(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {viewingLead ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewingLead.shopName}</DialogTitle>
                <DialogDescription>
                  {businessTypeLabels[viewingLead.businessType]} · visited by {viewingLead.createdByName || '-'} on{' '}
                  {formatDate(viewingLead.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Owner: </span>
                    {viewingLead.ownerName || '-'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Zone: </span>
                    {zoneName(viewingLead.zoneId)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${viewingLead.phone}`} className="hover:underline">
                      {viewingLead.phone}
                    </a>
                  </p>
                  <p className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    {viewingLead.whatsapp ? (
                      <a
                        href={`https://wa.me/${viewingLead.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {viewingLead.whatsapp}
                      </a>
                    ) : (
                      '-'
                    )}
                  </p>
                  <p className="flex items-center gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {viewingLead.address || '-'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Reputation: </span>
                    {viewingLead.reputation || '-'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Potential: </span>
                    <span className={cn('inline-flex rounded-full border px-3 py-0.5 text-xs font-medium', potentialToneClass(viewingLead.potential))}>
                      {potentialLabels[viewingLead.potential]}
                    </span>
                  </p>
                </div>
                {viewingLead.notes ? <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3">{viewingLead.notes}</p> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ['bannerPhoto', viewingLead.bannerPhotoUrl],
                      ['visitingCard', viewingLead.visitingCardUrl],
                    ] as const
                  ).map(([key, url]) => (
                    <div key={key} className="space-y-2">
                      <p className="text-muted-foreground">{photoLabels[key]}</p>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={photoLabels[key]} className="w-full rounded-xl border border-border/70 object-cover" />
                        </a>
                      ) : (
                        <p>-</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
