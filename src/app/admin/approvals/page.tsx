"use client"

import { useState } from 'react'

import { AdminShell } from '@/components/admin/AdminShell'
import { AllApprovals } from '@/components/admin/approvals/AllApprovals'
import { ChangeApprovals } from '@/components/admin/approvals/ChangeApprovals'
import { DailyClosingReport, DeliveryReport, StockReport } from '@/components/admin/approvals/ApprovalReports'
import { LedgerEntryApprovals } from '@/components/admin/approvals/LedgerEntryApprovals'
import { OrderApprovals } from '@/components/admin/approvals/OrderApprovals'
import { PurchaseApprovals } from '@/components/admin/approvals/PurchaseApprovals'
import { SubmissionApprovals } from '@/components/admin/approvals/SubmissionApprovals'
import { todayInput } from '@/components/admin/approvals/shared'
import { DateInput } from '@/components/ui/date-input'
import { useERP } from '@/lib/erp/provider'
import { APPROVAL_PERMISSIONS, toArray, userRoleIds } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Tab = 'all' | 'orders' | 'deposits' | 'ledger' | 'payments' | 'expenses' | 'purchases' | 'changes' | 'stock' | 'closing' | 'delivery'

const REPORT_TABS: Tab[] = ['stock', 'closing', 'delivery']

export default function ApprovalsPage() {
  const { data, currentUser, hasPermission } = useERP()
  const [tab, setTab] = useState<Tab>('all')
  const [day, setDay] = useState(todayInput)

  const roleIds = currentUser ? userRoleIds(currentUser) : []
  const isAdmin = roleIds.includes('admin')
  // Whoever holds an approval stage acts on every kind of submission at that stage.
  const isApprover = hasPermission(APPROVAL_PERMISSIONS.authorizer) || hasPermission(APPROVAL_PERMISSIONS.chairman)
  const pendingCount = (items: Array<{ status?: string }>) => items.filter((item) => item.status === 'pending').length

  const approvalTabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'orders', label: 'Orders', count: pendingCount(toArray(data?.orderRequests)) },
    { id: 'deposits', label: 'Deposits', count: pendingCount(toArray(data?.deposits)) },
    { id: 'ledger', label: 'Ledger entries', count: pendingCount(toArray(data?.ledgerEntryRequests)) },
    { id: 'payments', label: 'Payments', count: pendingCount(toArray(data?.supplierPayments)) },
    { id: 'expenses', label: 'Expenses', count: pendingCount(toArray(data?.expenses)) },
    { id: 'purchases', label: 'Purchases', count: pendingCount(toArray(data?.purchaseRequests)) },
    { id: 'changes', label: 'Record changes', count: pendingCount(toArray(data?.changeRequests)) },
  ]
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'all', label: 'All', count: approvalTabs.reduce((sum, item) => sum + item.count, 0) },
    ...approvalTabs,
    { id: 'stock', label: 'Stock & warehouse' },
    { id: 'closing', label: 'Daily closing' },
    { id: 'delivery', label: 'Delivery' },
  ]

  return (
    <AdminShell active="Approvals">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    tab === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.label}
                  {item.count ? (
                    <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{item.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          {REPORT_TABS.includes(tab) ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Day</span>
              <DateInput className="w-auto" value={day} onChange={(value) => setDay(value || todayInput())} />
            </label>
          ) : null}
        </div>

        {!REPORT_TABS.includes(tab) ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground print:hidden">
            {isApprover
              ? 'Each item is accepted by the Authorizer, then gets final approval from the Chairman. You can act at your stage, but not on your own submissions or on items you authorized.'
              : 'Each item is accepted by the Authorizer, then gets final approval from the Chairman. You can see what is waiting.'}
          </p>
        ) : null}

        {tab === 'all' ? <AllApprovals isAdmin={isAdmin} /> : null}
        {tab === 'orders' ? <OrderApprovals isAdmin={isAdmin} /> : null}
        {tab === 'deposits' ? <SubmissionApprovals kind="deposits" isAdmin={isAdmin} /> : null}
        {tab === 'ledger' ? <LedgerEntryApprovals /> : null}
        {tab === 'payments' ? <SubmissionApprovals kind="supplierPayments" isAdmin={isAdmin} /> : null}
        {tab === 'expenses' ? <SubmissionApprovals kind="expenses" isAdmin={isAdmin} /> : null}
        {tab === 'purchases' ? <PurchaseApprovals /> : null}
        {tab === 'changes' ? <ChangeApprovals /> : null}
        {tab === 'stock' ? <StockReport day={day} /> : null}
        {tab === 'closing' ? <DailyClosingReport day={day} /> : null}
        {tab === 'delivery' ? <DeliveryReport day={day} /> : null}
      </div>
    </AdminShell>
  )
}
