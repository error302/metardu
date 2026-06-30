'use client'

/**
 * Skip-to-content link for keyboard accessibility.
 *
 * Visually hidden by default, becomes visible on Tab focus.
 * Links to #main-content which is the ID used by AppShell's main element.
 * Styled with the accent color for consistency.
 */
export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        focus:fixed focus:top-4 focus:left-4 focus:z-[9999]
        focus:px-4 focus:py-2 focus:rounded-lg
        focus:text-sm focus:font-semibold
        focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
      "
      style={{
        background: 'var(--accent)',
        color: '#000',
      }}
    >
      Skip to main content
    </a>
  )
}
