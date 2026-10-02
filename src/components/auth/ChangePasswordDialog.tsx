"use client"

import { useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
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
import { useERP } from '@/lib/erp/provider'

const emptyForm = { current: '', next: '', confirm: '' }

/** Lets the signed-in user change their own password. The admin panel shows when it changed. */
export function ChangePasswordDialog({ trigger }: { trigger: ReactNode }) {
  const { changePassword } = useERP()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    setForm(emptyForm)
    setError(null)
    setDone(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (form.next.length < 8) {
      setError('The new password must be at least 8 characters long.')
      return
    }
    if (form.next !== form.confirm) {
      setError('The new passwords do not match.')
      return
    }

    setSaving(true)
    try {
      await changePassword(form.current, form.next)
      setForm(emptyForm)
      setDone(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one of at least 8 characters.</DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Your password was changed. Use the new password next time you sign in.
            </p>
            <DialogFooter>
              <Button className="rounded-xl" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="current-password" className="text-sm font-medium text-foreground">
                Current password
              </label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={(event) => setForm((current) => ({ ...current, current: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={form.next}
                onChange={(event) => setForm((current) => ({ ...current, next: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
                required
              />
            </div>

            {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

            <DialogFooter>
              <Button type="submit" className="rounded-xl" disabled={saving}>
                {saving ? 'Saving...' : 'Change password'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
