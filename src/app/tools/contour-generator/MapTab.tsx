'use client';

import { contourLabelMidpoint, type ContourLine, type SpotHeight } from '@/lib/engine/contours';
import type { Bounds } from './types';
import { MARGIN, SVG_HEIGHT, SVG_WIDTH } from './constants';
import { formatContourHeight } from './helpers';

export interface SvgElements {
  usableW: number;
  usableH: number;
  rangeE: number;
  rangeN: number;
  minElev: number;
  maxElev: number;
  toSvgX: (e: number) => number;
  toSvgY: (n: number) => number;
  spotSampled: SpotHeight[];
  viewBox: string;
}

interface MapTabProps {
  contours: ContourLine[];
  bounds: Bounds;
  points: SpotHeight[];
  contourInterval: number;
  svgElements: SvgElements;
  metricReference: boolean;
}

function scaleBarLength(maximum: number): number {
  if (!(maximum > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(maximum))
  const normalized = maximum / power
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * power
}

export function MapTab({ contours, bounds, points, contourInterval, svgElements, metricReference }: MapTabProps) {
  const units = metricReference ? 'm' : 'source units'
  const maxScaleBar = Math.min(svgElements.rangeE, svgElements.rangeN) * 0.2
  const scaleBarWorldLen = scaleBarLength(maxScaleBar)
  const scaleBarSvgLen = svgElements.toSvgX(bounds.minE + scaleBarWorldLen) - svgElements.toSvgX(bounds.minE)
  const scaleBarX = svgElements.toSvgX(bounds.maxE) - scaleBarSvgLen
  const scaleBarY = svgElements.toSvgY(bounds.minN) - 18

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[var(--border-color)] rounded-lg p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-3 text-slate-800">
          <div>
            <h2 className="text-sm font-bold tracking-wide">TOPOGRAPHIC CONTOUR PLAN · DRAFT</h2>
            <p className="text-xs text-slate-600 mt-1">{metricReference ? 'Declared projected metre coordinates and height reference' : 'Coordinate preview in source units; reference declarations are incomplete'}</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p>{points.length.toLocaleString()} source points</p>
            <p>{contours.length.toLocaleString()} contour lines</p>
          </div>
        </div>

        <svg viewBox={svgElements.viewBox} className="w-full rounded bg-white" style={{ maxHeight: '700px' }} role="img" aria-label="Generated topographic contour plan">
          <rect x={MARGIN} y={MARGIN} width={svgElements.usableW} height={svgElements.usableH} fill="#fff" stroke="#64748b" strokeWidth="1" />

          {/* The elevation surface is not mapped to northing; only show observed contours. */}
          {Array.from({ length: 7 }, (_, i) => {
            const easting = bounds.minE + svgElements.rangeE * i / 6
            const x = svgElements.toSvgX(easting)
            const northing = bounds.minN + svgElements.rangeN * i / 6
            const y = svgElements.toSvgY(northing)
            return (
              <g key={`grid-${i}`}>
                <line x1={x} y1={MARGIN} x2={x} y2={MARGIN + svgElements.usableH} stroke="#e1e5e8" strokeWidth="0.6" />
                <line x1={MARGIN} y1={y} x2={MARGIN + svgElements.usableW} y2={y} stroke="#e1e5e8" strokeWidth="0.6" />
                <text x={x} y={SVG_HEIGHT - 21} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#425466">{easting.toFixed(0)}</text>
                <text x={MARGIN - 6} y={y + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#425466">{northing.toFixed(0)}</text>
              </g>
            )
          })}

          {contours.map((contour, index) => {
            if (contour.points.length < 2) return null
            const coordinates = contour.points.map(point => `${svgElements.toSvgX(point.easting).toFixed(2)},${svgElements.toSvgY(point.northing).toFixed(2)}`).join(' ')
            const labelPoint = contour.isIndex ? contourLabelMidpoint(contour) : null
            return (
              <g key={`contour-${index}`}>
                <polyline points={coordinates} fill="none" stroke={contour.isIndex ? '#70411e' : '#97704a'} strokeWidth={contour.isIndex ? 2 : 0.85} strokeLinejoin="round" strokeLinecap="round" />
                {contour.isIndex && labelPoint && (
                  <text x={svgElements.toSvgX(labelPoint.easting)} y={svgElements.toSvgY(labelPoint.northing) - 4} textAnchor="middle" fill="#603518" stroke="#fff" strokeWidth="3" paintOrder="stroke" fontSize="9" fontWeight="700">
                    {formatContourHeight(contour.elevation)} {units}
                  </text>
                )}
              </g>
            )
          })}

          {svgElements.spotSampled.map((point, index) => {
            const x = svgElements.toSvgX(point.easting)
            const y = svgElements.toSvgY(point.northing)
            return <g key={`spot-${index}`}><circle cx={x} cy={y} r="1.8" fill="#25313d" /><text x={x + 4} y={y - 3} fontSize="7" fill="#25313d">{point.elevation.toFixed(2)}</text></g>
          })}

          <text x={MARGIN + 6} y={MARGIN + 18} fontSize="9" fontFamily="Geist, system-ui, sans-serif" fill="#334155">E {bounds.minE.toFixed(0)}–{bounds.maxE.toFixed(0)} {units}</text>
          <text x={MARGIN + 6} y={MARGIN + 31} fontSize="9" fontFamily="Geist, system-ui, sans-serif" fill="#334155">N {bounds.minN.toFixed(0)}–{bounds.maxN.toFixed(0)} {units}</text>
          <g transform={`translate(${SVG_WIDTH - 34}, ${MARGIN + 36})`} fill="#25313d" stroke="#25313d">
            <text x="0" y="-14" textAnchor="middle" fontSize="10" fontWeight="700" stroke="none">{metricReference ? 'GRID N' : 'N +'}</text>
            <line x1="0" y1="8" x2="0" y2="-8" strokeWidth="1.5" />
            <path d="M0 -12 L-4 -3 L4 -3 Z" />
          </g>
          <g>
            <line x1={scaleBarX} y1={scaleBarY} x2={scaleBarX + scaleBarSvgLen} y2={scaleBarY} stroke="#25313d" strokeWidth="2" />
            <line x1={scaleBarX} y1={scaleBarY - 4} x2={scaleBarX} y2={scaleBarY + 4} stroke="#25313d" strokeWidth="1" />
            <line x1={scaleBarX + scaleBarSvgLen} y1={scaleBarY - 4} x2={scaleBarX + scaleBarSvgLen} y2={scaleBarY + 4} stroke="#25313d" strokeWidth="1" />
            <text x={scaleBarX + scaleBarSvgLen / 2} y={scaleBarY - 6} textAnchor="middle" fontSize="9" fill="#25313d">{scaleBarWorldLen.toLocaleString()} {units}</text>
          </g>
          <text x={SVG_WIDTH / 2} y={SVG_HEIGHT - 4} textAnchor="middle" fontSize="10" fill="#425466">Easting ({units})</text>
        </svg>

        <div className="mt-3 flex items-center justify-center gap-5 flex-wrap text-xs text-slate-700">
          <span className="inline-flex items-center gap-2"><span className="inline-block w-6 border-t border-[#97704a]" /> Intermediate contour</span>
          <span className="inline-flex items-center gap-2"><span className="inline-block w-6 border-t-2 border-[#70411e]" /> Index contour</span>
          <span>Interval {formatContourHeight(contourInterval)} {units} · Elevations {formatContourHeight(svgElements.minElev)}–{formatContourHeight(svgElements.maxElev)} {units}</span>
        </div>
      </div>
      <p className="text-xs text-amber-300">Draft interpolation only. Confirm source CRS, height datum, survey accuracy, and project specification before issue or construction use.</p>
    </div>
  )
}
