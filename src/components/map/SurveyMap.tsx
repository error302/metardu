'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { registerProjectProjection, arrayTo3857, toProjectCrs, SRID_3857 } from '@/lib/map/projection';
import { nearestKenCORSStations, type KenCORSStation } from '@/lib/map/kencors';
import type { AdjustedStation, PlanGeometry } from '@/lib/engine/planGeometry';
import type { ProjectMapStation, ProjectMapGeometryKind } from '@/lib/workspaces/projectMapData';
import { computePlanGeometry } from '@/lib/engine/planGeometry';
import { createAnnotationLayer } from '@/lib/map/annotations';
import { MeasurementTool } from './MeasurementTool';
import { VertexEditToolbar } from './VertexEditToolbar';
import MapAccessibility from './MapAccessibility';
import { useVertexEditing } from '@/hooks/useVertexEditing';
import { LayerControl } from './LayerControl';
import { exportMapPDF } from '@/lib/surveyMapEngine/io/exportSurface';
import { SurveyMapEngineProvider } from '@/lib/surveyMapEngine/react/SurveyMapEngineContext';
import { useSurveyMapEngine } from '@/lib/surveyMapEngine/react/useSurveyMapEngine';

/**
 * SurveyMapPrintControls — sheet-layout + print affordances driven by the
 * survey map engine context (plan Phase 5 consumer rewiring). No direct
 * generator import here: the print/export entries come from the engine.
 */
function SurveyMapPrintControls() {
  const { printApi } = useSurveyMapEngine();
  return (
    <>
      <button
        onClick={printApi.toggleSheetLayout}
        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
          printApi.sheetLayoutOpen
            ? 'bg-[#1B3A5C] text-white border-[#1B3A5C]'
            : 'bg-white text-[#1B3A5C] border-[#1B3A5C] hover:bg-[#1B3A5C]/5'
        }`}
        title="Toggle sheet layout overlay (north arrow, scale bar, grid ticks, title block)"
      >
        {printApi.sheetLayoutOpen ? ' Sheet Layout On' : ' Sheet Layout'}
      </button>
      <button
        onClick={() => void printApi.print()}
        className="px-3 py-1.5 bg-white text-[#1B3A5C] border border-[#1B3A5C] rounded text-xs font-medium hover:bg-[#1B3A5C]/5 transition-colors"
        title="Export current map view to PDF (A3 landscape)"
      >
        ⎙ Print / PDF
      </button>
    </>
  );
}

interface SurveyMapProps {
  projectId: string;
  adjustedStations: ProjectMapStation[];
  geometryKind?: ProjectMapGeometryKind;
  coordinatePrecision?: number;
  centroidEasting: number;
  centroidNorthing: number;
  onBeaconClick?: (label: string, easting: number, northing: number) => void;
  readOnly?: boolean;
  /** Enable the vertex editing toolbar and interactions */
  enableEditing?: boolean;
  /** Callback with updated vertices (project CRS) after each edit */
  onVerticesChange?: (updated: Array<{ easting: number; northing: number }>) => void;
  /** Sheet layout props */
  lrNumber?: string;
  projectName?: string;
  surveyorName?: string;
  surveyorLicense?: string;
  clientName?: string;
  county?: string;
  /** Unique container ID for PDF print targeting */
  mapContainerId?: string;
  /** Project UTM EPSG (e.g. 'EPSG:21037') — required; never defaulted (plan F3/F4) */
  epsg: string;
}

interface NearestStation extends KenCORSStation {
  distanceKm: number;
}

export default function SurveyMap({
  projectId,
  adjustedStations,
  geometryKind = 'ordered_boundary',
  coordinatePrecision = 3,
  centroidEasting,
  centroidNorthing,
  onBeaconClick,
  readOnly: _readOnly = true,
  enableEditing = false,
  onVerticesChange,
  lrNumber,
  projectName,
  surveyorName,
  surveyorLicense,
  clientName,
  county,
  mapContainerId = 'metardu-map-container',
  epsg,
}: SurveyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('ol/Map').default | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [nearestStations, setNearestStations] = useState<NearestStation[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [clickedCoord, setClickedCoord] = useState<{ easting: number; northing: number } | null>(null);
  const [_basemap, setBasemap] = useState<'osm' | 'satellite' | 'blank'>('osm');

  // ── Sheet layout state ────────────────────────────────────────
  const [showSheetLayout, setShowSheetLayout] = useState(false);
  const [sheetLayoutReady, setSheetLayoutReady] = useState(false);

  // ── Compute plan geometry for sheet layout ─────────────────────
  const planGeometry: PlanGeometry | null = useMemo(() => {
    if (geometryKind !== 'ordered_boundary' || adjustedStations.length < 3 || !adjustedStations.every((station): station is AdjustedStation => Number.isFinite(station.originalEasting) && Number.isFinite(station.originalNorthing))) return null;
    return computePlanGeometry(adjustedStations);
  }, [adjustedStations, geometryKind]);

  // ── Dynamically import SheetLayout to avoid SSR issues ─────────
  const [SheetLayoutComponent, setSheetLayoutComponent] = useState<React.ComponentType<import('./SheetLayout').SheetLayoutProps> | null>(null);

  useEffect(() => {
    import('./SheetLayout').then((mod) => {
      setSheetLayoutComponent(() => mod.default);
      setSheetLayoutReady(true);
    });
  }, []);

  // ── Vertex editing state ──────────────────────────────────────
  const [vertexEditingEnabled, setVertexEditingEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(10);

  // Derive the editable vertices from adjustedStations
  const editableVertices = adjustedStations.map(s => ({
    easting: s.adjustedEasting,
    northing: s.adjustedNorthing,
  }));

  const { state: vertexEditState } = useVertexEditing({
    map: mapInstanceRef.current,
    vertices: editableVertices,
    enabled: !_readOnly && geometryKind === 'ordered_boundary' && enableEditing && vertexEditingEnabled,
    onVerticesChange: onVerticesChange ?? (() => {}),
    snapTolerance,
    snapEnabled,
    epsg,
  });

  async function to3857Single(e: number, n: number): Promise<[number, number]> {
    const { transform } = await import('ol/proj');
    return transform([e, n], epsg, SRID_3857) as [number, number];
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let map: import('ol/Map').default;
    let cancelled = false;
    const referenceRequest = new AbortController();
    setMapReady(false);
    setMapError(null);
    setReferenceError(null);
    setNearestStations([]);
    setClickedCoord(null);

    // Store handler references for cleanup
    let viewChangeHandler: (() => void) | null = null;
    let mapClickHandler: ((evt: { pixel: number[]; coordinate: number[] }) => void) | null = null;

    async function initMap() {
      await registerProjectProjection(epsg);

      const { default: Map }  = await import('ol/Map');
      const { default: View } = await import('ol/View');
      const { transform }     = await import('ol/proj');
      const { default: Attribution } = await import('ol/control/Attribution');

      if (cancelled) return;

      const storageKey = `metardu_map_${projectId}_${epsg}`;
      let savedState: { center: number[]; zoom: number } | null = null;
      try {
        const saved = localStorage.getItem(storageKey);
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        if (parsed && typeof parsed === 'object' && 'center' in parsed && 'zoom' in parsed && Array.isArray(parsed.center) && parsed.center.length === 2 && parsed.center.every(Number.isFinite) && typeof parsed.zoom === 'number' && Number.isFinite(parsed.zoom) && parsed.zoom >= 0 && parsed.zoom <= 28) {
          savedState = { center: parsed.center as number[], zoom: parsed.zoom };
        }
      } catch { /* Optional viewport cache must not prevent the survey map. */ }

      const center3857 = transform(
        [centroidEasting, centroidNorthing],
        epsg,
        SRID_3857
      ) as [number, number];

      const { createOSMLayer, createParcelLayer, createBeaconLayer, createKenCORSLayer }
        = await import('@/lib/map/layers');

      if (cancelled) return;

      const closed = geometryKind === 'ordered_boundary' && adjustedStations.length >= 3 ? [...adjustedStations, adjustedStations[0]] : [];
      const coords3857 = await arrayTo3857(
        closed.map(s => [s.adjustedEasting, s.adjustedNorthing] as [number, number]),
        epsg
      );

      const beaconCoords = await Promise.all(
        adjustedStations.map(async s => ({
          label: s.pointName,
          coord3857: await to3857Single(s.adjustedEasting, s.adjustedNorthing),
        }))
      );

      if (cancelled) return;

      const [osmLayer, parcelLayer, beaconLayer, kenCORSLayer] = await Promise.all([
        createOSMLayer(),
        createParcelLayer(coords3857),
        createBeaconLayer(beaconCoords),
        createKenCORSLayer([]),
      ]);

      // Tag the OSM layer so LayerControl can find it
      osmLayer.set('basemapId', 'osm');

      // Create annotation layer with bearings, distances, and area
      const stations21037 = geometryKind === 'ordered_boundary' ? adjustedStations.map(s => ({
        pointName: s.pointName,
        easting: s.adjustedEasting,
        northing: s.adjustedNorthing,
      })) : [];
      const annotationLayer = await createAnnotationLayer({
        coords3857,
        stations21037,
        epsg,
      });

      if (cancelled) return;

      const target = mapRef.current;
      if (!target) return;

      map = new Map({
        target,
        layers: [osmLayer, kenCORSLayer, parcelLayer, beaconLayer, annotationLayer],
        view: new View({
          center: savedState?.center ?? center3857,
          zoom: savedState?.zoom ?? 16,
          projection: SRID_3857,
        }),
        controls: [new Attribution({ collapsible: false })],
      });

      viewChangeHandler = () => {
        const state = {
          center: map.getView().getCenter(),
          zoom: map.getView().getZoom(),
        };
        try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Map interaction remains usable without storage. */ }
      };
      map.getView().on('change', viewChangeHandler);

      mapClickHandler = async (evt: { pixel: number[]; coordinate: number[] }) => {
        const [x, y] = evt.coordinate as [number, number];
        const [e, n] = await toProjectCrs(x, y, epsg);
        if (cancelled) return;
        setClickedCoord({ easting: e, northing: n });

        // ── Check if a beacon feature was clicked ─────────────────
        if (onBeaconClick) {
          const hitFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f as import('ol/Feature').default, {
            hitTolerance: 8,
          });
          if (hitFeature) {
                        const label: unknown = hitFeature.get('label') || hitFeature.get('name') || hitFeature.get('stationName');
            if (label) {
              const geom = hitFeature.getGeometry();
              if (geom && geom.getType() === 'Point') {
                const coord = (geom as import('ol/geom/Point').default).getCoordinates();
                const [be, bn] = await toProjectCrs(coord[0], coord[1], epsg);
                if (cancelled) return;
                onBeaconClick(String(label), be, bn);
              }
            }
          }
        }
      };
      map.on('click', mapClickHandler);

      mapInstanceRef.current = map;
      setMapReady(true);
      // Reference discovery is optional: render the survey first, then add
      // reviewed locations. A slow/offline lookup must not hold up field data.
      setReferenceLoading(true);
      void (async () => {
        try {
          const nearest = await nearestKenCORSStations(centroidEasting, centroidNorthing, 3, epsg, referenceRequest.signal);
          if (cancelled) return;
          const references = await Promise.all(nearest.map(async station => ({ ...station, coord3857: await to3857Single(station.easting, station.northing) })));
          const layer = await createKenCORSLayer(references);
          if (cancelled) return;
          layer.setVisible(kenCORSLayer.getVisible());
          map.getLayers().setAt(1, layer);
          setNearestStations(nearest);
          setReferenceError(null);
        } catch (cause) {
          if (!cancelled) setReferenceError(cause instanceof Error ? cause.message : 'Reference catalogue unavailable');
        } finally {
          if (!cancelled) setReferenceLoading(false);
        }
      })();
    }

    void initMap().catch(cause => {
      if (!cancelled) setMapError(cause instanceof Error ? cause.message : 'The survey map could not be initialized');
    });

    return () => {
      cancelled = true;
      referenceRequest.abort();
      const instance = mapInstanceRef.current;
      if (instance) {
        // Remove event listeners before destroying
        try {
          const view = instance.getView();
          if (view && viewChangeHandler) {
            view.un('change', viewChangeHandler);
          }
        } catch { /* ignore */ }
        try {
          if (mapClickHandler) {
            instance.un('click', mapClickHandler);
          }
        } catch { /* ignore */ }
        instance.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
    // Rebuild display layers when saved geometry changes, including edits that
    // keep the same centroid. The project page renders saved results read-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, centroidEasting, centroidNorthing, epsg, adjustedStations, geometryKind]);

  const fitToParcel = useCallback(async () => {
    if (!mapInstanceRef.current || adjustedStations.length === 0) return;
    const { transform } = await import('ol/proj');
    const coords = adjustedStations.map(s =>
      transform([s.adjustedEasting, s.adjustedNorthing], epsg, SRID_3857)
    );
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const extent = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number];
    mapInstanceRef.current.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 400, maxZoom: 20 });
  }, [adjustedStations, epsg]);

  const handlePrint = useCallback(() => {
    if (!showSheetLayout) {
      setShowSheetLayout(true);
    }
    // Small delay to ensure sheet layout renders before print
    setTimeout(() => {
      exportMapPDF(mapContainerId, { paperSize: 'a3', orientation: 'landscape' });
    }, 500);
  }, [showSheetLayout, mapContainerId]);

  // Phase 4 (plan §3.1): export/print entry points reachable from the engine
  const printApi = {
    sheetLayoutOpen: showSheetLayout,
    openSheetLayout: () => setShowSheetLayout(true),
    closeSheetLayout: () => setShowSheetLayout(false),
    toggleSheetLayout: () => setShowSheetLayout(v => !v),
    print: handlePrint,
  };

  return (
    <SurveyMapEngineProvider printApi={printApi}>
    <div id={mapContainerId} className="metardu-survey-map flex flex-col h-full text-slate-800" role="application" aria-label={geometryKind === 'points' ? 'Survey field point map' : 'Survey boundary map'}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 text-sm">
        <button
          onClick={fitToParcel}
          className="px-3 py-1.5 bg-[#1B3A5C] text-white rounded text-xs font-medium hover:bg-[#142d49]"
        >
          {geometryKind === 'points' ? 'Fit to Points' : 'Fit to Parcel'}
        </button>
        <SurveyMapPrintControls />
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="font-medium">Reviewed GNSS references:</span>
          {!mapReady ? <span>Reference locations load after the survey map.</span> : referenceLoading ? <span role="status">Loading optional reference locations…</span> : referenceError ? <span role="status">{referenceError}</span> : nearestStations.length === 0 && <span>No same-grid reference locations within 100 km.</span>}
          {nearestStations.map(st => (
            <span key={st.id} className="text-blue-700" title={`${st.sourceReference}; catalogue review does not indicate live station availability`}>
              {st.name} ({st.distanceKm.toFixed(1)} km grid)
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        {/* Screen reader live region for map state changes */}
        <MapAccessibility mapReady={mapReady} schemeDataLoaded={mapReady && adjustedStations.length > 0} />

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-3 items-end">
          {!_readOnly && geometryKind === 'ordered_boundary' && enableEditing && (
            <VertexEditToolbar
              enabled={vertexEditingEnabled}
              onToggle={() => setVertexEditingEnabled(v => !v)}
              snapEnabled={snapEnabled}
              onSnapToggle={() => setSnapEnabled(v => !v)}
              snapTolerance={snapTolerance}
              onToleranceChange={setSnapTolerance}
              editState={vertexEditState}
            />
          )}
          <MeasurementTool map={mapInstanceRef.current} crs={epsg} />
          <LayerControl
            map={mapInstanceRef.current}
            defaultCollapsed
            onBasemapChange={setBasemap}
            epsg={epsg}
          />
        </div>

        {clickedCoord && (
          <div className="absolute bottom-3 left-3 bg-white border border-gray-200 rounded px-3 py-2 text-xs font-mono shadow">
            <span className="text-gray-500 mr-1">E</span>
            <span className="font-semibold">{clickedCoord.easting.toFixed(coordinatePrecision)}</span>
            <span className="text-gray-300 mx-2">|</span>
            <span className="text-gray-500 mr-1">N</span>
            <span className="font-semibold">{clickedCoord.northing.toFixed(coordinatePrecision)}</span>
            <span className="ml-2 text-gray-400">{epsg}</span>
          </div>
        )}

        {/* Sheet Layout Overlay */}
        {showSheetLayout && sheetLayoutReady && SheetLayoutComponent && (
          <SheetLayoutComponent
            show={true}
            map={mapInstanceRef.current}
            planGeometry={planGeometry}
            epsg={epsg}
            lrNumber={lrNumber}
            projectName={projectName}
            surveyorName={surveyorName}
            surveyorLicense={surveyorLicense}
            clientName={clientName}
            county={county}
          />
        )}

        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-sm text-gray-500" role={mapError ? 'alert' : 'status'}>{mapError ?? 'Loading map...'}</div>
          </div>
        )}
      </div>
    </div>
    </SurveyMapEngineProvider>
  );
}
