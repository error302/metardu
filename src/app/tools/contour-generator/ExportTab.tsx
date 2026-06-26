'use client';

// Tab 4: Export
//
// Extracted from src/app/tools/contour-generator/page.tsx.

import type { Bounds, VolumeResult } from './types';
import { fmt } from './helpers';

interface ExportTabProps {
  exportDXF: () => void;
  exportSVG: () => void;
  exportCSV: () => void;
  exportGeoJSON: () => void;
  volumeResult: VolumeResult | null;
  bounds: Bounds | null;
}

export function ExportTab({
  exportDXF,
  exportSVG,
  exportCSV,
  exportGeoJSON,
  volumeResult,
  bounds,
}: ExportTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-white mb-2">Export Contour Data</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Download contour data in your preferred format. All exports use the generated contour data.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* DXF Export */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                DXF
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">AutoCAD DXF</h3>
                <p className="text-xs text-zinc-500">LWPOLYLINE per contour, layers by elevation</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Compatible with AutoCAD, Civil 3D, MicroSurvey, QGIS. Each contour placed on its own
              elevation layer (e.g., C100.0, C101.0).
            </p>
            <button
              onClick={exportDXF}
              className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
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
              Scalable vector graphic of the contour map. Includes coordinate labels, north arrow,
              scale bar, and elevation coloring. Edit in Inkscape or Illustrator.
            </p>
            <button
              onClick={exportSVG}
              className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
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
              Columns: contour_id, elevation, is_index, point_index, easting, northing.
              Import into Excel, Google Sheets, or any spreadsheet software.
            </p>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
            >
              Download CSV
            </button>
          </div>

          {/* GeoJSON Export */}
          <div className="bg-[var(--bg-tertiary)] border border-zinc-700 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm font-bold flex-shrink-0">
                GEO
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">GeoJSON</h3>
                <p className="text-xs text-zinc-500">MultiLineString per contour with properties</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Standard GeoJSON FeatureCollection. Each contour is a MultiLineString with
              elevation and is_index properties. Drop into QGIS, Mapbox, or Leaflet.
            </p>
            <button
              onClick={exportGeoJSON}
              className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg text-sm font-semibold w-full"
            >
              Download GeoJSON
            </button>
          </div>
        </div>
      </div>

      {/* Volume information */}
      {volumeResult && bounds && (
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
