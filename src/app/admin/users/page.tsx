import { AdminShell } from '@/components/admin/AdminShell'
import { UserManagementPanel } from '@/components/admin/UserManagementPanel'

export default function UsersPage() {
  return (
    <AdminShell active="User & Role Management">
      <div className="space-y-6">
        <UserManagementPanel />
      </div>
    </AdminShell>
  )
}
