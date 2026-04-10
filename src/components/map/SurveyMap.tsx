'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { registerProjections, arrayTo3857, to21037, SRID_3857 } from '@/lib/map/projection';
import { nearestKenCORSStations, type KenCORSStation } from '@/lib/map/kencors';
import type { AdjustedStation } from '@/lib/engine/planGeometry';
import { MeasurementTool } from './MeasurementTool';

interface SurveyMapProps {
  projectId: string;
  adjustedStations: AdjustedStation[];
  centroidEasting: number;
  centroidNorthing: number;
  onBeaconClick?: (label: string, easting: number, northing: number) => void;
  readOnly?: boolean;
}

interface NearestStation extends KenCORSStation {
  distanceKm: number;
}

export default function SurveyMap({
  projectId,
  adjustedStations,
  centroidEasting,
  centroidNorthing,
  onBeaconClick,
  readOnly = true,
}: SurveyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('ol/Map').default | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [nearestStations, setNearestStations] = useState<NearestStation[]>([]);
  const [clickedCoord, setClickedCoord] = useState<{ easting: number; northing: number } | null>(null);
  const [basemap, setBasemap] = useState<'osm' | 'blank'>('osm');

  async function to3857Single(e: number, n: number): Promise<[number, number]> {
    const { transform } = await import('ol/proj');
    return transform([e, n], 'EPSG:21037', SRID_3857) as [number, number];
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let map: import('ol/Map').default;

    async function initMap() {
      await registerProjections();

      const { default: Map }  = await import('ol/Map');
      const { default: View } = await import('ol/View');
      const { transform }     = await import('ol/proj');

      const storageKey = `metardu_map_${projectId}`;
      const saved = localStorage.getItem(storageKey);
      const savedState = saved ? JSON.parse(saved) : null;

      const center3857 = transform(
        [centroidEasting, centroidNorthing],
        'EPSG:21037',
        SRID_3857
      ) as [number, number];

      const { createOSMLayer, createParcelLayer, createBeaconLayer, createKenCORSLayer }
        = await import('@/lib/map/layers');

      const closed = [...adjustedStations, adjustedStations[0]];
      const coords3857 = await arrayTo3857(
        closed.map(s => [s.adjustedEasting, s.adjustedNorthing] as [number, number])
      );

      const beaconCoords = await Promise.all(
        adjustedStations.map(async s => ({
          label: s.pointName,
          coord3857: await to3857Single(s.adjustedEasting, s.adjustedNorthing),
        }))
      );

      const nearest = nearestKenCORSStations(centroidEasting, centroidNorthing, 3);
      setNearestStations(nearest);

      const kenCORSWithCoords = await Promise.all(
        nearest.map(async st => ({
          ...st,
          coord3857: await to3857Single(st.easting, st.northing),
        }))
      );

      const [osmLayer, parcelLayer, beaconLayer, kenCORSLayer] = await Promise.all([
        createOSMLayer(),
        createParcelLayer(coords3857),
        createBeaconLayer(beaconCoords),
        createKenCORSLayer(kenCORSWithCoords),
      ]);

      map = new Map({
        target: mapRef.current!,
        layers: [osmLayer, kenCORSLayer, parcelLayer, beaconLayer],
        view: new View({
          center: savedState?.center ?? center3857,
          zoom: savedState?.zoom ?? 16,
          projection: SRID_3857,
        }),
        controls: [],
      });

      map.getView().on('change', () => {
        const state = {
          center: map.getView().getCenter(),
          zoom: map.getView().getZoom(),
        };
        localStorage.setItem(storageKey, JSON.stringify(state));
      });

      map.on('click', async (evt) => {
        const [x, y] = evt.coordinate as [number, number];
        const [e, n] = await to21037(x, y);
        setClickedCoord({ easting: e, northing: n });
      });

      mapInstanceRef.current = map;
      setMapReady(true);
    }

    initMap();

    return () => {
      mapInstanceRef.current?.setTarget(undefined);
      mapInstanceRef.current = null;
    };
  }, [projectId, centroidEasting, centroidNorthing]);

  const toggleBasemap = useCallback(async () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (basemap === 'osm') {
      map.getLayers().getArray()
        .filter(l => l.get('type') === 'tile')
        .forEach(l => l.setVisible(false));
      setBasemap('blank');
    } else {
      map.getLayers().getArray().forEach(l => l.setVisible(true));
      setBasemap('osm');
    }
  }, [basemap]);

  const fitToParcel = useCallback(async () => {
    if (!mapInstanceRef.current || adjustedStations.length < 3) return;
    const { transform } = await import('ol/proj');
    const coords = adjustedStations.map(s =>
      transform([s.adjustedEasting, s.adjustedNorthing], 'EPSG:21037', SRID_3857)
    );
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const extent = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number];
    mapInstanceRef.current.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 400 });
  }, [adjustedStations]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 text-sm">
        <button
          onClick={fitToParcel}
          className="px-3 py-1.5 bg-[#1B3A5C] text-white rounded text-xs font-medium hover:bg-[#142d49]"
        >
          Fit to Parcel
        </button>
        <button
          onClick={toggleBasemap}
          className="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
        >
          {basemap === 'osm' ? 'Blank Map' : 'Satellite / OSM'}
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="font-medium">Nearest KenCORS:</span>
          {nearestStations.map(st => (
            <span key={st.id} className={st.status === 'active' ? 'text-green-700' : 'text-gray-400'}>
              {st.id} ({st.distanceKm.toFixed(0)} km)
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        <div className="absolute top-3 right-3 z-10">
          <MeasurementTool map={mapInstanceRef.current} />
        </div>

        {clickedCoord && (
          <div className="absolute bottom-3 left-3 bg-white border border-gray-200 rounded px-3 py-2 text-xs font-mono shadow">
            <span className="text-gray-500 mr-1">E</span>
            <span className="font-semibold">{clickedCoord.easting.toFixed(3)}</span>
            <span className="text-gray-300 mx-2">|</span>
            <span className="text-gray-500 mr-1">N</span>
            <span className="font-semibold">{clickedCoord.northing.toFixed(3)}</span>
            <span className="ml-2 text-gray-400">SRID 21037</span>
          </div>
        )}

        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-sm text-gray-500">Loading map...</div>
          </div>
        )}
      </div>
    </div>
  );
}