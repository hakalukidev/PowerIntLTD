"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useERP } from '@/lib/erp/provider'
import type { ZoneArea, ZoneRecord } from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'
import { customerZoneId } from '@/lib/erp/zones'

type ZoneFormState = {
  name: string
  thanas: ZoneArea[]
  managerIds: string[]
}

function emptyZoneForm(): ZoneFormState {
  return { name: '', thanas: [], managerIds: [] }
}

const areaKey = (area: ZoneArea) => `${area.district}|${area.thana}`
const sameThanaName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

type ZoneManagerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open straight into the "new zone" form instead of the zone list. */
  startWithNewZone?: boolean
}

export function ZoneManagerDialog({ open, onOpenChange, startWithNewZone = false }: ZoneManagerDialogProps) {
  const { data, users, saveZone, deleteZone, hasPermission } = useERP()
  const canDelete = hasPermission('zones.delete')
  const zones = useMemo(() => toArray(data?.zones).sort((left, right) => left.name.localeCompare(right.name)), [data?.zones])
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const activeUsers = useMemo(() => users.filter((user) => user.status === 'active'), [users])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ZoneFormState>(emptyZoneForm)
  const [thanaDraft, setThanaDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const customer of customers) {
      const id = customerZoneId(customer, zones)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [customers, zones])

  // Another zone that already has a thana by this name, so overlaps are visible while editing.
  function thanaOwner(thana: string) {
    return zones.find((zone) => zone.id !== editingId && zone.thanas.some((area) => sameThanaName(area.thana, thana)))?.name
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyZoneForm())
    setThanaDraft('')
    setError(null)
    setFormOpen(true)
  }

  function startEdit(zone: ZoneRecord) {
    setEditingId(zone.id)
    setForm({ name: zone.name, thanas: zone.thanas, managerIds: zone.managerIds })
    setThanaDraft('')
    setError(null)
    setFormOpen(true)
  }

  useEffect(() => {
    if (!open) return
    if (startWithNewZone) {
      startCreate()
    } else {
      setFormOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startWithNewZone])

  function removeThana(area: ZoneArea) {
    setForm((current) => ({ ...current, thanas: current.thanas.filter((item) => areaKey(item) !== areaKey(area)) }))
  }

  function withThana(thanas: ZoneArea[], name: string) {
    const thana = name.trim()
    if (!thana || thanas.some((area) => sameThanaName(area.thana, thana))) return thanas
    return [...thanas, { district: '', thana }]
  }

  function addThana() {
    setForm((current) => ({ ...current, thanas: withThana(current.thanas, thanaDraft) }))
    setThanaDraft('')
  }

  // Creating a zone whose name is already taken adds to that zone instead of failing.
  const matchingZone = editingId ? null : zones.find((zone) => sameThanaName(zone.name, form.name))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // A sub-zone typed but not yet added with the button is still saved.
      const thanas = withThana(form.thanas, thanaDraft)
      if (matchingZone) {
        await saveZone(
          {
            name: matchingZone.name,
            thanas: thanas.reduce((merged, area) => withThana(merged, area.thana), matchingZone.thanas),
            managerIds: Array.from(new Set([...matchingZone.managerIds, ...form.managerIds])),
          },
          matchingZone.id
        )
      } else {
        await saveZone({ ...form, thanas }, editingId ?? undefined)
      }
      setThanaDraft('')
      if (startWithNewZone && !editingId) onOpenChange(false)
      setFormOpen(false)
      setEditingId(null)
      setForm(emptyZoneForm())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save zone.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(zone: ZoneRecord) {
    if (!window.confirm(`Delete ${zone.name}? Its dealers will be left without a zone until they are moved to another one.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteZone(zone.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete zone.')
    } finally {
      setBusy(false)
    }
  }

  const userName = (id: string) => users.find((user) => user.id === id)?.name ?? 'Removed user'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zones</DialogTitle>
          <DialogDescription>
            Create zones and the sub-zones inside them. Dealers are filed under a zone and sub-zone, and users responsible for a zone only see that zone&apos;s dealers.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}

        {formOpen ? (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Zone name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Borishal Zone"
                required
              />
              {matchingZone ? (
                <p className="text-xs text-primary">
                  {matchingZone.name} already exists
                  {matchingZone.thanas.length ? ` (sub-zones: ${matchingZone.thanas.map((area) => area.thana).join(', ')})` : ''}. The
                  sub-zones and users below will be added to it.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Sub-zones</p>
              {form.thanas.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {form.thanas.map((area) => {
                    const owner = thanaOwner(area.thana)
                    return (
                      <span key={areaKey(area)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {area.thana}
                        {owner ? <span className="text-amber-600">· also in {owner}</span> : null}
                        <button type="button" onClick={() => removeThana(area)} aria-label={`Remove ${area.thana}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No sub-zones yet. Dealers can still be assigned to the zone itself.</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={thanaDraft}
                  onChange={(event) => setThanaDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addThana()
                    }
                  }}
                  placeholder="Sub-zone name, e.g. Kotwali"
                />
                <Button type="button" variant="outline" className="shrink-0 rounded-lg" onClick={addThana} disabled={!thanaDraft.trim()}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Dealers pick one of these sub-zones when they are added to this zone.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Responsible users</p>
              <div className="grid gap-1.5 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
                {activeUsers.map((user) => (
                  <label key={user.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={form.managerIds.includes(user.id)}
                      onChange={() => setForm((current) => ({ ...current, managerIds: toggle(current.managerIds, user.id) }))}
                    />
                    <span>
                      {user.name}
                      <span className="ml-1 text-xs text-muted-foreground">{user.title || user.roleId}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Admins always see every zone, even when listed here.</p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => (startWithNewZone && !editingId ? onOpenChange(false) : setFormOpen(false))}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={busy}>
                {busy ? 'Saving...' : editingId ? 'Save zone' : matchingZone ? `Add to ${matchingZone.name}` : 'Create zone'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {zones.length ? (
              zones.map((zone) => (
                <div key={zone.id} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">
                      {zone.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {customerCounts.get(zone.id) ?? 0} dealers
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sub-zones:{' '}
                      {zone.thanas.length
                        ? zone.thanas.map((area) => area.thana).join(', ')
                        : 'none'}
                    </p>
                    {zone.districts.length ? (
                      <p className="text-xs text-muted-foreground">Also holds older dealers saved with district {zone.districts.join(', ')}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Responsible: {zone.managerIds.length ? zone.managerIds.map(userName).join(', ') : 'nobody yet'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => startEdit(zone)} aria-label={`Edit ${zone.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleDelete(zone)}
                        aria-label={`Delete ${zone.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No zones yet. Create the first one to start grouping dealers.</p>
            )}
            <div className="flex justify-end">
              <Button type="button" className="rounded-xl" onClick={startCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                New zone
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
