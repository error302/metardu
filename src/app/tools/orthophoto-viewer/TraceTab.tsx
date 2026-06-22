'use client';

import {
  PenTool,
  Square,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Ruler,
} from 'lucide-react';
import type { TracedPolygon } from './types';
import { formatArea } from './generators';

interface TraceTabProps {
  polygons: TracedPolygon[];
  expandedPolygon: string | null;
  setExpandedPolygon: (id: string | null) => void;
  clearAllPolygons: () => void;
  renamePolygon: (id: string, newName: string) => void;
  togglePolygonVisibility: (id: string) => void;
  deletePolygon: (id: string) => void;
}

export default function TraceTab({
  polygons,
  expandedPolygon,
  setExpandedPolygon,
  clearAllPolygons,
  renamePolygon,
  togglePolygonVisibility,
  deletePolygon,
}: TraceTabProps) {
  return (
    <div className="space-y-4">
      {/* Trace controls */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <span className="label flex items-center gap-2">
            <PenTool className="h-4 w-4 text-[var(--accent)]" />
            Traced Boundaries
          </span>
          {polygons.length > 0 && (
            <button onClick={clearAllPolygons} className="btn btn-secondary text-xs flex items-center gap-1">
              <Trash2 className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        {polygons.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)]">
            <Square className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No boundaries traced yet.</p>
            <p className="text-xs mt-1">Click &quot;Draw Polygon&quot; above, then click on the map to place vertices. Double-click to finish.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {polygons.map((poly) => {
              const isExpanded = expandedPolygon === poly.id;
              return (
                <div
                  key={poly.id}
                  className="p-3 bg-[var(--bg-tertiary)] rounded border border-[var(--border-color)]"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: poly.color }}
                    />
                    <input
                      className="input text-sm flex-1 py-0.5"
                      value={poly.name}
                      onChange={(e) => renamePolygon(poly.id, e.target.value)}
                    />
                    <button
                      onClick={() => togglePolygonVisibility(poly.id)}
                      className="p-1 hover:bg-[var(--bg-card)] rounded transition-colors"
                      title={poly.visible ? 'Hide polygon' : 'Show polygon'}
                    >
                      {poly.visible ? (
                        <Eye className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      )}
                    </button>
                    <button
                      onClick={() => deletePolygon(poly.id)}
                      className="p-1 hover:bg-red-900/30 rounded transition-colors"
                      title="Delete polygon"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                    <button
                      onClick={() => setExpandedPolygon(isExpanded ? null : poly.id)}
                      className="p-1 hover:bg-[var(--bg-card)] rounded transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                      )}
                    </button>
                  </div>

                  {/* Area summary */}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Area (m²)</span>
                      <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {formatArea(poly.areaSqm)}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Acres</span>
                      <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {poly.areaAcres.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Hectares</span>
                      <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                        {poly.areaHa.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded vertex list */}
                  {isExpanded && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                        Vertices ({poly.coordinates.length})
                      </div>
                      <div className="overflow-x-auto max-h-32 overflow-y-auto">
                        <table className="table text-xs">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Lon</th>
                              <th>Lat</th>
                            </tr>
                          </thead>
                          <tbody>
                            {poly.coordinates.map(([lon, lat], i) => (
                              <tr key={i}>
                                <td className="font-mono text-[var(--text-muted)]">{i + 1}</td>
                                <td className="font-mono">{lon.toFixed(8)}</td>
                                <td className="font-mono">{lat.toFixed(8)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary stats */}
      {polygons.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="label flex items-center gap-2">
              <Ruler className="h-4 w-4 text-[var(--accent)]" />
              Summary
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--bg-tertiary)] rounded">
            <div>
              <span className="text-[var(--text-muted)] text-xs">Total Area</span>
              <div className="font-mono text-lg text-[var(--accent)]">
                {formatArea(polygons.reduce((s, p) => s + p.areaSqm, 0))} m²
              </div>
            </div>
            <div>
              <span className="text-[var(--text-muted)] text-xs">Total Acres</span>
              <div className="font-mono text-lg text-[var(--text-primary)]">
                {polygons.reduce((s, p) => s + p.areaAcres, 0).toFixed(4)}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-muted)] text-xs">Total Hectares</span>
              <div className="font-mono text-lg text-[var(--text-primary)]">
                {polygons.reduce((s, p) => s + p.areaHa, 0).toFixed(4)}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-muted)] text-xs">Total Parcels</span>
              <div className="font-mono text-lg text-[var(--text-primary)]">
                {polygons.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
