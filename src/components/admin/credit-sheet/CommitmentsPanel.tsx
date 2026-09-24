"use client"

import { useEffect, useState } from 'react'
import { Check, ImagePlus, Plus, RotateCcw, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteCloudinaryImage, uploadImageToCloudinary } from '@/lib/cloudinary'
import { useERP } from '@/lib/erp/provider'
import type { CustomerCommitment, CustomerRecord } from '@/lib/erp/types'
import { formatDate } from '@/lib/erp/utils'

const COMMITMENT_IMAGE_FOLDER = 'commitments'

export function sortedCommitments(customer: CustomerRecord): CustomerCommitment[] {
  return Object.values(customer.commitments ?? {}).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'pending' ? -1 : 1
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export function CommitmentsPanel({ customer, canEdit }: { customer: CustomerRecord; canEdit: boolean }) {
  const { saveCustomerCommitment, deleteCustomerCommitment } = useERP()
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  const commitments = sortedCommitments(customer)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update commitment.')
    } finally {
      setBusy(false)
    }
  }

  function handleAdd() {
    void run(async () => {
      const uploaded = imageFile ? await uploadImageToCloudinary(imageFile, COMMITMENT_IMAGE_FOLDER) : null
      await saveCustomerCommitment(customer.id, {
        note,
        dueDate,
        imageUrl: uploaded?.imageUrl,
        imagePublicId: uploaded?.imagePublicId,
      })
      setNote('')
      setDueDate('')
      setImageFile(null)
    })
  }

  function handleDelete(commitment: CustomerCommitment) {
    void run(async () => {
      await deleteCustomerCommitment(customer.id, commitment.id)
      // The record is gone either way; a leftover image is only storage clutter.
      if (commitment.imagePublicId) await deleteCloudinaryImage(commitment.imagePublicId).catch(() => undefined)
    })
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}

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
                {commitment.imageUrl ? (
                  <button type="button" onClick={() => setViewing(commitment.imageUrl ?? null)} className="shrink-0" aria-label="View image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={commitment.imageUrl} alt="" className="h-16 w-16 rounded-lg border border-border/70 object-cover" />
                  </button>
                ) : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className={`whitespace-pre-wrap break-words text-sm ${fulfilled ? 'text-muted-foreground line-through' : ''}`}>
                    {commitment.note}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold ${
                        fulfilled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : overdue
                            ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {fulfilled ? 'Fulfilled' : overdue ? 'Overdue' : 'Pending'}
                    </span>
                    {commitment.dueDate ? <span>Due {formatDate(commitment.dueDate)}</span> : null}
                    <span>
                      · Added {formatDate(commitment.createdAt)}
                      {commitment.createdBy ? ` by ${commitment.createdBy}` : ''}
                    </span>
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
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
                      disabled={busy}
                      onClick={() => handleDelete(commitment)}
                      aria-label="Delete note"
                      title="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No commitment notes yet.</p>
      )}

      {canEdit ? (
        <div className="space-y-3 rounded-xl bg-muted/30 p-3">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Will clear 50,000 BDT by the 10th; cheque photo attached"
            rows={2}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Commitment date (optional)</p>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-9 w-44" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Image (optional)</p>
                {imagePreview ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="" className="h-9 w-9 rounded-md border border-border/70 object-cover" />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setImageFile(null)} aria-label="Remove image">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted">
                    <ImagePlus className="h-4 w-4" />
                    Attach image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>
            </div>
            <Button type="button" size="sm" className="rounded-lg" disabled={busy || !note.trim()} onClick={handleAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              {busy ? 'Saving...' : 'Add note'}
            </Button>
          </div>
        </div>
      ) : null}

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewing(null)} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="Commitment attachment" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </div>
  )
}
