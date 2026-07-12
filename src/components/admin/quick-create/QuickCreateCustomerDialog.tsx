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

type QuickCreateCustomerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (customerId: string) => void
}

export function QuickCreateCustomerDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateCustomerDialogProps) {
  const { saveCustomer } = useERP()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setPhone('')
      setCompany('')
      setLocation('')
      setFeedback(null)
    }
  }, [open, initialName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      const customerId = await saveCustomer({ name, phone, company, location })
      onCreated(customerId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new customer</DialogTitle>
          <DialogDescription>
            Just the essentials — you can add due balance or service notes later from the customer list.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Customer name<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Md. Karim Uddin"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Phone number<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 01711-000000"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Company <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Karim Traders" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Location <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Mirpur, Dhaka" />
            </div>
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
