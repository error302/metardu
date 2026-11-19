'use client'
/**
 * MapNotifications — toast-style overlays for import/save/CRS messages.
 *
 * Two rules keep notifications from blocking field capture on a phone:
 *   1. Every toast can be dismissed, and every toast clears itself after a
 *      short delay. A missing-CRS hint must never sit over the map forever.
 *   2. Only the toast surface accepts pointer events. The container is
 *      `pointer-events-none`, so a tap anywhere else reaches the map.
 *
 * Toasts stack vertically instead of sharing one fixed position, so two
 * messages remain readable and independently dismissible.
 */

import React, { memo, useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

/** Informational toasts clear quickly; problems get longer to read. */
const DISMISS_AFTER_MS = {
  save: 7000,
  import: 7000,
  points: 9000,
  zone: 11000,
} as const

type ToastKey = keyof typeof DISMISS_AFTER_MS
type ToastTone = 'info' | 'warning' | 'error'

interface Toast {
  key: ToastKey
  message: string
  tone: ToastTone
}

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)]',
  warning: 'bg-amber-100 text-amber-950 border-amber-300',
  error: 'bg-red-950 text-red-100 border-red-400',
}

export const MapNotifications = memo(function MapNotifications() {
  const { importMsg, saveMsg, setSaveMsg, projectPointsError, zoneWarning } = useMapContext()

  // Remember which exact message text the surveyor dismissed. A different
  // message for the same slot is new information and renders again.
  const [dismissed, setDismissed] = useState<Partial<Record<ToastKey, string>>>({})

  // Save messages have a setter, so clearing them also clears the source
  // state that other controls read.
  useEffect(() => {
    if (!saveMsg) return
    const timer = setTimeout(() => setSaveMsg(''), DISMISS_AFTER_MS.save)
    return () => clearTimeout(timer)
  }, [saveMsg, setSaveMsg])

  const hideLater = useCallback((key: ToastKey, message: string, delay: number) => {
    if (!message) return undefined
    const timer = setTimeout(() => {
      setDismissed((previous) => (previous[key] === message ? previous : { ...previous, [key]: message }))
    }, delay)
    return () => clearTimeout(timer)
  }, [])

  useEffect(
    () => hideLater('import', importMsg, DISMISS_AFTER_MS.import),
    [importMsg, hideLater],
  )
  useEffect(
    () => hideLater('points', projectPointsError ?? '', DISMISS_AFTER_MS.points),
    [projectPointsError, hideLater],
  )
  useEffect(
    () => hideLater('zone', zoneWarning ?? '', DISMISS_AFTER_MS.zone),
    [zoneWarning, hideLater],
  )

  const dismiss = useCallback(
    (key: ToastKey, message: string) => {
      setDismissed((previous) => ({ ...previous, [key]: message }))
      if (key === 'save') setSaveMsg('')
    },
    [setSaveMsg],
  )

  const pointDisplayIsPartial = projectPointsError?.startsWith('More than 500 map features') ?? false

  const toasts: Toast[] = []
  if (zoneWarning && dismissed.zone !== zoneWarning) {
    toasts.push({ key: 'zone', message: zoneWarning, tone: 'warning' })
  }
  if (projectPointsError && dismissed.points !== projectPointsError) {
    toasts.push({ key: 'points', message: projectPointsError, tone: pointDisplayIsPartial ? 'warning' : 'error' })
  }
  if (importMsg && dismissed.import !== importMsg) {
    toasts.push({ key: 'import', message: importMsg, tone: 'warning' })
  }
  if (saveMsg && dismissed.save !== saveMsg) {
    toasts.push({ key: 'save', message: saveMsg, tone: saveMsg.startsWith('Error') ? 'error' : 'info' })
  }

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[calc(var(--map-header-height,48px)+12px)] z-[60] flex flex-col items-center gap-2 px-3"
      data-testid="map-notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`map-notification pointer-events-auto flex w-auto max-w-[min(92vw,36rem)] items-start gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl ${TONE_CLASSES[toast.tone]}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.key, toast.message)}
            aria-label={`Dismiss notification: ${toast.message.slice(0, 60)}`}
            title="Dismiss"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
})
