"use client"

import { useEffect, useState, type FormEvent } from 'react'
import { BellRing, FileImage, MessageSquareText, Send, Share2 } from 'lucide-react'

import { NotifyButtons } from '@/components/admin/approvals/shared'
import { ledgerFileSlug } from '@/components/admin/credit-sheet/ledgerDocument'
import { documentJpgFile } from '@/components/admin/credit-sheet/printSheet'
import { usePartyStatement } from '@/components/admin/portal/usePartyStatement'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { uploadImageToCloudinary } from '@/lib/cloudinary'
import { balanceSide } from '@/lib/erp/ledger'
import { PORTAL_DELIVERY_LABELS } from '@/lib/erp/portal'
import { useERP } from '@/lib/erp/provider'
import type { PortalMessageRecord, PortalNoticeInput, PortalPartyKind } from '@/lib/erp/types'
import { formatCurrency } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type NoticeKind = PortalNoticeInput['kind']

const KINDS: Array<{ value: NoticeKind; label: string; description: string; icon: typeof BellRing }> = [
  { value: 'payment_reminder', label: 'Payment reminder', description: 'Their balance today, asking them to pay.', icon: BellRing },
  { value: 'statement', label: 'Statement (JPG)', description: 'An image of their full sheet with the balance.', icon: FileImage },
  { value: 'notice', label: 'Message', description: 'Anything else you want to tell them.', icon: MessageSquareText },
]

/**
 * Sends a dealer or supplier a payment reminder, their statement as a JPG, or a message. It
 * lands in their portal inbox and goes to their WhatsApp; when WhatsApp is not set up on the
 * server, the office gets a WhatsApp button to send it by hand.
 */
export function PartyNotifyDialog({
  open,
  onOpenChange,
  partyKind,
  partyId,
  initialKind = 'payment_reminder',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  partyKind: PortalPartyKind
  partyId: string
  initialKind?: NoticeKind
}) {
  const { data, authorizedFetch } = useERP()
  const buildStatement = usePartyStatement()
  const [kind, setKind] = useState<NoticeKind>(initialKind)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ message: PortalMessageRecord; file: File | null } | null>(null)

  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setNote('')
      setError(null)
      setSent(null)
    }
  }, [initialKind, open])

  const statement = open ? buildStatement(partyKind, partyId) : null
  const currency = data?.settings.currency

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!statement) return
    setError(null)
    setSending(true)

    try {
      let imageUrl: string | undefined
      let file: File | null = null
      if (kind === 'statement') {
        file = await documentJpgFile(statement.html, `statement-${ledgerFileSlug(statement.name)}.jpg`)
        imageUrl = (await uploadImageToCloudinary(file, 'statements')).imageUrl
      }

      const input: PortalNoticeInput = { partyKind, partyId, kind, message: note.trim() || undefined, imageUrl }
      const result = await authorizedFetch<{ message: PortalMessageRecord }>('/api/admin/portal/notify', { method: 'POST', body: input })
      setSent({ message: result.message, file })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send.')
    } finally {
      setSending(false)
    }
  }

  async function shareImage(file: File, text: string) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
        return
      }
    } catch {
      // Cancelled by the user, or sharing is not allowed here: fall back to saving the file.
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file)
    link.download = file.name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const manualText = sent ? `${sent.message.title}\n${sent.message.body}${sent.message.imageUrl ? `\n${sent.message.imageUrl}` : ''}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Notify {statement?.name ?? (partyKind === 'customer' ? 'dealer' : 'supplier')}</DialogTitle>
          <DialogDescription>
            Goes to their portal inbox and their WhatsApp{statement?.phone ? ` (${statement.phone})` : ''}.
            {statement ? ` Balance today: ${formatCurrency(Math.abs(statement.totals.balance), currency)} ${balanceSide(statement.totals.balance)}.` : ''}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4">
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                sent.message.whatsapp === 'sent' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
              )}
            >
              <p className="font-medium">Saved to their portal inbox. {PORTAL_DELIVERY_LABELS[sent.message.whatsapp]}.</p>
              {sent.message.whatsappError ? <p className="mt-1 text-xs text-muted-foreground">{sent.message.whatsappError}</p> : null}
            </div>
            <p className="whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm">{sent.message.body}</p>
            {sent.message.whatsapp !== 'sent' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Send it on WhatsApp yourself:</p>
                <NotifyButtons phone={statement?.phone} message={manualText} />
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {sent.file ? (
                <Button type="button" variant="outline" onClick={() => void shareImage(sent.file!, manualText)}>
                  <Share2 className="h-4 w-4" />
                  Share / save JPG
                </Button>
              ) : null}
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              {KINDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    kind === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                  )}
                  aria-pressed={kind === option.value}
                >
                  <option.icon className={cn('mt-0.5 h-4 w-4 shrink-0', kind === option.value ? 'text-primary' : 'text-muted-foreground')} />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {kind === 'notice' ? 'Message' : 'Note'}
                {kind === 'notice' ? <span className="ml-0.5 text-rose-500">*</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
              </p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={kind === 'payment_reminder' ? 'e.g. Please pay by 15 October.' : kind === 'statement' ? 'e.g. Please check and confirm.' : 'Write your message'}
                required={kind === 'notice'}
              />
            </div>

            {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending || !statement}>
                <Send className="h-4 w-4" />
                {sending ? (kind === 'statement' ? 'Preparing statement...' : 'Sending...') : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
