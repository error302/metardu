import type { Metadata } from 'next'
import PublicParcelDraft from '@/components/scheme/PublicParcelDraft'
export const metadata: Metadata = {
  title: 'Shared draft | METARDU',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
}
export default function SharedDraftPage() {
  return <PublicParcelDraft />
}
