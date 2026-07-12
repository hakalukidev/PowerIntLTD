"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

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
import type { UserRecord } from '@/lib/erp/types'

const initialForm = {
  name: '',
  loginId: '',
  phone: '',
  password: '',
  roleId: 'viewer',
  title: '',
}

export function UserManagementPanel() {
  const { data, currentUser, createUser, updateUser, deleteUser } = useERP()
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const roles = useMemo(() => Object.values(data?.roles ?? {}), [data?.roles])
  const users = useMemo(() => Object.values(data?.users ?? {}), [data?.users])
  const isAdmin = currentUser?.roleId === 'admin'

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
    setForm({
      name: user.name,
      loginId: user.loginId,
      phone: user.phone,
      password: '',
      roleId: user.roleId,
      title: user.title,
    })
    setMessage(null)
    setError(null)
    setOpen(true)
  }

  function handleAddClick() {
    setEditingUser(null)
    setForm(initialForm)
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

  if (!isAdmin) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>User access</CardTitle>
          <CardDescription>Only admin can create users and assign roles.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Log in with the admin account to manage team access.
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

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={handleAddClick}>
              <Plus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Edit user' : 'Create a new user'}</DialogTitle>
              <DialogDescription>
                {editingUser
                  ? 'Update the login ID, phone number, and role for this team member. Leave the password blank to keep it unchanged.'
                  : 'Set the login ID, password, phone number, and role for a new team member.'}
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
                    <Input
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingUser ? 'Leave blank to keep unchanged' : 'Set a password'}
                      type="password"
                      required={!editingUser}
                    />
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
                    {roles.map((role) => (
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
      </CardHeader>
      <CardContent>
        {message ? <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Login ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No users yet. Click &quot;Add user&quot; to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.loginId}</TableCell>
                      <TableCell>{user.phone}</TableCell>
                      <TableCell>{data?.roles[user.roleId]?.name ?? user.roleId}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => handleEditClick(user)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {user.name}</span>
                          </Button>
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
    </Card>
  )
}
