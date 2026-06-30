import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'METARDU — Professional Land Surveying Platform for East Africa',
  description: 'Kenya-built surveying platform with COGO, traverse adjustment, deed plan generation, NLIMS export, RTK GNSS integration, and field-to-finish workflow. Survey Act Cap 299 compliant.',
  keywords: ['land surveying', 'Kenya survey', 'cadastral survey', 'deed plan', 'mutation form', 'COGO', 'traverse', 'Bowditch', 'Arc 1960', 'UTM 37S', 'NLIMS', 'ArdhiSasa', 'GNSS RTK', 'field book', 'Survey Act Cap 299'],
  openGraph: {
    title: 'METARDU — Professional Land Surveying Platform',
    description: 'Field-to-finish surveying workflow built for Kenya. Traverse, deed plans, NLIMS export, RTK corrections — all in one platform.',
    type: 'website',
    locale: 'en_KE',
    siteName: 'METARDU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'METARDU — Professional Land Surveying Platform',
    description: 'Kenya-built surveying platform with COGO, deed plans, NLIMS export, and RTK GNSS integration.',
  },
  alternates: {
    canonical: '/',
  },
}
