'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { FieldBeacon, FieldProject, MapLayer } from '@/types/field';
import { getCurrentPosition } from '@/lib/field/gps';
import { saveProjectLocally, generateProjectId, syncProjectToServer } from '@/lib/field/storage';
import { MapPin, Crosshair, Trash2, ArrowLeft, Cloud } from 'lucide-react';
import Link from 'next/link';

const MapViewer = dynamic(() => import('@/components/field/MapViewer'), { ssr: false });
import PushToTraverse from '@/components/field/PushToTraverse';

// Labels auto-increment: BP1, BP2, BP3…
function nextLabel(beacons: FieldBeacon[]): string {
  return `BP${beacons.length + 1}`;
}

export default function CollectPage() {
  const [project, setProject] = useState<FieldProject>(() => ({
    id: generateProjectId(),
    name: `Field Session ${new Date().toLocaleDateString('en-KE')}`,
    countyCode: '030',
    surveyorId: 'local',
    beacons: [],
    parcels: [],
    layers: [] as MapLayer[],
    coordinateSystem: 'WGS84',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncedToServer: false,
  }));
  const [beacons, setBeacons] = useState<FieldBeacon[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  // AUDIT FIX: Sync collected beacons to server
  async function syncToServer() {
    if (beacons.length === 0) return;
    setSyncing(true);
    setSyncResult('');
    try {
      const updatedProject = { ...project, beacons };
      const result = await syncProjectToServer(updatedProject);
      if (result.failed === 0) {
        setSyncResult(`✓ Synced ${result.synced} beacons to server`);
        setProject({ ...updatedProject, syncedToServer: true });
      } else {
        setSyncResult(`⚠ Synced ${result.synced}, failed ${result.failed}. Try again.`);
      }
    } catch {
      setSyncResult('✗ Sync failed. Check your connection.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(''), 5000);
    }
  }

  async function captureGPS() {
    setLoading(true);
    try {
      const coord = await getCurrentPosition();
      setLastAccuracy(coord.accuracy ?? null);
      const beacon: FieldBeacon = {
        id: `beacon_${Date.now()}`,
        label: nextLabel(beacons),
        coordinate: coord,
        beaconType: 'beacon_post',
        capturedAt: Date.now(),
      };
      const updated = [...beacons, beacon];
      setBeacons(updated);
      const updated_project = { ...project, beacons: updated, updatedAt: Date.now() };
      saveProjectLocally(updated_project);
    } catch (err) {
      alert(`GPS error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleMapClick(lat: number, lng: number) {
    const beacon: FieldBeacon = {
      id: `beacon_${Date.now()}`,
      label: nextLabel(beacons),
      coordinate: { lat, lng, timestamp: Date.now() },
      beaconType: 'beacon_post',
      capturedAt: Date.now(),
    };
    const updated = [...beacons, beacon];
    setBeacons(updated);
    saveProjectLocally({ ...project, beacons: updated, updatedAt: Date.now() });
  }

  function removeBeacon(id: string) {
    const updated = beacons.filter(b => b.id !== id);
    setBeacons(updated);
    saveProjectLocally({ ...project, beacons: updated, updatedAt: Date.now() });
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <Link href="/field"><ArrowLeft className="w-5 h-5 text-gray-400 hover:text-white" /></Link>
        <span className="font-semibold text-sm flex-1">Collect Beacons</span>
        {lastAccuracy && (
          <span className={`text-xs px-2 py-1 rounded-full ${lastAccuracy < 5 ? 'bg-green-800 text-green-300' : lastAccuracy < 15 ? 'bg-yellow-800 text-yellow-300' : 'bg-red-800 text-red-300'}`}>
            ±{lastAccuracy.toFixed(1)}m
          </span>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapViewer layers={[]} beacons={beacons} parcels={[]} onMapClick={handleMapClick} />
        {/* GPS capture button — floating */}
        <button
          onClick={captureGPS}
          disabled={loading}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:bg-gray-600 text-black font-bold px-6 py-3 rounded-full shadow-lg transition">
          <Crosshair className="w-5 h-5" />
          {loading ? 'Acquiring GPS…' : `Capture ${nextLabel(beacons)}`}
        </button>
      </div>

      {/* Beacon list */}
      {beacons.length > 0 && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-3 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">{beacons.length} beacon(s) captured</div>
            {/* AUDIT FIX: Sync to server button */}
            <button
              onClick={syncToServer}
              disabled={syncing || beacons.length === 0 || project.syncedToServer}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Cloud className="w-3.5 h-3.5" />
              {syncing ? 'Syncing…' : project.syncedToServer ? 'Synced ✓' : 'Sync to Server'}
            </button>
          </div>
          {syncResult && (
            <div className="text-xs text-[var(--accent)] mb-2 font-mono">{syncResult}</div>
          )}
          {beacons.map(b => (
            <div key={b.id} className="flex items-center justify-between py-1 border-b border-gray-700 last:border-0">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-mono font-bold">{b.label}</span>
                <span className="text-xs text-gray-400">
                  {b.coordinate.lat.toFixed(6)}, {b.coordinate.lng.toFixed(6)}
                </span>
              </div>
              <button onClick={() => removeBeacon(b.id)} className="text-gray-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <PushToTraverse beacons={beacons} />
          </div>
        </div>
      )}
    </div>
  );
}
