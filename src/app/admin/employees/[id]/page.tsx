"use client"

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { EmployeeProfile } from '@/components/admin/employees/EmployeeProfile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useERP } from '@/lib/erp/provider'

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>()
  const { data } = useERP()
  const employee = params?.id ? data?.employees[params.id] : undefined

  return (
    <AdminShell active="Employee Management">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-xl">
          <Link href="/admin/employees">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All employees
          </Link>
        </Button>
        {employee ? (
          <EmployeeProfile employee={employee} />
        ) : (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">
              {data ? 'Employee not found, or not in your team.' : 'Loading…'}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminShell>
  )
}
