import type { Metadata } from 'next'
import Link from 'next/link'

import './globals.css'
import NavBar from '@/components/NavBar'
import MobileNav from '@/components/MobileNav'
import AuthProvider from '@/components/AuthProvider'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { CountryProvider } from '@/lib/country'
import { SubscriptionProvider } from '@/lib/subscription/subscriptionContext'
import FeedbackWidget from '@/components/FeedbackWidget'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import { QuickCompute } from '@/components/layout/QuickCompute'
import { ProjectionInit } from '@/components/layout/ProjectionInit'
import { OfflineIndicator } from '@/components/app/OfflineIndicator'
import { AppUpdateBanner } from '@/components/app/AppUpdateBanner'
import { getPublicAppUrl } from '@/lib/site'

const publicAppUrl = getPublicAppUrl()

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl),
  title: 'METARDU - Precise earth measurements.',
  description:
    'Professional surveying platform for land surveyors worldwide. Traverse adjustment, leveling, COGO, GPS stakeout, PDF reports. Supports all 60 UTM zones. Built in Africa, used globally.',
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
    description: 'Complete surveying platform for professional land surveyors across Africa and beyond.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'METARDU - Professional Surveying Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'METARDU - Professional Surveying Platform',
    description: 'Complete surveying platform for professional land surveyors.',
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111111" />
        <meta name="application-name" content="METARDU" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="METARDU" />
        <meta name="description" content="Professional surveying platform for land surveyors. Traverse adjustment, leveling, COGO, GPS stakeout, PDF reports." />
        <meta name="format-detection" content="telephone=no" />
        <meta name="msapplication-TileColor" content="#111111" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="dark" />
        <link rel="icon" href="/metardu-logo.jpg" type="image/jpeg" />
        <link rel="apple-touch-icon" href="/metardu-logo.jpg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--accent)] focus:text-black focus:rounded focus:font-semibold"
        >
          Skip to content
        </a>
        <AuthProvider>
          <AppUpdateBanner />
          <OfflineIndicator />
          <ProjectionInit />
          <LanguageProvider>
            <CountryProvider>
              <SubscriptionProvider>
                <NavBar />
                <main id="main-content" className="min-h-screen pb-16 md:pb-0">
                  {children}
                </main>
                <footer className="border-t border-[var(--border-color)] py-6 mt-16">
                  <div className="max-w-7xl mx-auto px-4 text-center text-xs text-[var(--text-muted)]">
                    METARDU v1.0 - Professional Surveying Calculations -{' '}
                    <Link href="/community" prefetch={false} className="text-[var(--accent)] hover:underline">
                      Join Community
                    </Link>
                  </div>
                </footer>
                <FeedbackWidget />
                <KeyboardShortcuts />
                <QuickCompute />
                <MobileNav />
              </SubscriptionProvider>
            </CountryProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
