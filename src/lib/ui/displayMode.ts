/**
 * Display mode (dark ↔ field) is applied in exactly one place.
 *
 * next-themes owns the attribute before first paint, so a stored field mode
 * never flashes dark on navigation. This module only centralises the DOM
 * writes and the switch animation so the toggle, the ambient-light sensor and
 * any future caller behave identically.
 */

export type DisplayMode = 'dark' | 'field'

/** Legacy key written by the pre-next-themes toggle; migrated once on mount. */
export const LEGACY_DISPLAY_MODE_KEY = 'metardu_display_mode'

export const SENSOR_OPT_IN_KEY = 'metardu_auto_field_sensor'

export function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'dark' || value === 'field'
}

/** Legacy stored mode, if it disagrees with next-themes, so it can be adopted. */
export function readLegacyDisplayMode(): DisplayMode | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(LEGACY_DISPLAY_MODE_KEY)
    return isDisplayMode(stored) ? stored : null
  } catch {
    return null
  }
}

export function readSensorOptIn(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SENSOR_OPT_IN_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSensorOptIn(enabled: boolean): void {
  try {
    window.localStorage.setItem(SENSOR_OPT_IN_KEY, String(enabled))
  } catch {
    /* storage unavailable — the toggle still works for this session */
  }
}

/** Write the theme attributes synchronously (safe to call inside a snapshot). */
export function applyDisplayModeDom(mode: DisplayMode): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.setAttribute('data-theme', mode)
  // Kept for the older field-mode selectors that still key off the class.
  html.classList.toggle('field-mode', mode === 'field')
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

/**
 * Run a theme change behind a short crossfade.
 *
 * Chrome/Edge get a real view-transition snapshot, so the switch cannot show
 * a half-restyled frame or a layout jump (field mode thickens borders and
 * raises font weight). Other engines fall back to a 220 ms colour crossfade
 * driven by the `theme-crossfade` class in globals.css. Reduced-motion users
 * get an instant switch.
 */
export function switchDisplayMode(mode: DisplayMode, persist?: (mode: DisplayMode) => void): void {
  if (typeof document === 'undefined') {
    persist?.(mode)
    return
  }

  if (prefersReducedMotion()) {
    applyDisplayModeDom(mode)
    persist?.(mode)
    return
  }

  const doc = document as ViewTransitionDocument
  if (typeof doc.startViewTransition === 'function') {
    const transition = doc.startViewTransition(() => applyDisplayModeDom(mode))
    transition.finished.catch(() => undefined)
    persist?.(mode)
    return
  }

  const html = document.documentElement
  html.classList.add('theme-crossfade')
  // Swap on the next frame so the colour transition has a start value.
  requestAnimationFrame(() => {
    applyDisplayModeDom(mode)
    persist?.(mode)
    window.setTimeout(() => html.classList.remove('theme-crossfade'), 240)
  })
}
