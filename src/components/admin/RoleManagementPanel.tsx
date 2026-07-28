"use client"

import { useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCheck, Pencil, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'

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
import type { PermissionDefinition, RoleRecord, UserRecord } from '@/lib/erp/types'

const initialForm = {
  name: '',
  description: '',
  permissions: [] as string[],
}

function groupByCategory(permissions: PermissionDefinition[]) {
  const map = new Map<string, PermissionDefinition[]>()
  for (const permission of permissions) {
    const list = map.get(permission.category) ?? []
    list.push(permission)
    map.set(permission.category, list)
  }
  return Array.from(map.entries())
}

function PermissionPicker({
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
  const grouped = useMemo(() => groupByCategory(allPermissions), [allPermissions])
  const query = search.trim().toLowerCase()

  function matches(permission: PermissionDefinition) {
    if (!query) return true
    return (
      permission.label.toLowerCase().includes(query) ||
      permission.category.toLowerCase().includes(query) ||
      permission.description.toLowerCase().includes(query)
    )
  }

  const availableGroups = grouped
    .map(([category, perms]) => [category, perms.filter((p) => !selectedSet.has(p.id) && matches(p))] as const)
    .filter(([, perms]) => perms.length > 0)

  const assignedGroups = grouped
    .map(([category, perms]) => [category, perms.filter((p) => selectedSet.has(p.id) && matches(p))] as const)
    .filter(([, perms]) => perms.length > 0)

  function add(id: string) {
    if (!selectedSet.has(id)) onChange([...selected, id])
  }

  function addAll() {
    onChange(allPermissions.map((p) => p.id))
  }

  function removeAll() {
    onChange([])
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id))
  }

  function addCategory(category: string) {
    const ids = grouped.find(([c]) => c === category)?.[1].map((p) => p.id) ?? []
    const next = new Set(selected)
    ids.forEach((id) => next.add(id))
    onChange(Array.from(next))
  }

  function removeCategory(category: string) {
    const ids = new Set(grouped.find(([c]) => c === category)?.[1].map((p) => p.id) ?? [])
    onChange(selected.filter((id) => !ids.has(id)))
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  }

  function allowDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function handleDropAdd(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (id) add(id)
  }

  function handleDropRemove(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (id) remove(id)
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
            onClick={addAll}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Add full access
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={removeAll}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
            Remove all access
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className="flex max-h-[420px] flex-col rounded-2xl border border-border/70"
          onDragOver={allowDrop}
          onDrop={handleDropRemove}
        >
          <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Available permissions
            </p>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {allPermissions.length - selected.length}
            </Badge>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {availableGroups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No permissions match your search.</p>
            ) : (
              availableGroups.map(([category, perms]) => (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{category}</p>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline"
                      onClick={() => addCategory(category)}
                    >
                      Add all
                    </button>
                  </div>
                  <div className="space-y-1">
                    {perms.map((permission) => (
                      <div
                        key={permission.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, permission.id)}
                        className="flex cursor-grab items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm active:cursor-grabbing"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{permission.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{permission.description}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => add(permission.id)}
                          title="Add permission"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="flex max-h-[420px] flex-col rounded-2xl border border-primary/30 bg-primary/[0.03]"
          onDragOver={allowDrop}
          onDrop={handleDropAdd}
        >
          <div className="flex items-center justify-between border-b border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Assigned permissions</p>
            <Badge className="rounded-full bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
              {selected.length}
            </Badge>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {assignedGroups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Drag a permission here, or click its arrow, to grant it to this role.
              </p>
            ) : (
              assignedGroups.map(([category, perms]) => (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{category}</p>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
                      onClick={() => removeCategory(category)}
                    >
                      Remove all
                    </button>
                  </div>
                  <div className="space-y-1">
                    {perms.map((permission) => (
                      <div
                        key={permission.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, permission.id)}
                        className="flex cursor-grab items-center gap-2 rounded-lg border border-primary/20 bg-background px-2.5 py-1.5 text-sm active:cursor-grabbing"
                      >
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => remove(permission.id)}
                          title="Remove permission"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{permission.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{permission.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
  const canManage = hasPermission('roles.edit')
  const canDelete = hasPermission('roles.delete')

  const roles = useMemo(() => Object.values(data?.roles ?? {}), [data?.roles])
  const allPermissions = useMemo(() => Object.values(data?.permissions ?? {}), [data?.permissions])

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
            Define custom roles and pick exactly which view, edit, and delete permissions each one grants.
          </CardDescription>
        </div>

        {canManage ? (
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" onClick={handleAddClick}>
                <Plus className="mr-2 h-4 w-4" />
                Create role
              </Button>
            </DialogTrigger>
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
                  <PermissionPicker
                    allPermissions={allPermissions}
                    selected={form.permissions}
                    onChange={(permissions) => setForm((current) => ({ ...current, permissions }))}
                  />
                </div>

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
                  <TableHead>Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
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
