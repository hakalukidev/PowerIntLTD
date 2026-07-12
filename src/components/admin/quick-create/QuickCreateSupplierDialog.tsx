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

type QuickCreateSupplierDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (supplierId: string) => void
}

export function QuickCreateSupplierDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateSupplierDialogProps) {
  const { saveSupplier } = useERP()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setPhone('')
      setCompany('')
      setFeedback(null)
    }
  }, [open, initialName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      const supplierId = await saveSupplier({ name, phone, company })
      onCreated(supplierId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save supplier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new supplier</DialogTitle>
          <DialogDescription>
            Just the essentials — import, LC, and cost details can be filled in later from the suppliers list.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Supplier name<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Guangzhou Lift Co."
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Phone number<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 01711-000000" required />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Company <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Guangzhou Lift Co. Ltd." />
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
