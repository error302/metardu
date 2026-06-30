import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Survey Tools — METARDU',
  description: '60+ surveying calculation tools: COGO, traverse, leveling, coordinate transformation, curves, earthworks, GNSS, hydrographic, and more.',
  alternates: { canonical: '/tools/all' },
}

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children
}
