"use client"

import { useState } from 'react'
import { ShieldCheck, Users } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { RoleManagementPanel } from '@/components/admin/RoleManagementPanel'
import { UserManagementPanel } from '@/components/admin/UserManagementPanel'
import { useERP } from '@/lib/erp/provider'
import { cn } from '@/lib/utils'

type Tab = 'users' | 'roles'

export default function UsersPage() {
  const { hasPermission } = useERP()
  const [tab, setTab] = useState<Tab>('users')

  const canViewUsers = hasPermission('users.view')
  const canViewRoles = hasPermission('roles.view')

  const activeTab = tab === 'roles' && canViewRoles ? 'roles' : 'users'

  return (
    <AdminShell active="User & Role Management">
      <div className="space-y-6">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setTab('users')}
            disabled={!canViewUsers}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              activeTab === 'users' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-4 w-4" />
            Users
          </button>
          <button
            type="button"
            onClick={() => setTab('roles')}
            disabled={!canViewRoles}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              activeTab === 'roles' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Roles
          </button>
        </div>

        {activeTab === 'roles' ? <RoleManagementPanel /> : <UserManagementPanel />}
      </div>
    </AdminShell>
  )
}
