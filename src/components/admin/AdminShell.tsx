"use client"

import Image from 'next/image'
import Link from 'next/link'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Boxes,
  CheckCheck,
  FileSpreadsheet,
  Handshake,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
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
  SheetTrigger,
} from '@/components/ui/sheet'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { useERP } from '@/lib/erp/provider'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/erp/utils'

type NavigationItem = {
  label: string
  description: string
  href: string
  icon: typeof LayoutDashboard
  permission: string
}

type NavigationGroup = {
  title: string
  items: NavigationItem[]
}

const navigationGroups: NavigationGroup[] = [
  {
    title: 'Operations',
    items: [
      {
        label: 'Dashboard',
        description: "Today's sales, alerts, and warranty claims",
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        permission: 'view_dashboard',
      },
      {
        label: 'Sales & Billing',
        description: 'POS, invoices, returns, and due tracking',
        href: '/admin/sales',
        icon: ShoppingCart,
        permission: 'manage_orders',
      },
      {
        label: 'Inventory / Stock',
        description: 'Products, warehouses, and warranty-linked inventory',
        href: '/admin/stock/overview',
        icon: Boxes,
        permission: 'view_products',
      },
      {
        label: 'Suppliers & Imports',
        description: 'Purchase orders, LC tracking, and landed cost',
        href: '/admin/suppliers',
        icon: Truck,
        permission: 'view_finance',
      },
      {
        label: 'Customers (CRM)',
        description: 'Customer history, support, and credit tracking',
        href: '/admin/customers',
        icon: Users,
        permission: 'view_reports',
      },
      {
        label: 'Seller List',
        description: 'Sub-dealer ledger: taken, given, receivable, payable',
        href: '/admin/seller',
        icon: Handshake,
        permission: 'view_finance',
      },
      {
        label: 'Courier Update',
        description: 'Shipment status, COD amount, and bill tracking',
        href: '/admin/courier',
        icon: PackageCheck,
        permission: 'manage_orders',
      },
      {
        label: 'Accounting & Finance',
        description: 'Ledger, profit/loss, and multi-currency reporting',
        href: '/admin/finance',
        icon: Wallet,
        permission: 'view_finance',
      },
      {
        label: 'Reports',
        description: 'Sales, stock, returns, and warranty reports',
        href: '/admin/reports',
        icon: FileSpreadsheet,
        permission: 'view_reports',
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
        permission: 'view_reports',
      },
    ],
  },
] as const

type AdminShellProps = {
  active: string
  children: ReactNode
}

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
  const { hasPermission, currentUser } = useERP()

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'space-y-4 border-b border-sidebar-border py-6',
          collapsed ? 'px-3' : 'px-5'
        )}
      >
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
          <Link
            href="/admin/dashboard"
            className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}
            onClick={onNavigate}
          >
            <Image src="/muaz_icon.png" alt="ERP" width={34} height={34} className="h-8 w-8 shrink-0 rounded-md object-contain" />
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-sidebar-foreground/60">
                  ERP
                </p>
                <h2 className="truncate text-lg font-semibold">Muaz Technology</h2>
              </div>
            ) : null}
          </Link>
          {onToggleCollapse ? (
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 shrink-0 rounded-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:inline-flex"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn('flex-1 space-y-8 overflow-y-auto overflow-x-hidden py-6', collapsed ? 'px-2' : 'px-4')}>
        <div className="space-y-6">
          {visibleGroups.map((group) => (
            <div key={group.title} className="space-y-3">
              {!collapsed ? (
                <p className="px-2 text-xs font-medium uppercase tracking-[0.26em] text-sidebar-foreground/45">
                  {group.title}
                </p>
              ) : null}
              <nav className="space-y-2">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = active === item.label

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-2xl border transition-all',
                        collapsed ? 'justify-center px-0 py-2.5' : 'items-start px-3 py-3',
                        isActive
                          ? 'border-sidebar-primary/25 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20'
                          : 'border-transparent bg-transparent hover:border-sidebar-border hover:bg-sidebar-accent'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          !collapsed && 'mt-0.5',
                          isActive
                            ? 'bg-white/18 text-sidebar-primary-foreground'
                            : 'bg-sidebar-accent text-sidebar-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      {!collapsed ? (
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span
                            className={cn(
                              'mt-1 block text-xs leading-5',
                              isActive ? 'text-sidebar-primary-foreground/80' : 'text-sidebar-foreground/60'
                            )}
                          >
                            {item.description}
                          </span>
                        </span>
                      ) : null}
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

       
      </div>
    </div>
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
  const { data, currentUser, markNotificationRead, markAllNotificationsRead } = useERP()

  const notifications = Object.values(data?.notifications ?? {})
    .filter((notification) => {
      if (!currentUser || currentUser.roleId === 'admin') return true
      if (!notification.roles || notification.roles.length === 0) return true
      return notification.roles.includes(currentUser.roleId)
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const unread = notifications.filter((notification) => !notification.read)
  const unreadKey = unread.map((notification) => notification.id).sort().join(',')
  const seenUnreadIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    const currentUnreadIds = new Set(unread.map((notification) => notification.id))
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
        <Button variant="outline" size="icon" className="relative rounded-full">
          <Bell className="h-4 w-4" />
          {unread.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void markAllNotificationsRead(unread.map((notification) => notification.id))}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto border-t border-border/60">
          {notifications.length === 0 ? (
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('admin-sidebar-collapsed') === '1'
  })
  const { currentUser, data, logout, hasPermission, loading } = useERP()

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

  const roleName = currentUser ? data?.roles[currentUser.roleId]?.name ?? currentUser.roleId : 'Loading'

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
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar shadow-[24px_0_80px_-48px_rgba(15,23,42,0.45)] transition-[width] duration-200 lg:block',
            collapsed ? 'w-[88px]' : 'w-[320px]'
          )}
        >
          <SidebarContent active={active} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" className="lg:hidden">
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[320px] border-sidebar-border bg-sidebar p-0">
                      <SheetHeader className="px-5 pt-6 text-left">
                        <SheetTitle>Navigation</SheetTitle>
                        <SheetDescription>Browse the ERP workspace.</SheetDescription>
                      </SheetHeader>
                      <div className="mt-4 h-[calc(100%-5rem)]">
                        <SidebarContent active={active} onNavigate={() => setMobileOpen(false)} />
                      </div>
                    </SheetContent>
                  </Sheet>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em]">
                        {currentPage.label}
                      </Badge>
                      <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                        {roleName}
                      </Badge>
                    </div>
                    <h1 className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">
                      {currentPage.description}
                    </h1>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <NotificationBell />

                  <ThemeToggle className="hidden sm:inline-flex" />

                  <div className="hidden text-right text-sm sm:block">
                    <p className="font-medium text-foreground">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentUser.title} · {roleName}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" className="rounded-full" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">
              {hasPermission(currentPage.permission) ? (
                children
              ) : (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/70 bg-card/50 p-10 text-center">
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

          <footer className="border-t border-border/60 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p>{data?.settings.companyName ?? 'ERP'} · {data?.settings.timezone ?? 'Asia/Dhaka'}</p>
             <div className="px-2 pt-4 text-xs leading-5 text-sidebar-foreground/70">
            Developed by{' '}
            <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-sidebar-foreground hover:underline">
              hakaluki.dev
            </a>
          </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

