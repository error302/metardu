/**
 * METARDU Subdivision Panel
 *
 * UI panel for parcel subdivision operations.
 * Supports four methods: Grid, Radial, Area-Based, and Single Split.
 *
 * Style: Tailwind CSS, #1B3A5C primary, white cards, Calibri font.
 * Matches existing METARDU UI patterns from MeasurementTool and ParcelBuilderModal.
 */

'use client'

import { useState } from 'react'
import {
  Grid3X3,
  Radar,
  Ruler,
  Scissors,
  Play,
  Trash2,
  Download,
  MapPin,
  Loader2,
  AlertCircle,
  ChevronDown,
  Info,
} from 'lucide-react'
import type { SubdivisionMethod, SubdivisionParams, SubdivisionResult, SubdividedLot } from '@/types/subdivision'
import type { Point2D } from '@/lib/engine/types'
import { useSubdivision } from '@/hooks/useSubdivision'
import type Map from 'ol/Map'

interface SubdivisionPanelProps {
  /** Parent parcel vertices (EPSG:21037) */
  parentVertices: Point2D[]
  /** OpenLayers map instance */
  map: Map | null
  /** Project name for DXF export */
  projectName?: string
  /** CSS class for panel container */
  className?: string
}

type MethodOption = {
  id: SubdivisionMethod
  label: string
  icon: React.ReactNode
  description: string
}

const METHODS: MethodOption[] = [
  {
    id: 'grid',
    label: 'Grid',
    icon: <Grid3X3 className="w-4 h-4" />,
    description: 'Divide into equal grid cells',
  },
  {
    id: 'radial',
    label: 'Radial',
    icon: <Radar className="w-4 h-4" />,
    description: 'Create sectors from a center point',
  },
  {
    id: 'area',
    label: 'Area',
    icon: <Ruler className="w-4 h-4" />,
    description: 'Split by target lot area',
  },
  {
    id: 'single-split',
    label: 'Split Line',
    icon: <Scissors className="w-4 h-4" />,
    description: 'Cut by drawing a line on the map',
  },
]

function formatAreaHa(ha: number): string {
  if (ha < 0.01) return `${(ha * 10000).toFixed(1)} m²`
  return `${ha.toFixed(4)} ha`
}

function formatPerimeter(m: number): string {
  if (m < 1000) return `${m.toFixed(2)} m`
  return `${(m / 1000).toFixed(3)} km`
}

export default function SubdivisionPanel({
  parentVertices,
  map,
  projectName = 'METARDU_Subdivision',
  className = '',
}: SubdivisionPanelProps) {
  const {
    method,
    params,
    result,
    splitLine,
    isDrawingSplitLine,
    isComputing,
    error,
    selectMethod,
    updateParams,
    execute,
    clear,
    startSplitLineDrawing,
    pickCenterPoint,
    exportDXF,
  } = useSubdivision({
    parentVertices,
    map,
    projectName,
  })

  const [isCollapsed, setIsCollapsed] = useState(false)

  // ─── Compute parent area ──────────────────────────────────────────────
  const parentArea = (() => {
    if (parentVertices.length < 3) return 0
    let area = 0
    const n = parentVertices.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += parentVertices[i].easting * parentVertices[j].northing
      area -= parentVertices[j].easting * parentVertices[i].northing
    }
    return Math.abs(area / 2) / 10000
  })()

  return (
    <div className={`bg-white rounded-lg shadow-lg border border-gray-200 ${className}`}>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#1B3A5C] flex items-center justify-center text-white">
            <Grid3X3 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Subdivision</div>
            <div className="text-[10px] text-gray-500">
              {parentVertices.length} pts · {formatAreaHa(parentArea)}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      </div>

      {isCollapsed ? null : (
        <div className="divide-y divide-gray-100">
          {/* ─── Method Selector ──────────────────────────────────────── */}
          <div className="p-3">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2 block">
              Method
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectMethod(m.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    method === m.id
                      ? 'bg-[#1B3A5C] text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                  title={m.description}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── Parameters Form ──────────────────────────────────────── */}
          {method && (
            <div className="p-3 bg-gray-50/50">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2 block">
                Parameters
              </label>

              {/* Grid params */}
              {method === 'grid' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Rows</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={params.rows ?? 2}
                      onChange={(e) => updateParams({ rows: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-[#1B3A5C] focus:border-[#1B3A5C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Columns</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={params.cols ?? 2}
                      onChange={(e) => updateParams({ cols: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-[#1B3A5C] focus:border-[#1B3A5C] outline-none"
                    />
                  </div>
                  <div className="col-span-2 text-[10px] text-gray-400 mt-1">
                    Creates up to {((params.rows ?? 2) * (params.cols ?? 2))} lots
                  </div>
                </div>
              )}

              {/* Radial params */}
              {method === 'radial' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Number of Lots</label>
                    <input
                      type="number"
                      min={2}
                      max={36}
                      value={params.numLots ?? 4}
                      onChange={(e) => updateParams({ numLots: Math.max(2, parseInt(e.target.value) || 2) })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-[#1B3A5C] focus:border-[#1B3A5C] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Center Point</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => pickCenterPoint()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#1B3A5C]" />
                        {params.center
                          ? `E ${params.center.easting.toFixed(0)} N ${params.center.northing.toFixed(0)}`
                          : 'Click map to set'}
                      </button>
                      <span className="text-[10px] text-gray-400">
                        {params.center ? '✓ Set' : 'Default: centroid'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Area params */}
              {method === 'area' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Target Area (ha)</label>
                    <input
                      type="number"
                      min={0.001}
                      step={0.01}
                      value={params.targetArea ?? (parentArea / 2).toFixed(4)}
                      onChange={(e) => updateParams({ targetArea: Math.max(0.001, parseFloat(e.target.value) || 0.001) })}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-[#1B3A5C] focus:border-[#1B3A5C] outline-none font-mono"
                    />
                    <div className="text-[10px] text-gray-400 mt-1">
                      Parent: {formatAreaHa(parentArea)} → ~{Math.max(1, Math.floor(parentArea / (params.targetArea ?? parentArea / 2)))} lots
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Preferred Cut Bearing (°)</label>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      step={1}
                      placeholder="Auto (perpendicular)"
                      value={params.preferredBearing ?? ''}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        updateParams({ preferredBearing: isNaN(v) ? undefined : v })
                      }}
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-[#1B3A5C] focus:border-[#1B3A5C] outline-none font-mono"
                    />
                    <div className="text-[10px] text-gray-400 mt-1">
                      WCB: 0°=N, 90°=E, 180°=S, 270°=W. Leave empty for auto.
                    </div>
                  </div>
                </div>
              )}

              {/* Split line params */}
              {method === 'single-split' && (
                <div className="space-y-2">
                  {!splitLine && !isDrawingSplitLine && (
                    <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-blue-800">
                          Click the button below, then click two points on the map to define the split line.
                        </p>
                      </div>
                    </div>
                  )}
                  {isDrawingSplitLine && (
                    <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
                      <MapPin className="w-4 h-4 text-amber-600" />
                      <span className="text-xs text-amber-800 font-medium">
                        Click on the map to set the first point of the split line
                      </span>
                    </div>
                  )}
                  {splitLine && (
                    <div className="p-2.5 bg-green-50 border border-green-200 rounded-md">
                      <div className="text-xs text-green-800 font-medium mb-1">✓ Split line defined</div>
                      <div className="text-[10px] text-green-700 font-mono">
                        ({splitLine.startPoint.easting.toFixed(1)}, {splitLine.startPoint.northing.toFixed(1)}) →
                        ({splitLine.endPoint.easting.toFixed(1)}, {splitLine.endPoint.northing.toFixed(1)})
                      </div>
                    </div>
                  )}
                  {!splitLine && (
                    <button
                      onClick={startSplitLineDrawing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <Scissors className="w-3.5 h-3.5 text-[#1B3A5C]" />
                      Draw Split Line on Map
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Error Display ────────────────────────────────────────── */}
          {error && (
            <div className="mx-3 mt-2 p-2.5 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-red-800">{error}</span>
            </div>
          )}

          {/* ─── Action Buttons ───────────────────────────────────────── */}
          {method && (
            <div className="px-3 py-3 flex items-center gap-2">
              <button
                onClick={execute}
                disabled={isComputing || (method === 'single-split' && !splitLine)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1B3A5C] text-white text-xs font-semibold rounded-md hover:bg-[#142d49] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isComputing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {isComputing ? 'Computing...' : 'Subdivide'}
              </button>

              <button
                onClick={clear}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>

              {result && result.lots.length > 0 && (
                <button
                  onClick={exportDXF}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#1B3A5C] bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors ml-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export DXF
                </button>
              )}
            </div>
          )}

          {/* ─── Results Table ────────────────────────────────────────── */}
          {result && result.lots.length > 0 && (
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                  Results — {result.lots.length} Lot{result.lots.length !== 1 ? 's' : ''}
                </label>
                <div className="text-[10px] text-gray-400">
                  Total: {formatAreaHa(result.totalAreaHa)}
                  {result.remainderAreaHa > 0.0001 && (
                    <span className="text-amber-600 ml-1">
                      (Remainder: {formatAreaHa(result.remainderAreaHa)})
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-gray-200 rounded-md overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1.5 px-2.5 text-[10px] text-gray-500 font-medium">Lot</th>
                      <th className="text-right py-1.5 px-2.5 text-[10px] text-gray-500 font-medium">Area (ha)</th>
                      <th className="text-right py-1.5 px-2.5 text-[10px] text-gray-500 font-medium">Perimeter</th>
                      <th className="text-left py-1.5 px-2.5 text-[10px] text-gray-500 font-medium">Centroid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lots.map((lot) => (
                      <LotRow key={lot.lotNumber} lot={lot} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Empty state ──────────────────────────────────────────── */}
          {!method && (
            <div className="px-3 py-6 text-center">
              <div className="text-gray-300 mb-2">
                <Grid3X3 className="w-8 h-8 mx-auto" />
              </div>
              <p className="text-xs text-gray-400">
                Select a subdivision method above to begin
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Individual lot row in the results table. */
function LotRow({ lot }: { lot: SubdividedLot }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-1.5 px-2.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#1B3A5C] text-white text-[10px] font-bold">
          {lot.lotNumber}
        </span>
      </td>
      <td className="py-1.5 px-2.5 text-right font-mono font-medium">
        {lot.areaHa.toFixed(4)}
        {lot.areaError !== undefined && Math.abs(lot.areaError) > 0.001 && (
          <span className={`ml-1 text-[9px] ${Math.abs(lot.areaError) < 0.05 ? 'text-green-600' : 'text-amber-600'}`}>
            ({lot.areaError >= 0 ? '+' : ''}{lot.areaError.toFixed(4)})
          </span>
        )}
      </td>
      <td className="py-1.5 px-2.5 text-right font-mono text-gray-600">
        {formatPerimeter(lot.perimeter)}
      </td>
      <td className="py-1.5 px-2.5 font-mono text-gray-500 text-[10px]">
        E {lot.centroid.easting.toFixed(0)} N {lot.centroid.northing.toFixed(0)}
      </td>
    </tr>
  )
}
