"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, FileSpreadsheet, Home, KeyRound, LogOut, Package } from 'lucide-react'

import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import type { PortalOverview } from '@/lib/erp/portal'
import { useERP } from '@/lib/erp/provider'
import { cn } from '@/lib/utils'

type PortalContextValue = {
  overview: PortalOverview | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  markRead: (ids: string[]) => Promise<void>
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) throw new Error('usePortal must be used inside the portal.')
  return context
}

const NAVIGATION = [
  { href: '/portal', label: 'Home', icon: Home, soft: 'bg-violet-500/12 text-violet-600 dark:text-violet-400', solid: 'from-violet-500 to-fuchsia-500' },
  { href: '/portal/sheet', label: 'My sheet', icon: FileSpreadsheet, soft: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', solid: 'from-emerald-500 to-teal-500' },
  { href: '/portal/products', label: 'Products', icon: Package, soft: 'bg-sky-500/12 text-sky-600 dark:text-sky-400', solid: 'from-sky-500 to-blue-500' },
  { href: '/portal/messages', label: 'Messages', icon: Bell, soft: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', solid: 'from-amber-500 to-orange-500' },
] as const

/**
 * The dealer and supplier portal: their own sheet, products, and messages from the office.
 * Staff who land here are sent on to the ERP workspace by the sign-in screen.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { isPortalUser, loading: sessionLoading, authorizedFetch, logout } = useERP()
  const pathname = usePathname()
  const [overview, setOverview] = useState<PortalOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setOverview(await authorizedFetch<PortalOverview>('/api/portal/me'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load your account.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPortalUser])

  useEffect(() => {
    if (isPortalUser) void refresh()
  }, [isPortalUser, refresh])

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      setOverview((current) =>
        current ? { ...current, messages: current.messages.map((message) => (ids.includes(message.id) ? { ...message, read: true } : message)) } : current
      )
      await authorizedFetch('/api/portal/messages', { method: 'PATCH', body: { ids } }).catch(() => undefined)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPortalUser]
  )

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading...
        </div>
      </main>
    )
  }

  if (!isPortalUser) {
    return <LoginScreen />
  }

  const unread = overview?.messages.filter((message) => !message.read).length ?? 0
  const isActive = (href: string) => (href === '/portal' ? pathname === '/portal' : pathname.startsWith(href))

  return (
    <PortalContext.Provider value={{ overview, loading, error, refresh, markRead }}>
      <div className="app-backdrop flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-lg">
          <div className="brand-stripe h-1" />
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
            <Link href="/portal" className="flex min-w-0 items-center gap-2.5">
              <Image src="/power-icon.png" alt="" width={30} height={30} className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold">{overview?.company.name ?? 'Power International BD'}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {overview?.account.partyKind === 'supplier' ? 'Supplier portal' : 'Dealer portal'}
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Portal">
              {NAVIGATION.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href) ? cn('bg-gradient-to-r text-white shadow-md', item.solid) : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.href === '/portal/messages' && unread > 0 ? (
                    <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{unread}</span>
                  ) : null}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <ChangePasswordDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Change password" title="Change password">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                }
              />
              <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6 md:pb-10">
          {loading && !overview ? (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading your account...</div>
          ) : error && !overview ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          ) : (
            children
          )}
        </main>

        {/* Phone navigation along the bottom edge. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
          aria-label="Portal"
        >
          {NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                isActive(item.href) ? 'font-semibold text-foreground' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-12 items-center justify-center rounded-full',
                  isActive(item.href) ? cn('bg-gradient-to-r text-white shadow-md', item.solid) : item.soft
                )}
              >
                <item.icon className="h-5 w-5" />
              </span>
              {item.label}
              {item.href === '/portal/messages' && unread > 0 ? (
                <span className="absolute right-[calc(50%-26px)] top-1 rounded-full ring-2 ring-card bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">{unread}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
    </PortalContext.Provider>
  )
}
