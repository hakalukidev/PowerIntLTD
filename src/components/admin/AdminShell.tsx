"use client"

import Image from 'next/image'
import Link from 'next/link'
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  BatteryCharging,
  Bell,
  Boxes,
  Briefcase,
  CalendarCheck,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  BookCheck,
  FileCheck2,
  ClipboardPen,
  Receipt,
  Factory,
  FileSpreadsheet,
  Globe,
  HandCoins,
  IdCard,
  MessageSquareWarning,
  Handshake,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MoreHorizontal,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  Undo2,
  Send,
  ShieldCheck,
  Store,
  Tags,
  ShoppingCart,
  Target,
  Truck,
  UserPlus,
  UserRound,
  Users,
  Warehouse,
  Wallet,
} from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { useERP } from '@/lib/erp/provider'
import { dueCommitmentReminders, localToday } from '@/lib/erp/commitmentReminders'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, userRoleIds, userRoleNames } from '@/lib/erp/utils'

type NavigationItem = {
  label: string
  description: string
  href: string
  icon: typeof LayoutDashboard
  /** Empty: every signed-in user sees it. */
  permission: string
}

type NavigationGroup = {
  title: string
  items: NavigationItem[]
}

const navigationGroups: NavigationGroup[] = [
  {
    // Shown first so users find their forms right after signing in. Both go to the zone's
    // Authorizer and then the Chairman for final approval.
    title: 'Forms',
    items: [
      {
        label: 'Order Form',
        description: 'Dealer order for your zone, sent to the Authorizer and then the Chairman',
        href: '/admin/order-form',
        icon: ClipboardPen,
        permission: 'sales.view',
      },
      {
        label: 'Deposit Form',
        description: 'Cash deposits for your zone, sent to the Authorizer and then the Chairman',
        href: '/admin/deposit',
        icon: HandCoins,
        permission: 'credit_sheet.view',
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Dashboard',
        description: "Today's sales, alerts, and warranty claims",
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        permission: 'dashboard.view',
      },
      {
        label: 'Approvals',
        description: 'Confirm orders, deposits, payments and expenses; daily closing and delivery reports',
        href: '/admin/approvals',
        icon: ClipboardCheck,
        permission: 'finance.view',
      },
      {
        label: 'Sales & Billing',
        description: 'POS, invoices, returns, and due tracking',
        href: '/admin/sales',
        icon: ShoppingCart,
        permission: 'sales.view',
      },
      {
        label: 'Price List',
        description: 'Change prices for one dealer, one zone (leaving dealers out), or every dealer',
        href: '/admin/price-list',
        icon: Tags,
        permission: 'sales.view',
      },
      {
        label: 'Delivery',
        description: 'Post approved orders with warehouse, delivery man and courier; submit the delivery document',
        href: '/admin/delivery',
        icon: PackageCheck,
        permission: 'sales.view',
      },
      {
        label: 'Inventory / Stock',
        description: 'Products, warehouses, and warranty-linked inventory',
        href: '/admin/stock/overview',
        icon: Boxes,
        permission: 'inventory.view',
      },
      {
        label: 'Suppliers & Imports',
        description: 'Purchase orders, LC tracking, and landed cost',
        href: '/admin/suppliers',
        icon: Truck,
        permission: 'suppliers.view',
      },
      {
        label: 'Suppliers (CRM)',
        description: 'Supplier profiles, bank details, documents, and forms',
        href: '/admin/supplier-crm',
        icon: Factory,
        permission: 'suppliers.view',
      },
      {
        label: 'Payment Form',
        description: 'Supplier payments by bank or cash, sent to an admin for approval',
        href: '/admin/supplier-payment',
        icon: Send,
        permission: 'suppliers.view',
      },
      {
        label: 'Dealers (CRM)',
        description: 'Dealer history, support, and credit tracking',
        href: '/admin/customers',
        icon: Users,
        permission: 'customers.view',
      },
      {
        label: 'Depot',
        description: 'Depots, their dealers, depot prices, and deliveries',
        href: '/admin/depot',
        icon: Warehouse,
        permission: 'customers.view',
      },
      {
        label: 'Leads',
        description: 'Shop visits and potential customers (sales pipeline)',
        href: '/admin/leads',
        icon: Store,
        permission: 'leads.view',
      },
      {
        label: 'Credit Sheet',
        description: 'Dealer credit ledger, grouped by name and zone',
        href: '/admin/credit-sheet',
        icon: ClipboardList,
        permission: 'credit_sheet.view',
      },
      {
        label: 'Dealer Portal',
        description: 'Dealer and supplier logins, reminders, and statements',
        href: '/admin/portal-access',
        icon: Globe,
        permission: 'customers.view',
      },
      {
        label: 'Complain Form',
        description: 'Product complaints from SRs and customers, sent for approval',
        href: '/admin/complaint',
        icon: MessageSquareWarning,
        permission: 'customers.view',
      },
      {
        label: 'Replacement Form',
        description: 'Faulty product replacements raised by SRs, sent for approval',
        href: '/admin/replacement',
        icon: RefreshCcw,
        permission: 'customers.view',
      },
      {
        label: 'Replacement Return',
        description: 'Replaced products returned by dealers, sent for approval',
        href: '/admin/replacement-return',
        icon: Undo2,
        permission: 'customers.view',
      },
      {
        label: 'Replacement Sheet',
        description: 'Replaced, returned and still-returnable pieces per dealer',
        href: '/admin/replacement-sheet',
        icon: ClipboardList,
        permission: 'customers.view',
      },
      {
        label: 'Battery Check Report',
        description: 'Bench test readings, fault, warranty and decision for checked batteries',
        href: '/admin/battery-report',
        icon: BatteryCharging,
        permission: 'customers.view',
      },
      {
        label: 'Seller List',
        description: 'Sub-dealer ledger: taken, given, receivable, payable',
        href: '/admin/seller',
        icon: Handshake,
        permission: 'sellers.view',
      },
      {
        label: 'Courier Update',
        description: 'Shipment status, COD amount, and bill tracking',
        href: '/admin/courier',
        icon: PackageCheck,
        permission: 'couriers.view',
      },
      {
        label: 'Damage Products',
        description: 'Zone-wise damage reports and main office status',
        href: '/admin/damage-products',
        icon: AlertTriangle,
        permission: 'damage_products.view',
      },
      {
        label: 'Accounting & Finance',
        description: 'Ledger, profit/loss, and multi-currency reporting',
        href: '/admin/finance',
        icon: Wallet,
        permission: 'finance.view',
      },
      {
        label: 'Expense Form',
        description: 'Staff expenses with a receipt, sent to an admin for approval',
        href: '/admin/expense',
        icon: Receipt,
        permission: 'finance.view',
      },
      {
        label: 'Bank Accounts',
        description: 'Sender and receiver bank accounts used on the payment form',
        href: '/admin/bank-accounts',
        icon: Landmark,
        permission: 'finance.view',
      },
      {
        label: 'Sub Businesses',
        description: 'Separate books and balance sheet (stock, cash, deposits, payments, expenses)',
        href: '/admin/sub-business',
        icon: Briefcase,
        permission: 'finance.view',
      },
      {
        label: 'Reports',
        description: 'Sales, stock, returns, and warranty reports',
        href: '/admin/reports',
        icon: FileSpreadsheet,
        permission: 'reports.view',
      },
    ],
  },
  {
    title: 'Audit',
    items: [
      {
        label: 'Daily Audit',
        description: 'Everything approved or rejected each day, with who submitted and edited it',
        href: '/admin/audit/daily',
        icon: BookCheck,
        permission: 'finance.view',
      },
      {
        label: 'Monthly Audit',
        description: 'Approved reports and submitted deliveries for a month, with a day-by-day breakdown',
        href: '/admin/audit/monthly',
        icon: FileCheck2,
        permission: 'finance.view',
      },
    ],
  },
  {
    title: 'HR & Payroll',
    items: [
      {
        label: 'My Profile',
        description: 'Your pay, target, commission, advances, and clients',
        href: '/admin/my-profile',
        icon: IdCard,
        permission: '',
      },
      {
        label: 'Employee Management',
        description: 'Profiles, joining date, and probation/confirmation status',
        href: '/admin/employees',
        icon: UserRound,
        permission: 'employees.view',
      },
      {
        label: 'Employee Joining Form',
        description: 'Submit joining forms; an admin sets the pay and approves',
        href: '/admin/employees/joining',
        icon: UserPlus,
        permission: 'employees.view',
      },
      {
        label: 'Attendance',
        description: 'Daily present/absent sheet and the DA it earns',
        href: '/admin/attendance',
        icon: CalendarCheck,
        permission: 'attendance.view',
      },
      {
        label: 'Sales & Target',
        description: 'Monthly unit/amount targets, achievement, and commission',
        href: '/admin/sales-target',
        icon: Target,
        permission: 'sales_target.view',
      },
      {
        label: 'Salary & Commission',
        description: 'Base salary, commission, hold status, and payment history',
        href: '/admin/salary',
        icon: Banknote,
        permission: 'salary.view',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'User & Role Management',
        description: 'Employee logins and permission matrix',
        href: '/admin/users',
        icon: ShieldCheck,
        permission: 'users.view',
      },
    ],
  },
] as const

/**
 * Every module gets its own colour so staff on phones can find it at a glance.
 * Class names are spelled out in full so Tailwind picks them up.
 */
const TONES = {
  emerald: { chip: 'bg-emerald-500/15 text-emerald-400', soft: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', solid: 'from-emerald-500 to-teal-500' },
  teal: { chip: 'bg-teal-500/15 text-teal-400', soft: 'bg-teal-500/12 text-teal-600 dark:text-teal-400', solid: 'from-teal-500 to-cyan-500' },
  cyan: { chip: 'bg-cyan-500/15 text-cyan-400', soft: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400', solid: 'from-cyan-500 to-sky-500' },
  sky: { chip: 'bg-sky-500/15 text-sky-400', soft: 'bg-sky-500/12 text-sky-600 dark:text-sky-400', solid: 'from-sky-500 to-blue-500' },
  blue: { chip: 'bg-blue-500/15 text-blue-400', soft: 'bg-blue-500/12 text-blue-600 dark:text-blue-400', solid: 'from-blue-500 to-indigo-500' },
  indigo: { chip: 'bg-indigo-500/15 text-indigo-400', soft: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400', solid: 'from-indigo-500 to-violet-500' },
  violet: { chip: 'bg-violet-500/15 text-violet-400', soft: 'bg-violet-500/12 text-violet-600 dark:text-violet-400', solid: 'from-violet-500 to-fuchsia-500' },
  fuchsia: { chip: 'bg-fuchsia-500/15 text-fuchsia-400', soft: 'bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400', solid: 'from-fuchsia-500 to-pink-500' },
  pink: { chip: 'bg-pink-500/15 text-pink-400', soft: 'bg-pink-500/12 text-pink-600 dark:text-pink-400', solid: 'from-pink-500 to-rose-500' },
  rose: { chip: 'bg-rose-500/15 text-rose-400', soft: 'bg-rose-500/12 text-rose-600 dark:text-rose-400', solid: 'from-rose-500 to-orange-500' },
  orange: { chip: 'bg-orange-500/15 text-orange-400', soft: 'bg-orange-500/12 text-orange-600 dark:text-orange-400', solid: 'from-orange-500 to-amber-500' },
  amber: { chip: 'bg-amber-500/15 text-amber-400', soft: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', solid: 'from-amber-500 to-yellow-500' },
  lime: { chip: 'bg-lime-500/15 text-lime-400', soft: 'bg-lime-500/12 text-lime-600 dark:text-lime-400', solid: 'from-lime-500 to-green-500' },
} as const

type Tone = keyof typeof TONES

const TONE_BY_HREF: Record<string, Tone> = {
  '/admin/order-form': 'sky',
  '/admin/deposit': 'emerald',
  '/admin/dashboard': 'violet',
  '/admin/approvals': 'amber',
  '/admin/sales': 'emerald',
  '/admin/price-list': 'pink',
  '/admin/delivery': 'orange',
  '/admin/stock/overview': 'cyan',
  '/admin/suppliers': 'indigo',
  '/admin/supplier-crm': 'blue',
  '/admin/supplier-payment': 'teal',
  '/admin/customers': 'sky',
  '/admin/depot': 'lime',
  '/admin/leads': 'fuchsia',
  '/admin/credit-sheet': 'rose',
  '/admin/portal-access': 'blue',
  '/admin/complaint': 'rose',
  '/admin/replacement': 'amber',
  '/admin/replacement-return': 'orange',
  '/admin/replacement-sheet': 'violet',
  '/admin/battery-report': 'lime',
  '/admin/seller': 'teal',
  '/admin/courier': 'orange',
  '/admin/damage-products': 'rose',
  '/admin/finance': 'emerald',
  '/admin/expense': 'pink',
  '/admin/bank-accounts': 'indigo',
  '/admin/sub-business': 'cyan',
  '/admin/reports': 'violet',
  '/admin/audit/daily': 'teal',
  '/admin/audit/monthly': 'indigo',
  '/admin/my-profile': 'sky',
  '/admin/employees': 'blue',
  '/admin/employees/joining': 'emerald',
  '/admin/attendance': 'lime',
  '/admin/sales-target': 'rose',
  '/admin/salary': 'amber',
  '/admin/users': 'fuchsia',
}

function toneOf(href: string) {
  return TONES[TONE_BY_HREF[href] ?? 'emerald']
}

type AdminShellProps = {
  active: string
  children: ReactNode
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  )
}

// Every page mounts its own AdminShell, so the sidebar's scroll offset is kept here to survive navigation.
const sidebarScrollKey = 'admin-sidebar-scroll'

function SidebarContent({
  active,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  active: string
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const { hasPermission, currentUser, data, logout } = useERP()
  const roleName = currentUser ? userRoleNames(data?.roles, currentUser) : ''
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let saved: string | null = null
    try {
      saved = window.sessionStorage.getItem(sidebarScrollKey)
    } catch {}
    if (saved !== null) container.scrollTop = Number(saved) || 0
    // Fall back to revealing the active link when the saved offset does not show it.
    const activeLink = container.querySelector<HTMLElement>('[aria-current="page"]')
    if (!activeLink) return
    const top = activeLink.getBoundingClientRect().top - container.getBoundingClientRect().top
    if (top < 0 || top + activeLink.offsetHeight > container.clientHeight) {
      container.scrollTop += top - container.clientHeight / 2 + activeLink.offsetHeight / 2
    }
  }, [])

  const saveScroll = () => {
    try {
      window.sessionStorage.setItem(sidebarScrollKey, String(scrollRef.current?.scrollTop ?? 0))
    } catch {}
  }

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
        <Link
          href="/admin/dashboard"
          className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'justify-center')}
          onClick={onNavigate}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1">
            <Image src="/power-icon.png" alt="ERP" loading="eager" width={28} height={28} className="h-7 w-7 object-contain" />
          </span>
          {!collapsed ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold tracking-tight text-white">Power International</span>
              <span className="block text-[11px] text-sidebar-foreground/55">BD · ERP System</span>
            </span>
          ) : null}
        </Link>
        {onToggleCollapse && !collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white lg:inline-flex"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        onScroll={saveScroll}
        className={cn('flex-1 space-y-5 overflow-y-auto overflow-x-hidden py-4', collapsed ? 'px-2' : 'px-3')}
      >
        {onToggleCollapse && collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto hidden h-9 w-9 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white lg:flex"
            onClick={onToggleCollapse}
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        ) : null}
        {visibleGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            {!collapsed ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{group.title}</p>
            ) : null}
            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.label
                const tone = toneOf(item.href)

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : item.description}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                      collapsed ? 'h-10 justify-center' : 'px-2 py-1.5',
                      isActive
                        ? cn('bg-gradient-to-r text-white shadow-md', tone.solid)
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        isActive ? 'bg-white/20 text-white' : tone.chip
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      {currentUser ? (
        <div className={cn('shrink-0 border-t border-sidebar-border p-3', collapsed && 'px-2')}>
          <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 text-xs font-semibold text-white">
              {initialsOf(currentUser.name)}
            </span>
            {!collapsed ? (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium text-white">{currentUser.name}</span>
                <span className="block truncate text-[11px] text-sidebar-foreground/55">{roleName}</span>
              </span>
            ) : null}
            <ChangePasswordDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
                  title="Change password"
                  aria-label="Change password"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The pages staff open most, in order; the bottom bar on phones shows the first ones they can access. */
const MOBILE_TAB_HREFS = ['/admin/dashboard', '/admin/sales', '/admin/customers', '/admin/credit-sheet', '/admin/stock/overview']

const MOBILE_TAB_LABELS: Record<string, string> = {
  '/admin/dashboard': 'Home',
  '/admin/sales': 'Sales',
  '/admin/customers': 'Dealers',
  '/admin/credit-sheet': 'Credit',
  '/admin/stock/overview': 'Stock',
}

function MobileTabBar({ active, onOpenMenu }: { active: string; onOpenMenu: () => void }) {
  const { hasPermission } = useERP()
  const items = navigationGroups
    .flatMap((group) => group.items)
    .filter((item) => MOBILE_TAB_HREFS.includes(item.href) && hasPermission(item.permission))
    .sort((left, right) => MOBILE_TAB_HREFS.indexOf(left.href) - MOBILE_TAB_HREFS.indexOf(right.href))
    .slice(0, 4)
  const activeInTabs = items.some((item) => item.label === active)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.label === active
          const tone = toneOf(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                  isActive ? cn('bg-gradient-to-r text-white shadow-md', tone.solid) : tone.soft
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {MOBILE_TAB_LABELS[item.href] ?? item.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(
            'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
            activeInTabs ? 'text-muted-foreground' : 'font-semibold text-foreground'
          )}
        >
          <span
            className={cn(
              'flex h-8 w-12 items-center justify-center rounded-full',
              activeInTabs ? 'bg-slate-500/12 text-slate-600 dark:text-slate-300' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
          </span>
          More
        </button>
      </div>
    </nav>
  )
}

/** Phone "More" menu: every module the user can open, as a grid of coloured tiles. */
function MobileLauncher({ active, open, onOpenChange }: { active: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { hasPermission, currentUser, data, logout } = useERP()
  const roleName = currentUser ? userRoleNames(data?.roles, currentUser) : ''
  const visibleGroups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || hasPermission(item.permission)) }))
    .filter((group) => group.items.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="text-left">
          <SheetTitle>All modules</SheetTitle>
          <SheetDescription className="sr-only">Open any part of the ERP workspace.</SheetDescription>
        </SheetHeader>

        {currentUser ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 p-3 text-white shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
              {initialsOf(currentUser.name)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{currentUser.name}</span>
              <span className="block truncate text-xs text-white/80">{roleName}</span>
            </span>
            <ChangePasswordDialog
              trigger={
                <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 hover:text-white" aria-label="Change password">
                  <KeyRound className="h-4 w-4" />
                </Button>
              }
            />
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 hover:text-white" onClick={logout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="mt-4 space-y-5">
          {visibleGroups.map((group) => (
            <section key={group.title}>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
              <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const tone = toneOf(item.href)
                  const isActive = item.label === active
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onOpenChange(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-colors active:scale-[0.97]',
                        isActive ? 'border-transparent bg-accent' : 'border-border/60 bg-card'
                      )}
                    >
                      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', tone.solid)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="line-clamp-2 text-[11px] font-medium leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.3)
    oscillator.onended = () => void ctx.close()
  } catch {
    // ignore autoplay/audio restrictions
  }
}

function NotificationBell() {
  const { data, currentUser, hasPermission, markNotificationRead, markAllNotificationsRead } = useERP()
  const { customers } = useZoneAccess()
  const today = localToday()
  // Commitments due today or overdue remind the office on their date; dismissing one only hides it until tomorrow.
  const seenKey = `commitment-reminders-seen:${today}`
  const [seenReminderIds, setSeenReminderIds] = useState<string[]>([])
  useEffect(() => {
    try {
      setSeenReminderIds(JSON.parse(window.localStorage.getItem(seenKey) ?? '[]'))
    } catch {
      setSeenReminderIds([])
    }
  }, [seenKey])
  const dueReminders = useMemo(
    () => (hasPermission('customers.view') ? dueCommitmentReminders(customers, today) : []),
    [customers, hasPermission, today]
  )
  const unseenReminders = dueReminders.filter(({ commitment }) => !seenReminderIds.includes(commitment.id))

  function markRemindersSeen(ids: string[]) {
    const next = [...new Set([...seenReminderIds, ...ids])]
    setSeenReminderIds(next)
    try {
      window.localStorage.setItem(seenKey, JSON.stringify(next))
    } catch {
      // the reminder just shows as unread again
    }
  }

  const notifications = Object.values(data?.notifications ?? {})
    .filter((notification) => {
      if (!currentUser || currentUser.roleId === 'admin') return true
      if (!notification.roles || notification.roles.length === 0) return true
      const roleIds = userRoleIds(currentUser)
      return notification.roles.some((role) => roleIds.includes(role))
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const unread = notifications.filter((notification) => !notification.read)
  const unreadCount = unread.length + unseenReminders.length
  const unreadKey = [...unread.map((notification) => notification.id), ...unseenReminders.map(({ commitment }) => commitment.id)]
    .sort()
    .join(',')
  const seenUnreadIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    const currentUnreadIds = new Set(unreadKey ? unreadKey.split(',') : [])
    if (seenUnreadIds.current) {
      const hasNewNotification = [...currentUnreadIds].some((id) => !seenUnreadIds.current!.has(id))
      if (hasNewNotification) playNotificationSound()
    }
    seenUnreadIds.current = currentUnreadIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                markRemindersSeen(unseenReminders.map(({ commitment }) => commitment.id))
                if (unread.length) void markAllNotificationsRead(unread.map((notification) => notification.id))
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto border-t border-border/60">
          {dueReminders.map(({ customer, commitment }) => {
            const seen = seenReminderIds.includes(commitment.id)
            const overdue = commitment.dueDate < today
            return (
              <Link
                key={`reminder-${commitment.id}`}
                href="/admin/customers?reminders=1"
                onClick={() => markRemindersSeen([commitment.id])}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-border/40 px-3 py-2.5 text-left text-sm hover:bg-accent/60',
                  !seen && 'bg-accent/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', overdue ? 'bg-rose-500' : 'bg-amber-500')} />
                    {overdue ? 'Commitment overdue' : 'Commitment due today'}
                  </span>
                  {!seen ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {customer.name}: {commitment.note}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Due {formatDate(commitment.dueDate)}</p>
              </Link>
            )
          })}
          {notifications.length === 0 && dueReminders.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.read) void markNotificationRead(notification.id)
                }}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-border/40 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent/60',
                  !notification.read && 'bg-accent/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        notification.level === 'critical'
                          ? 'bg-rose-500'
                          : notification.level === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                      )}
                    />
                    {notification.title}
                  </span>
                  {!notification.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{notification.body}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {formatDateTime(notification.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminShell({ active, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('admin-sidebar-collapsed') === '1'
  })
  const { currentUser, data, hasPermission, loading } = useERP()

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  const allNavigationItems = navigationGroups.flatMap((group) => group.items)

  const currentPage = useMemo(
    () => allNavigationItems.find((item) => item.label === active) ?? allNavigationItems[0],
    [active, allNavigationItems]
  )

  const roleName = currentUser ? userRoleNames(data?.roles, currentUser) : 'Loading'

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading workspace...
        </div>
      </main>
    )
  }

  if (!currentUser) {
    return <LoginScreen />
  }

  return (
    <div className="app-backdrop min-h-screen">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
            collapsed ? 'w-[72px]' : 'w-64'
          )}
        >
          <SidebarContent active={active} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0 [&>button]:text-sidebar-foreground">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Browse the ERP workspace.</SheetDescription>
            </SheetHeader>
            <SidebarContent active={active} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-lg">
            <div className="brand-stripe h-1" />
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-2.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 shrink-0 lg:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md sm:h-10 sm:w-10',
                    toneOf(currentPage.href).solid
                  )}
                >
                  <currentPage.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{currentPage.label}</h1>
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">{currentPage.description}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <NotificationBell />
                <ThemeToggle />
                <div className="ml-1 hidden items-center gap-2.5 border-l border-border pl-3 md:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 text-xs font-semibold text-white">
                    {initialsOf(currentUser.name)}
                  </span>
                  <span className="leading-tight">
                    <span className="block max-w-40 truncate text-sm font-medium">{currentUser.name}</span>
                    <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{roleName}</span>
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8">
            <div className="mx-auto w-full max-w-7xl">
              {!currentPage.permission || hasPermission(currentPage.permission) ? (
                children
              ) : (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-lg font-semibold">Access restricted</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Your role ({roleName}) doesn&apos;t have permission to view {currentPage.label}. Contact an
                    administrator if you need access.
                  </p>
                </div>
              )}
            </div>
          </main>

          <footer className="hidden border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:block lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
              <p>{data?.settings.companyName ?? 'ERP'} · {data?.settings.timezone ?? 'Asia/Dhaka'}</p>
              <p>
                Developed by{' '}
                <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                  hakaluki.dev
                </a>
              </p>
            </div>
          </footer>
        </div>
      </div>

      <MobileTabBar active={active} onOpenMenu={() => setLauncherOpen(true)} />
      <MobileLauncher active={active} open={launcherOpen} onOpenChange={setLauncherOpen} />
    </div>
  )
}

