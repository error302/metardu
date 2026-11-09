'use client';

/**
 * FieldMeasureButton — large one-tap measurement capture button
 *
 * Designed for field use:
 *   - Large touch target (min 120×120px) — works with gloves
 *   - High contrast — visible in sunlight
 *   - Haptic feedback on press (vibration)
 *   - Audio cue on successful capture
 *   - Shows point ID being measured
 *   - Disabled state when no instrument connected
 *
 * After capture:
 *   - Flashes green
 *   - Auto-increments point ID (P1 → P2 → P3…)
 *   - Shows last measurement summary for 2 seconds
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Crosshair, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useInstrumentStore } from '@/stores/instrumentStore'
import { logger } from '@/lib/logger'

function stepPointId(pointId: string, step: 1 | -1): string | null {
  const match = /^(.*?)([0-9]+)$/.exec(pointId)
  if (!match) return null
  const [ , prefix, digits] = match
  const candidate = BigInt(digits) + BigInt(step)
  if (candidate < BigInt(1)) return pointId
  const id = prefix + candidate.toString().padStart(digits.length, '0')
  return id.length <= 100 ? id : null
}

interface FieldMeasureButtonProps {
  onCapture: (pointId: string) => Promise<boolean>
  disabled?: boolean
  pointIdPrefix?: string  // e.g., 'P', 'BP', 'STN'
  stationSetup?: boolean  // is station set up?
  nextPointNumber?: number
  featureCode?: string
}

export function FieldMeasureButton({
  onCapture,
  disabled = false,
  pointIdPrefix = 'P',
  stationSetup = false,
  nextPointNumber = 1,
  featureCode,
}: FieldMeasureButtonProps) {
  const suggestedId = `${pointIdPrefix}${Math.max(1, nextPointNumber)}`
  const [pointIdInput, setPointIdInput] = useState(suggestedId)
  const manuallySelectedId = useRef(false)
  const capturePending = useRef(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null)
  const [lastPointId, setLastPointId] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const status = useInstrumentStore(state => state.status)
  const isConnected = status === 'connected' || status === 'streaming'
  const pointId = pointIdInput.trim()
  const validId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(pointId)
  const isDisabled = disabled || !isConnected || !stationSetup || isCapturing || !validId

  useEffect(() => {
    if (!manuallySelectedId.current) setPointIdInput(suggestedId)
  }, [suggestedId])

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  function selectId(id: string) {
    manuallySelectedId.current = true
    setPointIdInput(id)
  }

  const handleMeasure = useCallback(async () => {
    if (isDisabled || capturePending.current) return
    capturePending.current = true

    // Haptic feedback
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(30)
    }

    setIsCapturing(true)
    setLastResult(null)

    try {
      const success = await onCapture(pointId)
      if (success) {
        setLastResult('success')
        setLastPointId(pointId)
        const nextId = stepPointId(pointId, 1)
        setPointIdInput(nextId ?? '')

        // Audio cue: short high beep
        try {
          const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          const ctx = new AudioCtx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = 880  // A5
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
          osc.start()
          osc.onended = () => { void ctx.close().catch(() => {}) }
          osc.stop(ctx.currentTime + 0.15)
        } catch {}

        // Clear flash after 2s
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setLastResult(null), 2000)
      } else {
        setLastResult('error')
        // Error buzz: low tone
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 100])
        }
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setLastResult(null), 3000)
      }
    } catch (err) {
      setLastResult('error')
      logger.error('[field-measure] Capture failed:', { error: err })
    } finally {
      capturePending.current = false
      setIsCapturing(false)
    }
  }, [isDisabled, onCapture, pointId])

  // Button styles based on state
  const baseClass = 'relative w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 transition-all duration-150 select-none font-bold'

  let buttonClass = baseClass
  let icon = <Crosshair className="w-8 h-8" />
  let label = 'MEASURE'

  if (isCapturing) {
    buttonClass += ' bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-4 border-[var(--accent)] text-[var(--accent)]'
    icon = <Loader2 className="w-8 h-8 animate-spin" />
    label = 'CAPTURING…'
  } else if (lastResult === 'success') {
    buttonClass += ' bg-[color-mix(in_srgb,var(--success)_30%,transparent)] border-4 border-[var(--success)] text-[var(--success)] scale-105'
    icon = <CheckCircle className="w-8 h-8" />
    label = 'STORED'
  } else if (lastResult === 'error') {
    buttonClass += ' bg-[color-mix(in_srgb,var(--error)_30%,transparent)] border-4 border-[var(--error)] text-[var(--error)]'
    icon = <AlertTriangle className="w-8 h-8" />
    label = 'FAILED'
  } else if (isDisabled) {
    buttonClass += ' bg-[var(--bg-tertiary)] border-4 border-[var(--border-color)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
    if (!isConnected) label = 'NO INSTRUMENT'
    else if (!stationSetup) label = 'SETUP FIRST'
    else if (!validId) label = 'POINT ID REQUIRED'
  } else {
    buttonClass += ' bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-4 border-[var(--accent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] active:scale-95 cursor-pointer'
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
        <label className="block text-sm font-semibold" htmlFor="collector-point-id">Point ID</label>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" disabled={isCapturing || !validId || !stepPointId(pointId, -1)} onClick={() => selectId(stepPointId(pointId, -1) ?? pointId)} className="btn btn-secondary min-h-11 min-w-11" title="Previous point number">−</button>
          <input id="collector-point-id" value={pointIdInput} onChange={event => selectId(event.target.value)} maxLength={100} disabled={isCapturing} autoCapitalize="characters" spellCheck={false}
            aria-invalid={!!pointId && !validId} className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-base tabular-nums" />
          <button type="button" disabled={isCapturing || !validId || !stepPointId(pointId, 1)} onClick={() => selectId(stepPointId(pointId, 1) ?? pointId)} className="btn btn-secondary min-h-11 min-w-11" title="Next point number">+</button>
        </div>
        <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">Feature code: <strong>{featureCode || 'Uncoded'}</strong></p>
        {!!pointId && !validId && <p className="mt-1 text-sm text-[var(--error)]">Use letters, numbers, dots, dashes or underscores. Start with a letter or number.</p>}
      </div>
      <button type="button"
        onClick={handleMeasure}
        disabled={isDisabled}
        className={buttonClass}
        aria-label={`Measure point ${pointId}`}
      >
        {icon}
        <span className="text-sm tracking-wider">{label}</span>
      </button>

      {lastResult === 'success' && lastPointId && (
        <p role="status" className="break-all text-center text-sm text-[var(--success)]">{lastPointId} stored on this device. Review it in the point log.</p>
      )}

      {lastResult === 'error' && (
        <p role="status" className="max-w-xs text-center text-sm text-[var(--error)]">
          No point was saved. Check the point ID, incoming instrument reading and device storage, then retry.
        </p>
      )}
    </div>
  )
}
