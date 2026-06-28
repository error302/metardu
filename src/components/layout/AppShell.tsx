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
import { PWAInstallBanner } from '@/components/app/PWAInstallBanner'
import { ProjectionInit } from '@/components/layout/ProjectionInit'
import FieldModeToggle from '@/components/shared/FieldModeToggle'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { CountryProvider } from '@/lib/country'
import { SubscriptionProvider } from '@/lib/subscription/subscriptionContext'
import SkipToContent from '@/components/shared/SkipToContent'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { CommandPalette } from '@/components/search/CommandPalette'
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

function isAuthRoute(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register' || pathname.startsWith('/login/') || pathname.startsWith('/register/')
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
  const auth = isAuthRoute(pathname)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (isAuthRoute(pathname)) return
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

  // Auth routes (login/register): bare page, no chrome
  if (auth) {
    return (
      <>
        <SkipToContent />
        <OfflineIndicator />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <main id="main-content" className="min-h-screen max-w-full overflow-x-hidden">
                {children}
              </main>
              <NotificationToast />
            </SubscriptionProvider>
          </CountryProvider>
        </LanguageProvider>
      </>
    )
  }

  // Full-screen routes (field map): no chrome at all, but field mode toggle is always available
  if (fullScreen) {
    return (
      <>
        <SkipToContent />
        <AppUpdateBanner />
        <OfflineIndicator />
        <PWAInstallBanner />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <main id="main-content" className="overflow-hidden">
                {children}
              </main>
              <div className="fixed bottom-6 right-6 z-50">
                <FieldModeToggle />
              </div>
              <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
                <NotificationBell />
              </div>
              <CommandPalette />
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
        <SkipToContent />
        <AppUpdateBanner />
        <OfflineIndicator />
        <PWAInstallBanner />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <main id="main-content" className="min-h-screen max-w-full overflow-x-hidden">
                {children}
              </main>
              <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
                <NotificationBell />
                <FieldModeToggle />
              </div>
              <CommandPalette />
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
      <SkipToContent />
      <AppUpdateBanner />
      <OfflineIndicator />
      <PWAInstallBanner />
      <ProjectionInit />
      <LanguageProvider>
        <CountryProvider>
          <SubscriptionProvider>
            <NavBar />
            <main id="main-content" className="min-h-screen pb-40 md:pb-0 mobile-nav-spacer max-w-full overflow-x-hidden">
              {children}
            </main>
            <Footer />
            <FeedbackWidget />
            <KeyboardShortcuts />
            <QuickCompute />
            <MobileNav />
            <CommandPalette />
            <NotificationToast />
            {onboardingModal}
          </SubscriptionProvider>
        </CountryProvider>
      </LanguageProvider>
    </>
  )
}
