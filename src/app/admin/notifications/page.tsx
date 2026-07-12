import { ModuleFeatureScreen } from '@/components/admin/ModuleFeatureScreen'

export default function NotificationsPage() {
  return (
    <ModuleFeatureScreen
      active="Notifications"
      eyebrow="Notifications"
      title="Alert routing, thresholds, and recipient rules"
      description="Notifications now need real routing rules, so this section groups in-app, SMS, and email delivery by alert type instead of treating them as a generic setting."
      highlights={[
        { label: 'Channels', value: 'In-app / SMS / Email', note: 'Pick delivery method per alert type.' },
        { label: 'Thresholds', value: 'Configurable', note: 'Control stock, due date, and warranty warning levels.' },
        { label: 'Recipients', value: 'Role-based', note: 'Choose who receives which alert.' },
        { label: 'SMS gateway', value: 'BD ready', note: 'Leave room for a bulk SMS provider integration.' },
      ]}
      sections={[
        {
          title: 'Alert rules',
          description: 'Each alert type should define both channel and recipient behavior.',
          items: [
            { title: 'Low stock alerts', description: 'Notify manager and admin when stock crosses the threshold.', status: 'Scaffolded' },
            { title: 'Due payment alerts', description: 'Escalate overdue balances to admin or finance roles.', status: 'Scaffolded' },
            { title: 'Warranty expiry warnings', description: 'Warn before warranty windows close out.', status: 'Planned' },
          ],
        },
        {
          title: 'Delivery setup',
          description: 'The module leaves room for a real BD SMS gateway and email provider later.',
          items: [
            { title: 'SMS gateway config', description: 'Store provider credentials and sender rules.', status: 'Planned' },
            { title: 'Channel selection', description: 'Choose in-app, SMS, or email per alert type.', status: 'Ready' },
            { title: 'Recipient matrix', description: 'Define who receives each alert category.', status: 'Planned' },
          ],
        },
      ]}
      actions={[{ label: 'Open dashboard alerts', href: '/admin/dashboard', variant: 'outline' }]}
    />
  )
}