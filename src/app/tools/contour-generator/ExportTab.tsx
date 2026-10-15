'use client';

// Tab 4: Export
//
// Extracted from src/app/tools/contour-generator/page.tsx.

import type { Bounds, VolumeResult } from './types';
import { fmt } from './helpers';
import type { ContourExportMetadata } from './generators';

interface ExportTabProps {
  exportDXF: () => void;
  exportPDF: () => void;
  exportSVG: () => void;
  exportCSV: () => void;
  volumeResult: VolumeResult | null;
  bounds: Bounds | null;
  metadata: ContourExportMetadata;
  referenceIssue: string | null;
  exportError: string;
  pdfExporting?: boolean;
}

export function ExportTab({
  exportDXF,
  exportPDF,
  exportSVG,
  exportCSV,
  volumeResult,
  bounds,
  metadata,
  referenceIssue,
  exportError,
  pdfExporting = false,
}: ExportTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-white mb-2">Export Contour Data</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Download contour data in your preferred format. All exports use the generated contour data.
        </p>

        {referenceIssue && <p role="status" className="mb-4 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{referenceIssue}</p>}
        {exportError && <p role="alert" className="mb-4 rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{exportError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Print-ready PDF */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 text-sm font-bold flex-shrink-0">PDF</div>
              <div>
                <h3 className="text-sm font-semibold text-white">A3 landscape plan</h3>
                <p className="text-xs text-zinc-500">Print-ready vector PDF</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Includes a map key, equal-scale coordinate frame, scale bar, spot heights, interval, and explicit CRS / datum provenance.
            </p>
            <button disabled={referenceIssue != null || pdfExporting} onClick={exportPDF} className="min-h-11 px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed">
              {pdfExporting ? 'Preparing PDF…' : 'Download A3 PDF'}
            </button>
          </div>

          {/* DXF Export */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                DXF
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">AutoCAD DXF</h3>
              <p className="text-xs text-zinc-500">Elevated LWPOLYLINE on indexed contour layers</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Coordinates remain in metres; each line carries its contour elevation and layer. CRS and datum are noted in the file.
            </p>
            <button
              onClick={exportDXF}
              disabled={referenceIssue != null}
              className="min-h-11 px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download DXF
            </button>
          </div>

          {/* SVG Export */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm font-bold flex-shrink-0">
                SVG
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">SVG Vector Image</h3>
                <p className="text-xs text-zinc-500">Full SVG with viewBox, styled contour map</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Equal-scale projected geometry with coordinate graticule, north arrow, key, scale bar, and source-reference labels. Edit in Inkscape or Illustrator.
            </p>
            <button
              onClick={exportSVG}
              disabled={referenceIssue != null}
              className="min-h-11 px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download SVG
            </button>
          </div>

          {/* CSV Export */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400 text-sm font-bold flex-shrink-0">
                CSV
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">CSV Spreadsheet</h3>
                <p className="text-xs text-zinc-500">Contour points as tabular data</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Contour vertices with metre units, index flags, and horizontal / vertical reference columns.
            </p>
            <button
              onClick={exportCSV}
              disabled={referenceIssue != null}
              className="min-h-11 px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download CSV
            </button>
          </div>

        </div>
        <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-xs text-[var(--text-secondary)]">
          <p><strong>Horizontal CRS:</strong> {metadata.horizontalCrs.trim() || 'Not specified in source data'}</p>
          <p className="mt-1"><strong>Vertical datum:</strong> {metadata.verticalDatum.trim() || 'Not specified in source data'}</p>
          <p className="mt-2 text-amber-300">GeoJSON export is withheld until a verified WGS 84 coordinate transformation is available. Projected Easting/Northing must not be labelled as RFC 7946 longitude/latitude.</p>
        </div>
      </div>

      {/* Volume information */}
      {volumeResult && bounds && referenceIssue == null && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Volume Summary</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Volume computed from TIN surface relative to minimum elevation ({bounds.minZ.toFixed(2)} m).
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Cut Volume</span>
              <span className="font-mono text-xl text-red-400">{fmt(volumeResult.cut, 2)} m&sup3;</span>
            </div>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Fill Volume</span>
              <span className="font-mono text-xl text-blue-400">{fmt(volumeResult.fill, 2)} m&sup3;</span>
            </div>
            <div className="p-4 bg-[var(--bg-tertiary)] rounded">
              <span className="text-[var(--text-secondary)] text-sm block">Net Volume</span>
              <span className={`font-mono text-xl ${volumeResult.net >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {fmt(volumeResult.net, 2)} m&sup3;
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
