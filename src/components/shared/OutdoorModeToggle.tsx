'use client'

/**
 * OutdoorModeToggle — v0.3 redesign
 *
 * Now a three-state theme toggle: Dark (default) · Light · Field.
 * - Dark: tinted charcoal #1A1816 (default, indoor/evening)
 * - Light: cool off-white #FAFAF7 (indoor daylight, preference)
 * - Field: pure white + pure black (direct sunlight, max contrast)
 *
 * Sets data-theme attribute on <html>. Backward compatible:
 * also toggles 'field-mode' class so existing CSS rules still apply.
 */

import { useEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light' | 'field'

const STORAGE_KEY = 'metardu:theme'

const THEME_ORDER: Theme[] = ['dark', 'light', 'field']

function applyTheme(theme: Theme) {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
  // Backward compat: field-mode class still used by many CSS rules
  if (theme === 'field') {
    html.classList.add('field-mode')
  } else {
    html.classList.remove('field-mode')
  }
  // Legacy outdoor-mode class (some components check for it)
  if (theme === 'field') {
    html.classList.add('outdoor-mode')
  } else {
    html.classList.remove('outdoor-mode')
  }
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved && THEME_ORDER.includes(saved)) return saved
  // Default to dark; respect prefers-color-scheme only on first visit
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export function OutdoorModeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const cycle = useCallback(() => {
    setTheme(prev => {
      const idx = THEME_ORDER.indexOf(prev)
      const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length]
      localStorage.setItem(STORAGE_KEY, next)
      applyTheme(next)
      return next
    })
  }, [])

  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Field'
  const icon = theme === 'dark' ? '◐' : theme === 'light' ? '○' : ''

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-2 px-2.5 h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors text-xs font-mono"
      title={`Theme: ${label} — click to cycle Dark → Light → Field`}
      aria-label={`Theme: ${label}. Click to change.`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function useOutdoorMode() {
  // Backward compat: returns true if theme is 'field'
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const check = () => setEnabled(document.documentElement.getAttribute('data-theme') === 'field')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return enabled
}
