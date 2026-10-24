'use client';

/**
 * Mobile Field Collection Page — Upgraded
 * ═══════════════════════════════════════
 * Integrates:
 *   - UniversalMobileObservationForm (multi-survey-type entry)
 *   - GNSSConnectionPanel (BLE/Web Bluetooth instrument streaming)
 *   - BeaconPhotoCapture (field photos with optional device EXIF metadata)
 *   - offlineStorage + syncService (IndexedDB offline-first + auto sync)
 *   - instrumentStore (reactive instrument connection state)
 *
 * Replaces the old basic GPS-only field page with a professional
 * surveyor workflow supporting traverse, leveling, control,
 * hydrographic, and mining observations.
 */

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import type { CapturedBeaconPhoto } from '@/components/fieldbook/BeaconPhotoCapture'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  Bluetooth, MapPin, Ruler, Compass,
  RefreshCw, Wifi, WifiOff, Plus,
  ArrowLeft, Satellite,
} from 'lucide-react'
import { offlineStorage, type FieldObservation } from '@/lib/mobile/offlineStorage'
import { syncService } from '@/lib/mobile/syncService'
import { prepareCapturedPhotoData } from '@/lib/mobile/capturedPhotoData'
import { createClient } from '@/lib/api-client/client'
import {
  UniversalMobileObservationForm,
  type MobileSurveyType,
} from '@/components/fieldbook/UniversalMobileObservationForm'
import { GNSSConnectionPanel } from '@/components/gnss/GNSSConnectionPanel'
import { useInstrumentStore } from '@/stores/instrumentStore'
import type { NMEAPosition } from '@/lib/gnss/nmea-parser'
import { logger } from '@/lib/logger'
import { LegacyDeviceRecovery } from '@/components/fieldbook/LegacyDeviceRecovery'
import { ProjectPicker } from '@/components/field/ProjectPicker'

// ─── Survey type metadata ───────────────────────────────────────

const SURVEY_TYPES: Record<MobileSurveyType, { label: string; icon: typeof Compass; color: string }> = {
  leveling:     { label: 'Leveling',     icon: Ruler,    color: 'bg-sky-500' },
  traverse:     { label: 'Traverse',     icon: Compass,  color: 'bg-amber-500' },
  control:      { label: 'Control',      icon: MapPin,   color: 'bg-emerald-500' },
}

// ─── Main Component ─────────────────────────────────────────────

function MobileFieldContent({ ownerId }: { ownerId: string }) {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || ''

  // ─── State ────────────────────────────────────────────
  const [projectName, setProjectName] = useState('Unknown Project')
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState<number|null>(null)
  const [failedCount, setFailedCount] = useState<number|null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Survey mode
  const [activeSurveyType, setActiveSurveyType] = useState<MobileSurveyType>('traverse')
  const [showForm, setShowForm] = useState(false)
  const [showGNSS, setShowGNSS] = useState(false)

  // Observations
  const [recentObservations, setRecentObservations] = useState<FieldObservation[]>([])
  const [observationStatus,setObservationStatus] = useState<'loading'|'ready'|'failed'>('loading')
  const [statsError,setStatsError] = useState(false)
  const [reloadingDevice,setReloadingDevice] = useState(false)
  const deviceReads=useRef({observations:0,stats:0})

  // Instrument store
  const isConnected = useInstrumentStore((s) => s.status === 'connected' || s.status === 'streaming')

  // ─── Data loading ─────────────────────────────────────
  const loadProject = useCallback(async () => {
    try {
      const dbClient = createClient()
            const { data } = await dbClient.from('projects').select('name').eq('id', projectId).single() as unknown as { data: { name: string } | null }
      if ((data as { name?: string } | null)?.name) setProjectName((data as { name: string }).name)
    } catch {
      // Project might not exist or DB unreachable
    }
  }, [projectId])

  const loadObservations = useCallback(async () => {
    if (!projectId) return
    const ticket=++deviceReads.current.observations
    setObservationStatus('loading')
    try {
      const observations = await offlineStorage.getFieldObservations(projectId, ownerId, 10)
      if(ticket===deviceReads.current.observations){setRecentObservations(observations);setObservationStatus('ready')}
    } catch(error) {
      if(ticket===deviceReads.current.observations){setRecentObservations([]);setObservationStatus('failed')}
      throw error
    }
  }, [projectId, ownerId])

  const loadStats = useCallback(async () => {
    const ticket=++deviceReads.current.stats
    setPendingCount(null);setFailedCount(null);setStatsError(false)
    try {
      const stats = await offlineStorage.getStorageStats(ownerId)
      if(ticket===deviceReads.current.stats){setPendingCount(stats.pendingSync);setFailedCount(stats.failedSync)}
    } catch(error) {
      if(ticket===deviceReads.current.stats){setPendingCount(null);setFailedCount(null);setStatsError(true)}
      throw error
    }
  }, [ownerId])

  const reloadDevice=async()=>{
    if(reloadingDevice)return
    setReloadingDevice(true)
    try {await Promise.allSettled([loadObservations(),loadStats()])}
    finally {setReloadingDevice(false)}
  }

  // ─── Initialize ────────────────────
  useEffect(() => {
    const reads=deviceReads.current
    if (projectId) {
      loadProject()
      void loadObservations().catch(()=>undefined)
      void loadStats().catch(()=>undefined)
    }

    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    syncService.startAutoSync()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      syncService.stopAutoSync()
      reads.observations++;reads.stats++
    }
  }, [projectId, loadProject, loadObservations, loadStats])
  // ─── Sync ─────────────────────────────────────────────
  const handleSync = async () => {
    if (!isOnline) return
    setIsSyncing(true)
    try {
      const { synced, failed } = await syncService.forceSync()
      if (synced > 0) setLastSync(new Date().toLocaleTimeString())
      const status = syncService.getSyncStatus()
      const delay = status.retryAt ? ` Retry after ${new Date(status.retryAt).toLocaleTimeString()}.` : ''
      setSyncMessage(status.message ? `${status.message}${delay}` : `${synced} records delivered.${failed > 0 ? ` ${failed} records need attention; device copies retained.` : ' Remaining queued records are retained on this device.'}`)
      await loadStats()
      await loadObservations()
    } catch {
      setSyncMessage('Could not complete delivery. Saved device records were retained; retry when the connection and device storage are available.')
    } finally {
      setIsSyncing(false)
    }
  }

  // ─── Observation handling ─────────────────────────────
  const handleAddObservation = useCallback(async (row: Record<string, string>, photos: CapturedBeaconPhoto[]) => {
    try {
      if (!projectId) throw new Error('Select a project before saving an observation.')

      const optionalNumber = (value: string | undefined): number | undefined => {
        if (!value?.trim()) return undefined
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) throw new Error('Entered measurements must be finite numbers; leave unknown readings blank.')
        return parsed
      }
      const pointName = row.station?.trim() || row.pointId?.trim() || row.soundingId?.trim()
      if (!pointName) throw new Error('Enter a station or point identifier before saving this observation.')

      const observationId = crypto.randomUUID()
      const observation: FieldObservation = {
        id: observationId,
        projectId,
        ownerId,
        pointName,
        pointId: row.pointId?.trim() || undefined,
        surveyType: activeSurveyType === 'control' ? 'unspecified' : activeSurveyType,
        surveyMode: activeSurveyType,
        captureFormVersion: 1,
        rawForm: { ...row },
        observationSource: 'manual',
        observationType: activeSurveyType === 'leveling'
          ? 'level'
          : activeSurveyType === 'traverse'
            ? 'total_station'
            : 'manual',
        northing: optionalNumber(row.northing),
        easting: optionalNumber(row.easting),
        elevation: optionalNumber(row.elevation),
        latitude: optionalNumber(row.latitude),
        longitude: optionalNumber(row.longitude),
        accuracy: undefined,
        instrumentHeight: optionalNumber(row.ih || row.instrumentHeight),
        rodHeight: optionalNumber(row.th || row.targetHeight),
        slopeDistance: optionalNumber(row.slopeDist || row.slopeDistance),
        verticalAngle: optionalNumber(row.vaDeg || row.verticalAngle),
        backsightReading: optionalNumber(row.bs),
        intermediateReading: optionalNumber(row.is),
        foresightReading: optionalNumber(row.fs),
        // Retain bearing text in rawForm: this form has no declared DMS/decimal
        // encoding, so it cannot safely populate numeric horizontalAngle.
        notes: row.remarks || undefined,
      }

      const photoData = await prepareCapturedPhotoData(photos, projectId, {
        pointId: row.pointId?.trim() || pointName,
        pointName,
        observationClientId: observationId,
      })
      await offlineStorage.saveFieldObservationWithPhotos(observation, photoData)
    } catch (error) {
      logger.error('Save error:', { error: error })
      alert(error instanceof Error ? `Could not save the observation and its photos: ${error.message}` : 'Could not save the observation and its photos.')
      throw error
    }
    // A later delivery/read failure must not turn a committed capture into a
    // reported save failure and encourage the operator to record it twice.
    setSyncMessage('Saved on this device. Server delivery is pending.')
    try {
      if (isOnline) {
        const { synced } = await syncService.syncPending()
        if (synced > 0) setLastSync(new Date().toLocaleTimeString())
        const status = syncService.getSyncStatus()
        setSyncMessage(status.message ?? (synced > 0 ? `${synced} queued records delivered. Check the pending count for remaining work.` : 'Saved on this device. Server delivery is pending.'))
      }
      await loadObservations()
      await loadStats()
    } catch {
      setSyncMessage('Saved on this device. Delivery or queue refresh could not complete; your saved record was retained.')
    }
  }, [projectId, ownerId, activeSurveyType, isOnline, loadObservations, loadStats])

  // ─── Pull from instrument ─────────────────────────────
  const handlePullFromInstrument = useCallback(async (): Promise<Partial<Record<string, string>>> => {
    const latest = useInstrumentStore.getState().latestPoint
    if (!latest) return {}

    const reading: Partial<Record<string, string>> = {}
    if (typeof latest.northing === 'number' && Number.isFinite(latest.northing)) reading.northing = String(latest.northing)
    if (typeof latest.easting === 'number' && Number.isFinite(latest.easting)) reading.easting = String(latest.easting)
    if (typeof latest.elevation === 'number' && Number.isFinite(latest.elevation)) reading.elevation = String(latest.elevation)
    if (typeof latest.latitude === 'number' && Number.isFinite(latest.latitude)) reading.latitude = String(latest.latitude)
    if (typeof latest.longitude === 'number' && Number.isFinite(latest.longitude)) reading.longitude = String(latest.longitude)
    return reading
  }, [])

  // ─── GNSS position callback ───────────────────────────
  const handleGNSSPosition = useCallback((_pos: NMEAPosition) => {
    // Update instrument store via the panel — already handled inside GNSSConnectionPanel
    // This callback is for any additional side effects
  }, [])

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-base font-bold">Field Collection</h1>
            <p className="text-xs text-gray-400 truncate max-w-[180px]">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* GNSS toggle */}
          <button
            onClick={() => setShowGNSS(!showGNSS)}
            className={`p-2 rounded-lg transition-colors ${
              isConnected
                ? 'bg-green-900/40 text-green-400 ring-1 ring-green-500/30'
                : 'bg-gray-800 text-gray-400'
            }`}
            title="GNSS Connection"
          >
            <Satellite className="w-5 h-5" />
          </button>
          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={isSyncing || !isOnline}
            className={`p-2 rounded-lg transition-colors ${
              isSyncing ? 'bg-blue-900/40 text-blue-400' : isOnline ? 'bg-gray-800 text-gray-400' : 'bg-red-900/40 text-red-400'
            }`}
            title="Sync"
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          {/* Online status */}
          {isOnline ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
        </div>
      </header>

      {/* GNSS Panel (slide-down) */}
      {showGNSS && (
        <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md">
          <GNSSConnectionPanel
            onPosition={handleGNSSPosition}
            showProjectCrsNote={true}
            autoReconnect={true}
            className="border-0 rounded-none shadow-none"
          />
        </div>
      )}

      {/* Stats Bar */}
      <div className="bg-gray-900/50 px-4 py-2 flex justify-between items-center text-xs border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-gray-500">
            Pending: <span className="text-yellow-400 font-mono">{pendingCount??'Unknown'}</span>
          </span>
          {isConnected && (
            <span className="flex items-center gap-1 text-green-400">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Instrument connected
            </span>
          )}
        </div>
        {lastSync && (
          <span className="text-gray-600">
            Last delivery: {lastSync}
          </span>
        )}
      </div>
      {failedCount!==null&&failedCount > 0 && (
        <p className="px-4 py-2 text-xs text-amber-300">Needs review: {failedCount}. Device records retained. Review their sources before manual Sync; it retries up to 20 held records and respects the retry delay.</p>
      )}
      {(statsError||observationStatus==='failed')&&<div className="px-4 py-3 border-b border-amber-800 space-y-2">
        <div role="alert" className="text-sm text-amber-300">
          {statsError&&<p>Device queue status is unavailable. Counts remain unknown until a successful read.</p>}
          {observationStatus==='failed'&&<p>Device readings could not be loaded. No stored source was changed.</p>}
        </div>
        <button type="button" className="min-h-11 rounded border border-gray-600 px-3 text-sm" disabled={reloadingDevice||isSyncing} onClick={()=>void reloadDevice()}>Reload device readings</button>
      </div>}
      {syncMessage && (
        <p role="status" className="px-4 py-2 text-xs text-gray-300 border-b border-gray-800">{syncMessage}</p>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {projectId && <div className="px-4 pt-4 space-y-3">
          <Link href={`/fieldbook?project=${encodeURIComponent(projectId)}`} className="inline-flex min-h-11 items-center rounded-lg border border-gray-700 px-3 text-sm text-gray-200">Review delivered readings in Fieldbook →</Link>
          <p className="text-xs text-gray-400">Sync readings first, then inspect and select their original sources to create a new draft book.</p>
          <LegacyDeviceRecovery actorId={ownerId} projectId={projectId} onRefresh={async () => { await loadObservations(); await loadStats() }} />
        </div>}
        {/* Survey Type Selector */}
        <div className="p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Survey Type</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(Object.entries(SURVEY_TYPES) as [MobileSurveyType, typeof SURVEY_TYPES[MobileSurveyType]][]).map(([key, meta]) => {
              const Icon = meta.icon
              return (
                <button
                  key={key}
                  onClick={() => setActiveSurveyType(key)}
                  className={[
                    'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                    activeSurveyType === key
                      ? `${meta.color} text-white shadow-lg`
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-750',
                  ].join(' ')}
                >
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Add Observation FAB */}
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            New {SURVEY_TYPES[activeSurveyType].label} Reading
          </button>
        </div>

        {/* Quick Instrument Read */}
        {isConnected && (
          <div className="px-4 mb-4">
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 border border-green-500/30 bg-green-900/10 text-green-400 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-green-900/20 transition-colors"
            >
              <Bluetooth className="w-4 h-4" />
              Pull from Instrument →
            </button>
          </div>
        )}

        {/* Recent Observations */}
        {recentObservations.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Recent Observations</div>
            <div className="space-y-1.5">
              {recentObservations.map((obs) => (
                <div
                  key={obs.id}
                  className="flex items-center justify-between py-2.5 px-3 bg-gray-900 rounded-lg border border-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      obs.observationType === 'gps'
                        ? 'bg-blue-900/40 text-blue-400'
                        : obs.observationType === 'level'
                        ? 'bg-sky-900/40 text-sky-400'
                        : 'bg-purple-900/40 text-purple-400'
                    }`}>
                      {obs.observationType === 'gps' ? 'GPS' : obs.observationType === 'level' ? 'LV' : 'TS'}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-gray-200">{obs.pointName}</p>
                      {!obs.ownerId && obs.deliveryReceipt?.legacyRecoveryReview && <p className="text-xs text-amber-300">Capture author unknown · recovery reviewed</p>}
                      <p className="text-xs text-gray-500">
                        {typeof obs.timestamp==='number'&&Number.isFinite(new Date(obs.timestamp).getTime())?new Date(obs.timestamp).toLocaleTimeString():'Capture time unknown'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    obs.synced
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-yellow-900/30 text-yellow-400'
                  }`}>
                    {obs.synced ? 'Synced' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {observationStatus==='ready'&&recentObservations.length === 0 && (
          <div className="px-4 py-12 text-center">
            <MapPin className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No observations yet</p>
            <p className="text-gray-600 text-xs mt-1">
              Tap &ldquo;New Reading&rdquo; to start collecting data
            </p>
          </div>
        )}
      </main>

      {/* Universal Mobile Observation Form (bottom sheet) */}
      {showForm && (
        <UniversalMobileObservationForm
          surveyType={activeSurveyType}
          stationName={recentObservations[0]?.pointName}
          onAdd={handleAddObservation}
          onClose={() => setShowForm(false)}
          lastStation={recentObservations[0]?.pointName}
          onPullInstrumentReading={isConnected ? handlePullFromInstrument : undefined}
        />
      )}
    </div>
  )
}

function MobileFieldSession() {
  const session = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const chooseProject = useCallback((projectId: string) => {
    const query = new URLSearchParams(searchParams.toString())
    query.set('project', projectId)
    router.replace(`/mobile/field?${query.toString()}`)
  }, [router, searchParams])
  const ownerId = session.data?.user.id
  if (session.status === 'loading') return <p role="status" className="p-4">Checking your account…</p>
  if (session.status !== 'authenticated' || !ownerId) return <p className="p-4">Sign in to access this account’s device readings. <Link href="/login?next=%2Fmobile%2Ffield">Sign in</Link></p>
  if (!searchParams.get('project')?.trim()) return <ProjectPicker key={ownerId} title="Choose a field project"
    subtitle="Select the project that will retain your original readings and photos." onPick={chooseProject} />
  return <MobileFieldContent key={`${ownerId}:${searchParams.get('project') ?? ''}`} ownerId={ownerId} />
}

export default function MobileFieldPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 p-4 text-sm text-gray-400 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading field collection…
        </div>
      }
    >
      <MobileFieldSession />
    </Suspense>
  )
}
