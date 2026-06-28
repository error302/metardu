'use client';

import type { BBox, GridCell, Method } from './types';
import type { SurfacePoint } from '@/lib/engine/volume';

interface ExportTabProps {
  cutVolume: number | null;
  fillVolume: number | null;
  netVolume: number | null;
  gridCells: GridCell[];
  surveyAPoints: SurfacePoint[];
  surveyBPoints: SurfacePoint[];
  bboxA: BBox | null;
  bboxB: BBox | null;
  method: Method;
  gridSpacing: number;
  balancePoint: number | null;
  exportResultsCSV: () => void;
  exportGridCSV: () => void;
  handlePrint: () => void;
}

export default function ExportTab({
  cutVolume,
  fillVolume,
  netVolume,
  gridCells,
  surveyAPoints,
  surveyBPoints,
  bboxA,
  bboxB,
  method,
  gridSpacing,
  balancePoint,
  exportResultsCSV,
  exportGridCSV,
  handlePrint,
}: ExportTabProps) {
  const canExport = cutVolume !== null && fillVolume !== null;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Export Options</h3>

        {!canExport && (
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Run the volume computation first before exporting results.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Export results CSV */}
          <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">📄</span>
              <div>
                <h4 className="font-medium text-sm">Results Summary (CSV)</h4>
                <p className="text-xs text-[var(--text-muted)]">Volume metadata + statistics</p>
              </div>
            </div>
            <button
              onClick={exportResultsCSV}
              disabled={!canExport}
              className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Results CSV
            </button>
          </div>

          {/* Export grid CSV */}
          <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">[Compass]</span>
              <div>
                <h4 className="font-medium text-sm">Cut/Fill Grid (CSV)</h4>
                <p className="text-xs text-[var(--text-muted)]">Per-cell easting, northing, diff, type</p>
              </div>
            </div>
            <button
              onClick={exportGridCSV}
              disabled={gridCells.length === 0}
              className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Grid CSV ({gridCells.length} cells)
            </button>
          </div>

          {/* Print report */}
          <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🖨</span>
              <div>
                <h4 className="font-medium text-sm">Print-Friendly Report</h4>
                <p className="text-xs text-[var(--text-muted)]">Browser print dialog</p>
              </div>
            </div>
            <button
              onClick={handlePrint}
              disabled={!canExport}
              className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Print Report
            </button>
          </div>
        </div>
      </div>

      {/* Print preview (visible only during print) */}
      {canExport && (
        <div className="print:block hidden">
          <h1 className="text-2xl font-bold mb-4">Volume Comparison Report</h1>
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <div className="font-medium">Survey A: {surveyAPoints.length} points</div>
              {bboxA && <div>BBox: E {bboxA.minE.toFixed(1)}–{bboxA.maxE.toFixed(1)}, N {bboxA.minN.toFixed(1)}–{bboxA.maxN.toFixed(1)}</div>}
            </div>
            <div>
              <div className="font-medium">Survey B: {surveyBPoints.length} points</div>
              {bboxB && <div>BBox: E {bboxB.minE.toFixed(1)}–{bboxB.maxE.toFixed(1)}, N {bboxB.minN.toFixed(1)}–{bboxB.maxN.toFixed(1)}</div>}
            </div>
          </div>
          <div className="border-t border-b py-4 mb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-500">Cut Volume</div>
                <div className="text-xl font-bold">{cutVolume?.toFixed(2)} m³</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Fill Volume</div>
                <div className="text-xl font-bold">{fillVolume?.toFixed(2)} m³</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Net Volume</div>
                <div className="text-xl font-bold">{netVolume?.toFixed(2)} m³</div>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Method: {method === 'tin' ? 'TIN Interpolation' : 'IDW Grid'} | Grid Spacing: {gridSpacing}m | Balance Point: {balancePoint !== null ? `${balancePoint.toFixed(3)}m` : 'N/A'}
          </div>
        </div>
      )}
    </div>
  );
}
