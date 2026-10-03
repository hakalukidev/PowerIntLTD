"use client"

import { useMemo } from 'react'

import { AdminShell } from '@/components/admin/AdminShell'
import { EmployeeProfile } from '@/components/admin/employees/EmployeeProfile'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'
import { toArray } from '@/lib/erp/utils'

/** The signed-in user's own employee profile, found through the login linked to it. */
export default function MyProfilePage() {
  const { data, currentUser } = useERP()
  const employee = useMemo(
    () => (currentUser ? toArray(data?.employees).find((entry) => entry.userId === currentUser.id) : undefined),
    [currentUser, data?.employees]
  )

  return (
    <AdminShell active="My Profile">
      {employee ? (
        <EmployeeProfile employee={employee} selfView />
      ) : (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {data
              ? 'Your login is not linked to an employee profile yet. Ask an admin to link it from Employee Management.'
              : 'Loading…'}
          </CardContent>
        </Card>
      )}
    </AdminShell>
  )
}
