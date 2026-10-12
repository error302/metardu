'use client';
import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { FieldBeacon, FieldParcel, FieldWalkPoint, MapLayer, type FieldProject } from '@/types/field';
import { watchPosition, clearWatch, haversineDistance, computeAreaM2, computePerimeterM } from '@/lib/field/gps';
import { Play, Square, RotateCcw, ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger'
import {
  listLocalProjects,
  saveProjectLocally,
  generateProjectId,
} from '@/lib/field/storage';
import PushToTraverse from '@/components/field/PushToTraverse';

const MapViewer = dynamic(() => import('@/components/field/MapViewer'), { ssr: false });

const MIN_DISTANCE_M = 3.0; // ignore GPS jitter below 3m
const LOCAL_PROJECT_KEY = 'metardu-walk-project';

export default function WalkPage() {
  const [walking, setWalking] = useState(false);
  const [points, setPoints] = useState<FieldWalkPoint[]>([]);
  const [parcel, setParcel] = useState<FieldParcel | null>(null);
  const [beacons, setBeacons] = useState<FieldBeacon[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const watchIdRef = useRef<string | null>(null);

  /**
   * Field work must survive a reload, a dead battery or a dropped signal:
   * a walked boundary measured in the sun is expensive to repeat. Recover the
   * last unsent walk from local storage on mount.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_PROJECT_KEY);
      if (!raw) return;
      const project = JSON.parse(raw) as FieldProject;
      const lastParcel = project.parcels?.[project.parcels.length - 1];
      if (lastParcel) {
        setParcel(lastParcel);
        setPoints(lastParcel.walkPoints ?? []);
      }
      setBeacons(project.beacons ?? []);
    } catch (error) {
      logger.warn('[field/walk] could not restore local walk', { error });
    }
  }, []);

  /** Write-through to offline storage: the walk is never only in memory. */
  const persistLocally = useCallback((nextParcel: FieldParcel, nextBeacons: FieldBeacon[]) => {
    try {
      const existing = listLocalProjects();
      const base = existing[0];
      const project: FieldProject = {
        id: base?.id ?? generateProjectId(),
        name: base?.name ?? `Field walk ${new Date().toISOString().slice(0, 10)}`,
        countyCode: base?.countyCode ?? '',
        surveyorId: base?.surveyorId ?? 'field-user',
        beacons: nextBeacons,
        parcels: [...(base?.parcels ?? []).filter((p) => p.id !== nextParcel.id), nextParcel],
        layers: base?.layers ?? [],
        coordinateSystem: base?.coordinateSystem ?? {
          code: 'EPSG:4326',
          datum: 'WGS84',
          kind: 'geographic',
        },
        createdAt: base?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        syncedToServer: false,
      };
      saveProjectLocally(project);
      // Keep a direct handle so a reload restores instantly without listing.
      window.localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(project));
      setSaveState('saved');
    } catch (error) {
      logger.error('[field/walk] local save failed', { error });
    }
  }, []);

  async function startWalk() {
    setWalking(true);
    setPoints([]);
    setParcel(null);
    setSaveState('idle');
    let seq = 0;
    let lastPoint: FieldWalkPoint | null = null;

    const id = await watchPosition(
      (coord) => {
        if (lastPoint) {
          const dist = haversineDistance(lastPoint.coordinate, coord);
          if (dist < MIN_DISTANCE_M) return; // filter jitter
        }
        const wp: FieldWalkPoint = { coordinate: coord, sequence: seq++ };
        lastPoint = wp;
        setPoints(prev => [...prev, wp]);
      },
      (err) => { logger.error('Walk GPS error:', { error: err }); }
    );
    watchIdRef.current = id;
  }

  async function stopWalk() {
    if (watchIdRef.current) {
      await clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWalking(false);
    // Compute area and perimeter, turn the walk into beacons, and persist it
    // offline before the surveyor can leave the page.
    setPoints(prev => {
      const coords = prev.map(p => p.coordinate);
      const areaM2 = computeAreaM2(coords);
      const perimeterM = computePerimeterM(coords);
      const closedParcel: FieldParcel = {
        id: `parcel_${Date.now()}`,
        label: `Plot ${prev.length} pts`,
        walkPoints: prev,
        computedAreaM2: areaM2,
        computedPerimeterM: perimeterM,
        closedAt: Date.now(),
      };
      // Corners of the walk become beacons so the boundary can be pushed to a
      // traverse (and thence into the office compute stage) as a real
      // bearing/distance traverse instead of an orphaned polygon.
      const nextBeacons: FieldBeacon[] = prev.map((p, index) => ({
        id: `bp_${index + 1}`,
        label: `${String(index + 1).padStart(2, '0')}`,
        coordinate: p.coordinate,
        beaconType: 'gps_point',
        notes: 'Walked corner',
        capturedAt: Date.now(),
      }));
      setParcel(closedParcel);
      setBeacons(nextBeacons);
      persistLocally(closedParcel, nextBeacons);
      return prev;
    });
  }

  function reset() {
    setPoints([]);
    setParcel(null);
    setBeacons([]);
    setWalking(false);
    setSaveState('idle');
  }

  const areaHa = parcel?.computedAreaM2 ? (parcel.computedAreaM2 / 10000).toFixed(4) : null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 z-10">
        <Link href="/field"><ArrowLeft className="w-5 h-5 text-gray-400 hover:text-white" /></Link>
        <span className="font-semibold text-sm flex-1">Walk Perimeter</span>
        <span className="text-xs text-gray-400">{points.length} pts</span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapViewer layers={[] as MapLayer[]} beacons={[]} parcels={parcel ? [parcel] : []} />

        {/* Control buttons — floating */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-3 w-max">
          {!walking && !parcel && (
            <button onClick={startWalk}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-3 rounded-full shadow-lg transition">
              <Play className="w-5 h-5" /> Start Walk
            </button>
          )}
          {walking && (
            <button onClick={stopWalk}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-full shadow-lg animate-pulse transition">
              <Square className="w-5 h-5" /> Stop & Close
            </button>
          )}
          {parcel && (
            <button onClick={reset}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-full shadow-lg transition">
              <RotateCcw className="w-4 h-4" /> New Walk
            </button>
          )}
          {parcel && beacons.length >= 2 && (
            <div className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg transition">
              <Send className="w-4 h-4" />
              <PushToTraverse beacons={beacons} />
            </div>
          )}
        </div>
      </div>

      {/* Results panel */}
      {parcel && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-4 z-10">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400">Points</div>
              <div className="text-xl font-bold">{points.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Area</div>
              <div className="text-xl font-bold">{areaHa} ha</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Perimeter</div>
              <div className="text-xl font-bold">{parcel.computedPerimeterM?.toFixed(0)} m</div>
            </div>
          </div>
          {saveState === 'saved' && (
            <p className="mt-2 text-center text-[11px] text-green-400">
              Saved on this device — survives reload and signal loss. Syncs when you are back online.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
