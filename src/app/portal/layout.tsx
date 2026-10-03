import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { PortalShell } from '@/components/portal/PortalShell'

export const metadata: Metadata = {
  title: 'My Account | Power International BD',
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>
}
