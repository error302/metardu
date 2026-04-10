/**
 * Centralized environment and feature-flags configuration.
 *
 * All feature-gating, version info, and environment checks should read from
 * here rather than scattering `process.env.*` references throughout the app.
 */

/** Semantic version of the METARDU app — bump on each release. */
export const APP_VERSION = '1.0.0'
export const APP_BUILD_PHASE = '40' // last completed development phase

/** Public-facing config — safe for client-side use. */
export const appConfig = {
  /** Display name */
  appName: 'METARDU',

  /** App version */
  version: APP_VERSION,

  /** Last development phase completed */
  buildPhase: APP_BUILD_PHASE,

  /** Base URL (public) */
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.vercel.app',

  /** Supabase */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',

  /** Stripe publishable key */
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',

  /** WhatsApp number for support */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',

  /** Sentry DSN */
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  sentryEnvironment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',

  /** Log endpoint */
  logEndpoint: process.env.NEXT_PUBLIC_LOG_ENDPOINT || '',

  /** Whether we are running in a browser */
  isBrowser: typeof window !== 'undefined',

  /** Current environment name */
  get environment(): 'development' | 'staging' | 'production' {
    if (process.env.NODE_ENV === 'development') return 'development'
    if (process.env.NODE_ENV === 'production') return 'production'
    return 'staging'
  },

  /** Whether we're in development mode */
  get isDev(): boolean {
    return process.env.NODE_ENV === 'development'
  },
} as const

/** Feature flags — toggle capabilities on/off without code changes. */
export const featureFlags = {
  /** Enable the beta feedback widget */
  feedbackWidget: true,

  /** Enable the changelog panel */
  changelogPanel: true,

  /** Enable PWA service worker registration */
  pwaEnabled: true,

  /** Enable offline indicator */
  offlineIndicator: true,

  /** Enable app update banner */
  updateBanner: true,

  /** Enable GNSS Bluetooth connection */
  gnssBluetooth: true,

  /** Enable AI plan checker */
  aiPlanChecker: true,

  /** Enable mining / minetwin features */
  miningFeatures: true,

  /** Enable hydrographic surveys */
  hydroFeatures: true,

  /** Enable USV mission planning */
  usvFeatures: true,

  /** Enable earthworks / mass haul */
  earthworkFeatures: true,

  /** Enable deed plan generator */
  deedPlanGenerator: true,

  /** Enable workflow automator */
  automator: true,

  /** Enable geofusion data integration */
  geofusion: true,

  /** Enable minescan safety dashboard */
  minescan: true,

  /** Enable fieldguard data cleaner */
  fieldguard: true,

  /** Enable peer review marketplace */
  peerReview: true,

  /** Enable CPD tracking */
  cpdTracking: true,

  /** Enable subscription / payments */
  payments: true,

  /** Enable instruments / equipment tracker */
  equipmentTracker: true,

  /** Enable beacon registry */
  beaconRegistry: true,

  /** Enable voice notes in field book */
  voiceNotes: true,

  /** Enable OCR import */
  ocrImport: true,

  /** Enable digital signature */
  digitalSignature: true,

  /** Enable report builder */
  reportBuilder: true,

  /** Enable data cleaner */
  dataCleaner: true,
} as const

/** Full user-agent based device detection — browser only. */
export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, platform: 'server' as const }
  }

  const ua = navigator.userAgent
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua)

  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    platform: (ua.includes('Win')
      ? 'windows'
      : ua.includes('Mac')
        ? 'macos'
        : ua.includes('Linux')
          ? 'linux'
          : ua.includes('Android')
            ? 'android'
            : 'ios') as 'windows' | 'macos' | 'linux' | 'android' | 'ios',
  }
}
