'use client';

// Tab 3: Contour Map (SVG rendering)
//
// Extracted from src/app/tools/contour-generator/page.tsx.

import type { ContourLine, SpotHeight } from '@/lib/engine/contours';
import type { Bounds } from './types';
import { MARGIN, SVG_HEIGHT, SVG_WIDTH } from './constants';
import { elevationToColor } from './helpers';

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
}

export function MapTab({
  contours,
  bounds,
  points,
  contourInterval,
  svgElements,
}: MapTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Contour Map</h2>

        <svg
          viewBox={svgElements.viewBox}
          className="w-full rounded"
          style={{ maxHeight: '700px', background: '#0d1117' }}
        >
          {/* Background */}
          <rect
            x={MARGIN}
            y={MARGIN}
            width={svgElements.usableW}
            height={svgElements.usableH}
            fill="#0d1117"
            stroke="#30363d"
            strokeWidth="1"
          />

          {/* Grid lines */}
          {(() => {
            const numTicksE = 6;
            const numTicksN = 6;
            const gridLines: React.ReactNode[] = [];
            for (let i = 0; i <= numTicksE; i++) {
              const e = bounds.minE + (svgElements.rangeE * i) / numTicksE;
              const x = svgElements.toSvgX(e);
              gridLines.push(
                <line key={`ge${i}`} x1={x} y1={MARGIN} x2={x} y2={MARGIN + svgElements.usableH} stroke="#1a2233" strokeWidth="0.5" />
              );
            }
            for (let i = 0; i <= numTicksN; i++) {
              const n = bounds.minN + (svgElements.rangeN * i) / numTicksN;
              const y = svgElements.toSvgY(n);
              gridLines.push(
                <line key={`gn${i}`} x1={MARGIN} y1={y} x2={MARGIN + svgElements.usableW} y2={y} stroke="#1a2233" strokeWidth="0.5" />
              );
            }
            return gridLines;
          })()}

          {/* Contour lines */}
          {contours.map((contour, ci) => {
            const color = elevationToColor(contour.elevation, svgElements.minElev, svgElements.maxElev);
            const sw = contour.isIndex ? 2.0 : 0.8;
            const pts = contour.points
              .map(p => `${svgElements.toSvgX(p.easting).toFixed(2)},${svgElements.toSvgY(p.northing).toFixed(2)}`)
              .join(' ');

            return (
              <g key={`c${ci}`}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth={sw}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Index contour labels */}
                {contour.isIndex && contour.points.length > 8 && (() => {
                  const labelPositions: number[] = [];
                  const step = Math.max(1, Math.floor(contour.points.length / 4));
                  for (let li = step; li < contour.points.length - step; li += step) {
                    labelPositions.push(li);
                  }
                  return labelPositions.map((li, lidx) => {
                    const pt = contour.points[li];
                    const x = svgElements.toSvgX(pt.easting);
                    const y = svgElements.toSvgY(pt.northing);
                    // Calculate text rotation based on line direction
                    const prev = contour.points[Math.max(0, li - 2)];
                    const next = contour.points[Math.min(contour.points.length - 1, li + 2)];
                    const dx = svgElements.toSvgX(next.easting) - svgElements.toSvgX(prev.easting);
                    const dy = svgElements.toSvgY(next.northing) - svgElements.toSvgY(prev.northing);
                    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    if (angle > 90) angle -= 180;
                    if (angle < -90) angle += 180;
                    return (
                      <text
                        key={`l${lidx}`}
                        x={x.toFixed(2)}
                        y={(y - 3).toFixed(2)}
                        fill="#e0e0e0"
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="middle"
                        transform={`rotate(${angle.toFixed(1)}, ${x.toFixed(2)}, ${(y - 3).toFixed(2)})`}
                        paintOrder="stroke"
                        stroke="#0d1117"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      >
                        {contour.elevation.toFixed(1)}
                      </text>
                    );
                  });
                })()}
              </g>
            );
          })}

          {/* Spot height crosses */}
          {svgElements.spotSampled.map((pt, i) => {
            const x = svgElements.toSvgX(pt.easting);
            const y = svgElements.toSvgY(pt.northing);
            return (
              <g key={`sp${i}`}>
                <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} stroke="#555" strokeWidth="0.5" />
                <line x1={x + 3} y1={y - 3} x2={x - 3} y2={y + 3} stroke="#555" strokeWidth="0.5" />
              </g>
            );
          })}

          {/* Coordinate labels - Easting (bottom) */}
          {(() => {
            const numTicks = 6;
            const labels: React.ReactNode[] = [];
            for (let i = 0; i <= numTicks; i++) {
              const e = bounds.minE + (svgElements.rangeE * i) / numTicks;
              const x = svgElements.toSvgX(e);
              labels.push(
                <text key={`et${i}`} x={x.toFixed(2)} y={SVG_HEIGHT - MARGIN / 3} fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  {e.toFixed(1)}
                </text>
              );
              // Tick mark
              labels.push(
                <line key={`em${i}`} x1={x} y1={MARGIN + svgElements.usableH} x2={x} y2={MARGIN + svgElements.usableH + 5} stroke="#555" strokeWidth="0.5" />
              );
            }
            return labels;
          })()}

          {/* Coordinate labels - Northing (left) */}
          {(() => {
            const numTicks = 6;
            const labels: React.ReactNode[] = [];
            for (let i = 0; i <= numTicks; i++) {
              const n = bounds.minN + (svgElements.rangeN * i) / numTicks;
              const y = svgElements.toSvgY(n);
              labels.push(
                <text key={`nt${i}`} x={MARGIN / 2} y={(y + 3).toFixed(2)} fill="#888" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  {n.toFixed(1)}
                </text>
              );
              // Tick mark
              labels.push(
                <line key={`nm${i}`} x1={MARGIN - 5} y1={y} x2={MARGIN} y2={y} stroke="#555" strokeWidth="0.5" />
              );
            }
            return labels;
          })()}

          {/* Axis labels */}
          <text
            x={MARGIN + svgElements.usableW / 2}
            y={SVG_HEIGHT - 5}
            fill="#888"
            fontSize="11"
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            Easting (m)
          </text>
          <text
            x={10}
            y={MARGIN + svgElements.usableH / 2}
            fill="#888"
            fontSize="11"
            fontFamily="sans-serif"
            textAnchor="middle"
            transform={`rotate(-90, 10, ${MARGIN + svgElements.usableH / 2})`}
          >
            Northing (m)
          </text>

          {/* North arrow */}
          <g transform={`translate(${SVG_WIDTH - 40}, ${MARGIN + 30})`}>
            <line x1="0" y1="20" x2="0" y2="0" stroke="#aaa" strokeWidth="1.5" />
            <polygon points="0,0 -4,8 4,8" fill="#aaa" />
            <text x="0" y="32" fill="#aaa" fontSize="10" textAnchor="middle" fontFamily="sans-serif">N</text>
          </g>

          {/* Scale bar */}
          {(() => {
            const scaleBarWorldLen = svgElements.rangeE / 5;
            const scaleBarSvgLen = svgElements.usableW / 5;
            const sbX = MARGIN + svgElements.usableW - scaleBarSvgLen;
            const sbY = SVG_HEIGHT - MARGIN / 3 - 2;
            return (
              <g>
                <rect x={sbX} y={sbY - 4} width={scaleBarSvgLen} height={8} fill="none" stroke="#aaa" strokeWidth="1" />
                <rect x={sbX} y={sbY - 4} width={scaleBarSvgLen / 2} height={8} fill="#aaa" />
                <text
                  x={(sbX + scaleBarSvgLen / 2).toFixed(2)}
                  y={(sbY - 8).toFixed(2)}
                  fill="#aaa"
                  fontSize="9"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {scaleBarWorldLen.toFixed(1)} m
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Color legend */}
        <div className="flex items-center gap-2 mt-4 justify-center">
          <span className="text-xs text-zinc-500">Low ({svgElements.minElev.toFixed(1)}m)</span>
          <div
            className="w-48 h-3 rounded"
            style={{
              background: `linear-gradient(to right, ${[
                0, 0.25, 0.5, 0.75, 1.0,
              ].map(t => elevationToColor(svgElements.minElev + t * (svgElements.maxElev - svgElements.minElev), svgElements.minElev, svgElements.maxElev)).join(', ')})`,
            }}
          />
          <span className="text-xs text-zinc-500">High ({svgElements.maxElev.toFixed(1)}m)</span>
        </div>

        {/* Map statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-[var(--bg-tertiary)] rounded">
            <span className="text-[var(--text-secondary)] text-xs block">Contour Lines</span>
            <span className="font-mono text-sm text-white">{contours.length}</span>
          </div>
          <div className="p-3 bg-[var(--bg-tertiary)] rounded">
            <span className="text-[var(--text-secondary)] text-xs block">Index Contours</span>
            <span className="font-mono text-sm text-white">{contours.filter(c => c.isIndex).length}</span>
          </div>
          <div className="p-3 bg-[var(--bg-tertiary)] rounded">
            <span className="text-[var(--text-secondary)] text-xs block">Data Points</span>
            <span className="font-mono text-sm text-white">{points.length}</span>
          </div>
          <div className="p-3 bg-[var(--bg-tertiary)] rounded">
            <span className="text-[var(--text-secondary)] text-xs block">Contour Interval</span>
            <span className="font-mono text-sm text-white">{contourInterval.toFixed(1)} m</span>
          </div>
        </div>
      </div>
    </div>
  );
}
