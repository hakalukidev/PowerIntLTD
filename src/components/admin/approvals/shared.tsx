"use client"

import { MessageCircle, MessageSquareText, PencilLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { DepositStatus, SubmissionEdit } from '@/lib/erp/types'
import { formatDateTime, smsLink, whatsappLink } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export const STATUS_STYLES: Record<DepositStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

export function StatusPill({ status }: { status: DepositStatus }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[status])}>{status}</span>
}

export function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` of a stored ISO date in local time, for comparing with a date input. */
export function localDay(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function SubmittedBy({ name, role, at }: { name: string; role?: string; at: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Submitted by <span className="font-medium text-foreground">{name}</span>
      {role ? ` (${role})` : ''} · {formatDateTime(at)}
    </p>
  )
}

/** Every admin edit, with the old and new value of each changed field. */
export function EditHistory({ edits }: { edits?: SubmissionEdit[] }) {
  if (!edits?.length) return null
  return (
    <div className="space-y-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs text-sky-800 dark:text-sky-300">
      {edits.map((edit, index) => (
        <div key={`${edit.at}-${index}`}>
          <p className="flex items-center gap-1.5 font-medium">
            <PencilLine className="h-3.5 w-3.5" />
            Edited by {edit.byName}
            {edit.byRole ? ` (${edit.byRole})` : ''} · {formatDateTime(edit.at)}
          </p>
          <ul className="ml-5 list-disc">
            {edit.changes.map((change, changeIndex) => (
              <li key={changeIndex}>
                {change.field}: <span className="line-through opacity-70">{change.from || '—'}</span> → {change.to || '—'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** WhatsApp and SMS buttons that open the message ready to send to the customer or supplier. */
export function NotifyButtons({ phone, message }: { phone?: string; message: string }) {
  const whatsapp = whatsappLink(phone, message)
  const sms = smsLink(phone, message)
  if (!whatsapp) return <p className="text-xs text-muted-foreground">No phone number on file to notify.</p>
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href={whatsapp} target="_blank" rel="noreferrer">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      </Button>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href={sms}>
          <MessageSquareText className="h-4 w-4" />
          SMS
        </a>
      </Button>
    </div>
  )
}

export function SummaryRow({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: 'danger' }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'border-t border-border pt-1.5 font-semibold')}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right tabular-nums', tone === 'danger' && 'text-rose-600')}>{value}</dd>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{text}</p>
}

export type Feedback = { tone: 'success' | 'error'; text: string } | null

export function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        feedback.tone === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
      )}
    >
      {feedback.text}
    </p>
  )
}
