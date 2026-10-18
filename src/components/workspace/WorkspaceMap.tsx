'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo, Component } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { logger } from '@/lib/logger'
import { useSelectionStore } from '@/lib/surveyMapEngine/ol/selection';
import { switchBasemapById } from '@/lib/surveyMapEngine/ol/layers';
import { exportMapPDF } from '@/lib/surveyMapEngine/io/exportSurface';
import { SurveyMapEngineProvider } from '@/lib/surveyMapEngine/react/SurveyMapEngineContext';
import { useSurveyMapEngine } from '@/lib/surveyMapEngine/react/useSurveyMapEngine';

/** Stable DOM id so the engine export surface can capture this map canvas. */
const WORKSPACE_MAP_CONTAINER_ID = 'metardu-workspace-map';

/**
 * WorkspacePrintButton — print affordance driven by the survey map engine
 * context (plan Phase 5 consumer rewiring). The generator is reached through
 * the engine io surface, never imported by this component.
 */
function WorkspacePrintButton({ className }: { className: string }) {
  const { exportApi } = useSurveyMapEngine();
  const handlePrint = useCallback(() => {
    void exportApi.exportMapPDF(WORKSPACE_MAP_CONTAINER_ID, {
      paperSize: 'a4',
      orientation: 'landscape',
    });
  }, [exportApi]);
  return (
    <button onClick={handlePrint} title="Print / PDF" className={className}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
      </svg>
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────

interface StationCoord {
  pointName?: string;
  adjustedEasting?: number; adjustedNorthing?: number;
  easting?: number; northing?: number;
  E?: number; N?: number; e?: number; n?: number;
}

/** OL Map with the workspace meta extension written during init. */
type MapWithWsMeta = import('ol/Map').default & {
  _wsMeta?: { projectName: string };
}

interface WorkspaceMapProps {
  projectId: string;
  projectName: string;
  boundaryData?: {
    adjustedStations?: Array<StationCoord> | null;
    stations?: StationCoord[];
  } | null;
  /** Project UTM EPSG (e.g. 'EPSG:21037') — required; never defaulted (plan F3) */
  epsg: string;
}

// ── Error Boundary ────────────────────────────────────────────────────

class MapEB extends Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(e: Error, info: React.ErrorInfo) { logger.error('[WorkspaceMap]', { error: e, info }); }
  render() {
    if (this.state.err) return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-center max-w-xs px-4">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-red-400 mb-1">Map failed to load</p>
          <p className="text-[11px] text-gray-500">{(this.state.err as Error)?.message}</p>
          <button onClick={() => this.setState({ err: null })}
            className="mt-3 px-4 py-1.5 text-xs bg-[#D17B47] hover:bg-[#D17B47]/80 text-white rounded transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function extractCoord(s: StationCoord): [number, number] | null {
  const e = s.adjustedEasting ?? s.easting ?? s.E ?? s.e;
  const n = s.adjustedNorthing ?? s.northing ?? s.N ?? s.n;
  return (e != null && n != null && !isNaN(e) && !isNaN(n)) ? [e, n] : null;
}

// ── Component ─────────────────────────────────────────────────────────

export default function WorkspaceMap({ projectId, projectName, boundaryData, epsg }: WorkspaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('ol/Map').default | null>(null);
  const projectExtentRef = useRef<[number, number, number, number] | null>(null);
  const coordBarRef = useRef<HTMLDivElement>(null);
  const throttleRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [stationCount, setStationCount] = useState(0);
  const [pointStatus, setPointStatus] = useState('Loading survey points in view…');
  const [boundaryPartial, setBoundaryPartial] = useState(false);

  // Sync active tool from uiStore
  const setViewport = useUIStore(s => s.setViewport);
  const selectedPointIds = useUIStore(s => s.selectedPointIds);

  // Sync map viewport changes back to uiStore
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const map = mapRef.current;
    const view = map.getView();
    const center = view.getCenter();
    const zoom = view.getZoom();
    const rotation = view.getRotation();
    setViewport({
      center: center ? [center[0], center[1]] : [0, 0],
      zoom: zoom ?? 0,
      rotation,
      projection: 'EPSG:3857',
    });
  }, [ready, setViewport]);

  // React to selected point changes (e.g. highlight selected station)
  useEffect(() => {
    if (!mapRef.current || !ready || selectedPointIds.length === 0) return;
    // The select interaction handles visual highlighting
  }, [ready, selectedPointIds]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: import('ol/Map').default | null = null;
    let cancelled = false;
    let viewportRequest: AbortController | null = null;
    let disposeViewportListeners: (() => void) | null = null;
    const extentRequest = new AbortController();

    async function init() {
      try {
        // Register the actual project CRS with OpenLayers before plotting any points.
        const { registerProjectProjection } = await import('@/lib/map/projection');
        await registerProjectProjection(epsg);

        // Load only core OL modules needed
        const [Map, View, TileLayer, OSM, XYZ, VectorLayer, VectorSource,
          Feature, Point, LineString, Style, Fill, Stroke, CircleStyle, Text,
          ScaleLine, MousePosition, Overlay, proj
        ] = await Promise.all([
          import('ol/Map').then(m => m.default),
          import('ol/View').then(m => m.default),
          import('ol/layer/Tile').then(m => m.default),
          import('ol/source/OSM').then(m => m.default),
          import('ol/source/XYZ').then(m => m.default),
          import('ol/layer/Vector').then(m => m.default),
          import('ol/source/Vector').then(m => m.default),
          import('ol/Feature').then(m => m.default),
          import('ol/geom/Point').then(m => m.default),
          import('ol/geom/LineString').then(m => m.default),
          import('ol/style/Style').then(m => m.default),
          import('ol/style/Fill').then(m => m.default),
          import('ol/style/Stroke').then(m => m.default),
          import('ol/style/Circle').then(m => m.default),
          import('ol/style/Text').then(m => m.default),
          import('ol/control/ScaleLine').then(m => m.default),
          import('ol/control/MousePosition').then(m => m.default),
          import('ol/Overlay').then(m => m.default),
          import('ol/proj'),
        ]);

        if (cancelled || !containerRef.current) return;

        // ── Basemap layers ──
        const osmLayer = new TileLayer({
          source: new OSM({ crossOrigin: 'anonymous' }),
          visible: true,
        });
        osmLayer.set('basemapId', 'osm');

        const satLayer = new TileLayer({
          source: new XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            crossOrigin: 'anonymous', maxZoom: 19,
            attributions: 'Tiles &copy; Esri',
          }),
          visible: false,
        });
        satLayer.set('basemapId', 'satellite');

        // ── Bounded boundary display and viewport survey points ──
        const stationSource = new VectorSource();
        const viewportSource = new VectorSource();
        const allBoundaryStations = boundaryData?.adjustedStations ?? [];
        const isBoundaryPartial = allBoundaryStations.length > 500;
        setBoundaryPartial(isBoundaryPartial);
        // Never draw a traverse from a truncated boundary: that would imply a
        // closed parcel where no complete geometry has been established.
        const stations = allBoundaryStations.slice(0, 500);
        const validCoords: Array<[number, number, string]> = [];
        for (const s of stations) {
          const c = extractCoord(s);
          if (!c) continue;
          try {
            const [e3857, n3857] = proj.transform(c, epsg, 'EPSG:3857');
            if (!Number.isFinite(e3857) || !Number.isFinite(n3857)) continue;
            const name = s.pointName || `P${validCoords.length + 1}`;
            validCoords.push([e3857, n3857, name]);
            const feat = new Feature({ geometry: new Point([e3857, n3857]) });
            feat.set('name', name);
            stationSource.addFeature(feat);
          } catch { /* skip bad coordinates */ }
        }

        const lineSource = new VectorSource();
        if (!isBoundaryPartial && validCoords.length >= 2) {
          const coords = validCoords.map(([e, n]) => [e, n]);
          if (coords.length >= 3) coords.push([...coords[0]]);
          lineSource.addFeature(new Feature({ geometry: new LineString(coords) }));
        }

        let surveyExtent: [number, number, number, number] | null = null;
        try {
          const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/map-points?mode=extent`, {
            signal: extentRequest.signal,
          });
          if (!response.ok) throw new Error(`Project extent request failed (${response.status})`);
          const overview: unknown = await response.json();
          const rawExtent = (overview as { extent?: unknown } | null)?.extent;
          if (Array.isArray(rawExtent) && rawExtent.length === 4 &&
              rawExtent.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))) {
            const [minE, minN, maxE, maxN] = rawExtent as [number, number, number, number];
            // A one-point project still needs a finite area for OpenLayers fit.
            const padded: [number, number, number, number] = [
              minE === maxE ? minE - 1 : minE,
              minN === maxN ? minN - 1 : minN,
              minE === maxE ? maxE + 1 : maxE,
              minN === maxN ? maxN + 1 : maxN,
            ];
            const transformed = proj.transformExtent(padded, epsg, 'EPSG:3857', 8);
            if (transformed.every(Number.isFinite)) surveyExtent = transformed as [number, number, number, number];
          }
        } catch (error) {
          if (!cancelled && !extentRequest.signal.aborted) {
            logger.warn('[WorkspaceMap] extent unavailable', { error });
          }
        }
        if (cancelled || !containerRef.current) return;

        const pointStyle = (feature: import('ol/Feature').FeatureLike) => {
            const name = (feature.get('name') as string | undefined) || '';
            return new Style({
              image: new CircleStyle({
                radius: 7,
                fill: new Fill({ color: '#D17B47' }),
                stroke: new Stroke({ color: '#fff', width: 2 }),
              }),
              text: new Text({
                text: name,
                font: 'bold 11px Geist, system-ui, sans-serif',
                fill: new Fill({ color: '#fff' }),
                stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
                offsetY: -16,
              }),
            });
        };
        const stationLayer = new VectorLayer({ source: stationSource, style: pointStyle, zIndex: 10 });
        const viewportLayer = new VectorLayer({ source: viewportSource, style: pointStyle, zIndex: 11 });

        const lineLayer = new VectorLayer({
          source: lineSource,
          style: new Style({
            stroke: new Stroke({ color: '#D17B47', width: 2, lineDash: [8, 4] }),
          }),
          zIndex: 9,
        });

        // ── Popup ──
        const popupEl = document.createElement('div');
        popupEl.className = 'hidden';
        const popup = new Overlay({
          element: popupEl, autoPan: { animation: { duration: 200 } },
          positioning: 'bottom-center', offset: [0, -12],
        });

        // ── Create map ──
        map = new Map({
          target: containerRef.current,
          layers: [osmLayer, satLayer, lineLayer, stationLayer, viewportLayer],
          view: new View({
            center: surveyExtent
              ? [(surveyExtent[0] + surveyExtent[2]) / 2, (surveyExtent[1] + surveyExtent[3]) / 2]
              : validCoords.length > 0
                ? [validCoords[0][0], validCoords[0][1]]
                : proj.fromLonLat([36.8219, -1.2921]),
            zoom: surveyExtent || validCoords.length > 0 ? 17 : 8,
            maxZoom: 22, minZoom: 2,
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new MousePosition({
              coordinateFormat: (coord) => {
                if (!coord) return '';
                try {
                  const [e, n] = proj.transform(coord, 'EPSG:3857', epsg);
                  const now = Date.now();
                  if (now - throttleRef.current > 100) {
                    throttleRef.current = now;
                    const bar = coordBarRef.current;
                    if (bar) {
                      // VULN-002 FIX: numbers only here, but use textContent
                      // so no markup is ever parsed into the DOM.
                      bar.replaceChildren();
                      const span = (text: string, cls: string) => {
                        const s = document.createElement('span');
                        s.className = cls;
                        s.textContent = text;
                        return s;
                      };
                      bar.append(
                        span('E', 'text-gray-500'),
                        document.createTextNode(' '),
                        span(e.toFixed(1), 'text-[#D17B47] font-mono'),
                        document.createTextNode(' '),
                        span('N', 'text-gray-500'),
                        document.createTextNode(' '),
                        span(n.toFixed(1), 'text-[#D17B47] font-mono'),
                        document.createTextNode(' '),
                        span(epsg, 'text-gray-600 text-[9px]')
                      );
                    }
                  }
                  return 'E: ' + e.toFixed(1) + '  N: ' + n.toFixed(1);
                } catch {
                  return coord[0].toFixed(5) + ', ' + coord[1].toFixed(5);
                }
              },
              projection: 'EPSG:3857',
              className: 'ol-mouse-position',
            }),
          ],
          overlays: [popup],
        });
        mapRef.current = map;

        // ── Select for popups ──
        const { default: Select } = await import('ol/interaction/Select');
        const select = new Select({
          style: new Style({
            image: new CircleStyle({ radius: 9, fill: new Fill({ color: '#D17B47' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
          }),
          hitTolerance: 8, layers: [stationLayer, viewportLayer],
        });
        select.on('select', (evt: import('ol/interaction/Select').SelectEvent) => {
          if (evt.selected.length > 0) {
            const f = evt.selected[0];
            const coord = f.getGeometry()?.getClosestPoint(evt.mapBrowserEvent.coordinate);
            const name = (f.get('name') as string | undefined) || 'Station';
            useSelectionStore.getState().setSelection({ kind: 'station', surface: 'workspace', ids: [name] });
            // VULN-002 FIX (security review 2026-08-03): station names are
            // user-entered — render with textContent, never innerHTML.
            popupEl.replaceChildren();
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(20,20,30,0.95);border:1px solid rgba(209, 123, 71,0.3);border-radius:10px;padding:10px 14px;font-size:12px;color:#fff;min-width:160px;';
            const label = document.createElement('div');
            label.style.cssText = 'font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;';
            label.textContent = 'Station';
            const value = document.createElement('div');
            value.style.cssText = 'color:#D17B47;font-weight:600;';
            value.textContent = name;
            card.append(label, value);
            popupEl.append(card);
            popupEl.className = '';
            if (coord) popup.setPosition(coord);
          } else {
            useSelectionStore.getState().clearSelectionFrom('workspace');
            popupEl.className = 'hidden';
            popup.setPosition(undefined);
          }
        });
        map.addInteraction(select);

        // ── Click on map to select ──
        map.on('click', () => { /* popup handled by select */ });

        // ── Fit to complete project extent, then load only visible points ──
        const boundaryExtent = !isBoundaryPartial && validCoords.length > 0
          ? stationSource.getExtent() as [number, number, number, number]
          : null;
        projectExtentRef.current = surveyExtent ?? boundaryExtent;
        if (projectExtentRef.current) {
          try {
            map.getView().fit(projectExtentRef.current, {
              padding: [40, 40, 40, 40], maxZoom: 18, duration: 0,
            });
          } catch { /* keep initial center */ }
        }

        const activeMap = map;
        const loadViewportPoints = async () => {
          const size = activeMap.getSize();
          if (!size || size[0] === 0 || size[1] === 0) return;
          viewportRequest?.abort();
          const request = new AbortController();
          viewportRequest = request;
          viewportSource.clear();
          setStationCount(0);
          setPointStatus('Loading survey points in view…');
          try {
            const bbox = proj.transformExtent(
              activeMap.getView().calculateExtent(size), 'EPSG:3857', epsg, 8,
            );
            if (bbox.length !== 4 || bbox.some(value => !Number.isFinite(value)) ||
                bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
              setPointStatus('Zoom in to a valid project area to load survey points.');
              return;
            }
            const response = await fetch(
              `/api/project/${encodeURIComponent(projectId)}/map-points?bbox=${encodeURIComponent(bbox.join(','))}`,
              { signal: request.signal },
            );
            if (!response.ok) throw new Error(`Survey point request failed (${response.status})`);
            const data: unknown = await response.json();
            const payload = data as { points?: unknown; truncated?: unknown } | null;
            if (!Array.isArray(payload?.points) || typeof payload.truncated !== 'boolean') {
              throw new Error('Invalid survey point response');
            }
            if (cancelled || viewportRequest !== request) return;
            let displayed = 0;
            const points = payload.points as unknown[];
            for (const rawPoint of points.slice(0, 500)) {
              if (!rawPoint || typeof rawPoint !== 'object') continue;
              const point = rawPoint as { name?: unknown; easting?: unknown; northing?: unknown };
              const e = Number(point.easting);
              const n = Number(point.northing);
              if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
              try {
                const coordinate = proj.transform([e, n], epsg, 'EPSG:3857');
                if (!coordinate.every(Number.isFinite)) continue;
                const feature = new Feature({ geometry: new Point(coordinate) });
                feature.set('name', typeof point.name === 'string' && point.name ? point.name : 'Survey point');
                viewportSource.addFeature(feature);
                displayed++;
              } catch { /* skip unprojectable point */ }
            }
            setStationCount(displayed);
            setPointStatus(payload.truncated
              ? `Showing the first ${displayed} of more than 500 points in view. Zoom in for the rest.`
              : `Showing all ${displayed} survey points in view.`);
          } catch (error) {
            if (!request.signal.aborted && !cancelled) {
              logger.warn('[WorkspaceMap] viewport points unavailable', { error });
              setPointStatus('Survey points could not load for this view. Pan or zoom to retry.');
            }
          }
        };
        const onViewportChange = () => { void loadViewportPoints(); };
        activeMap.on('moveend', onViewportChange);
        activeMap.on('change:size', onViewportChange);
        disposeViewportListeners = () => {
          activeMap.un('moveend', onViewportChange);
          activeMap.un('change:size', onViewportChange);
        };
        activeMap.updateSize();
        void loadViewportPoints();

        // ── Expose toggleBasemap ──
        ;(map as MapWithWsMeta)._wsMeta = { projectName };

        if (!cancelled) setReady(true);
      } catch (err: unknown) {
        logger.error('[WorkspaceMap] init failed:', { error: err });
        if (!cancelled) setInitError(err instanceof Error ? err.message : 'Map could not load');
      }
    }

    init();

    // Resize observer
    const ro = new ResizeObserver(() => { mapRef.current?.updateSize(); });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      extentRequest.abort();
      viewportRequest?.abort();
      disposeViewportListeners?.();
      projectExtentRef.current = null;
      ro.disconnect();
      if (map) { try { map.setTarget(undefined); } catch {} mapRef.current = null; }
    };
  }, [boundaryData, epsg, projectName, projectId]);

  // ── Basemap toggle ──
  const toggleBasemap = (mode: 'osm' | 'satellite') => {
    if (!mapRef.current) return;
    switchBasemapById(mapRef.current, mode);
  };

  // ── Fit to the complete server-reported project extent ──
  const fitProject = () => {
    if (!mapRef.current || !projectExtentRef.current) return;
    mapRef.current.getView().fit(projectExtentRef.current, {
      padding: [40, 40, 40, 40], maxZoom: 18, duration: 400,
    });
  };

  const zoomBy = (delta: number) => {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.setZoom((view.getZoom() ?? 0) + delta);
  };

  const BTN = 'w-7 h-7 flex items-center justify-center rounded-md bg-[#14141e]/90 border border-white/[0.08] hover:bg-[#14141e] text-gray-400 hover:text-white transition-colors';

  // Phase 5: export/print entries exposed through the engine context. The
  // workspace surface has no sheet-layout overlay, so only the print entry is
  // bound; the button reads it back via useSurveyMapEngine().
  const printApi = useMemo(
    () => ({
      sheetLayoutOpen: false,
      openSheetLayout: () => {},
      closeSheetLayout: () => {},
      toggleSheetLayout: () => {},
      print: () => {
        void exportMapPDF(WORKSPACE_MAP_CONTAINER_ID, {
          paperSize: 'a4',
          orientation: 'landscape',
        });
      },
    }),
    []
  );

  return (
    <SurveyMapEngineProvider printApi={printApi}>
    <MapEB>
      <div className="h-full w-full relative bg-[#0a0a0f]">
        <div id={WORKSPACE_MAP_CONTAINER_ID} ref={containerRef} className="w-full h-full" />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80 z-10">
            <div className="max-w-xs px-5 text-center">
              {initError ? (
                <>
                  <p className="text-sm font-medium text-red-400">Map could not load</p>
                  <p className="mt-1 text-xs text-gray-400">{initError}</p>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 border-2 border-[#D17B47] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Loading map...</p>
                </>
              )}
            </div>
          </div>
        )}

        {ready && (
          <>
            {/* Controls - top right */}
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
              <button onClick={fitProject} title="Fit to project extent" disabled={!projectExtentRef.current} className={BTN}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              <button onClick={() => zoomBy(1)} title="Zoom in" className={BTN}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
              </button>
              <button onClick={() => zoomBy(-1)} title="Zoom out" className={BTN}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                </svg>
              </button>
              <div className="w-full h-px bg-white/[0.06] my-0.5" />
              <button onClick={() => toggleBasemap('osm')} title="OSM" className={BTN}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
              <button onClick={() => toggleBasemap('satellite')} title="Satellite" className={BTN}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <div className="w-full h-px bg-white/[0.06] my-0.5" />
              <WorkspacePrintButton className={BTN} />
            </div>

            {/* Viewport point count and explicit partial-loading status */}
            <div className="absolute top-2 left-2 z-10 max-w-[min(28rem,calc(100%-5rem))]">
              <div className="bg-[#14141e]/95 border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg" role="status" aria-live="polite">
                <span className="text-xs text-[#D17B47] font-semibold">{stationCount} survey points loaded</span>
                <p className="text-[11px] leading-4 text-gray-300">{pointStatus}</p>
                {boundaryPartial && <p className="text-[11px] leading-4 text-amber-300">Boundary station display is limited to the first 500; traverse line omitted.</p>}
              </div>
            </div>

            {/* Coordinate bar - bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <div ref={coordBarRef} className="mx-2 mb-2 h-7 bg-[#14141e]/90 border border-white/[0.06] rounded-md flex items-center justify-center px-3">
                <span className="text-xs text-gray-600">Move cursor for coordinates</span>
              </div>
            </div>
          </>
        )}
      </div>
    </MapEB>
    </SurveyMapEngineProvider>
  );
}
