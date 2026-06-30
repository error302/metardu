import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Surveyor Community — METARDU',
  description: 'Connect with verified surveyors across East Africa. Equipment marketplace, CPD tracking, regional coverage directory.',
  alternates: { canonical: '/community' },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return children
}
