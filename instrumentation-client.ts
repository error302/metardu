// Client-side Sentry instrumentation.
//
// IMPORTANT (bundle-weight): this file is bundled into the root layout graph on
// EVERY route, including the marketing landing page. It must NOT statically
// import @sentry/nextjs - a static import puts ~590 KB of the Sentry SDK into
// the eager startup set for all pages. Route the SDK through a dynamic import
// so it only downloads when a DSN is configured. See scripts/bundle-budget.mjs.

let sdkPromise = null

function loadSentry() {
  if (!sdkPromise) {
    sdkPromise = import('@sentry/nextjs').then((S) => {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
      if (dsn && !dsn.includes('mockup')) {
        S.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.05,
          replaysOnErrorSampleRate: 1.0,
          integrations: [
            S.replayIntegration({ maskAllText: false, blockAllMedia: false }),
          ],
          debug: false,
        })
      }
      return S
    })
  }
  return sdkPromise
}

// Lazily initialise on first router transition (navigation is the earliest
// meaningful telemetry signal, and avoids loading the SDK on a static view).
export function onRouterTransitionStart(...args) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn || dsn.includes('mockup')) return
  void loadSentry().then((S) => {
    S.captureRouterTransitionStart(...args)
  })
}
