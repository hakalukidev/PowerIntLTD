"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, History, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { LoginHistoryEntry, UserRecord } from '@/lib/erp/types'
import { formatDateTime } from '@/lib/erp/utils'
import { subZoneKeyFor, teamUserIds, zoneSubZones } from '@/lib/erp/zones'

const initialForm = {
  name: '',
  loginId: '',
  email: '',
  phone: '',
  password: '',
  roleId: 'viewer',
  title: '',
  zoneIds: [] as string[],
  areaKeys: [] as string[],
  reportsTo: '',
  extraRoleIds: [] as string[],
}

const NO_SUPERVISOR = 'none'

const LOGIN_METHOD_LABELS: Record<LoginHistoryEntry['method'], string> = {
  email: 'Email',
  phone: 'Phone',
  loginId: 'Login ID',
}

/** A short device name from a browser's user agent, e.g. "Chrome on Android". */
function describeDevice(userAgent: string) {
  if (!userAgent) return 'Unknown device'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser'
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'another system'
  return `${browser} on ${system}`
}

function LoginHistoryDialog({ user, onClose }: { user: UserRecord | null; onClose: () => void }) {
  const { fetchLoginHistory } = useERP()
  const [result, setResult] = useState<{ userId: string; entries?: LoginHistoryEntry[]; error?: string } | null>(null)
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchLoginHistory(userId)
      .then((loaded) => !cancelled && setResult({ userId, entries: loaded }))
      .catch((reason) => !cancelled && setResult({ userId, error: reason instanceof Error ? reason.message : 'Unable to load the login history.' }))
    return () => {
      cancelled = true
    }
    // fetchLoginHistory is recreated on every render of the provider; the user is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const current = result?.userId === userId ? result : null
  const entries = current?.entries ?? null
  const error = current?.error ?? null

  return (
    <Dialog open={Boolean(user)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Login history</DialogTitle>
          <DialogDescription>
            {user?.name}: {user?.loginCount ?? 0} sign-in{user?.loginCount === 1 ? '' : 's'}. Passwords are never stored or shown;
            reset one from Edit user if needed.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : !entries ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>When</TableHead>
                  <TableHead>Signed in with</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={`${entry.at}-${index}`}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(entry.at)}</TableCell>
                    <TableCell>{LOGIN_METHOD_LABELS[entry.method] ?? entry.method}</TableCell>
                    <TableCell className="text-muted-foreground" title={entry.userAgent}>
                      {describeDevice(entry.userAgent)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.ip || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function UserManagementPanel() {
  const { data, currentUser, createUser, updateUser, deleteUser, reviewRoleRequest, hasPermission } = useERP()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [historyUser, setHistoryUser] = useState<UserRecord | null>(null)
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const roles = useMemo(() => Object.values(data?.roles ?? {}), [data?.roles])
  const users = useMemo(() => Object.values(data?.users ?? {}), [data?.users])
  const zones = useMemo(
    () => Object.values(data?.zones ?? {}).sort((left, right) => left.name.localeCompare(right.name)),
    [data?.zones]
  )
  // A user cannot report to themselves or to anyone below them.
  const supervisorCandidates = useMemo(() => {
    const excluded = editingUser ? teamUserIds(editingUser.id, users) : new Set<string>()
    return users.filter((user) => !excluded.has(user.id)).sort((left, right) => left.name.localeCompare(right.name))
  }, [editingUser, users])
  const isAdmin = currentUser?.roleId === 'admin'
  // Only an admin can make someone an admin; others still see it on a user who already is one.
  const primaryRoleOptions = roles.filter((role) => isAdmin || role.id !== 'admin' || editingUser?.roleId === 'admin')
  // Admin is only ever a main role, since it already grants everything.
  const extraRoleOptions = roles.filter((role) => role.id !== 'admin' && role.id !== form.roleId)
  const pendingRequests = users.flatMap((user) => (user.pendingRoleIds ?? []).map((roleId) => ({ user, roleId })))
  const selectedRole = data?.roles[form.roleId]
  const hasNoTerritory = selectedRole?.dataScope === 'assigned' && !form.zoneIds.length && !form.areaKeys.length

  function territoryLabel(user: UserRecord) {
    const labels = [
      ...(user.zoneIds ?? []).map((zoneId) => data?.zones[zoneId]?.name ?? 'Deleted zone'),
      ...(user.areaKeys ?? []).map((key) => {
        const [zoneId, subZone] = key.split('|')
        const zone = data?.zones[zoneId]
        const name = zoneSubZones(zone).find((area) => subZoneKeyFor(zoneId, area) === key) ?? subZone
        return `${name} (${zone?.name ?? 'Deleted zone'})`
      }),
    ]
    return labels.length ? labels.join(', ') : '—'
  }
  const canView = hasPermission('users.view')
  const canManage = hasPermission('users.edit')
  const canDelete = hasPermission('users.delete')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)

    try {
      if (editingUser) {
        await updateUser(editingUser.id, form)
        setMessage('User updated successfully.')
      } else {
        await createUser(form)
        setMessage('User created successfully.')
      }
      setForm(initialForm)
      setEditingUser(null)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save user.')
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    setShowPassword(false)
    if (next) {
      setMessage(null)
      setError(null)
    } else {
      setEditingUser(null)
      setForm(initialForm)
    }
  }

  function handleEditClick(user: UserRecord) {
    setEditingUser(user)
    setShowPassword(false)
    setForm({
      name: user.name,
      loginId: user.loginId,
      email: user.email ?? '',
      phone: user.phone,
      password: '',
      roleId: user.roleId,
      title: user.title,
      zoneIds: [...(user.zoneIds ?? [])],
      areaKeys: [...(user.areaKeys ?? [])],
      reportsTo: user.reportsTo ?? '',
      // A non-admin sees the requests they can still withdraw; an admin reviews them separately.
      extraRoleIds: [...(user.extraRoleIds ?? []), ...(isAdmin ? [] : user.pendingRoleIds ?? [])],
    })
    setMessage(null)
    setError(null)
    setOpen(true)
  }

  function handleAddClick() {
    setEditingUser(null)
    setForm(initialForm)
  }

  async function handleReview(userId: string, roleId: string, decision: 'approve' | 'reject') {
    const key = `${userId}:${roleId}`
    setReviewing(key)
    setMessage(null)
    setReviewError(null)
    try {
      await reviewRoleRequest(userId, roleId, decision)
      setMessage(decision === 'approve' ? 'Role approved.' : 'Role request rejected.')
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'Unable to review the role request.')
    } finally {
      setReviewing(null)
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) {
      return
    }

    setDeleteError(null)

    try {
      await deleteUser(deletingUser.id)
      setDeletingUser(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete user.')
    }
  }

  if (!canView) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>User access</CardTitle>
          <CardDescription>You don&apos;t have permission to view users.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contact an administrator if you need access to user management.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">Admin only</Badge>
            <Badge variant="outline" className="rounded-full">User setup</Badge>
          </div>
          <CardTitle>Current users</CardTitle>
          <CardDescription>Login ID and role map for the team already stored in Firebase.</CardDescription>
        </div>

        {canManage ? (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={handleAddClick}>
              <Plus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Edit user' : 'Create a new user'}</DialogTitle>
              <DialogDescription>
                {editingUser
                  ? 'Update the login ID, email address, phone number, and role for this team member. Leave the password blank to keep it unchanged.'
                  : 'Set the login ID, email address, password, phone number, and role for a new team member.'}
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Full name<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Rahim Ahmed"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Job title<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="e.g. Sales Executive"
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium text-foreground">
                      Phone number<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="e.g. 01711-000000"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Login credentials</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium text-foreground">Email address</p>
                    <Input
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="e.g. name@powerinternationalbd.com"
                      type="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Login ID<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      value={form.loginId}
                      onChange={(event) => setForm((current) => ({ ...current, loginId: event.target.value }))}
                      placeholder="e.g. rahim.ahmed"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Password{!editingUser ? <span className="ml-0.5 text-rose-500">*</span> : null}
                    </p>
                    <div className="relative">
                      <Input
                        value={form.password}
                        onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                        placeholder={editingUser ? 'Leave blank to keep unchanged' : 'Set a password'}
                        type={showPassword ? 'text' : 'password'}
                        className="pr-10"
                        required={!editingUser}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</p>
                <p className="text-sm font-medium text-foreground">
                  Role<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Select
                  value={form.roleId}
                  onValueChange={(value) => setForm((current) => ({ ...current, roleId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {primaryRoleOptions.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.roleId ? (
                  <p className="text-xs text-muted-foreground">
                    {roles.find((role) => role.id === form.roleId)?.description ?? 'Controls what this user can see and do.'}
                  </p>
                ) : null}

                <p className="pt-2 text-sm font-medium text-foreground">Additional roles</p>
                <div className="grid gap-1.5 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
                  {extraRoleOptions.map((role) => {
                    const awaiting =
                      editingUser?.pendingRoleIds?.includes(role.id) && !editingUser.extraRoleIds?.includes(role.id)
                    const isNew = !editingUser?.extraRoleIds?.includes(role.id) && form.extraRoleIds.includes(role.id)
                    return (
                      <label key={role.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={form.extraRoleIds.includes(role.id)}
                          onChange={() => setForm((current) => ({ ...current, extraRoleIds: toggle(current.extraRoleIds, role.id) }))}
                        />
                        <span>{role.name}</span>
                        {awaiting ? (
                          <Badge variant="outline" className="rounded-full border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                            Awaiting approval
                          </Badge>
                        ) : !isAdmin && isNew ? (
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            Needs approval
                          </Badge>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? 'The user gets the access of every role ticked here, as well as the main role.'
                    : 'The user gets the access of every role ticked here once an admin approves it. Unticking a role removes it straight away.'}
                </p>
                {isAdmin && editingUser?.pendingRoleIds?.length ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Requested and awaiting your approval:{' '}
                    {editingUser.pendingRoleIds.map((roleId) => data?.roles[roleId]?.name ?? roleId).join(', ')}. Approve or reject it
                    from the list of role requests.
                  </p>
                ) : null}
              </div>

              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Territory & reporting</p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Reports to</p>
                  <Select
                    value={form.reportsTo || NO_SUPERVISOR}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, reportsTo: value === NO_SUPERVISOR ? '' : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SUPERVISOR}>No supervisor</SelectItem>
                      {supervisorCandidates.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} — {data?.roles[user.roleId]?.name ?? user.roleId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A supervisor also sees this user&apos;s zone or area and officer records (e.g. an SR reports to an Area Sales
                    Manager, who reports to a Zonal Manager).
                  </p>
                </div>

                {zones.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Zones and areas</p>
                    <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-border/70 p-3">
                      {zones.map((zone) => {
                        const wholeZone = form.zoneIds.includes(zone.id)
                        return (
                          <div key={zone.id} className="space-y-1.5">
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                checked={wholeZone}
                                onChange={() => setForm((current) => ({ ...current, zoneIds: toggle(current.zoneIds, zone.id) }))}
                              />
                              <span>{zone.name}</span>
                              <span className="text-xs font-normal text-muted-foreground">(whole zone)</span>
                            </label>
                            {!wholeZone && zoneSubZones(zone).length ? (
                              <div className="grid gap-1 pl-6 sm:grid-cols-2">
                                {zoneSubZones(zone).map((area) => {
                                  const key = subZoneKeyFor(zone.id, area)
                                  return (
                                    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-primary"
                                        checked={form.areaKeys.includes(key)}
                                        onChange={() =>
                                          setForm((current) => ({ ...current, areaKeys: toggle(current.areaKeys, key) }))
                                        }
                                      />
                                      <span>{area}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tick a whole zone for a Zonal Manager, or single areas for an Area Sales Manager or SR. Users with zones or
                      areas ticked only see those customers and their transactions.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No zones yet. Create zones from the Credit Sheet page first.</p>
                )}

                {hasNoTerritory ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    The {selectedRole?.name} role only shows the user&apos;s own zone or area. Assign one, or this user will see no
                    customers.
                  </p>
                ) : null}
              </div>

              {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

              <DialogFooter>
                <Button type="submit" className="rounded-xl" disabled={saving}>
                  {saving ? 'Saving...' : editingUser ? 'Save changes' : 'Create user'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {message ? <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        {pendingRequests.length ? (
          <div className="mb-4 space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              Role requests awaiting admin approval ({pendingRequests.length})
            </p>
            {reviewError ? <p className="text-sm text-rose-600 dark:text-rose-400">{reviewError}</p> : null}
            {pendingRequests.map(({ user, roleId }) => {
              const key = `${user.id}:${roleId}`
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                  <p>
                    <span className="font-medium">{user.name}</span> as{' '}
                    <span className="font-medium">{data?.roles[roleId]?.name ?? roleId}</span>
                    {user.roleRequestedBy ? (
                      <span className="text-muted-foreground"> · requested by {data?.users[user.roleRequestedBy]?.name ?? 'a former user'}</span>
                    ) : null}
                  </p>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-lg"
                        disabled={reviewing === key}
                        onClick={() => void handleReview(user.id, roleId, 'approve')}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-rose-600 hover:text-rose-600 dark:text-rose-400"
                        disabled={reviewing === key}
                        onClick={() => void handleReview(user.id, roleId, 'reject')}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="rounded-full text-[10px]">Waiting for an admin</Badge>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Login ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Zone / area</TableHead>
                  <TableHead>Reports to</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Password changed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No users yet. Click &quot;Add user&quot; to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.loginId}</TableCell>
                      <TableCell>{user.phone}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <span>{data?.roles[user.roleId]?.name ?? user.roleId}</span>
                          {(user.extraRoleIds ?? []).map((roleId) => (
                            <Badge key={roleId} variant="outline" className="rounded-full text-[10px]">
                              + {data?.roles[roleId]?.name ?? roleId}
                            </Badge>
                          ))}
                          {(user.pendingRoleIds ?? []).map((roleId) => (
                            <Badge
                              key={roleId}
                              variant="outline"
                              className="rounded-full border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              {data?.roles[roleId]?.name ?? roleId} (pending)
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{territoryLabel(user)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.reportsTo ? data?.users[user.reportsTo]?.name ?? '—' : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {user.passwordChangedAt ? (
                          <>
                            {formatDateTime(user.passwordChangedAt)}
                            <span className="block text-[11px]">
                              {user.passwordChangedBy === user.id
                                ? 'by the user'
                                : `by ${data?.users[user.passwordChangedBy ?? '']?.name ?? 'an admin'}`}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            title="Login history"
                            onClick={() => setHistoryUser(user)}
                          >
                            <History className="h-4 w-4" />
                            <span className="sr-only">Login history of {user.name}</span>
                          </Button>
                          {canManage ? (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              onClick={() => handleEditClick(user)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit {user.name}</span>
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-rose-600 hover:text-rose-600 dark:text-rose-400"
                              disabled={user.id === currentUser?.id}
                              onClick={() => {
                                setDeleteError(null)
                                setDeletingUser(user)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete {user.name}</span>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={Boolean(deletingUser)}
        onOpenChange={(next) => {
          if (!next) {
            setDeletingUser(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingUser?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? <p className="text-sm text-rose-600 dark:text-rose-400">{deleteError}</p> : null}

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeletingUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => void handleConfirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoginHistoryDialog user={historyUser} onClose={() => setHistoryUser(null)} />
    </Card>
  )
}
