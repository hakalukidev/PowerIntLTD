"use client"

import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { CheckCheck, Pencil, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { PermissionDefinition, RoleDataScope, RoleRecord, UserRecord } from '@/lib/erp/types'

const initialForm = {
  name: '',
  description: '',
  permissions: [] as string[],
  zoneIds: [] as string[],
  dataScope: 'all' as RoleDataScope,
  requiresApproval: false,
}

const MATRIX_ACTIONS = [
  { action: 'view', label: 'View' },
  { action: 'create', label: 'Create' },
  { action: 'edit', label: 'Edit' },
  { action: 'delete', label: 'Delete' },
] as const

type MatrixAction = (typeof MATRIX_ACTIONS)[number]['action']

type ModuleRow = {
  prefix: string
  name: string
  permissions: Partial<Record<MatrixAction, PermissionDefinition>>
}

type MatrixGroup = {
  category: string
  modules: ModuleRow[]
  /** Permissions that are not View/Create/Edit/Delete (the two approval stages): one checkbox each. */
  others: PermissionDefinition[]
}

function isMatrixAction(action: PermissionDefinition['action']): action is MatrixAction {
  return MATRIX_ACTIONS.some((entry) => entry.action === action)
}

/** "View the credit sheet" → "Credit sheet". */
function moduleName(permission: PermissionDefinition) {
  const noun = permission.label.replace(/^\S+\s+/, '').replace(/^the\s+/i, '')
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

function buildMatrix(permissions: PermissionDefinition[]): MatrixGroup[] {
  const groups = new Map<string, MatrixGroup>()
  const modules = new Map<string, ModuleRow>()
  for (const permission of permissions) {
    const group = groups.get(permission.category) ?? { category: permission.category, modules: [], others: [] }
    groups.set(permission.category, group)
    if (!isMatrixAction(permission.action)) {
      group.others.push(permission)
      continue
    }
    const prefix = permission.id.slice(0, permission.id.lastIndexOf('.'))
    let row = modules.get(prefix)
    if (!row) {
      row = { prefix, name: moduleName(permission), permissions: {} }
      modules.set(prefix, row)
      group.modules.push(row)
    }
    row.permissions[permission.action] = permission
    if (permission.action === 'view') row.name = moduleName(permission)
  }
  return Array.from(groups.values())
}

function rowPermissions(row: ModuleRow) {
  return MATRIX_ACTIONS.flatMap(({ action }) => (row.permissions[action] ? [row.permissions[action]!.id] : []))
}

function MatrixCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  label: string
  onChange: () => void
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-primary"
      aria-label={label}
      title={label}
      checked={checked}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate && !checked
      }}
      onChange={onChange}
    />
  )
}

/**
 * One row per module, grouped by category, with a View / Create / Edit / Delete checkbox each.
 * Ticking Create, Edit or Delete also ticks View (they are unusable without it), and unticking
 * View clears the module's other actions. The approval stages get one checkbox per row.
 */
function PermissionMatrix({
  allPermissions,
  selected,
  onChange,
}: {
  allPermissions: PermissionDefinition[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const groups = useMemo(() => buildMatrix(allPermissions), [allPermissions])
  const query = search.trim().toLowerCase()

  const visibleGroups = groups
    .map((group) => {
      if (!query || group.category.toLowerCase().includes(query)) return group
      const matches = (text: string) => text.toLowerCase().includes(query)
      return {
        ...group,
        modules: group.modules.filter(
          (row) => matches(row.name) || Object.values(row.permissions).some((permission) => matches(permission!.label))
        ),
        others: group.others.filter((permission) => matches(permission.label) || matches(permission.description)),
      }
    })
    .filter((group) => group.modules.length > 0 || group.others.length > 0)
  const visibleModules = visibleGroups.flatMap((group) => group.modules)

  /** Applies additions and removals, keeping View in step with the other actions. */
  function apply(add: string[], remove: string[]) {
    const next = new Set(selected)
    remove.forEach((id) => next.delete(id))
    add.forEach((id) => next.add(id))
    for (const group of groups) {
      for (const row of group.modules) {
        const view = row.permissions.view?.id
        if (!view) continue
        const others = rowPermissions(row).filter((id) => id !== view)
        if (remove.includes(view)) others.forEach((id) => next.delete(id))
        else if (others.some((id) => add.includes(id) && next.has(id))) next.add(view)
      }
    }
    onChange(Array.from(next))
  }

  function toggle(id: string) {
    if (selectedSet.has(id)) apply([], [id])
    else apply([id], [])
  }

  function toggleIds(ids: string[]) {
    if (ids.every((id) => selectedSet.has(id))) apply([], ids)
    else apply(ids, [])
  }

  function columnIds(action: MatrixAction) {
    return visibleModules.flatMap((row) => (row.permissions[action] ? [row.permissions[action]!.id] : []))
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search permissions by name or section..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {selected.length} of {allPermissions.length} permissions granted
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={selected.length === allPermissions.length}
            onClick={() => onChange(allPermissions.map((p) => p.id))}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Add full access
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onChange([])}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
            Remove all access
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-2xl border border-border/70" data-testid="permission-matrix">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-border/70 bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Module
              </th>
              {MATRIX_ACTIONS.map(({ action, label }) => {
                const ids = columnIds(action)
                const count = ids.filter((id) => selectedSet.has(id)).length
                return (
                  <th
                    key={action}
                    className="sticky top-0 z-20 w-20 border-b border-border/70 bg-muted px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <label className="flex cursor-pointer flex-col items-center gap-1">
                      {label}
                      <MatrixCheckbox
                        label={`All ${label} permissions`}
                        checked={ids.length > 0 && count === ids.length}
                        indeterminate={count > 0}
                        onChange={() => toggleIds(ids)}
                      />
                    </label>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  No permissions match your search.
                </td>
              </tr>
            ) : (
              visibleGroups.map((group) => (
                <Fragment key={group.category}>
                  <tr>
                    <th
                      colSpan={5}
                      scope="colgroup"
                      className="border-b border-border/70 bg-background px-3 pb-1 pt-3 text-left text-xs font-semibold text-foreground"
                    >
                      <span className="sticky left-3">{group.category}</span>
                    </th>
                  </tr>
                  {group.modules.map((row) => {
                    const ids = rowPermissions(row)
                    const count = ids.filter((id) => selectedSet.has(id)).length
                    return (
                      <tr key={row.prefix} className="group">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-border/40 bg-background px-3 py-1.5 text-left font-normal group-hover:bg-muted"
                        >
                          <label className="flex cursor-pointer items-center gap-2 pl-3">
                            <MatrixCheckbox
                              label={`All ${row.name} permissions`}
                              checked={count === ids.length}
                              indeterminate={count > 0}
                              onChange={() => toggleIds(ids)}
                            />
                            <span className="max-w-[160px] truncate sm:max-w-none" title={row.name}>
                              {row.name}
                            </span>
                          </label>
                        </th>
                        {MATRIX_ACTIONS.map(({ action }) => {
                          const permission = row.permissions[action]
                          return (
                            <td key={action} className="border-b border-border/40 px-2 py-1.5 text-center group-hover:bg-muted">
                              {permission ? (
                                <MatrixCheckbox
                                  label={permission.label}
                                  checked={selectedSet.has(permission.id)}
                                  onChange={() => toggle(permission.id)}
                                />
                              ) : (
                                <span className="text-muted-foreground" aria-label={`No ${action} for ${row.name}`}>
                                  —
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {group.others.map((permission) => (
                    <tr key={permission.id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-border/40 bg-background px-3 py-1.5 text-left font-normal group-hover:bg-muted"
                      >
                        <span className="block max-w-[160px] pl-3 sm:max-w-none">{permission.label}</span>
                      </th>
                      <td colSpan={4} className="border-b border-border/40 px-2 py-1.5 group-hover:bg-muted">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <MatrixCheckbox
                            label={permission.label}
                            checked={selectedSet.has(permission.id)}
                            onChange={() => toggle(permission.id)}
                          />
                          <span>Allowed — {permission.description}</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RoleManagementPanel() {
  const { data, users, hasPermission, createRole, updateRole, deleteRole } = useERP()
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null)
  const [deletingRole, setDeletingRole] = useState<RoleRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reassignRoleId, setReassignRoleId] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canView = hasPermission('roles.view')
  const canCreate = hasPermission('roles.create')
  const canManage = hasPermission('roles.edit')
  const canDelete = hasPermission('roles.delete')

  const roles = useMemo(() => Object.values(data?.roles ?? {}), [data?.roles])
  const allPermissions = useMemo(() => Object.values(data?.permissions ?? {}), [data?.permissions])
  const zones = useMemo(
    () => Object.values(data?.zones ?? {}).sort((left, right) => left.name.localeCompare(right.name)),
    [data?.zones]
  )

  const usersByRole = useMemo(() => {
    const map = new Map<string, UserRecord[]>()
    for (const user of users) {
      const list = map.get(user.roleId) ?? []
      list.push(user)
      map.set(user.roleId, list)
    }
    return map
  }, [users])

  const affectedUsers = deletingRole ? usersByRole.get(deletingRole.id) ?? [] : []
  const reassignCandidates = roles.filter((role) => role.id !== deletingRole?.id)

  if (!canView) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Role access</CardTitle>
          <CardDescription>You don&apos;t have permission to view roles.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contact an administrator if you need access to role management.
        </CardContent>
      </Card>
    )
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setMessage(null)
      setError(null)
    } else {
      setEditingRole(null)
      setForm(initialForm)
    }
  }

  function handleAddClick() {
    setEditingRole(null)
    setForm(initialForm)
  }

  function handleEditClick(role: RoleRecord) {
    setEditingRole(role)
    setForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      zoneIds: [...(role.zoneIds ?? [])],
      dataScope: role.dataScope ?? 'all',
      requiresApproval: Boolean(role.requiresApproval),
    })
    setMessage(null)
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)

    try {
      if (editingRole) {
        await updateRole(editingRole.id, form)
        setMessage('Role updated successfully.')
      } else {
        await createRole(form)
        setMessage('Role created successfully.')
      }
      setForm(initialForm)
      setEditingRole(null)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save role.')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRole) return

    setDeleteError(null)

    if (affectedUsers.length > 0 && !reassignRoleId) {
      setDeleteError('Choose a role to move these users to before deleting.')
      return
    }

    setDeleting(true)

    try {
      await deleteRole(deletingRole.id, affectedUsers.length > 0 ? reassignRoleId : undefined)
      setDeletingRole(null)
      setReassignRoleId('')
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete role.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Access control
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {roles.length} role{roles.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <CardTitle>Roles & permissions</CardTitle>
          <CardDescription>
            Define custom roles and tick exactly which view, create, edit, and delete permissions each one grants.
          </CardDescription>
        </div>

        {canCreate || canManage ? (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            {canCreate ? (
              <DialogTrigger asChild>
                <Button className="rounded-xl" onClick={handleAddClick}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create role
                </Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editingRole ? 'Edit role' : 'Create a new role'}</DialogTitle>
                <DialogDescription>
                  {editingRole
                    ? 'Update the role name, description, and permission grants.'
                    : 'Name the role and choose which permissions it grants across the ERP.'}
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Role name<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Warehouse Supervisor"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Description</p>
                    <Textarea
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="What this role is for"
                      className="min-h-[38px]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Permissions<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <PermissionMatrix
                    allPermissions={allPermissions}
                    selected={form.permissions}
                    onChange={(permissions) => setForm((current) => ({ ...current, permissions }))}
                  />
                </div>

                {editingRole?.id !== 'admin' ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Data scope</p>
                    <Select
                      value={form.dataScope}
                      onValueChange={(value) => setForm((current) => ({ ...current, dataScope: value as RoleDataScope }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All records</SelectItem>
                        <SelectItem value="assigned">Only the user&apos;s own zone or area, and their team</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      For Zonal Managers, Area Sales Managers, and SRs: each user only sees the customers and transactions of the
                      zones or areas assigned to them on the Users tab, and the officers who report to them.
                    </p>
                  </div>
                ) : null}

                <p className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                  Every add, edit and delete (orders, deposits, ledger entries, payments, expenses, purchases, dealers and suppliers)
                  waits for a user with <span className="font-medium text-foreground">Authorize submissions</span>, then one with{' '}
                  <span className="font-medium text-foreground">Final approval</span>. Both are in the permission list under Approvals.
                </p>

                {editingRole?.id !== 'admin' ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Zone access</p>
                    {zones.length ? (
                      <div className="grid gap-1.5 rounded-xl border border-border/70 p-3 sm:grid-cols-3">
                        {zones.map((zone) => (
                          <label key={zone.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={form.zoneIds.includes(zone.id)}
                              onChange={() =>
                                setForm((current) => ({
                                  ...current,
                                  zoneIds: current.zoneIds.includes(zone.id)
                                    ? current.zoneIds.filter((id) => id !== zone.id)
                                    : [...current.zoneIds, zone.id],
                                }))
                              }
                            />
                            <span>{zone.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No zones yet. Create zones from the Credit Sheet page first.</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Tick zones to limit this role: its users will only see customers from those zones in CRM and the credit sheet.
                      Leave all unticked for no limit.
                    </p>
                  </div>
                ) : null}

                {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

                <DialogFooter>
                  <Button type="submit" className="rounded-xl" disabled={saving || form.permissions.length === 0}>
                    {saving ? 'Saving...' : editingRole ? 'Save changes' : 'Create role'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {message ? <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Zones</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No roles yet. Click &quot;Create role&quot; to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => {
                    const userCount = usersByRole.get(role.id)?.length ?? 0
                    const isProtected = role.id === 'admin'

                    return (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {role.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full">
                            {role.permissions.length}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {role.zoneIds?.length
                            ? role.zoneIds.map((zoneId) => data?.zones[zoneId]?.name ?? 'Deleted zone').join(', ')
                            : role.dataScope === 'assigned'
                              ? "User's own zone/area"
                              : 'All zones'}
                        </TableCell>
                        <TableCell>{userCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canManage ? (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => handleEditClick(role)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit {role.name}</span>
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                disabled={isProtected}
                                title={isProtected ? 'The Admin role cannot be deleted.' : undefined}
                                onClick={() => {
                                  setDeleteError(null)
                                  setReassignRoleId('')
                                  setDeletingRole(role)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete {role.name}</span>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={Boolean(deletingRole)}
        onOpenChange={(next) => {
          if (!next) {
            setDeletingRole(null)
            setDeleteError(null)
            setReassignRoleId('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingRole?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {affectedUsers.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-foreground">
                {affectedUsers.length} user{affectedUsers.length === 1 ? ' is' : 's are'} currently assigned to this
                role: <span className="font-medium">{affectedUsers.map((user) => user.name).join(', ')}</span>.
                Choose a role to move {affectedUsers.length === 1 ? 'them' : 'them'} to before deleting.
              </p>
              <Select value={reassignRoleId} onValueChange={setReassignRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Reassign affected users to..." />
                </SelectTrigger>
                <SelectContent>
                  {reassignCandidates.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {deleteError ? <p className="text-sm text-rose-600 dark:text-rose-400">{deleteError}</p> : null}

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeletingRole(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleting || (affectedUsers.length > 0 && !reassignRoleId)}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? 'Deleting...' : affectedUsers.length > 0 ? 'Reassign & delete' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
