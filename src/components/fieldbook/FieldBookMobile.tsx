'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Wifi, WifiOff, CloudUpload, CheckCircle, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { offlineStorage, type FieldObservation } from '@/lib/mobile/offlineStorage'
import { syncService } from '@/lib/mobile/syncService'
import { prepareCapturedPhotoData } from '@/lib/mobile/capturedPhotoData'
import { QuickAddModal, type QuickAddObservation } from './QuickAddModal';
import type { CapturedBeaconPhoto } from './BeaconPhotoCapture'
import { logger } from '@/lib/logger'
import { LegacyDeviceRecovery } from './LegacyDeviceRecovery'

interface FieldBookMobileProps {
  projectId: string;
  surveyType: string;
  surveyorId: string;
}

export function FieldBookMobile(props: FieldBookMobileProps) {
  const session = useSession()
  const ownerId = session.data?.user.id
  if (session.status === 'loading') return <p role="status">Checking your account…</p>
  if (session.status !== 'authenticated' || !ownerId) return <p>Sign in to access this account’s device readings. <Link href="/login?next=%2Ffieldbook">Sign in</Link></p>
  return <OwnedFieldBookMobile key={`${ownerId}:${props.projectId}`} projectId={props.projectId} ownerId={ownerId} />
}

function OwnedFieldBookMobile({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [observations, setObservations] = useState<SavedFieldObservation[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const loadObservations = useCallback(async () => {
    const obs = await offlineStorage.getFieldObservations(projectId, ownerId)
    const saved = obs.filter((record): record is SavedFieldObservation => typeof record.id === 'string' && typeof record.timestamp === 'number')
      .sort((a, b) => b.timestamp - a.timestamp)
    setObservations(saved)
    const [photos, stats] = await Promise.all([
      offlineStorage.getProjectPhotos(projectId, ownerId),
      offlineStorage.getStorageStats(ownerId),
    ])
    const counts: Record<string, number> = {}
    for (const photo of photos) {
      if (!photo.observationClientId) continue
      counts[photo.observationClientId] = (counts[photo.observationClientId] ?? 0) + 1
    }
    setPhotoCounts(counts)
    setPendingCount(stats.pendingSync + stats.failedSync)
  }, [projectId, ownerId]);

  useEffect(() => {
    loadObservations();
  }, [projectId, loadObservations]);

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    syncService.startAutoSync()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      syncService.stopAutoSync()
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (!online || syncing) return;
    
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await syncService.forceSync()
      setSyncResult({ synced: result.synced, failed: result.failed });
      if (result.synced > 0) setLastSync(new Date());
      setSyncMessage(syncService.getSyncStatus().message)
      await loadObservations();
    } catch (err) {
      logger.error('Sync failed:', { error: err });
      setSyncMessage('Delivery could not complete. Your saved device readings were retained.')
    } finally {
      setSyncing(false);
    }
  }, [online, syncing, loadObservations]);

  const handleAddObservation = async (obs: QuickAddObservation, photos: CapturedBeaconPhoto[]) => {
    const id = crypto.randomUUID()
    const newObs: FieldObservation = {
      id,
      ownerId,
      projectId,
      surveyType: 'traverse',
      observationSource: 'manual',
      pointName: obs.station_to,
      pointId: obs.station_to,
      observationType: 'total_station',
      backsight: obs.station_from,
      foresight: obs.station_to,
      horizontalAngle: obs.horizontal_angle,
      verticalAngle: obs.vertical_angle,
      slopeDistance: obs.slope_distance,
      instrumentHeight: obs.instrument_height,
      rodHeight: obs.target_height,
      notes: obs.remarks || undefined,
    }
    const photoData = await prepareCapturedPhotoData(photos, projectId, {
      pointId: obs.station_to,
      pointName: obs.station_to,
      observationClientId: id,
    })

    await offlineStorage.saveFieldObservationWithPhotos(newObs, photoData)
    setShowAddModal(false);
    setSyncMessage('Saved on this device. Server delivery is pending.')
    try {
      if (online) await syncService.syncPending()
      await loadObservations()
      setSyncMessage(syncService.getSyncStatus().message ?? 'Delivery attempted. Check the pending count for retained records.')
    } catch {
      setSyncMessage('Saved on this device. Delivery or queue refresh could not complete; the device record was retained.')
    }
  };

  const unsyncedCount = pendingCount;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {syncMessage && <p role="status" className="px-4 py-2 text-sm text-gray-700">{syncMessage}</p>}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-2">
          {online ? (
            <>
              <Wifi className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Offline</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-xs text-gray-500">
              Last delivery: {lastSync.toLocaleTimeString()}
            </span>
          )}
          
          <button
            onClick={handleSync}
            disabled={!online || syncing || unsyncedCount === 0}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors',
              online && !syncing && unsyncedCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {syncing ? (
              <>
                <CloudUpload className="w-4 h-4 animate-pulse" />
                Syncing...
              </>
            ) : (
              <>
                <CloudUpload className="w-4 h-4" />
                Sync ({unsyncedCount})
              </>
            )}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={[
          'flex items-center gap-2 px-4 py-2 text-sm',
          syncResult.failed === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700',
        ].join(' ')}>
          {syncResult.failed === 0 ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Synced {syncResult.synced} field items
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4" />
              Synced {syncResult.synced} field items, failed {syncResult.failed}
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {projectId && <div className="mb-4"><LegacyDeviceRecovery actorId={ownerId} projectId={projectId} onRefresh={loadObservations} /></div>}
        {observations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-lg font-medium">No observations yet</p>
            <p className="text-sm">Tap the + button to add your first observation</p>
          </div>
        ) : (
          <div className="space-y-2">
            {observations.map((obs, idx) => (
              <ObservationCard 
                key={obs.id} 
                observation={obs} 
                index={observations.length - idx}
                photoCount={photoCounts[obs.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 p-4 bg-white border-t">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg flex items-center justify-center gap-2 active:bg-blue-700"
        >
          <span className="text-2xl">+</span>
          Add Observation
        </button>
      </div>

      {showAddModal && (
        <QuickAddModal
          onAdd={handleAddObservation}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

type SavedFieldObservation = FieldObservation & { id: string; timestamp: number; synced?: boolean }

function ObservationCard({ observation, index, photoCount }: { observation: SavedFieldObservation; index: number; photoCount: number }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-lg">
          {observation.backsight || '—'} → {observation.foresight || observation.pointName}
        </span>
        <span className="text-xs text-gray-500">#{index}</span>
      </div>
      
      {!observation.ownerId && observation.deliveryReceipt?.legacyRecoveryReview && <p className="mb-2 text-xs text-amber-700">Capture author unknown · recovery reviewed</p>}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <span className="text-gray-500">HA</span>
          <span className="font-mono ml-1">{observation.horizontalAngle?.toFixed(4) ?? '—'}°</span>
        </div>
        <div>
          <span className="text-gray-500">VA</span>
          <span className="font-mono ml-1">{observation.verticalAngle?.toFixed(4) ?? '—'}°</span>
        </div>
        <div>
          <span className="text-gray-500">Dist</span>
          <span className="font-mono ml-1">{observation.slopeDistance?.toFixed(3) ?? '—'}m</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-gray-400">
          {new Date(observation.timestamp).toLocaleTimeString()}
        </span>
        {observation.synced ? (
          <span className="text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Synced
          </span>
        ) : (
          <span className="text-yellow-600">Pending sync</span>
        )}
      </div>
      
      {observation.notes && (
        <p className="mt-2 text-sm text-gray-600 italic">{observation.notes}</p>
      )}
      {photoCount > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
          <ImageIcon aria-hidden="true" className="w-3 h-3" /> {photoCount} original field photo{photoCount === 1 ? '' : 's'} attached
        </p>
      )}
    </div>
  );
}
