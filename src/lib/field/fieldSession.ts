/**
 * Field Session Manager — orchestrates the field data collection workflow
 *
 * Ties together: instrumentStore (connection) + fieldBookDB (persistence)
 * + liveToleranceChecker (QC) + syncQueue (sync) + stakeout (navigation)
 *
 * Works offline-first: all measurements saved locally, synced when online.
 */

import { useInstrumentStore } from '@/stores/instrumentStore'
import { type ToleranceCheckResult } from '@/lib/survey/liveToleranceChecker'
import { logger } from '@/lib/logger'
import { readFieldPointId } from '@/lib/field/pointIds'
import { assertProjectedCrs, transformPoint, WGS84_CRS } from '@/lib/spatial/projectCrs'
import { hasAcknowledgedFieldObservation } from './observationReceipt'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SurveyType = 'cadastral' | 'engineering' | 'topographic' | 'control' | 'leveling'
export type InstrumentType = 'total_station' | 'gnss_rover' | 'gnss_static' | 'level'
export type MeasurementMode = 'traverse' | 'radiation' | 'stakeout' | 'leveling' | 'walk'

export interface StationSetup {
  stationName: string
  instrumentHeight: number
  targetHeight: number
  backsightStation?: string
  backsightBearing?: { deg: number; min: number; sec: number }
  temperature?: number
  pressure?: number
  isControlPoint: boolean
  easting?: number
  northing?: number
  elevation?: number
}

/** A single parsed instrument reading, supplied directly for explicit imports or read from the shared instrument store. */
export interface FieldInstrumentReading {
  id: string
  pointName: string
  source: 'nmea' | 'gsi' | 'manual'
  timestamp: Date
  latitude?: number
  longitude?: number
  easting?: number
  northing?: number
  elevation?: number | null
  quality?: number
  satellites?: number
  hdop?: number
}

function readInstrumentReadingId(notes?: string): string | null {
  const match = /(?:^|;\s*)INSTRUMENT_READING_ID=([^;]*)/.exec(notes ?? '')
  return match?.[1]?.trim() || null
}
function receiverFixLabel(quality:number|undefined):string|undefined{
  if(quality===undefined)return undefined
  return ({1:'single',2:'dgps',4:'fixed',5:'float'} as Record<number,string>)[quality]??`code ${quality}`
}

export interface FieldMeasurement {
  id: string
  timestamp: number
  pointId: string
  stationFrom: string
  stationTo?: string
  // GNSS observations (from StreamedPoint)
  latitude?: number
  longitude?: number
  elevation?: number
  fixQuality?: string
  satellites?: number
  hdop?: number
  // Total station observations (from GSI parser — future)
  slopeDistance?: number
  horizontalAngle?: { deg: number; min: number; sec: number }
  verticalAngle?: { deg: number; min: number; sec: number }
  // Reduced coordinates
  easting?: number
  northing?: number
  // Metadata
  instrumentType: InstrumentType | null
  horizontalCrs?:string
  geographicCrs?:string
  mode: MeasurementMode
  notes?: string
  synced: boolean
}

export interface FieldSessionState {
  projectId: string
  surveyType: SurveyType
  setup: StationSetup | null
  measurements: FieldMeasurement[]
  stakeoutTarget: { easting: number; northing: number; elevation: number } | null
  toleranceStatus: ToleranceCheckResult | null
  isOnline: boolean
  isSyncing: boolean
  pendingSyncCount: number
  lastSyncAt: number | null
  syncMessage?: string | null
}

// ─── Field Session Class ────────────────────────────────────────────────────

class FieldSession {
  private state: FieldSessionState
  private listeners: Set<(state: FieldSessionState) => void> = new Set()

  constructor(projectId: string, surveyType: SurveyType) {
    this.state = {
      projectId,
      surveyType,
      setup: null,
      measurements: [],
      stakeoutTarget: null,
      toleranceStatus: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      pendingSyncCount: 0,
      lastSyncAt: null,
    }
  }

  subscribe = (listener: (state: FieldSessionState) => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): FieldSessionState => this.state

  private setState(updates: Partial<FieldSessionState>) {
    this.state = { ...this.state, ...updates }
    this.listeners.forEach(l => l(this.state))
  }

  // ─── Station Setup ────────────────────────────────────────────────────────

  setupStation(setup: StationSetup) {
    this.setState({ setup })
  }

  isReady(): boolean {
    return this.state.setup !== null
  }

  // ─── Measurement Capture ──────────────────────────────────────────────────

  /**
   * Capture a measurement from the connected instrument.
   * Reads the latest reading from the instrument store and saves it.
   */
  async captureMeasurement(params: {
    pointId: string
    stationTo?: string
    targetHeight?: number
    notes?: string
    projectCrs?: string
    /** Exact declared CRS for total-station output; required when projectCrs is supplied for non-GNSS readings. */
    coordinateCrs?: string
    reading?: FieldInstrumentReading
  }): Promise<FieldMeasurement | null> {
    if (!this.state.setup) {
      return null
    }

    if (this.state.measurements.some(measurement => measurement.pointId === params.pointId)) {
      logger.warn('[field-session] Duplicate point ID was rejected.', { pointId: params.pointId })
      return null
    }

    const instrumentStore = useInstrumentStore.getState()
    const latestPoint = params.reading ?? instrumentStore.latestPoint

    if (!latestPoint) {
      return null
    }
    const instrumentReadingId = latestPoint.id.replace(/[;\r\n]/g, ' ').slice(0, 100)
    if (this.state.measurements.some(measurement => readInstrumentReadingId(measurement.notes) === instrumentReadingId)) {
      logger.warn('[field-session] Instrument reading was already captured.', { readingId: instrumentReadingId })
      return null
    }

    let easting: number | undefined
    let northing: number | undefined
    if (latestPoint.source === 'nmea') {
      if (typeof latestPoint.quality !== 'number'
        || !Number.isInteger(latestPoint.quality)
        || latestPoint.quality <= 0) return null
      const latitude = latestPoint.latitude
      const longitude = latestPoint.longitude
      if (typeof latitude !== 'number' || !Number.isFinite(latitude)
        || typeof longitude !== 'number' || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90
        || longitude < -180 || longitude > 180) return null
      if (params.projectCrs) {
        try {
          assertProjectedCrs(params.projectCrs)
          const projected = transformPoint(longitude, latitude, WGS84_CRS, params.projectCrs)
          if (!projected.every(Number.isFinite)) return null
          easting = projected[0]
          northing = projected[1]
        } catch (error) {
          logger.warn('[field-session] GNSS reading could not be transformed into the declared project CRS.', { error })
          return null
        }
      }
    } else {
      if (!Number.isFinite(latestPoint.easting) || !Number.isFinite(latestPoint.northing)) return null
      if (params.projectCrs) {
        try {
          const projectCode = assertProjectedCrs(params.projectCrs).code
          const coordinateCode = params.coordinateCrs ? assertProjectedCrs(params.coordinateCrs).code : null
          if (coordinateCode !== projectCode) return null
        } catch {
          return null
        }
      }
      easting = latestPoint.easting
      northing = latestPoint.northing
    }

    // Determine instrument type from the reading source
    const instrumentType: InstrumentType | null = latestPoint.source === 'nmea'
      ? 'gnss_rover'
      : latestPoint.source === 'gsi'
        ? 'total_station'
        : null

    // Build the measurement from the StreamedPoint
    const readingTimestamp = latestPoint.timestamp instanceof Date && Number.isFinite(latestPoint.timestamp.getTime())
      ? latestPoint.timestamp.getTime()
      : Date.now()
    const noteText = params.notes?.trim()
    const savedNotes = readInstrumentReadingId(noteText) === instrumentReadingId
      ? noteText
      : [noteText, `INSTRUMENT_READING_ID=${instrumentReadingId}`].filter(Boolean).join('; ')
    const measurement: FieldMeasurement = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: readingTimestamp,
      pointId: params.pointId,
      stationFrom: this.state.setup.stationName,
      stationTo: params.stationTo,
      // GNSS fields (from StreamedPoint)
      latitude: latestPoint.source === 'nmea' ? latestPoint.latitude : undefined,
      longitude: latestPoint.source === 'nmea' ? latestPoint.longitude : undefined,
      elevation: latestPoint.elevation ?? undefined,
      fixQuality: latestPoint.source==='nmea'?receiverFixLabel(latestPoint.quality):undefined,
      satellites: latestPoint.satellites,
      hdop: latestPoint.hdop,
      // Reduced coordinates (StreamedPoint has easting/northing)
      easting,
      northing,
      // Metadata
      instrumentType,
      horizontalCrs:easting!=null&&northing!=null?params.projectCrs??params.coordinateCrs:undefined,
      geographicCrs:latestPoint.source==='nmea'?WGS84_CRS:undefined,
      mode: this.state.surveyType === 'leveling' ? 'leveling' : 'traverse',
      notes: savedNotes,
      synced: false,
    }

    // Save to IndexedDB (offline-first)
    try {
      const { saveObservation } = await import('@/lib/offline/fieldBookDB')
      await saveObservation({
        id: measurement.id,
        projectId: this.state.projectId,
        pointId: measurement.pointId,
        surveyType: measurement.mode as 'traverse' | 'leveling' | 'topo' | 'gnss' | 'hydro' | 'mining',
        station: measurement.stationFrom,
        backsight: this.state.setup.backsightStation,
        foresight: measurement.stationTo,
        // GNSS fields
        latitude: measurement.latitude,
        longitude: measurement.longitude,
        // Coordinates
        easting: measurement.easting,
        northing: measurement.northing,
        elevation: measurement.elevation,
        horizontalCrs: easting!=null&&northing!=null ? params.projectCrs??params.coordinateCrs : undefined,
        geographicCrs:latestPoint.source==='nmea'?WGS84_CRS:undefined,
        instrumentType:instrumentType??undefined,
        observationSource: latestPoint.source==='nmea'?'gnss_receiver':latestPoint.source==='gsi'?'total_station':'manual',
        instrumentHeight:this.state.setup.instrumentHeight,
        targetHeight:params.targetHeight??this.state.setup.targetHeight,
        fixQuality:latestPoint.source==='nmea'?latestPoint.quality:undefined,
        satellites:latestPoint.satellites,
        hdop:latestPoint.hdop,
        // Metadata
        notes: measurement.notes,
        createdAt: new Date(measurement.timestamp).toISOString(),
        syncedAt: null,
      })
    } catch (error) {
      logger.warn('[field-session] Point was not stored locally; capture was not accepted.', { error })
      return null
    }

    // Add to session state
    const measurements = [...this.state.measurements, measurement]
    this.setState({ measurements, pendingSyncCount: this.state.pendingSyncCount + 1 })

    // Trigger haptic feedback (mobile)
    this.hapticFeedback()

    return measurement
  }

  /**
   * Trigger haptic feedback on measurement capture.
   */
  private hapticFeedback() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }
  }

  // ─── Stakeout ─────────────────────────────────────────────────────────────

  activateStakeout(target: { easting: number; northing: number; elevation: number }) {
    this.setState({ stakeoutTarget: target })
  }

  deactivateStakeout() {
    this.setState({ stakeoutTarget: null })
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  async syncNow(options:{automatic?:boolean}={}): Promise<{ synced: number; failed: number }> {
    if (this.state.isSyncing) return { synced: 0, failed: 0 }

    this.setState({ isSyncing: true })

    try {
      const { syncObservations,getObservations } = await import('@/lib/offline/fieldBookDB')
      const result = options.automatic ? await syncObservations(this.state.projectId) : await syncObservations(this.state.projectId,{retryBlocked:true})

      const syncedCount = result.synced || 0
      const failedCount = result.failed || 0

      const recorded=await getObservations(this.state.projectId)
      const receiptIds=await Promise.all(recorded.filter(obs=>obs.projectId===this.state.projectId).map(async obs=>await hasAcknowledgedFieldObservation(obs)?obs.id:null))
      const acknowledged=new Set(receiptIds.filter((id):id is string=>id!==null))
      // Read exact durable acknowledgements for this project. A global count
      // cannot label another capture or a newly collected point delivered.
      const measurements = this.state.measurements.map(m => ({
        ...m,
        synced: m.synced || acknowledged.has(m.id),
      }))

      this.setState({
        isSyncing: false,
        measurements,
        pendingSyncCount: measurements.filter(m=>!m.synced).length,
        lastSyncAt: syncedCount>0?Date.now():this.state.lastSyncAt,
        syncMessage:result.errors?.[0]??(result.deferred?'Some device records are waiting for retry or review. Original readings remain on this device.':null),
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      })

      return { synced: syncedCount, failed: failedCount }
    } catch {
      this.setState({ isSyncing: false,syncMessage:'Delivery could not complete. Keep this working tab open and retain your device copy.' })
      return { synced: 0, failed: this.state.pendingSyncCount }
    }
  }

  /**
   * Load existing measurements from IndexedDB (for session resume).
   */
  async loadMeasurements(): Promise<boolean> {
    try {
      const { getObservations } = await import('@/lib/offline/fieldBookDB')
      const observations = await getObservations(this.state.projectId)
      const measurements: FieldMeasurement[] = await Promise.all(observations.map(async(obs) => ({
        id: obs.id,
        timestamp: new Date(obs.createdAt).getTime(),
        pointId: obs.pointId??readFieldPointId(obs.notes),
        stationFrom: obs.station || '',
        stationTo: obs.foresight || undefined,
        latitude: obs.latitude,
        longitude: obs.longitude,
        elevation: obs.elevation ?? undefined,
        easting: obs.easting,
        northing: obs.northing,
        instrumentType: obs.instrumentType??null,
        horizontalCrs:obs.horizontalCrs,
        geographicCrs:obs.geographicCrs,
        satellites:obs.satellites,
        hdop:obs.hdop,
        fixQuality:receiverFixLabel(obs.fixQuality),
        mode: (obs.surveyType as MeasurementMode) || 'traverse',
        notes: obs.notes,
        synced: await hasAcknowledgedFieldObservation(obs),
      })))
      this.setState({
        measurements,
        pendingSyncCount: measurements.filter(m => !m.synced).length,
      })
      return true
    } catch {
      logger.warn('[field-session] Saved observations could not be loaded.')
      return false
    }
  }

  /**
   * Clear all measurements.
   */
  clearMeasurements() {
    this.setState({ measurements: [], pendingSyncCount: 0, toleranceStatus: null })
  }
}

// ─── Session Registry ───────────────────────────────────────────────────────

const sessions = new Map<string, FieldSession>()

export function getFieldSession(projectId: string, surveyType: SurveyType = 'cadastral'): FieldSession {
  const key = `${projectId}:${surveyType}`
  let session = sessions.get(key)
  if (!session) {
    session = new FieldSession(projectId, surveyType)
    sessions.set(key, session)
  }
  return session
}

// ─── React Hook ─────────────────────────────────────────────────────────────

export function useFieldSession(options: {
  projectId: string
  surveyType?: SurveyType
}): FieldSession {
  const { projectId, surveyType = 'cadastral' } = options
  return getFieldSession(projectId, surveyType)
}
