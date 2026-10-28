'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import NavBar from '@/components/NavBar'
import Footer from '@/components/Footer'
import { ProjectionInit } from '@/components/layout/ProjectionInit'
import FieldModeToggle from '@/components/shared/FieldModeToggle'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { CountryProvider } from '@/lib/country'
import { SubscriptionProvider } from '@/lib/subscription/subscriptionContext'
import SkipToContent from '@/components/shared/SkipToContent'
import { OfflineIndicator } from '@/components/app/OfflineIndicator'
import { ChatGPTNoticeBanner } from '@/components/chatgpt/NoticeBanner'
import {CadWorkspaceShell,isCadWorkspaceRoute} from '@/components/cad-editor/CadWorkspaceShell'

// Heavy / route-specific overlays are code-split so their JS chunks only
// download when the component is actually rendered (never on the landing
// page or marketing routes). Each chunk stays cached for later routes.
const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), { ssr: false })
const MobileNav = dynamic(() => import('@/components/MobileNav'), { ssr: false })
const HotkeyHelpOverlay = dynamic(() => import('@/components/shared/HotkeyHelpOverlay').then(m => m.HotkeyHelpOverlay), { ssr: false })
const AppUpdateBanner = dynamic(() => import('@/components/app/AppUpdateBanner').then(m => m.AppUpdateBanner), { ssr: false })
const PWAInstallBanner = dynamic(() => import('@/components/app/PWAInstallBanner').then(m => m.PWAInstallBanner), { ssr: false })
const NotificationBell = dynamic(() => import('@/components/notifications/NotificationBell').then(m => m.NotificationBell), { ssr: false })
const CommandPalette = dynamic(() => import('@/components/search/CommandPalette').then(m => m.CommandPalette), { ssr: false })
const OnboardingTour = dynamic(() => import('@/components/onboarding/OnboardingTour').then(m => m.OnboardingTour), { ssr: false })
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

function isMapRoute(pathname: string): boolean {
  return pathname === '/map' || pathname.startsWith('/map/')
}

function isFieldbookRoute(pathname: string): boolean {
  return pathname === '/fieldbook' || pathname.startsWith('/fieldbook/')
}

// Marketing routes get a minimal shell: no LoadingScreen, no global
// overlays (QuickCompute, CommandPalette, onboarding, install banners…).
// This is a large performance win — those overlays are the biggest JS
// chunks and the 1.5s branded splash directly inflates LCP/FCP on the
// first visit (the landing page is what Lighthouse scores).
function isMarketingRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/install' || pathname === '/offline' || pathname === '/pricing' || pathname === '/enterprise' || pathname.startsWith('/connect/chatgpt')
}
/* ── Shell Component ─────────────────────────────────────────────── */

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const fullScreen = isFullScreenRoute(pathname)
  const admin = isAdminRoute(pathname)
  const auth = isAuthRoute(pathname)
  const mapPage = isMapRoute(pathname)
  const fieldbookPage = isFieldbookRoute(pathname)
  const marketing = isMarketingRoute(pathname)
  const cadPage=isCadWorkspaceRoute(pathname)
  // Map and fieldbook are full-data-entry surfaces. Keep the global mobile
  // navigation on the map so surveyors can switch pages without leaving it;
  // hide the other overlays that compete with map and fieldbook controls.
  const hideGlobalOverlays = mapPage || fieldbookPage

  // Capability views have their own responsive shell. No account overlays,
  // location watchers, survey defaults or feedback capture on recipient pages.
  if (pathname.startsWith('/p/')) return <><SkipToContent />{children}</>

  // Auth routes (login/register): bare page, no chrome.
  // ProjectionInit is deliberately omitted: no map renders pre-auth, so
  // downloading + registering proj4/ol projections here is pure waste —
  // every map surface awaits registerProjections() itself on init.
  if (auth) {
    return (
      <>
        <SkipToContent />
        <OfflineIndicator />
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

  // Marketing routes (landing, pricing, enterprise): minimal chrome —
  // NavBar + Footer only. No LoadingScreen splash, no compute/search/
  // onboarding overlays, no PWA/update banners. Their code-split chunks
  // never download here, cutting the landing page's JS by ~50%.
  // Marketing routes: ProjectionInit is deliberately omitted. No map renders
  // here, and mounting it triggers registerProjections() → dynamic import of
  // proj4 + ol/proj/proj4 → ~46 OpenLayers chunks (~600 KB) on a marketing page.
  if (marketing) {
    return (
      <>
        <SkipToContent />
        <OfflineIndicator />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <NavBar />
              <main id="main-content" className="min-h-screen max-w-full overflow-x-hidden">
                {pathname === '/' && <ChatGPTNoticeBanner />}
                {children}
              </main>
              <Footer />
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
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <PWAInstallBanner />
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
              <HotkeyHelpOverlay />
              <NotificationToast />
            </SubscriptionProvider>
          </CountryProvider>
        </LanguageProvider>
      </>
    )
  }

  // AdminLayout owns its header controls; keep this shell free of floating duplicates.
  if (admin) {
    return (
      <>
        <SkipToContent />
        <AppUpdateBanner />
        <OfflineIndicator />
        <ProjectionInit />
        <LanguageProvider>
          <CountryProvider>
            <SubscriptionProvider>
              <PWAInstallBanner />
              <main id="main-content" className="min-h-screen max-w-full overflow-x-hidden">
                {children}
              </main>
              <CommandPalette />
              <HotkeyHelpOverlay />
              <NotificationToast />
            </SubscriptionProvider>
          </CountryProvider>
        </LanguageProvider>
      </>
    )
  }

  if(cadPage) {
    return <><SkipToContent/><OfflineIndicator/><ProjectionInit/>
      <LanguageProvider><CountryProvider><SubscriptionProvider>
        <CadWorkspaceShell>{children}</CadWorkspaceShell><MobileNav/><NotificationToast/>
      </SubscriptionProvider></CountryProvider></LanguageProvider>
    </>
  }

  // Default: full app shell
  return (
    <>
      <SkipToContent />
      <AppUpdateBanner />
      <OfflineIndicator />
      <ProjectionInit />
      <LanguageProvider>
        <CountryProvider>
          <SubscriptionProvider>
            <PWAInstallBanner />
            {/* NavBar renders on ALL app routes. (An earlier audit hid it on
                /dashboard because that group used the AppSidebar layout — that
                layout is gone, so hiding it here left the dashboard with no
                navigation at all.) NOTE: do NOT wrap NavBar in <Suspense> —
                an explicit boundary here deterministically breaks SSR of
                sibling content on /project/new (breadcrumb link never renders,
                E2E project-crud shard fails). NavBar's SSR bailout recovers
                fine client-side without it. */}
            <NavBar />
            <main id="main-content" className="min-h-screen max-w-full overflow-x-hidden pb-40 md:pb-0 mobile-nav-spacer">
              {['/','/dashboard','/projects','/account','/fieldbook'].includes(pathname) && <ChatGPTNoticeBanner />}
              {children}
            </main>
            <Footer />
            {!hideGlobalOverlays && <FeedbackWidget />}
            <HotkeyHelpOverlay />
            {!fieldbookPage && <MobileNav />}
            {!hideGlobalOverlays && <CommandPalette />}
            <NotificationToast />
            <OnboardingTour />
          </SubscriptionProvider>
        </CountryProvider>
      </LanguageProvider>
    </>
  )
}
