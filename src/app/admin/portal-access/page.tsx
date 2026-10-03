"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { BellRing, History, KeyRound, Power, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { NotifyButtons } from '@/components/admin/approvals/shared'
import { PartyNotifyDialog } from '@/components/admin/portal/PartyNotifyDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isPlaceholderEmail, PORTAL_DELIVERY_LABELS, PORTAL_MESSAGE_KIND_LABELS } from '@/lib/erp/portal'
import { useERP } from '@/lib/erp/provider'
import type { PortalAccountRecord, PortalMessageRecord, PortalPartyKind } from '@/lib/erp/types'
import { useZoneAccess } from '@/lib/erp/useZoneAccess'
import { formatDateTime, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Party = { id: string; name: string; company: string; phone: string; email: string }

type LoginForm = { email: string; phone: string; password: string }

/** A password that is easy to read out on the phone: no 0/O or 1/l look-alikes. */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (pool: string) => pool[Math.floor(Math.random() * pool.length)]
  return `${Array.from({ length: 5 }, () => pick(letters)).join('')}${Array.from({ length: 4 }, () => pick(digits)).join('')}`
}

function loginName(account: PortalAccountRecord) {
  return isPlaceholderEmail(account.email) ? account.phone : account.email
}

export default function PortalAccessPage() {
  const { data, hasPermission, authorizedFetch } = useERP()
  const { customers } = useZoneAccess()
  const canSeeDealers = hasPermission('customers.view')
  const canSeeSuppliers = hasPermission('suppliers.view')
  const [tab, setTab] = useState<PortalPartyKind>(canSeeDealers || !canSeeSuppliers ? 'customer' : 'supplier')
  const canEditLogins = hasPermission(tab === 'customer' ? 'customers.edit' : 'suppliers.edit')
  const canNotify = hasPermission(tab === 'customer' ? 'credit_sheet.edit' : 'suppliers.edit')

  const [accounts, setAccounts] = useState<PortalAccountRecord[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [loginParty, setLoginParty] = useState<Party | null>(null)
  const [loginForm, setLoginForm] = useState<LoginForm>({ email: '', phone: '', password: '' })
  const [loginError, setLoginError] = useState<string | null>(null)
  const [savingLogin, setSavingLogin] = useState(false)
  const [savedLogin, setSavedLogin] = useState<{ login: string; password: string; phone: string } | null>(null)

  const [notifyParty, setNotifyParty] = useState<Party | null>(null)
  const [historyParty, setHistoryParty] = useState<Party | null>(null)
  const [history, setHistory] = useState<PortalMessageRecord[] | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      setAccounts((await authorizedFetch<{ accounts: PortalAccountRecord[] }>('/api/admin/portal/accounts')).accounts)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to load portal logins.')
    } finally {
      setLoadingAccounts(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const parties = useMemo<Party[]>(() => {
    const list =
      tab === 'customer'
        ? customers.map((customer) => ({ id: customer.id, name: customer.name, company: customer.company, phone: customer.phone, email: customer.email }))
        : toArray(data?.suppliers).map((supplier) => ({ id: supplier.id, name: supplier.name, company: supplier.company, phone: supplier.phone, email: supplier.email }))
    const needle = query.trim().toLowerCase()
    return list
      .filter((party) => !needle || [party.name, party.company, party.phone, party.email].join(' ').toLowerCase().includes(needle))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [customers, data?.suppliers, query, tab])

  const accountByParty = useMemo(
    () => new Map(accounts.filter((account) => account.partyKind === tab).map((account) => [account.partyId, account])),
    [accounts, tab]
  )
  const registeredCount = parties.filter((party) => accountByParty.has(party.id)).length

  function openLoginDialog(party: Party) {
    const existing = accountByParty.get(party.id)
    setLoginParty(party)
    setLoginError(null)
    setSavedLogin(null)
    setLoginForm({
      email: existing ? (isPlaceholderEmail(existing.email) ? '' : existing.email) : party.email,
      phone: existing ? existing.phone : party.phone,
      password: existing ? '' : generatePassword(),
    })
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loginParty) return
    const existing = accountByParty.get(loginParty.id)
    setLoginError(null)
    setSavingLogin(true)
    try {
      const body = existing
        ? { accountId: existing.id, email: loginForm.email, phone: loginForm.phone, ...(loginForm.password ? { password: loginForm.password } : {}) }
        : { partyKind: tab, partyId: loginParty.id, ...loginForm }
      const { account } = await authorizedFetch<{ account: PortalAccountRecord }>('/api/admin/portal/accounts', {
        method: existing ? 'PATCH' : 'POST',
        body,
      })
      setAccounts((current) => [...current.filter((item) => item.id !== account.id), account])
      if (loginForm.password) {
        setSavedLogin({ login: loginName(account), password: loginForm.password, phone: account.phone || loginParty.phone })
      } else {
        setLoginParty(null)
      }
    } catch (reason) {
      setLoginError(reason instanceof Error ? reason.message : 'Unable to save the login.')
    } finally {
      setSavingLogin(false)
    }
  }

  async function toggleStatus(account: PortalAccountRecord) {
    setFeedback(null)
    try {
      const { account: updated } = await authorizedFetch<{ account: PortalAccountRecord }>('/api/admin/portal/accounts', {
        method: 'PATCH',
        body: { accountId: account.id, status: account.status === 'active' ? 'inactive' : 'active' },
      })
      setAccounts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to change the login.')
    }
  }

  async function removeLogin(account: PortalAccountRecord) {
    if (!window.confirm(`Remove the portal login of ${account.name}? Their sheet and messages stay.`)) return
    setFeedback(null)
    try {
      await authorizedFetch('/api/admin/portal/accounts', { method: 'DELETE', body: { accountId: account.id } })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove the login.')
    }
  }

  async function openHistory(party: Party) {
    setHistoryParty(party)
    setHistory(null)
    try {
      const result = await authorizedFetch<{ messages: PortalMessageRecord[] }>(
        `/api/admin/portal/notify?partyKind=${tab}&partyId=${encodeURIComponent(party.id)}`
      )
      setHistory(result.messages)
    } catch (reason) {
      setHistory([])
      setFeedback(reason instanceof Error ? reason.message : 'Unable to load messages.')
    }
  }

  const portalUrl = typeof window === 'undefined' ? '' : window.location.origin
  const kindLabel = tab === 'customer' ? 'dealer' : 'supplier'

  return (
    <AdminShell active="Dealer Portal">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Dealer &amp; supplier portal</CardTitle>
              <CardDescription>
                Register a login for a dealer or supplier and set their first password. They sign in at {portalUrl || 'the sign-in page'} with their email or
                phone, and see only their own sheet, replacement history, products, and your messages.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadAccounts()} disabled={loadingAccounts}>
              <RefreshCw className={cn('h-4 w-4', loadingAccounts && 'animate-spin')} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {canSeeDealers ? (
                  <button
                    type="button"
                    onClick={() => setTab('customer')}
                    className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === 'customer' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    Dealers
                  </button>
                ) : null}
                {canSeeSuppliers ? (
                  <button
                    type="button"
                    onClick={() => setTab('supplier')}
                    className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === 'supplier' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                  >
                    Suppliers
                  </button>
                ) : null}
              </div>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kindLabel}s`} className="pl-9" />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {registeredCount} of {parties.length} {kindLabel}s have a portal login.
            </p>

            {feedback ? <p className="text-sm text-rose-600 dark:text-rose-400">{feedback}</p> : null}

            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tab === 'customer' ? 'Dealer' : 'Supplier'}</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Portal login</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.map((party) => {
                    const account = accountByParty.get(party.id)
                    return (
                      <TableRow key={party.id}>
                        <TableCell>
                          <p className="font-medium">{party.name}</p>
                          {party.company ? <p className="text-xs text-muted-foreground">{party.company}</p> : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{party.phone || '-'}</TableCell>
                        <TableCell>
                          {account ? (
                            <div className="space-y-1">
                              <p className="text-sm">{loginName(account)}</p>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'border-transparent',
                                  account.status === 'active'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                                )}
                              >
                                {account.status === 'active' ? 'Active' : 'Disabled'}
                              </Badge>
                            </div>
                          ) : loadingAccounts ? (
                            <span className="text-xs text-muted-foreground">...</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not registered</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : account ? 'Never' : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {canNotify ? (
                              <Button size="sm" variant="outline" onClick={() => setNotifyParty(party)}>
                                <BellRing className="h-4 w-4" />
                                Notify
                              </Button>
                            ) : null}
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => void openHistory(party)} aria-label="Messages sent" title="Messages sent">
                              <History className="h-4 w-4" />
                            </Button>
                            {canEditLogins && !account && !loadingAccounts ? (
                              <Button size="sm" onClick={() => openLoginDialog(party)}>
                                <UserPlus className="h-4 w-4" />
                                Register login
                              </Button>
                            ) : null}
                            {canEditLogins && account ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openLoginDialog(party)}>
                                  <KeyRound className="h-4 w-4" />
                                  Edit / password
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() => void toggleStatus(account)}
                                  aria-label={account.status === 'active' ? 'Disable login' : 'Enable login'}
                                  title={account.status === 'active' ? 'Disable login' : 'Enable login'}
                                >
                                  <Power className={cn('h-4 w-4', account.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground')} />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => void removeLogin(account)}
                                  aria-label="Remove login"
                                  title="Remove login"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {parties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        No {kindLabel}s found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(loginParty)} onOpenChange={(open) => !open && setLoginParty(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{loginParty && accountByParty.has(loginParty.id) ? 'Edit portal login' : 'Register portal login'}</DialogTitle>
            <DialogDescription>
              {loginParty?.name} signs in with this email or phone number and password.
            </DialogDescription>
          </DialogHeader>

          {savedLogin ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <p className="font-medium">Login saved. Give these details to {loginParty?.name}:</p>
                <p className="mt-2">
                  Sign in: <span className="font-mono">{savedLogin.login}</span>
                </p>
                <p>
                  Password: <span className="font-mono">{savedLogin.password}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">The password is not shown again. They can change it after signing in.</p>
              </div>
              <NotifyButtons
                phone={savedLogin.phone}
                message={`Your ${data?.settings.companyName ?? 'Power International BD'} account is ready.\nSign in: ${portalUrl}\nLogin: ${savedLogin.login}\nPassword: ${savedLogin.password}\nPlease change the password after your first sign-in.`}
              />
              <div className="flex justify-end">
                <Button type="button" onClick={() => setLoginParty(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleLoginSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-medium">Phone number</p>
                <Input
                  value={loginForm.phone}
                  onChange={(event) => setLoginForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="01711-000000"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="dealer@example.com"
                />
                <p className="text-xs text-muted-foreground">Enter at least one of phone or email.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {loginParty && accountByParty.has(loginParty.id) ? (
                    <>
                      New password <span className="font-normal text-muted-foreground">(leave empty to keep the current one)</span>
                    </>
                  ) : (
                    'Password'
                  )}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="At least 8 characters"
                    className="font-mono"
                    minLength={loginParty && accountByParty.has(loginParty.id) ? undefined : 8}
                    required={!(loginParty && accountByParty.has(loginParty.id))}
                    autoComplete="new-password"
                  />
                  <Button type="button" variant="outline" onClick={() => setLoginForm((current) => ({ ...current, password: generatePassword() }))}>
                    Generate
                  </Button>
                </div>
              </div>
              {loginError ? <p className="text-sm text-rose-600 dark:text-rose-400">{loginError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLoginParty(null)} disabled={savingLogin}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingLogin}>
                  {savingLogin ? 'Saving...' : 'Save login'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {notifyParty ? (
        <PartyNotifyDialog open onOpenChange={(open) => !open && setNotifyParty(null)} partyKind={tab} partyId={notifyParty.id} />
      ) : null}

      <Dialog open={Boolean(historyParty)} onOpenChange={(open) => !open && setHistoryParty(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Messages sent to {historyParty?.name}</DialogTitle>
            <DialogDescription>Account alerts, reminders, and statements in their portal inbox, newest first.</DialogDescription>
          </DialogHeader>
          {history === null ? <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p> : null}
          {history?.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing sent yet.</p> : null}
          <ul className="space-y-3">
            {history?.map((message) => (
              <li key={message.id} className="rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{PORTAL_MESSAGE_KIND_LABELS[message.kind]}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line">{message.body}</p>
                {message.imageUrl ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                    View statement image
                  </a>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {PORTAL_DELIVERY_LABELS[message.whatsapp]} · {message.read ? 'Read' : 'Unread'} · by {message.createdByName}
                </p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
