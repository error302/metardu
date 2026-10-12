'use client';
import { useParams } from 'next/navigation'

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { loadProjectMapData } from '@/lib/workspaces/projectMapData';
import { useSelectionStore } from '@/lib/surveyMapEngine/ol/selection';

const SurveyMap = dynamic(() => import('@/components/map/SurveyMap'), { ssr: false });
type MapData = Awaited<ReturnType<typeof loadProjectMapData>>;

export default function MapPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBeacon, setSelectedBeacon] = useState<{ label: string; easting: number; northing: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedBeacon(null);
    void loadProjectMapData(params.id, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The project map could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [params.id]);

  useEffect(() => {
    return () => useSelectionStore.getState().clearSelectionFrom('project-map');
  }, []);

  const handleBeaconClick = useCallback((label: string, easting: number, northing: number) => {
    setSelectedBeacon({ label, easting, northing });
    useSelectionStore.getState().setSelection({ kind: 'beacon', surface: 'project-map', label, easting, northing });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center bg-[var(--bg-primary)] text-sm text-[var(--text-muted)]" role="status">
        Loading project survey map…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-[var(--bg-primary)] px-4">
        <div className="text-center max-w-md p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Project map unavailable</h3>
          <p className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed" role="alert">
            {error}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <a
              href={`/project/${params.id}/settings`}
              className="w-full sm:w-auto px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-xs font-semibold rounded-lg transition-colors"
            >
              Open Project Settings →
            </a>
            <a
              href={`/project/${params.id}`}
              className="w-full sm:w-auto px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-medium rounded-lg transition-colors"
            >
              Back to Project
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm text-[var(--text-muted)]">Project map metadata is unavailable. Reload the project.</div>;
  }
  const { stations, projectInfo, geometryKind, coordinatePrecision } = data;

  const sumE = stations.reduce((sum, s) => sum + s.adjustedEasting, 0);
  const sumN = stations.reduce((sum, s) => sum + s.adjustedNorthing, 0);
  const centroidEasting = sumE / stations.length;
  const centroidNorthing = sumN / stations.length;

  return (
    <main className="h-[calc(100dvh-8rem)] min-h-[32rem] flex flex-col bg-[var(--bg-primary)]" aria-label="Project survey map">
      <header className="flex flex-col gap-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-base font-semibold text-[var(--text-primary)]">
              {projectInfo?.name || 'Project survey map'}
            </h1>
            <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
              {geometryKind === 'points' ? 'Survey points' : 'Saved boundary'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            EPSG:{data.epsg} · {stations.length} {stations.length === 1 ? 'coordinate' : 'coordinates'} · {coordinatePrecision} decimal places
            {geometryKind === 'points' ? ' · no boundary inferred' : ' · ordered survey boundary'}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
          {selectedBeacon ? (
            <div className="min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--bg-secondary)] px-3 py-2" role="status" aria-live="polite">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Selected point · {selectedBeacon.label}</p>
              <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                E {selectedBeacon.easting.toFixed(coordinatePrecision)} · N {selectedBeacon.northing.toFixed(coordinatePrecision)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]" aria-live="polite">Select a mapped point to inspect its coordinates.</p>
          )}
          <a
            href={`/project/${params.id}/observe`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Review Field Book
          </a>
        </div>
      </header>

      {/* ── Survey Map ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <SurveyMap
          projectId={params.id}
          adjustedStations={stations}
          centroidEasting={centroidEasting}
          centroidNorthing={centroidNorthing}
          readOnly
          geometryKind={geometryKind}
          coordinatePrecision={coordinatePrecision}
          onBeaconClick={handleBeaconClick}
          lrNumber={projectInfo?.lrNumber}
          projectName={projectInfo?.name}
          surveyorName={projectInfo?.surveyorName}
          surveyorLicense={projectInfo?.surveyorLicense}
          clientName={projectInfo?.clientName}
          county={projectInfo?.county}
          epsg={projectInfo.epsg}
        />
      </div>
    </main>
  );
}
