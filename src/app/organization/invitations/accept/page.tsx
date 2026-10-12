import type { Metadata } from 'next'
import InvitationAcceptance from './InvitationAcceptance'

export const metadata: Metadata = {
  title: 'Accept firm invitation | METARDU',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function AcceptFirmInvitationPage() {
  return <InvitationAcceptance />
}
