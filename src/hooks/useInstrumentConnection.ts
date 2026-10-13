/**
 * METARDU — useInstrumentConnection Hook
 * ========================================
 * React hook for managing serial instrument connections.
 * Provides real-time data stream from Total Stations and GNSS receivers.
 *
 * Usage:
 * ```tsx
 * const { connect, disconnect, status, lastPoint, isStreaming } = useInstrumentConnection()
 *
 * // Connect to a Leica TS16
 * await connect({ baudRate: 115200 })
 *
 * // Or use a preset
 * await connectWithPreset('leica-ts16')
 * ```
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  InstrumentSerialConnection,
  isSerialSupported,
  type ConnectionStatus,
  type SerialConnectionConfig,
  type ParsedInstrumentData,
  type InstrumentInfo,
} from '@/lib/serial'
import { createStreamedPoint, type StreamedPoint as InstrumentStreamedPoint } from '@/lib/serial/streamedPoint'
export type { StreamedPoint } from '@/lib/serial/streamedPoint'
import { logger } from '@/lib/logger'
import { useInstrumentStore } from '@/stores/instrumentStore'

export interface UseInstrumentConnectionReturn {
  /** Connect to an instrument (triggers port selection dialog) */
  connect: (config?: Partial<SerialConnectionConfig>) => Promise<void>
  /** Connect using a named preset */
  connectWithPreset: (presetKey: string) => Promise<void>
  /** Disconnect from instrument */
  disconnect: () => Promise<void>
  /** Current connection status */
  status: ConnectionStatus
  /** Whether data is actively streaming */
  isStreaming: boolean
  /** Whether the Web Serial API is available */
  isSupported: boolean
  /** Instrument info (detected manufacturer, protocol) */
  instrumentInfo: InstrumentInfo | null
  /** All points received during this session */
  points: InstrumentStreamedPoint[]
  /** Most recently received point */
  lastPoint: InstrumentStreamedPoint | null
  /** Total bytes received */
  bytesReceived: number
  /** Total messages parsed */
  messagesParsed: number
  /** Total errors */
  errorCount: number
  /** Clear all received points */
  clearPoints: () => void
  /** Send an instrument command */
  sendCommand: (commandType: string, ...args: unknown[]) => Promise<void>
  /** Error message if connection failed */
  error: string | null
}

export function useInstrumentConnection(): UseInstrumentConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [isStreaming, setIsStreaming] = useState(false)
  const [instrumentInfo, setInstrumentInfo] = useState<InstrumentInfo | null>(null)
  const [points, setPoints] = useState<InstrumentStreamedPoint[]>([])
  const [lastPoint, setLastPoint] = useState<InstrumentStreamedPoint | null>(null)
  const [bytesReceived] = useState(0)
  const [messagesParsed, setMessagesParsed] = useState(0)
  const [errorCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const connectionRef = useRef<InstrumentSerialConnection | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.disconnect()
      }
    }
  }, [])

  const connect = useCallback(async (config?: Partial<SerialConnectionConfig>) => {
    setError(null)

    const connection = new InstrumentSerialConnection(config)

    // Wire up event handlers
    connection.onStatus((newStatus) => {
      setStatus(newStatus)
      setIsStreaming(newStatus === 'streaming')
      useInstrumentStore.getState().setStatus(newStatus)
    })

    connection.onError((err) => {
      setError(err.message)
      useInstrumentStore.getState().setError(err.message)
    })

    connection.onData((data: ParsedInstrumentData) => {
      setMessagesParsed(prev => prev + 1)

      const point = createStreamedPoint(data)

      if (point) {
        setLastPoint(point)
        const latest = point
        setPoints(prev => [...prev, latest])
        useInstrumentStore.getState().addPoint(point)
        // Expose the latest reading globally so other components (e.g.
        // the mobile fieldbook's "Pull from instrument" button) can
        // read it without re-instantiating the connection.
        if (typeof window !== 'undefined') {
          ;(window as unknown as { __metarduLastInstrumentReading?: unknown }).__metarduLastInstrumentReading = {
            easting: point.easting,
            northing: point.northing,
            elevation: point.elevation,
            pointName: point.pointName,
            timestamp: point.timestamp.toISOString(),
          }
        }
      }
    })

    connectionRef.current = connection

    try {
      await connection.connect()
      setInstrumentInfo(connection.instrumentInfo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      throw err
    }
  }, [])

  const connectWithPreset = useCallback(async (presetKey: string) => {
    setError(null)

    const connection = new InstrumentSerialConnection()

    connection.onStatus((newStatus) => {
      setStatus(newStatus)
      setIsStreaming(newStatus === 'streaming')
      useInstrumentStore.getState().setStatus(newStatus)
    })

    connection.onError((err) => {
      setError(err.message)
      useInstrumentStore.getState().setError(err.message)
    })

    connection.onData((data: ParsedInstrumentData) => {
      setMessagesParsed(prev => prev + 1)
      const point = createStreamedPoint(data)
      if (point) {
        setLastPoint(point)
        const latest = point
        setPoints(prev => [...prev, latest])
        useInstrumentStore.getState().addPoint(point)
        if (typeof window !== 'undefined') {
          ;(window as unknown as { __metarduLastInstrumentReading?: unknown }).__metarduLastInstrumentReading = {
            easting: point.easting,
            northing: point.northing,
            elevation: point.elevation,
            pointName: point.pointName,
            timestamp: point.timestamp.toISOString(),
          }
        }
      }
    })

    connectionRef.current = connection

    try {
      await connection.connectWithPreset(presetKey)
      setInstrumentInfo(connection.instrumentInfo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      throw err
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (connectionRef.current) {
      await connectionRef.current.disconnect()
      connectionRef.current = null
    }
    useInstrumentStore.getState().setDisconnected()
  }, [])

  const clearPoints = useCallback(() => {
    setPoints([])
    setLastPoint(null)
    useInstrumentStore.getState().clearPoints()
    if (typeof window !== 'undefined') {
      try {
        delete (window as unknown as { __metarduLastInstrumentReading?: unknown }).__metarduLastInstrumentReading
      } catch { /* ignore */ }
    }
  }, [])

  const sendCommand = useCallback(async (commandType: string, ...args: unknown[]) => {
    if (!connectionRef.current) return
    const brand = connectionRef.current.getCurrentBrand()
    if (!brand) return
    try {
      await connectionRef.current.sendInstrumentCommand(brand, commandType, ...args)
    } catch (err) {
      logger.error('Failed to send instrument command:', { error: err })
      setError(err instanceof Error ? err.message : 'Command failed')
    }
  }, [])

  return {
    connect,
    connectWithPreset,
    disconnect,
    status,
    isStreaming,
    isSupported: isSerialSupported(),
    instrumentInfo,
    points,
    lastPoint,
    bytesReceived,
    messagesParsed,
    errorCount,
    clearPoints,
    sendCommand,
    error,
  }
}
