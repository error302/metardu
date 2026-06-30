import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help & Support — METARDU',
  description: 'Find answers about field collection, document generation, GNSS connection, NTRIP corrections, NLIMS export, and more.',
  alternates: { canonical: '/help' },
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children
}
