import { createDefaultERPData } from './defaultData'
import type { PermissionDefinition, RoleRecord } from './types'

/**
 * Roles saved before the permission catalog was split into per-module view/edit/delete
 * grants still store these coarse ids. They expand to their closest granular equivalents
 * so existing roles keep the access they had instead of losing it silently.
 */
const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  view_dashboard: ['dashboard.view'],
  view_products: ['inventory.view'],
  manage_products: ['inventory.view', 'inventory.edit'],
  manage_orders: ['sales.view', 'sales.edit', 'couriers.view', 'couriers.edit'],
  view_reports: ['reports.view', 'customers.view'],
  view_finance: ['suppliers.view', 'finance.view', 'sellers.view'],
  view_employees: ['employees.view', 'sales_target.view', 'salary.view'],
  manage_employees: [
    'employees.view',
    'employees.edit',
    'sales_target.view',
    'sales_target.edit',
    'salary.view',
    'salary.edit',
  ],
}

let defaults: { roles: Record<string, RoleRecord>; permissions: Record<string, PermissionDefinition> } | null = null

function defaultRolesAndPermissions() {
  if (!defaults) {
    const data = createDefaultERPData()
    defaults = { roles: data.roles, permissions: data.permissions }
  }
  return defaults
}

/** The permission catalog every role is checked against. */
export function permissionCatalog() {
  return defaultRolesAndPermissions().permissions
}

/**
 * The roles as the ERP uses them: the built-in roles (such as Zonal Manager) with any
 * stored changes on top, legacy permission ids translated, and the admin role always
 * holding every permission. The app and the server-side permission checks both use
 * this, so a role means the same thing on both sides.
 */
export function resolveRoles(stored?: Record<string, RoleRecord> | null): Record<string, RoleRecord> {
  const { roles: builtIn, permissions: catalog } = defaultRolesAndPermissions()
  const merged: Record<string, RoleRecord> = { ...builtIn }
  for (const [id, role] of Object.entries(stored ?? {})) {
    merged[id] = builtIn[id] ? { ...builtIn[id], ...role } : role
  }

  return Object.fromEntries(
    Object.entries(merged).map(([id, role]) => {
      if (id === 'admin') {
        return [id, { ...role, permissions: Object.keys(catalog), dataScope: 'all' }]
      }

      const resolved = new Set<string>()
      for (const permission of role.permissions ?? []) {
        const migrated = LEGACY_PERMISSION_MAP[permission]
        if (migrated) {
          migrated.forEach((next) => resolved.add(next))
        } else if (catalog[permission]) {
          resolved.add(permission)
        }
      }

      return [id, { ...role, permissions: Array.from(resolved), zoneIds: role.zoneIds ?? [], dataScope: role.dataScope ?? 'all' }]
    })
  )
}
