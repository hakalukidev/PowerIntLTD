"use client"

import Link from 'next/link'
import { ArrowRight, Bell, FileSpreadsheet, Package } from 'lucide-react'

import { usePortal } from '@/components/portal/PortalShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { balanceSide } from '@/lib/erp/ledger'
import { PORTAL_MESSAGE_KIND_LABELS } from '@/lib/erp/portal'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export default function PortalHomePage() {
  const { overview } = usePortal()
  if (!overview) return null

  const { company, party, ledger, messages, account } = overview
  const money = (amount: number) => formatCurrency(amount, company.currency)
  const isDealer = account.partyKind === 'customer'
  const recentRows = [...ledger.rows].reverse().slice(0, 5)
  const latestMessages = messages.slice(0, 3)

  const stats = [
    {
      label: 'Current balance',
      value: `${money(Math.abs(ledger.totals.balance))} ${balanceSide(ledger.totals.balance)}`,
      hint: isDealer ? 'What your sheet shows today' : 'Balance on your supplier sheet',
      strong: true,
    },
    { label: isDealer ? 'Total purchase' : 'Total supplied', value: money(ledger.totals.credit), hint: 'Credit on your sheet' },
    { label: isDealer ? 'Total paid' : 'Total received', value: money(ledger.totals.debit), hint: 'Debit on your sheet' },
    ...(isDealer && party.creditLimit > 0 ? [{ label: 'Credit limit', value: money(party.creditLimit), hint: 'Most you may owe' }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{party.name}</h1>
        {party.ownerName ? <p className="text-sm text-muted-foreground">{party.ownerName}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className={cn('border-border/70 shadow-sm', stat.strong && 'border-primary/40 bg-primary/5')}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className={cn('mt-1 text-xl font-semibold tabular-nums', stat.strong && 'text-primary')}>{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Recent sheet entries</CardTitle>
              <CardDescription>The latest lines on your sheet.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/sheet">
                <FileSpreadsheet className="h-4 w-4" />
                Full sheet
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentRows.length ? (
              <ul className="divide-y divide-border/70">
                {recentRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.particulars}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(row.date)}
                        {row.qty ? ` · Qty ${row.qty}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      {row.credit ? <p>Cr {money(row.credit)}</p> : null}
                      {row.debit ? <p>Dr {money(row.debit)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No entries on your sheet yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Messages</CardTitle>
              <CardDescription>Alerts and notices from the office.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/messages">
                <Bell className="h-4 w-4" />
                All
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {latestMessages.length ? (
              <ul className="space-y-3">
                {latestMessages.map((message) => (
                  <li key={message.id} className={cn('rounded-lg border border-border/70 p-3 text-sm', !message.read && 'border-primary/40 bg-primary/5')}>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{PORTAL_MESSAGE_KIND_LABELS[message.kind]}</span>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line">{message.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Link
        href="/portal/products"
        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium">Browse products</span>
            <span className="block text-sm text-muted-foreground">
              {isDealer ? 'See our range and your prices.' : 'See the product range we carry.'}
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  )
}
