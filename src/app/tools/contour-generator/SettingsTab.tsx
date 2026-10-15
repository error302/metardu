'use client';

// Tab 2: Settings & Generate
//
// Extracted from src/app/tools/contour-generator/page.tsx.

import type { ContourLine, TINSurface } from '@/lib/engine/contours';
import type { Bounds, VolumeResult } from './types';
import { fmt, formatContourHeight } from './helpers';
import { contourElevationAtIndex } from '@/lib/topo/tinContours';

interface SettingsTabProps {
  contourInterval: number;
  setContourInterval: (v: number) => void;
  indexMultiplier: number;
  setIndexMultiplier: (v: number) => void;
  mapTitle: string;
  setMapTitle: (v: string) => void;
  horizontalCrs: string;
  setHorizontalCrs: (v: string) => void;
  verticalDatum: string;
  setVerticalDatum: (v: string) => void;
  heightsInMetres: boolean;
  setHeightsInMetres: (value: boolean) => void;
  points: { length: number } & unknown;
  bounds: Bounds | null;
  isGenerating: boolean;
  generateError: string;
  handleGenerate: () => void;
  contours: ContourLine[];
  tinSurface: TINSurface | null;
  volumeResult: VolumeResult | null;
  generateProgress?: number;
  usingWorker?: boolean;
  executionMode?: 'worker' | 'main-thread' | null;
  breaklineCount?: number;
  generationComplete?: boolean;
}

export function SettingsTab({
  contourInterval,
  setContourInterval,
  indexMultiplier,
  setIndexMultiplier,
  mapTitle,
  setMapTitle,
  horizontalCrs,
  setHorizontalCrs,
  verticalDatum,
  setVerticalDatum,
  heightsInMetres,
  setHeightsInMetres,
  points,
  bounds,
  isGenerating,
  generateError,
  handleGenerate,
  contours,
  tinSurface,
  volumeResult,
  generateProgress = 0,
  usingWorker = false,
  executionMode = null,
  breaklineCount = 0,
  generationComplete = false,
}: SettingsTabProps) {
  const heightUnits = heightsInMetres ? 'm' : 'source units';
  let indexSpacing = 'unavailable';
  try { if (indexMultiplier >= 1) indexSpacing = formatContourHeight(contourElevationAtIndex(contourInterval, indexMultiplier)); } catch { /* Invalid settings remain editable; generation explains the error. */ }
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Contour Generation Settings</h2>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">Plan identity and survey reference</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Enter a registered projected metre CRS and the source height reference before exporting. Source coordinates and heights are used as entered; no unit conversion is applied.
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-3">All supplied points and measured breaklines define the surface. Import ground observations or a reviewed ground-only dataset; this tool does not automatically remove vegetation, buildings or high ground.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="contour-map-title">Map title</label>
            <input id="contour-map-title" value={mapTitle} onChange={event => setMapTitle(event.target.value)} maxLength={120}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="contour-horizontal-crs">Horizontal CRS / EPSG</label>
            <input id="contour-horizontal-crs" value={horizontalCrs} onChange={event => setHorizontalCrs(event.target.value)} maxLength={120}
              placeholder="EPSG:21037 (use your source CRS)"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="contour-vertical-datum">Vertical datum / height source</label>
            <input id="contour-vertical-datum" value={verticalDatum} onChange={event => setVerticalDatum(event.target.value)} maxLength={120}
              placeholder="Enter the source height reference"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
        <label className="mb-3 flex min-h-11 items-center gap-3 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={heightsInMetres} onChange={event => setHeightsInMetres(event.target.checked)} />
          I confirm that the source height values are in metres.
        </label>
        <p className="text-xs text-amber-300 mb-6">Record the CRS, vertical datum and source units before exporting a metric plan. These declarations do not verify survey control or measurement accuracy.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="contour-interval-m">
              Contour Interval ({heightsInMetres ? 'm' : 'source height units'})
            </label>
            <input id="contour-interval-m" aria-label="Contour interval"
              type="number"
              step="0.1"
              min="0.01"
              value={contourInterval}
              onChange={e => setContourInterval(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-xs text-zinc-500 mt-1">Vertical spacing between contours</p>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1" htmlFor="index-contour-multiplier">
              Index Contour Multiplier
            </label>
            <input id="index-contour-multiplier" aria-label="Index Contour Multiplier"
              type="number"
              step="1"
              min="1"
              value={indexMultiplier}
              onChange={e => setIndexMultiplier(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Every Nth contour is an index (thick) line (interval &times; {indexMultiplier} = {indexSpacing} {heightUnits})
            </p>
          </div>
          <div className="flex flex-col">
            <div className="block text-sm text-[var(--text-secondary)] mb-1">Points Available</div>
            <div className="px-3 py-2 bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg text-sm text-zinc-300">
              {points.length.toLocaleString()} points
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {bounds ? `Elevation range: ${fmt(bounds.minZ, 1)} – ${fmt(bounds.maxZ, 1)} ${heightUnits}` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || points.length < 3}
            className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              'Generate Contours'
            )}
          </button>
          {isGenerating && (
            <div className="flex items-center gap-3 text-sm text-zinc-400 flex-1 min-w-[200px]">
              <div className="flex-1 max-w-xs">
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-300"
                    style={{ width: `${Math.round(generateProgress * 100)}%` }}
                  />
                </div>
              </div>
              <span className="font-mono text-xs">
                {Math.round(generateProgress * 100)}%
              </span>
              {usingWorker ? (
                <span className="text-[10px] uppercase tracking-wider text-cyan-400 border border-cyan-700/50 rounded px-1.5 py-0.5">
                  Worker
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                  Sync
                </span>
              )}
            </div>
          )}
          {!isGenerating && points.length >= 3 && (
            <span className="text-sm text-zinc-400">
              Ready to generate{breaklineCount > 0 ? ` (${breaklineCount} breakline${breaklineCount > 1 ? 's' : ''} active)` : '.'}
            </span>
          )}
          {!isGenerating && points.length < 3 && (
            <span className="text-sm text-zinc-500">Import at least 3 points first.</span>
          )}
        </div>
      </div>

      {generateError && (
        <div role="alert" className="p-4 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
          {generateError}
        </div>
      )}

      {/* Results summary */}
      {generationComplete && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Generation Results</h2>
          {contours.length === 0 && <p role="status" className="text-sm text-[var(--text-secondary)] mb-4">The surface was built, but it has no contour lines at this interval. A flat surface or an interval larger than the height range can produce this result. Review the elevation range and interval.</p>}
          {executionMode && <p className="text-xs text-[var(--text-secondary)] mb-4" role="status">{executionMode === 'worker' ? 'Calculated in the background worker.' : 'Calculated in this browser tab using the fallback engine. Large datasets may pause the page.'}</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Contour Lines</span>
              <span className="font-mono text-xl text-[var(--accent)]">{contours.length}</span>
            </div>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Index Contours</span>
              <span className="font-mono text-xl">{contours.filter(c => c.isIndex).length}</span>
            </div>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">TIN Triangles</span>
              <span className="font-mono text-xl">{tinSurface?.triangles.length || 0}</span>
            </div>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Volume (above min Z)</span>
              <span className="font-mono text-lg">
                {volumeResult ? `${fmt(volumeResult.cut, 1)} m\u00B3` : '\u2014'}
              </span>
            </div>
          </div>

          {/* Contour elevation list */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
              Contour Elevations
            </h3>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const uniqueElevations = [...new Set(contours.map(c => c.elevation))].sort((a, b) => a - b);
                return uniqueElevations.map(elev => {
                  const contour = contours.find(c => c.elevation === elev);
                  const isIndex = contour?.isIndex;
                  return (
                    <span
                      key={elev}
                      className={`px-2 py-1 rounded text-xs font-mono ${
                        isIndex
                          ? 'bg-[var(--accent)] text-black font-bold'
                          : 'bg-[var(--bg-tertiary)] text-zinc-400'
                      }`}
                    >
                      {formatContourHeight(elev)}{isIndex ? ' (idx)' : ''}
                    </span>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
