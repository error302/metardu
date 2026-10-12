import type { Metadata } from 'next'
import OrganizationWorkspace from './OrganizationWorkspace'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Firm workspace | METARDU',
  description: 'Manage your surveying firm, members, and shared project access.',
}

export default function OrganizationPage() {
  return <OrganizationWorkspace />
}
