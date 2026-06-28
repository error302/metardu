'use client'

/**
 * OutdoorModeToggle — High-contrast theme for field work under direct sunlight
 */

import { useEffect, useState, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'

const STORAGE_KEY = 'metardu:outdoor-mode'
const OUTDOOR_CLASS = 'outdoor-mode'

export function OutdoorModeToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) === 'true'
    setEnabled(saved)
    if (saved) document.documentElement.classList.add(OUTDOOR_CLASS)
  }, [])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      if (next) document.documentElement.classList.add(OUTDOOR_CLASS)
      else document.documentElement.classList.remove(OUTDOOR_CLASS)
      return next
    })
  }, [])

  return (
    <button
      onClick={toggle}
      className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${
        enabled ? 'bg-amber-400 border-amber-500 text-black' : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
      title={enabled ? 'Outdoor mode ON — tap to disable' : 'Outdoor mode OFF — tap to enable high-contrast for sunlight'}
      aria-label="Toggle outdoor high-contrast mode"
      aria-pressed={enabled}
    >
      {enabled ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

export function useOutdoorMode() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const check = () => setEnabled(document.documentElement.classList.contains(OUTDOOR_CLASS))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return enabled
}
