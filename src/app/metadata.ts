import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'METARDU — Professional Land Surveying Platform for East Africa',
  description: 'Kenya-built surveying workspace for project-referenced field records, COGO, traverse computation, GNSS workflows, and surveyor-reviewed document drafts.',
  keywords: ['land surveying', 'Kenya survey', 'cadastral survey', 'deed plan draft', 'COGO', 'traverse', 'Bowditch', 'Arc 1960', 'UTM', 'GNSS', 'field book', 'survey workflow'],
  openGraph: {
    title: 'METARDU — Professional Land Surveying Platform',
    description: 'Project-referenced field-to-finish surveying tools and reviewable document drafts for Kenyan survey workflows.',
    type: 'website',
    locale: 'en_KE',
    siteName: 'METARDU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'METARDU — Professional Land Surveying Platform',
    description: 'Kenya-built surveying workspace for COGO, field records, project reference systems, GNSS workflows, and document drafts.',
  },
  alternates: {
    canonical: '/',
  },
}
