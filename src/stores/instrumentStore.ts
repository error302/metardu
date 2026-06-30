/**
 * Instrument Connection Store (Zustand)
 * ══════════════════════════════════════
 * Centralized reactive state for all instrument connections —
 * replaces the old `window.__metarduLastInstrumentReading` bridge
 * and the scattered useState/useRef in useInstrumentConnection.
 *
 * Any component can subscribe to connection status, latest readings,
 * and instrument metadata without prop-drilling or global hacks.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Types ──────────────────────────────────────────────────────

export type ConnectionTransport = 'web-serial' | 'web-bluetooth' | 'capacitor-ble' | 'none'

export type ConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'reconnecting'
  | 'error'

export type InstrumentKind = 'total-station' | 'gnss-receiver' | 'unknown'

export interface StreamedPoint {
  id: string
  pointName: string
  latitude: number
  longitude: number
  northing: number
  easting: number
  elevation: number | null
  timestamp: Date
  source: 'nmea' | 'gsi' | 'manual'
  quality?: number
  satellites?: number
  hdop?: number
  raw?: string
}

export interface InstrumentDevice {
  id: string
  name: string
  kind: InstrumentKind
  transport: ConnectionTransport
  rssi?: number
}

export interface InstrumentInfo {
  manufacturer: string
  model?: string
  protocol: 'nmea' | 'gsi' | 'geocom' | 'rc232' | 'ssv' | 'sdr33' | 'unknown'
  firmwareVersion?: string
  serialNumber?: string
}

export interface ConnectionMetrics {
  bytesReceived: number
  messagesParsed: number
  errorsCount: number
  connectedAt: Date | null
  lastDataAt: Date | null
  reconnectAttempts: number
}

export interface InstrumentState {
  // Connection
  status: ConnectionStatus
  transport: ConnectionTransport
  device: InstrumentDevice | null
  instrumentInfo: InstrumentInfo | null
  error: string | null

  // Data
  latestPoint: StreamedPoint | null
  points: StreamedPoint[]
  metrics: ConnectionMetrics

  // BLE reconnection
  autoReconnect: boolean
  maxReconnectAttempts: number
  reconnectDelayMs: number
  lastDeviceId: string | null

  // Actions
  setStatus: (status: ConnectionStatus) => void
  setTransport: (transport: ConnectionTransport) => void
  setDevice: (device: InstrumentDevice | null) => void
  setInstrumentInfo: (info: InstrumentInfo | null) => void
  setError: (error: string | null) => void
  addPoint: (point: StreamedPoint) => void
  clearPoints: () => void
  incrementBytes: (count: number) => void
  incrementMessages: () => void
  incrementErrors: () => void
  setConnected: (device: InstrumentDevice, transport: ConnectionTransport) => void
  setDisconnected: () => void
  setStreaming: () => void
  setAutoReconnect: (enabled: boolean) => void
  recordReconnectAttempt: () => void
  resetReconnectAttempts: () => void
}

const INITIAL_METRICS: ConnectionMetrics = {
  bytesReceived: 0,
  messagesParsed: 0,
  errorsCount: 0,
  connectedAt: null,
  lastDataAt: null,
  reconnectAttempts: 0,
}

export const useInstrumentStore = create<InstrumentState>()(
  subscribeWithSelector((set, get) => ({
    // ─── Initial state ────────────────────────────────────
    status: 'disconnected',
    transport: 'none',
    device: null,
    instrumentInfo: null,
    error: null,

    latestPoint: null,
    points: [],
    metrics: { ...INITIAL_METRICS },

    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 2000,
    lastDeviceId: null,

    // ─── Actions ──────────────────────────────────────────

    setStatus: (status) => set({ status }),

    setTransport: (transport) => set({ transport }),

    setDevice: (device) => set((s) => ({
      device,
      lastDeviceId: device?.id ?? s.lastDeviceId,
    })),

    setInstrumentInfo: (instrumentInfo) => set({ instrumentInfo }),

    setError: (error) => set({ error, status: error ? 'error' : get().status }),

    addPoint: (point) => set((s) => ({
      latestPoint: point,
      points: [...s.points, point],
      metrics: {
        ...s.metrics,
        lastDataAt: new Date(),
      },
      // Auto-transition to streaming on first data
      status: s.status === 'connected' ? 'streaming' : s.status,
    })),

    clearPoints: () => set({ points: [], latestPoint: null }),

    incrementBytes: (count) => set((s) => ({
      metrics: { ...s.metrics, bytesReceived: s.metrics.bytesReceived + count },
    })),

    incrementMessages: () => set((s) => ({
      metrics: { ...s.metrics, messagesParsed: s.metrics.messagesParsed + 1 },
    })),

    incrementErrors: () => set((s) => ({
      metrics: { ...s.metrics, errorsCount: s.metrics.errorsCount + 1 },
    })),

    setConnected: (device, transport) => set({
      status: 'connected',
      device,
      transport,
      error: null,
      metrics: {
        ...INITIAL_METRICS,
        connectedAt: new Date(),
      },
    }),

    setDisconnected: () => set((s) => ({
      status: 'disconnected',
      device: null,
      instrumentInfo: null,
      transport: 'none',
      error: null,
      // Keep points and metrics for review after disconnect
      // but clear the connected timestamp
      metrics: {
        ...s.metrics,
        connectedAt: null,
      },
    })),

    setStreaming: () => set({ status: 'streaming' }),

    setAutoReconnect: (enabled) => set({ autoReconnect: enabled }),

    recordReconnectAttempt: () => set((s) => ({
      metrics: {
        ...s.metrics,
        reconnectAttempts: s.metrics.reconnectAttempts + 1,
      },
      status: 'reconnecting',
    })),

    resetReconnectAttempts: () => set((s) => ({
      metrics: {
        ...s.metrics,
        reconnectAttempts: 0,
      },
    })),
  }))
)

// ─── Selectors ──────────────────────────────────────────────────

export const selectIsConnected = (s: InstrumentState) =>
  s.status === 'connected' || s.status === 'streaming'

export const selectIsStreaming = (s: InstrumentState) =>
  s.status === 'streaming'

export const selectPointCount = (s: InstrumentState) =>
  s.points.length

export const selectConnectionUptime = (s: InstrumentState): number => {
  if (!s.metrics.connectedAt) return 0
  return Date.now() - s.metrics.connectedAt.getTime()
}

export const selectCanReconnect = (s: InstrumentState) =>
  s.autoReconnect &&
  s.lastDeviceId !== null &&
  s.metrics.reconnectAttempts < s.maxReconnectAttempts

/**
 * Get a snapshot of the latest instrument reading for cross-component
 * consumption without React re-renders. Replaces the old
 * window.__metarduLastInstrumentReading bridge.
 */
export function getLatestReadingSnapshot(): StreamedPoint | null {
  return useInstrumentStore.getState().latestPoint
}
