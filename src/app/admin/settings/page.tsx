import { ModuleFeatureScreen } from '@/components/admin/ModuleFeatureScreen'

export default function SettingsPage() {
  return (
    <ModuleFeatureScreen
      active="Settings"
      eyebrow="Settings"
      title="Company, warehouse, currency, and policy defaults"
      description="This section keeps the global operational defaults together so finance, inventory, and returns all read from the same configuration layer."
      highlights={[
        { label: 'Company profile', value: 'Central', note: 'Keep business identity in one place.' },
        { label: 'Warehouses', value: 'Managed list', note: 'Add or rename storage locations here.' },
        { label: 'Currency', value: 'Base + source', note: 'Store the reporting base currency and exchange source.' },
        { label: 'Policies', value: 'Defaults', note: 'Control return windows and refund rules.' },
      ]}
      sections={[
        {
          title: 'Business defaults',
          description: 'These are the cross-module settings that other workflows should read from.',
          items: [
            { title: 'Company profile', description: 'Business identity, address, and brand details.', status: 'Ready' },
            { title: 'Warehouse list', description: 'Add warehouses and keep location names consistent.', status: 'Ready' },
            { title: 'Base currency and exchange source', description: 'Use BDT for reporting and define how rates are sourced.', status: 'Scaffolded' },
          ],
        },
        {
          title: 'Return policy defaults',
          description: 'Refund, exchange, and return behavior should stay configurable from one place.',
          items: [
            { title: 'Return window', description: 'Set the default number of days allowed for returns.', status: 'Planned' },
            { title: 'Refund policy', description: 'Define whether cash, store credit, or exchange is preferred.', status: 'Planned' },
            { title: 'Warehouse restock rule', description: 'Decide whether returns restock automatically or are marked damaged.', status: 'Planned' },
          ],
        },
      ]}
      actions={[{ label: 'Open user management', href: '/admin/users', variant: 'outline' }]}
    />
  )
}