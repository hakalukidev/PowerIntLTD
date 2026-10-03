"use client"

import { useEffect, useState } from 'react'

import { usePortal } from '@/components/portal/PortalShell'
import { Badge } from '@/components/ui/badge'
import { PORTAL_MESSAGE_KIND_LABELS } from '@/lib/erp/portal'
import { formatDateTime } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export default function PortalMessagesPage() {
  const { overview, markRead } = usePortal()
  const messages = overview?.messages ?? []
  // Opening the inbox reads everything in it; what was new stays highlighted until the next visit.
  const [unreadIds] = useState(() => new Set(messages.filter((message) => !message.read).map((message) => message.id)))

  useEffect(() => {
    if (unreadIds.size) void markRead(Array.from(unreadIds))
  }, [markRead, unreadIds])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Messages</h1>
        <p className="text-sm text-muted-foreground">Account alerts, payment reminders, and statements from the office.</p>
      </div>

      {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p> : null}

      <ul className="space-y-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn('rounded-xl border border-border/70 bg-card p-4 shadow-sm', unreadIds.has(message.id) && 'border-primary/40 bg-primary/5')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{PORTAL_MESSAGE_KIND_LABELS[message.kind]}</Badge>
                <span className="text-sm font-semibold">{message.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-6">{message.body}</p>
            {message.imageUrl ? (
              <a href={message.imageUrl} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={message.imageUrl} alt="Statement" loading="lazy" className="max-h-72 rounded-lg border border-border object-contain" />
                <span className="mt-1 block text-xs text-primary hover:underline">Open full statement</span>
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
