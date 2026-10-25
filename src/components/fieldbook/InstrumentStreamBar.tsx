'use client'

/** Instrument capture through the available serial or Bluetooth LE transports.
 * Protocol presets require a matching instrument configuration and a checked
 * sample before field use. Raw records are retained even when decoding fails.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Crosshair, Loader2, Check,
  MapPin, Plus, Activity,
  AlertCircle, Zap, X,
} from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import { useHaptics } from './MobileFieldUX'
import type { GNSSBleConnection, GNSSPosition } from '@/lib/instruments/gnssBleConnection'
import type { TotalStationConnection, InstrumentBrand } from '@/lib/instruments/totalStationSerial'

export type CollectionMode = 'total-station' | 'gnss' | 'manual'
function CollectionModeIcon({ mode, className }: { mode: CollectionMode; className: string }) {
  return mode === 'manual' ? <Plus className={className} aria-hidden="true" />
    : <GeomaticsIcon symbol={mode === 'total-station' ? 'total-station' : 'gnss-rover'} className={className} />
}
export type SurveyType = 'traverse' | 'leveling' | 'control' | 'topographic'

export interface StreamedReading {
  /** Target point identifier supplied by the instrument, when present. */
  station?: string
  /** Instrument setup station is separate from the measured target point. */
  setupStation?: string
  bearing?: number      // decimal degrees
  distance?: number     // metres (slope or horizontal)
  verticalAngle?: number // decimal degrees (zenith)
  easting?: number
  northing?: number
  latitude?: number
  longitude?: number
  horizontalCrs?: string
  verticalDatum?: string
  elevation?: number
  instrumentHeight?: number
  targetHeight?: number
  temperature?: number
  pressure?: number
  fixQuality?: number   // GNSS: 0=none, 1=GPS, 2=DGPS, 4=RTK fixed, 5=RTK float
  solutionType?: 'fixed' | 'float' | 'dgps' | 'single'
  satellites?: number
  hdop?: number
  accuracy?: number     // metres
  accuracySource?: 'receiver' | 'browser' | 'unknown'
  source?: 'gnss_receiver' | 'browser_geolocation' | 'total_station'
  instrumentName?: string
  rawData?: string
  timestamp: string
}

interface InstrumentStreamBarProps {
  docked?: boolean
  onManualEntry?: () => void
  surveyType: SurveyType
  /** Called when a reading is collected (from instrument or GPS) */
  onReading: (reading: StreamedReading) => void | Promise<void>
  /** Station name for the current setup */
  stationName?: string
  /** Instrument height (for total station) */
  instrumentHeight?: number
  /** Target height (for total station) */
  targetHeight?: number
}

export function InstrumentStreamBar({
  docked = true,
  onManualEntry,
  surveyType,
  onReading,
  stationName = 'STN',
  instrumentHeight,
  targetHeight,
}: InstrumentStreamBarProps) {
  const [mode, setMode] = useState<CollectionMode>('manual')
  const [brand, setBrand] = useState<InstrumentBrand>('generic')
  const [baudRate, setBaudRate] = useState(9600)
  const [heightText, setHeightText] = useState(instrumentHeight?.toString() ?? '')
  const [targetText, setTargetText] = useState(targetHeight?.toString() ?? '')
  const [capabilities, setCapabilities] = useState({ serial: false, bluetooth: false })
  const onReadingRef = useRef(onReading)
  useEffect(() => { onReadingRef.current = onReading }, [onReading])
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [lastReading, setLastReading] = useState<StreamedReading | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoCollect, setAutoCollect] = useState(false)
  const [autoCollectInterval, setAutoCollectInterval] = useState(5) // seconds
  const [readingCount, setReadingCount] = useState(0)
  const [receiverPosition, setReceiverPosition] = useState<GNSSPosition | null>(null)
  const haptics = useHaptics()
  const autoCollectRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const totalStationRef = useRef<TotalStationConnection | null>(null)
  const gnssConnectionRef = useRef<GNSSBleConnection | null>(null)
  const receiverPositionRef = useRef<{ position: GNSSPosition; receivedAt: number } | null>(null)
  const receiverNameRef = useRef<string | undefined>(undefined)
  const measureCompletionRef = useRef<{
    resolve: () => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)

  // Auto-detect available instruments
  useEffect(() => {
    const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator
    const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator
    setCapabilities({ serial: hasSerial && window.isSecureContext, bluetooth: hasBluetooth && window.isSecureContext })

    if (hasSerial && (surveyType === 'traverse' || surveyType === 'topographic' || surveyType === 'leveling')) {
      setMode('total-station')
    } else if (hasBluetooth && (surveyType === 'control' || surveyType === 'topographic')) {
      setMode('gnss')
    } else {
      setMode('manual')
    }
  }, [surveyType])

  // Connect to instrument
  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    haptics('medium')

    try {
      if (mode === 'total-station') {
        await totalStationRef.current?.disconnect()
        // Use the existing TotalStationConnection from src/lib/instruments/
        const { TotalStationConnection, INSTRUMENT_PRESETS } = await import('@/lib/instruments/totalStationSerial')
        const preset = { ...INSTRUMENT_PRESETS[brand], baudRate }
        const configuredHeight = heightText.trim() && Number.isFinite(Number(heightText)) ? Number(heightText) : undefined
        const configuredTarget = targetText.trim() && Number.isFinite(Number(targetText)) ? Number(targetText) : undefined

        const conn = new TotalStationConnection(preset, (obs) => {
          if (!obs.parsed) {
            void Promise.resolve(onReadingRef.current({ source: 'total_station', rawData: obs.raw,
              instrumentName: preset.model || preset.brand, setupStation: stationName, timestamp: obs.timestamp,
            })).then(() => {
              setError('Raw record saved, but its measurement format was not recognized. Check the selected protocol.')
            }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'The raw record could not be saved.'))
            return
          }
          if (obs.parsed) {
            const reading: StreamedReading = {
              station: obs.parsed.pointId || '',
              setupStation: stationName,
              bearing: obs.parsed.horizontalAngle,
              distance: obs.parsed.slopeDistance,
              verticalAngle: obs.parsed.verticalAngle,
              easting: obs.parsed.easting,
              northing: obs.parsed.northing,
              elevation: obs.parsed.elevation,
              instrumentHeight: obs.parsed.instrumentHeight ?? configuredHeight,
              targetHeight: obs.parsed.targetHeight ?? configuredTarget,
              source: 'total_station',
              instrumentName: preset.model || preset.brand,
              rawData: obs.raw,
              timestamp: obs.timestamp,
            }
            void Promise.resolve(onReadingRef.current(reading)).then(() => {
              setLastReading(reading)
              setReadingCount((count) => count + 1)
              haptics('success')
              measureCompletionRef.current?.resolve()
            }).catch((error: unknown) => {
              const failure = error instanceof Error ? error : new Error(String(error))
              setError(failure.message)
              measureCompletionRef.current?.reject(failure)
            })
          }
        }, setConnected)

        totalStationRef.current = conn
        await conn.connect()
        haptics('success')
      } else if (mode === 'gnss') {
        const { GNSSBleConnection } = await import('@/lib/instruments/gnssBleConnection')

        const conn = new GNSSBleConnection(
          (position) => {
            receiverPositionRef.current = { position, receivedAt: Date.now() }
            setReceiverPosition(position)
          },
          (state) => {
            setConnected(state.connected)
            receiverNameRef.current = state.deviceName
            if (!state.connected) {
              receiverPositionRef.current = null
              setReceiverPosition(null)
            }
          }
        )

        gnssConnectionRef.current = conn
        await conn.connect()
        haptics('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      await Promise.allSettled([
        totalStationRef.current?.disconnect(),
        gnssConnectionRef.current?.disconnect(),
      ].filter((operation): operation is Promise<void> => operation !== undefined))
      totalStationRef.current = null
      gnssConnectionRef.current = null
      setConnected(false)
      haptics('heavy')
    } finally {
      setConnecting(false)
    }
  }, [mode, stationName, heightText, targetText, brand, baudRate, haptics])

  const handleDisconnect = useCallback(async () => {
    const pending = measureCompletionRef.current
    if (pending) {
      clearTimeout(pending.timeout)
      measureCompletionRef.current = null
      pending.reject(new Error('Measurement cancelled because the instrument disconnected.'))
    }
    const connections = [totalStationRef.current, gnssConnectionRef.current]
    totalStationRef.current = null
    gnssConnectionRef.current = null
    await Promise.allSettled(connections.map((connection) => connection?.disconnect()).filter(
      (operation): operation is Promise<void> => operation !== undefined
    ))
    receiverPositionRef.current = null
    receiverNameRef.current = undefined
    setReceiverPosition(null)
    setConnected(false)
    setMeasuring(false)
  }, [])

  useEffect(() => () => {
    const pending = measureCompletionRef.current
    if (pending) clearTimeout(pending.timeout)
    void totalStationRef.current?.disconnect()
    void gnssConnectionRef.current?.disconnect()
  }, [])

  // Measure (total station)
  const handleMeasure = useCallback(async () => {
    if (!connected || mode !== 'total-station' || !totalStationRef.current) return

    setMeasuring(true)
    haptics('medium')

    try {
      const conn = totalStationRef.current
      const observationReceived = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          measureCompletionRef.current = null
          reject(new Error('No valid measurement was received from the total station within 12 seconds.'))
        }, 12000)
        measureCompletionRef.current = {
          resolve: () => {
            clearTimeout(timeout)
            measureCompletionRef.current = null
            resolve()
          },
          reject: (error) => {
            clearTimeout(timeout)
            measureCompletionRef.current = null
            reject(error)
          },
          timeout,
        }
      })
      await conn.measure()
      await observationReceived
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Measurement failed')
      haptics('heavy')
    } finally {
      setMeasuring(false)
    }
  }, [connected, mode, haptics])

  // Collect GNSS point
  const handleCollectGNSS = useCallback(async () => {
    if (!connected || mode !== 'gnss') return

    haptics('medium')

    try {
      const latest = receiverPositionRef.current
      if (!latest) throw new Error('Waiting for a position from the connected GNSS receiver. No point was recorded.')
      if (Date.now() - latest.receivedAt > 10000) {
        throw new Error('The GNSS receiver position is stale. Wait for a fresh receiver update before collecting.')
      }
      if (!Number.isInteger(latest.position.fixQuality) || latest.position.fixQuality <= 0) {
        throw new Error('The receiver reports no valid GNSS fix. No point was recorded.')
      }

      const position = latest.position
      const solutionTypeByFixQuality: Record<number, StreamedReading['solutionType']> = {
        1: 'single',
        2: 'dgps',
        4: 'fixed',
        5: 'float',
      }
      const reading: StreamedReading = {
        station: `${stationName}_${readingCount + 1}`,
        latitude: position.latitude,
        longitude: position.longitude,
        horizontalCrs: 'EPSG:4326',
        elevation: Number.isFinite(position.elevation) ? position.elevation : undefined,
        accuracy: position.accuracy ?? undefined,
        accuracySource: position.accuracy == null ? undefined : 'receiver',
        fixQuality: position.fixQuality,
        solutionType: solutionTypeByFixQuality[position.fixQuality],
        satellites: position.satellites,
        hdop: position.hdop,
        source: 'gnss_receiver',
        instrumentName: receiverNameRef.current,
        timestamp: position.timestamp,
      }
      await onReadingRef.current(reading)
      setLastReading(reading)
      setReadingCount((count) => count + 1)
      haptics('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GPS collection failed')
      haptics('heavy')
    }
  }, [connected, mode, stationName, readingCount, haptics])

  // Auto-collect mode (GNSS only — records points at interval)
  useEffect(() => {
    if (!autoCollect || mode !== 'gnss' || !connected) {
      if (autoCollectRef.current) {
        clearInterval(autoCollectRef.current)
        autoCollectRef.current = null
      }
      return
    }

    autoCollectRef.current = setInterval(() => {
      handleCollectGNSS()
    }, autoCollectInterval * 1000)

    return () => {
      if (autoCollectRef.current) clearInterval(autoCollectRef.current)
    }
  }, [autoCollect, mode, connected, autoCollectInterval, handleCollectGNSS])

  return (
    <div aria-label="Instrument capture" className={`${docked ? 'fixed bottom-0 left-0 right-0 z-40 max-h-[60dvh] overflow-y-auto' : 'rounded-xl border overflow-hidden'} bg-[var(--bg-secondary)] border-t border-[var(--border-color)]`}>
      {/* Error banner */}
      {error && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span role="alert">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss instrument error" className="ml-auto text-red-400/50 hover:text-red-400">
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex items-center gap-1 px-3 pt-2">
        {(['total-station', 'gnss', 'manual'] as CollectionMode[]).map(m => {
          const label = m === 'total-station' ? 'Total Station' : m === 'gnss' ? 'GNSS Rover' : 'Manual'
          const active = mode === m
          return (
            <button
              key={m}
              disabled={connecting}
              onClick={() => {
                if (m !== mode) void handleDisconnect()
                setMode(m)
                setError(null)
                haptics('light')
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
              }`}
            >
              <CollectionModeIcon mode={m} className="w-3.5 h-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {mode === 'total-station' && !connected && <details className="px-4 pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[var(--text-primary)]">Connection settings</summary><div className="grid grid-cols-2 gap-2 px-4 pt-3 text-xs text-[var(--text-secondary)]">
        <label>Instrument protocol<select aria-label="Instrument protocol" value={brand} disabled={connecting} onChange={event => setBrand(event.target.value as InstrumentBrand)} className="input mt-1 min-h-11 w-full text-base">
          {(['generic', 'leica', 'topcon', 'sokkia', 'trimble', 'pentax', 'south'] as InstrumentBrand[]).map(value => <option key={value} value={value}>{value === 'generic' ? 'Generic / receive only' : value[0].toUpperCase() + value.slice(1)}</option>)}
        </select></label>
        <label>Baud rate<select aria-label="Instrument baud rate" value={baudRate} disabled={connecting} onChange={event => setBaudRate(Number(event.target.value))} className="input mt-1 min-h-11 w-full text-base">
          {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(rate => <option key={rate} value={rate}>{rate}</option>)}
        </select></label>
        <label>Instrument height (m)<input aria-label="Instrument height in metres" inputMode="decimal" value={heightText} disabled={connecting} onChange={event => setHeightText(event.target.value)} className="input mt-1 min-h-11 w-full text-base" placeholder="Measured height" /></label>
        <label>Target height (m)<input aria-label="Target height in metres" inputMode="decimal" value={targetText} disabled={connecting} onChange={event => setTargetText(event.target.value)} className="input mt-1 min-h-11 w-full text-base" placeholder="Measured height" /></label>
      </div></details>}
      {mode !== 'manual' && !connected && <p className="px-4 pt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        {mode === 'total-station'
          ? capabilities.serial ? 'Match the serial protocol and baud rate to your instrument. Android connections depend on controller, browser and transport support.' : 'Serial access is unavailable here. Use a compatible browser/controller, or transfer an exported job file.'
          : capabilities.bluetooth ? 'Use a receiver that streams NMEA over a supported Bluetooth LE service. Bluetooth Classic pairing alone is insufficient.' : 'Bluetooth LE access is unavailable here. Use a compatible browser/controller or transfer a file.'}
      </p>}

      {/* Main action area */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Connection status */}
        <div className="shrink-0">
          {mode === 'manual' ? null : connected ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">
                {mode === 'gnss' && receiverPosition ? `Connected · ${receiverPosition.fixLabel}` : 'Connected'}
              </span>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="ml-1 rounded px-1.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting || (mode === 'total-station' ? !capabilities.serial : !capabilities.bluetooth)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] active:scale-95 transition"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CollectionModeIcon mode={mode} className="w-4 h-4" />}
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>

        {/* Primary action button */}
        <div className="flex-1">
          {mode === 'manual' ? (
            <button
              onClick={() => {
                haptics('medium')
                onManualEntry?.()
              }}
              disabled={!onManualEntry}
              className="w-full min-h-12 py-3 bg-[var(--accent)] text-black font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              <Plus className="w-5 h-5" />
              Add Reading
            </button>
          ) : mode === 'total-station' ? (
            <button
              onClick={handleMeasure}
              disabled={!connected || measuring}
              className="w-full py-3 bg-[var(--accent)] text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition"
            >
              {measuring ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crosshair className="w-5 h-5" />}
              {measuring ? 'Measuring...' : 'Measure'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCollectGNSS}
                disabled={!connected}
                className="flex-1 py-3 bg-[var(--accent)] text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition"
              >
                <MapPin className="w-5 h-5" />
                Collect Point
              </button>
              <button
                onClick={() => { setAutoCollect(!autoCollect); haptics('medium') }}
                className={`px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition ${
                  autoCollect
                    ? 'bg-red-500 text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {autoCollect ? <Activity className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                {autoCollect ? 'Stop' : 'Auto'}
              </button>
            </div>
          )}
        </div>

        {/* Reading count */}
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{readingCount}</div>
          <div className="text-[9px] text-[var(--text-muted)] uppercase">Readings</div>
        </div>
      </div>

      {/* Last reading preview (compact) */}
      {lastReading && (
        <div className="px-4 pb-2 -mt-1">
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)] rounded-lg px-3 py-1.5">
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Last:
            </span>
            {lastReading.bearing != null && (
              <span className="font-mono">{lastReading.bearing.toFixed(4)} deg</span>
            )}
            {lastReading.distance != null && (
              <span className="font-mono">{lastReading.distance.toFixed(3)} m</span>
            )}
            {lastReading.easting != null && (
              <span className="font-mono">E:{lastReading.easting.toFixed(3)}</span>
            )}
            {lastReading.latitude != null && lastReading.longitude != null && (
              <span className="font-mono">{lastReading.latitude.toFixed(7)}, {lastReading.longitude.toFixed(7)} · {lastReading.horizontalCrs}</span>
            )}
            {lastReading.fixQuality != null && (
              <span className="font-medium">{lastReading.fixQuality === 4 ? 'RTK fixed' : lastReading.fixQuality === 5 ? 'RTK float' : lastReading.fixQuality === 2 ? 'DGPS' : lastReading.fixQuality === 1 ? 'Single' : `Fix ${lastReading.fixQuality}`}</span>
            )}
            {lastReading.elevation != null && (
              <span className="font-mono">Z:{lastReading.elevation.toFixed(3)}</span>
            )}
            {lastReading.accuracy != null && (
              <span className="font-mono text-amber-400">+/-{lastReading.accuracy.toFixed(2)}m</span>
            )}
          </div>
        </div>
      )}

      {/* Auto-collect interval slider */}
      {autoCollect && mode === 'gnss' && (
        <div className="px-4 pb-2 -mt-1">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span>Auto-collect every</span>
            <input
              type="range"
              min="1"
              max="30"
              value={autoCollectInterval}
              onChange={e => setAutoCollectInterval(+e.target.value)}
              className="flex-1 max-w-32"
            />
            <span className="font-mono">{autoCollectInterval}s</span>
          </div>
        </div>
      )}
    </div>
  )
}
