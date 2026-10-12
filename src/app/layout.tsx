import type { Metadata, Viewport } from 'next'

import './globals.css'
import './fonts.css'
import AuthProvider from '@/components/AuthProvider'
import { ThemeProvider } from 'next-themes'
import AppShell from '@/components/layout/AppShell'
import QueryProvider from '@/lib/api/QueryProvider'
import { getPublicAppUrl } from '@/lib/site'
import { WebVitals } from './web-vitals'
import { SRID_21037 } from '@/lib/map/projectionConstants'

const publicAppUrl = getPublicAppUrl()

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl),
  title: 'METARDU - Precise earth measurements.',
  description:
    'Survey project workspace for field observations, coordinate and traverse checks, CAD drafting, and reports for professional review. Built in Kenya; confirm the project reference system and control for every job.',
  keywords: [
    'surveying software',
    'traverse calculation',
    'leveling calculator',
    'COGO tools',
    'survey platform',
    'land surveying',
    'surveying software Kenya',
    'topographie Afrique',
    'software topografia',
    'software agrimensura',
    'programa topografia',
    'survey traverse online',
    'bowditch adjustment',
    'horizontal curves calculator',
    'UTM coordinates',
    'surveying app',
    'cadastral survey',
    'GPS stakeout',
  ],
  authors: [{ name: 'METARDU' }],
  creator: 'METARDU',
  publisher: 'METARDU',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: publicAppUrl,
    siteName: 'METARDU',
    title: 'METARDU - Precise earth measurements.',
    description: 'Keep survey observations, calculations, CAD work, and reviewable reports together in one project workspace.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'METARDU survey project workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'METARDU - Survey project workspace',
    description: 'Field observations, survey calculations, CAD work, and reports for professional review.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No CSP nonce plumbing here: reading headers() in the root layout forces
  // every page dynamic, which fails the Capacitor static export (mobile build).
  // Inline scripts (font flipper, next-themes init) are allowed via
  // 'unsafe-inline' in script-src (required for Next 14 RSC anyway); the
  // nonce-based CSP returns with the Next 15 upgrade.
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="google" content="notranslate" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#D17B47" />
        <meta name="application-name" content="METARDU" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="METARDU" />
        {/* description meta is set via metadata export above to avoid duplicates */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="msapplication-TileColor" content="#D17B47" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" href="/metardu-icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="shortcut icon" href="/metardu-icon.png" />
        {/* Shared body font is local; other families load only when used. */}
        <link rel="preload" href="/fonts/19f9c92546aa300c.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/* Skip link is rendered by AppShell's SkipToContent on every page —
            the layout-level copy was removed to avoid duplicate anchors. */}
        <AuthProvider>
          {/* UI-8 (2026-07-24): Wire ThemeProvider so next-themes useTheme()
              works across the app. The CSS in globals.css uses
              html[data-theme="light"] and html[data-theme="field"], so we
              use attribute="data-theme". Default is dark (the :root vars).
              Sonner toasts, field mode toggle, and outdoor mode toggle can
              now use useTheme() to switch between 'dark', 'light', 'field'. */}
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="dark"
            enableSystem={false}
          >
            <QueryProvider>
              <WebVitals />
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'Organization',
                    name: 'METARDU',
                    url: publicAppUrl,
                    description: 'Professional land-surveying platform built in Kenya for the East African market.',
                    areaServed: 'KE',
                    knowsAbout: ['Survey Act Cap. 299', 'RDM 1.1', 'NLIMS', 'ArdhiSasa', SRID_21037],
                  }),
                }}
              />
              <AppShell>
                {children}
              </AppShell>
            </QueryProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
