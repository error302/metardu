'use client'

/**
 * RealTimeQCPanel — Live quality control during field work.
 *
 * Shows:
 *   - Running closure (live misclosure as each leg is added)
 *   - Precision ratio with color coding (green/amber/red)
 *   - Setup verification checklist
 *   - Redundant observation alerts
 *   - Outlier detection results
 *
 * Wired to src/lib/survey/realTimeQC.ts
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  RunningClosureMonitor,
  detectRedundantObservationDiscrepancies,
  verifySetup,
  formatPrecisionIndicator,
  type Observation,
  type SurveyClass,
} from '@/lib/survey/realTimeQC'
import {
  AlertTriangle, CheckCircle2, XCircle, Gauge,
  ShieldCheck, Activity,
} from 'lucide-react'
import { useInstrumentStore } from '@/stores/instrumentStore'

interface RealTimeQCPanelProps {
  /** Observations from the current traverse (for redundant obs detection and closure) */
  observations?: Observation[]
  /** Current survey class */
  surveyClass?: SurveyClass
  /** Compact mode (for embedding in field book sidebar) */
  compact?: boolean
}

export function RealTimeQCPanel({
  observations = [],
  surveyClass = 'urban',
  compact = false,
}: RealTimeQCPanelProps) {
  const [monitor] = useState(() => new RunningClosureMonitor(surveyClass))
  const [manualLegs, setManualLegs] = useState<Array<{ bearing: number; distance: number }>>([])
  const [setupData] = useState({
    instrumentHeight: 1.5,
    targetHeight: 1.5,
    temperature: 25,
    pressure: 1013,
    isControlPoint: false,
  })

  // Subscribe to live instrument store (connected total stations & GNSS rovers)
  const latestPoint = useInstrumentStore((s) => s.latestPoint)
  const connectionStatus = useInstrumentStore((s) => s.status)
  const connectedDevice = useInstrumentStore((s) => s.device)

  // Synchronize surveyClass with monitor
  useEffect(() => {
    monitor.setSurveyClass(surveyClass)
  }, [monitor, surveyClass])

  // Automatically sync incoming observations into running closure monitor
  useEffect(() => {
    monitor.reset()
    for (const obs of observations) {
      if (obs.bearing != null && obs.distance != null && obs.distance > 0) {
        monitor.addLeg(obs.bearing, obs.distance)
      }
    }
    for (const leg of manualLegs) {
      monitor.addLeg(leg.bearing, leg.distance)
    }
  }, [monitor, observations, manualLegs])

  const state = monitor.getState()

  const addLeg = useCallback((bearing: number, distance: number) => {
    setManualLegs(prev => [...prev, { bearing, distance }])
  }, [])

  const undoLeg = useCallback(() => {
    setManualLegs(prev => prev.slice(0, -1))
  }, [])

  const reset = useCallback(() => {
    setManualLegs([])
    monitor.reset()
  }, [monitor])



  // Redundant observation check
  const discrepancies = useMemo(
    () => detectRedundantObservationDiscrepancies(observations),
    [observations]
  )

  // Setup verification
  const setupChecks = useMemo(
    () => verifySetup(setupData),
    [setupData]
  )

  const precisionInfo = formatPrecisionIndicator(state.precisionRatio ?? null, surveyClass)

  const hasHardware = connectionStatus === 'connected' || connectionStatus === 'streaming' || latestPoint !== null
  const fixQuality = latestPoint?.quality
  const fixLabel = fixQuality === 4 ? 'RTK Fixed'
    : fixQuality === 5 ? 'RTK Float'
    : fixQuality === 2 ? 'DGPS'
    : fixQuality === 1 ? 'GPS'
    : latestPoint?.source === 'gsi' ? 'Total Station'
    : connectionStatus === 'streaming' ? 'Streaming'
    : 'No Fix'

  const hdop = latestPoint?.hdop ?? null
  const sats = latestPoint?.satellites ?? null

  if (compact) {
    return (
      <div className="space-y-2">
        {/* Live Hardware QC Metrics */}
        {hasHardware && (
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[var(--border-color)] text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-emerald-400">
                {fixLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[var(--text-muted)] font-mono">
              {sats !== null && (
                <span title="Satellites in view">🛰️ {sats}</span>
              )}
              {hdop !== null && (
                <span title="Horizontal Dilution of Precision" className={hdop <= 1.5 ? 'text-emerald-400' : hdop <= 2.5 ? 'text-amber-400' : 'text-red-400'}>
                  HDOP {hdop.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Precision indicator */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)] uppercase">Precision</span>
          <span className={`font-mono text-xs font-bold ${
            precisionInfo.color === 'green' ? 'text-emerald-400'
            : precisionInfo.color === 'amber' ? 'text-amber-400'
            : 'text-red-400'
          }`}>
            {precisionInfo.label}
          </span>
        </div>
        {/* Misclosure */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)] uppercase">Misclosure</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">
            {state.linearMisclosure.toFixed(3)}m
          </span>
        </div>
        {/* Warnings */}
        {state.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-1 text-[10px] text-amber-400">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{w}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Live Hardware QC Metrics Card ── */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Hardware Live QC</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${hasHardware ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {connectedDevice?.name || (hasHardware ? 'Hardware Active' : 'Disconnected')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-[var(--bg-tertiary)]">
            <p className={`text-xs font-bold font-mono ${
              fixQuality === 4 ? 'text-emerald-400'
              : fixQuality === 5 ? 'text-lime-400'
              : fixQuality === 2 ? 'text-blue-400'
              : 'text-[var(--text-secondary)]'
            }`}>
              {fixLabel}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase mt-0.5">Fix Mode</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-[var(--bg-tertiary)]">
            <p className="text-xs font-bold font-mono text-[var(--text-primary)]">
              {sats !== null ? sats : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase mt-0.5">Satellites</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-[var(--bg-tertiary)]">
            <p className={`text-xs font-bold font-mono ${
              hdop === null ? 'text-[var(--text-muted)]'
              : hdop <= 1.5 ? 'text-emerald-400'
              : hdop <= 2.5 ? 'text-amber-400'
              : 'text-red-400'
            }`}>
              {hdop !== null ? hdop.toFixed(1) : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase mt-0.5">HDOP</p>
          </div>
        </div>

        {latestPoint && typeof latestPoint.easting === 'number' && Number.isFinite(latestPoint.easting)
          && typeof latestPoint.northing === 'number' && Number.isFinite(latestPoint.northing) && (
          <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
            <span>E: {latestPoint.easting.toFixed(2)}</span>
            <span>N: {latestPoint.northing.toFixed(2)}</span>
            {latestPoint.elevation !== null && <span>Z: {latestPoint.elevation.toFixed(2)}m</span>}
          </div>
        )}
      </div>

      {/* ── Running Closure Monitor ── */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Running Closure</h3>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">{state.legCount}</p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase">Legs</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {state.linearMisclosure.toFixed(3)}m
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase">Misclosure</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${
              precisionInfo.color === 'green' ? 'text-emerald-400'
              : precisionInfo.color === 'amber' ? 'text-amber-400'
              : 'text-red-400'
            }`}>
              {precisionInfo.label}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase">Precision</p>
          </div>
        </div>

        {/* Distance bar */}
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
            <span>Total: {state.totalDistance.toFixed(1)}m</span>
            <span>Required: 1:{state.minRequired.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                state.meetsStandard ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{
                width: state.totalDistance > 0 && state.precisionRatio
                  ? `${Math.min(100, (state.precisionRatio / state.minRequired) * 100)}%`
                  : '0%'
              }}
            />
          </div>
        </div>

        {/* Warnings */}
        {state.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{w}</span>
          </div>
        ))}

        {/* Quick add leg (for testing/manual entry) */}
        <div className="flex gap-2">
          <button
            onClick={() => addLeg(45, 50)}
            className="text-[10px] px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] hover:bg-[var(--border-color)]"
          >
            + Test Leg (45°, 50m)
          </button>
          {manualLegs.length > 0 && (
            <button
              onClick={undoLeg}
              className="text-[10px] px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] hover:bg-[var(--border-color)]"
            >
              ↶ Undo
            </button>
          )}
          {manualLegs.length > 0 && (
            <button
              onClick={reset}
              className="text-[10px] px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Setup Verification ── */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Setup Check</h3>
        </div>

        <div className="space-y-2">
          {setupChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {check.passed
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              }
              <span className={`flex-1 ${check.passed ? 'text-[var(--text-secondary)]' : 'text-red-400'}`}>
                {check.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Redundant Observation Alerts ── */}
      {discrepancies.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Observation Discrepancies ({discrepancies.length})
            </h3>
          </div>
          <div className="space-y-2">
            {discrepancies.map((d, i) => (
              <div
                key={i}
                className={`text-xs rounded-lg p-2 ${
                  d.severity === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {d.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Survey Class selector ── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-muted)] uppercase">Class:</span>
        {(['control', 'urban', 'rural', 'topographic'] as SurveyClass[]).map(cls => (
          <button
            key={cls}
            onClick={() => monitor.setSurveyClass(cls)}
            className={`text-[10px] px-2 py-1 rounded ${
              surveyClass === cls
                ? 'bg-[var(--accent)] text-black font-semibold'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            }`}
          >
            {cls}
          </button>
        ))}
      </div>
    </div>
  )
}
