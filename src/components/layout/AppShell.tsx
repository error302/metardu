'use client'

import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'
import OnboardingModal from '@/components/ui/OnboardingModal'
import NavBar from '@/components/NavBar'
import Footer from '@/components/Footer'
import FeedbackWidget from '@/components/FeedbackWidget'
import { QuickCompute } from '@/components/layout/QuickCompute'
import MobileNav from '@/components/MobileNav'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import { AppUpdateBanner } from '@/components/app/AppUpdateBanner'
import { OfflineIndicator } from '@/components/app/OfflineIndicator'
import { ProjectionInit } from '@/components/layout/ProjectionInit'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { CountryProvider } from '@/lib/country'
import { SubscriptionProvider } from '@/lib/subscription/subscriptionContext'
import dynamic from 'next/dynamic'

const NotificationToast = dynamic(
  () => import('@/components/ui/NotificationToast').then(m => ({ default: m.NotificationToast })),
  { ssr: false }
)

/* ── Route classification ─────────────────────────────────────────── */

function isFullScreenRoute(pathname: string): boolean {
  return pathname === '/field/map' || pathname.startsWith('/field/map/')
}

function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function isHiddenShellRoute(pathname: string): boolean {
  return isFullScreenRoute(pathname) || isAdminRoute(pathname)
}

/* ── Shell Component ─────────────────────────────────────────────── */

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const fullScreen = isFullScreenRoute(pathname)
  const admin = isAdminRoute(pathname)
  const hidden = isHiddenShellRoute(pathname)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/login/')) return
    if (!localStorage.getItem('metardu_onboarding_seen')) {
      setShowOnboarding(true)
    }
  }, [pathname])

  const dismissOnboarding = () => {
    localStorage.setItem('metardu_onboarding_seen', 'true')
    setShowOnboarding(false)
  }

  const onboardingModal = (
    <OnboardingModal
      open={showOnboarding}
      onClose={dismissOnboarding}
      onComplete={dismissOnboarding}
    />
  )

  // Full-screen routes (field map): no chrome at all
  if (fullScreen) {
    return (
      <>
        <AppUpdateBanner />
        <OfflineIndicator />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <main id="main-content" className="overflow-hidden">
                {children}
              </main>
              <KeyboardShortcuts />
              <NotificationToast />
              {onboardingModal}
            </SubscriptionProvider>
          </CountryProvider>
        </LanguageProvider>
      </>
    )
  }

  // Admin routes: hide NavBar, Footer, QuickCompute, FeedbackWidget, MobileNav
  if (admin) {
    return (
      <>
        <AppUpdateBanner />
        <OfflineIndicator />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <main id="main-content" className="min-h-screen overflow-x-hidden">
                {children}
              </main>
              <KeyboardShortcuts />
              <NotificationToast />
              {onboardingModal}
            </SubscriptionProvider>
          </CountryProvider>
        </LanguageProvider>
      </>
    )
  }

  // Default: full app shell
  return (
    <>
      <AppUpdateBanner />
      <OfflineIndicator />
      <ProjectionInit />
      <LanguageProvider>
        <CountryProvider>
          <SubscriptionProvider>
            <NavBar />
            <main id="main-content" className="min-h-screen pb-16 md:pb-0 mobile-nav-spacer overflow-x-hidden">
              {children}
            </main>
            <Footer />
            <FeedbackWidget />
            <KeyboardShortcuts />
            <QuickCompute />
            <MobileNav />
            <NotificationToast />
            {onboardingModal}
          </SubscriptionProvider>
        </CountryProvider>
      </LanguageProvider>
    </>
  )
}
