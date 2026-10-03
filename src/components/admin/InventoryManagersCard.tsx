"use client"

import { useState } from 'react'
import { KeyRound } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useERP } from '@/lib/erp/provider'
import { hasPermission as roleHasPermission, userRoleIds, userRoleNames } from '@/lib/erp/utils'

/** Lets an admin put people in charge of inventory, stock and the warehouses, whatever their role. */
export function InventoryManagersCard() {
  const { data, users, updateSettings } = useERP()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const managerIds = data?.settings.inventoryManagerIds ?? []
  const candidates = users.filter((user) => user.status === 'active' && !userRoleIds(user).includes('admin'))

  async function toggle(userId: string, allowed: boolean) {
    const next = allowed ? Array.from(new Set([...managerIds, userId])) : managerIds.filter((id) => id !== userId)
    setBusyId(userId)
    setError(null)
    try {
      await updateSettings({ inventoryManagerIds: next })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save who manages inventory.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Who manages inventory &amp; warehouses
        </CardTitle>
        <CardDescription>
          Admins always can. Turn it on for anyone else to let them add, edit and delete products, receive purchases, run the
          warehouses and handle damage products. A whole role gets the same through the Inventory Management permissions under
          User &amp; Role Management (the Inventory &amp; Stock Manager role has them).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other active users.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((user) => {
              const byRole = roleHasPermission(data, user, 'inventory.edit')
              return (
                <li key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {byRole ? `Through role: ${userRoleNames(data?.roles, user)}` : user.title || user.loginId}
                    </p>
                  </div>
                  <Switch
                    checked={byRole || managerIds.includes(user.id)}
                    disabled={byRole || busyId === user.id}
                    onCheckedChange={(checked) => void toggle(user.id, checked)}
                    aria-label={`Let ${user.name} manage inventory and warehouses`}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
