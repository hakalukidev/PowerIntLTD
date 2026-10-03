"use client"

import { useMemo, useState } from 'react'
import { PencilLine } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { EmptyState, StatusPill, todayInput } from '@/components/admin/approvals/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { AuditKind } from '@/lib/erp/types'
import { formatCurrency, formatDate, formatDateTime, toArray } from '@/lib/erp/utils'

const KIND_LABELS: Record<AuditKind, string> = {
  order: 'Order',
  deposit: 'Deposit',
  supplier_payment: 'Supplier payment',
  expense: 'Expense',
  delivery: 'Delivery',
  change: 'Record change',
  employee: 'Employee joining',
  advance: 'Emergency advance',
  business: 'Sub business',
}

const PLURAL_LABELS: Record<AuditKind, string> = {
  order: 'Orders',
  deposit: 'Deposits',
  supplier_payment: 'Supplier payments',
  expense: 'Expenses',
  delivery: 'Deliveries',
  change: 'Record changes',
  employee: 'Employees joined',
  advance: 'Emergency advances',
  business: 'Sub business entries',
}

export default function DailyAuditPage() {
  const { data } = useERP()
  const [day, setDay] = useState(todayInput)
  const [kind, setKind] = useState<AuditKind | 'all'>('all')

  const entries = useMemo(
    () =>
      toArray(data?.auditLog)
        .filter((entry) => entry.day === day)
        .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)),
    [data?.auditLog, day]
  )
  const visible = kind === 'all' ? entries : entries.filter((entry) => entry.kind === kind)

  const totals = (Object.keys(KIND_LABELS) as AuditKind[]).map((item) => {
    const approved = entries.filter((entry) => entry.kind === item && entry.decision === 'approved')
    return { kind: item, count: approved.length, amount: approved.reduce((sum, entry) => sum + entry.amount, 0) }
  })

  return (
    <AdminShell active="Daily Audit">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Daily audit — {formatDate(day)}</h2>
            <p className="text-sm text-muted-foreground">Everything an admin approved or rejected on this day, with who submitted and who edited it.</p>
          </div>
          <Input type="date" className="w-auto" value={day} onChange={(event) => setDay(event.target.value || todayInput())} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 xl:grid-cols-9">
          {totals.map((total) => (
            <button
              key={total.kind}
              type="button"
              onClick={() => setKind(kind === total.kind ? 'all' : total.kind)}
              className={`rounded-lg border p-3 text-left transition-colors ${kind === total.kind ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
            >
              <p className="text-xs text-muted-foreground">
                {PLURAL_LABELS[total.kind]} {total.kind === 'delivery' ? 'submitted' : 'approved'}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(total.amount)}</p>
              <p className="text-xs text-muted-foreground">{total.count} entr{total.count === 1 ? 'y' : 'ies'}</p>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{kind === 'all' ? 'All entries' : PLURAL_LABELS[kind]}</CardTitle>
            <CardDescription>{visible.length} reviewed</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {visible.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead>Reviewed by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((entry) => (
                    <TableRow key={entry.id} className="align-top">
                      <TableCell>
                        <span className="block font-medium">{KIND_LABELS[entry.kind]}</span>
                        {entry.kind === 'delivery' ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">submitted</span>
                        ) : (
                          <StatusPill status={entry.decision} />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{entry.party}</TableCell>
                      <TableCell className="max-w-xs">
                        <span className="block text-sm">{entry.summary || '—'}</span>
                        {(entry.edits ?? []).map((line) => (
                          <span key={line} className="mt-1 flex items-start gap-1 text-xs text-sky-700 dark:text-sky-300">
                            <PencilLine className="mt-0.5 h-3 w-3 shrink-0" />
                            {line}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount)}</TableCell>
                      <TableCell>
                        <span className="block">{entry.submittedByName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {entry.submittedByRole ? `${entry.submittedByRole} · ` : ''}
                          {formatDateTime(entry.submittedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block">{entry.reviewedByName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {entry.reviewedByRole ? `${entry.reviewedByRole} · ` : ''}
                          {formatDateTime(entry.reviewedAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState text="Nothing was reviewed on this day." />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
