"use client"

import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useERP } from '@/lib/erp/provider'

type QuickCreateWarehouseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (warehouseId: string) => void
}

export function QuickCreateWarehouseDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateWarehouseDialogProps) {
  const { saveWarehouse } = useERP()
  const [name, setName] = useState(initialName)
  const [location, setLocation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setLocation('')
      setFeedback(null)
    }
  }, [open, initialName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      const warehouseId = await saveWarehouse({ name, location })
      onCreated(warehouseId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save warehouse.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new warehouse</DialogTitle>
          <DialogDescription>Keep storage names and locations clean so product assignment stays clear.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Warehouse name<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dhaka Main Warehouse"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Location<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Mirpur, Dhaka" required />
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create warehouse'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
