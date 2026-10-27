'use client';

import { useState, useMemo } from 'react';
import { z } from 'zod';
import { CrossSectionVolumeSchema, crossSectionVolume, massHaulDiagram, logEngineeringCompute, type CrossSectionVolumeResult } from '@/lib/engineering/compute';
import { initialiseSokDXFLayers, DXF_LAYERS } from '@/lib/drawing/dxfLayers';

interface MassHaulPoint {
  station: number;
  volume: number;
  cumulative: number;
  zone: 'cut' | 'fill' | 'balance';
}

function MassHaulDiagramSVG({ diagram, balancePoint }: { diagram: MassHaulPoint[]; balancePoint: number | null }) {
  const padding = { top: 30, right: 40, bottom: 50, left: 70 };
  const chartW = Math.min(2000, Math.max(diagram.length * 60, 600));
  const chartH = 320;
  const totalW = chartW + padding.left + padding.right;
  const totalH = chartH + padding.top + padding.bottom;

  const stations = diagram.map(d => d.station);
  const cumulatives = diagram.map(d => d.cumulative);
  const minStation = Math.min(...stations);
  const maxStation = Math.max(...stations);
  const minCum = Math.min(...cumulatives, 0);
  const maxCum = Math.max(...cumulatives, 0);
  const rangeX = maxStation - minStation || 1;
  const rangeY = maxCum - minCum || 1;

  const scaleX = (v: number) => padding.left + ((v - minStation) / rangeX) * chartW;
  const scaleY = (v: number) => padding.top + chartH - ((v - minCum) / rangeY) * chartH;
  const zeroY = scaleY(0);

  // Build polyline points
  const linePoints = diagram.map(d => `${scaleX(d.station)},${scaleY(d.cumulative)}`).join(' ');

  // Build filled polygons: surplus (green above zero) and deficit (red below zero)
  const surplusParts: string[] = [];
  const deficitParts: string[] = [];

  for (let i = 0; i < diagram.length - 1; i++) {
    const d0 = diagram[i];
    const d1 = diagram[i + 1];
    const x0 = scaleX(d0.station);
    const x1 = scaleX(d1.station);
    const y0 = scaleY(d0.cumulative);
    const y1 = scaleY(d1.cumulative);

    if (d0.cumulative >= 0 && d1.cumulative >= 0) {
      // Both above zero
      surplusParts.push(`M${x0},${zeroY} L${x0},${y0} L${x1},${y1} L${x1},${zeroY} Z`);
    } else if (d0.cumulative <= 0 && d1.cumulative <= 0) {
      // Both below zero
      deficitParts.push(`M${x0},${zeroY} L${x0},${y0} L${x1},${y1} L${x1},${zeroY} Z`);
    } else {
      // Crosses zero — interpolate crossing point
      const t = Math.abs(d0.cumulative) / (Math.abs(d0.cumulative) + Math.abs(d1.cumulative));
      const crossX = x0 + t * (x1 - x0);

      if (d0.cumulative > 0) {
        surplusParts.push(`M${x0},${zeroY} L${x0},${y0} L${crossX},${zeroY} Z`);
        deficitParts.push(`M${crossX},${zeroY} L${crossX},${zeroY} L${x1},${y1} L${x1},${zeroY} Z`);
      } else {
        deficitParts.push(`M${x0},${zeroY} L${x0},${y0} L${crossX},${zeroY} Z`);
        surplusParts.push(`M${crossX},${zeroY} L${crossX},${zeroY} L${x1},${y1} L${x1},${zeroY} Z`);
      }
    }
  }

  // Grid lines
  const gridLines: { x?: number; y?: number; label: string; axis: 'x' | 'y' }[] = [];
  const numXGrid = Math.min(diagram.length, 10);
  for (let i = 0; i <= numXGrid; i++) {
    const val = minStation + (rangeX * i) / numXGrid;
    gridLines.push({ x: scaleX(val), label: val.toFixed(0), axis: 'x' });
  }
  const numYGrid = 6;
  for (let i = 0; i <= numYGrid; i++) {
    const val = minCum + (rangeY * i) / numYGrid;
    gridLines.push({ y: scaleY(val), label: val.toFixed(0), axis: 'y' });
  }

  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
      <div className="bg-[var(--bg-secondary)] px-4 py-2 border-b border-[var(--border-color)]">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          Mass Haul Diagram
          <span className="flex items-center gap-1 ml-3 text-xs font-normal text-[var(--text-muted)]">
            <span className="inline-block w-3 h-2 bg-green-500/40 rounded-sm border border-green-500/60" />
            Surplus (Cut)
          </span>
          <span className="flex items-center gap-1 text-xs font-normal text-[var(--text-muted)]">
            <span className="inline-block w-3 h-2 bg-red-500/40 rounded-sm border border-red-500/60" />
            Deficit (Fill)
          </span>
        </h4>
      </div>
      <div className="bg-white p-2" style={{ maxHeight: 400 }}>
        <svg
          viewBox={`0 0 ${totalW} ${totalH}`}
          className="w-full h-auto"
          style={{ maxHeight: 380 }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern id="mhd-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* Background grid */}
          <rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill="url(#mhd-grid)" />

          {/* Zero line */}
          <line
            x1={padding.left} y1={zeroY} x2={padding.left + chartW} y2={zeroY}
            stroke="#374151" strokeWidth="1.5" strokeDasharray="6 3"
          />

          {/* Surplus fill (green) */}
          {surplusParts.map((d, i) => (
            <path key={`surplus-${i}`} d={d} fill="rgba(34,197,94,0.2)" stroke="rgba(34,197,94,0.4)" strokeWidth="0.5" />
          ))}

          {/* Deficit fill (red) */}
          {deficitParts.map((d, i) => (
            <path key={`deficit-${i}`} d={d} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" strokeWidth="0.5" />
          ))}

          {/* Cumulative volume line */}
          <polyline points={linePoints} fill="none" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points */}
          {diagram.map((d) => (
            <circle
              key={d.station}
              cx={scaleX(d.station)} cy={scaleY(d.cumulative)}
              r="3"
              fill={d.cumulative >= 0 ? '#16a34a' : '#dc2626'}
              stroke="white" strokeWidth="1.5"
            />
          ))}

          {/* Balance point marker */}
          {balancePoint !== null && (
            <line
              x1={scaleX(balancePoint)} y1={padding.top}
              x2={scaleX(balancePoint)} y2={padding.top + chartH}
              stroke="#d97706" strokeWidth="2" strokeDasharray="8 4"
            />
          )}
          {balancePoint !== null && (
            <text
              x={scaleX(balancePoint)} y={padding.top - 8}
              textAnchor="middle"
              className="text-[10px]"
              fill="#d97706" fontWeight="600"
            >
              Balance @{balancePoint.toFixed(0)}m
            </text>
          )}

          {/* X axis labels */}
          {gridLines.filter(g => g.axis === 'x').map((g, i) => (
            <text key={`xl-${i}`} x={g.x} y={totalH - 8} textAnchor="middle" className="text-[10px]" fill="#6b7280">
              {g.label}m
            </text>
          ))}

          {/* Y axis labels */}
          {gridLines.filter(g => g.axis === 'y').map((g, i) => (
            <g key={`yl-${i}`}>
              <line
                x1={padding.left} y1={g.y} x2={padding.left + chartW} y2={g.y}
                stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 4"
              />
              <text x={padding.left - 8} y={(g.y ?? 0) + 3} textAnchor="end" className="text-[10px]" fill="#6b7280">
                {g.label}
              </text>
            </g>
          ))}

          {/* Axis titles */}
          <text x={totalW / 2} y={totalH - 0} textAnchor="middle" className="text-[11px]" fill="#374151" fontWeight="500">
            Chainage (m)
          </text>
          <text
            x={12} y={padding.top + chartH / 2}
            textAnchor="middle"
            className="text-[11px]"
            fill="#374151"
            fontWeight="500"
            transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}
          >
            Cumulative Volume (m³)
          </text>
        </svg>
      </div>
    </div>
  );
}

interface VolumesPanelProps {
  projectId?: string;
  projectData?: {
    lr_number?: string;
    county?: string;
    district?: string;
    locality?: string;
  };
  surveyorProfile?: {
    fullName: string;
    registrationNumber: string;
    firmName: string;
  } | null;
}

export function VolumesPanel({ projectId, projectData: _projectData, surveyorProfile: _surveyorProfile }: VolumesPanelProps) {
  const [areaText, setAreaText] = useState('');
  const [intervalText, setIntervalText] = useState('20');
  const [method, setMethod] = useState<'prismoidal' | 'end-area'>('prismoidal');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CrossSectionVolumeResult | null>(null);
  const stationInterval = Number(intervalText);
  const areas = result?.volumeTable.map(row => row.cutArea - row.fillArea) ?? [];

  const calculate = () => {
    setResult(null);
    try {
      const tokens = areaText.trim().split(/[,\t]|\r?\n|\r/);
      const parsedAreas = tokens.map((token, index) => {
        const value = token.trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
          throw new Error(`Section ${index + 1}: enter a finite decimal area in m². Blank sections and units in cells are not accepted.`);
        }
        return Number(value);
      });
      const input = CrossSectionVolumeSchema.parse({ areas: parsedAreas, stationInterval, method });
      setError(null);
      const res = crossSectionVolume(input);
      setResult(res);
      void logEngineeringCompute('cross_section_volume', input, res, { projectId });
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.issues[0]?.message ?? 'Check the section areas and station interval.');
      } else {
        setError(e instanceof Error ? e.message : 'Volume calculation failed.');
      }
    }
  };

  const massHaul = useMemo(() => {
    if (!result) return null;
    const rows = result.volumeTable.filter(row => row.methodApplied !== 'midsection');
    return massHaulDiagram({
      cumulativeVolumes: rows.map(row => row.cutVolume - row.fillVolume),
      stationInterval,
      stations: rows.map(row => row.station),
    });
  }, [stationInterval, result]);

  const exportDXF = async () => {
    if (!result) return;

    const { default: Drawing } = await import('dxf-writer');
    const drawing = new Drawing();
    initialiseSokDXFLayers(drawing);

    const baseY = 100;
    const scale = 2;

    drawing.setActiveLayer(DXF_LAYERS.PROFILE.name);
    
    let prevX = 50;
    let prevY = baseY;
    
    areas.forEach((area, i) => {
      const x = 50 + result.volumeTable[i].station * scale;
      const y = baseY - area * scale;
      drawing.drawLine(prevX, prevY, x, y);
      prevX = x;
      prevY = y;
    });

    drawing.setActiveLayer(DXF_LAYERS.CHAIN.name);
    drawing.drawText(50, baseY + 30, 0.2, 0, `Total Cut: ${result.totalCut.toFixed(2)} m³`);
    drawing.drawText(50, baseY + 50, 0.2, 0, `Total Fill: ${result.totalFill.toFixed(2)} m³`);

    const dxfString = drawing.toDxfString();
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volumes_${projectId || 'export'}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Cross-Section Volumes & Mass Haul</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Geometric volumes from supplied, equally spaced cross-section areas.
          </p>
        </div>
        {result && (
          <button
            onClick={exportDXF}
            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export DXF
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="station-interval-m">Station Interval (m)</label>
          <input id="station-interval-m" aria-label="Station Interval (m)"
            type="number"
            min={0.001}
            max={100}
            step="any"
            value={intervalText}
            onChange={(e) => { setIntervalText(e.target.value); setResult(null); setError(null); }}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="method">Method</label>
          <select
             id="method" value={method}
            onChange={(e) => { setMethod(e.target.value as 'prismoidal' | 'end-area'); setResult(null); setError(null); }}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm"
          >
            <option value="prismoidal">Prismoidal — three-section groups</option>
            <option value="end-area">Average end-area — adjacent sections</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
        <div className="bg-[var(--bg-secondary)] px-4 py-2 border-b border-[var(--border-color)]">
          <label htmlFor="volume-section-areas" className="font-semibold text-sm">Cross-section areas (m²)</label>
        </div>
        <div className="p-4">
          <p id="volume-area-help" className="mb-3 text-xs text-[var(--text-muted)]">Paste one area per line or a comma-separated list in station order. Positive = cut; negative = fill; zero is valid. Stations start at relative chainage 0. Mixed cut/fill in one section needs separate area schedules.</p>
          <textarea id="volume-section-areas" aria-describedby="volume-area-help" rows={5} value={areaText}
            onChange={event => { setAreaText(event.target.value); setResult(null); setError(null); }}
            className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 font-mono text-sm"
          />
          <button type="button" onClick={calculate} className="mt-3 min-h-11 rounded bg-[var(--accent)] px-4 py-2 font-semibold text-black">Calculate volumes</button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Total Cut</p>
              <p aria-label="Total cut volume" className="font-mono font-semibold text-red-400">{result.totalCut.toFixed(2)} m³</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Total Fill</p>
              <p className="font-mono font-semibold text-green-400">{result.totalFill.toFixed(2)} m³</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Net Volume</p>
              <p className={`font-mono font-semibold ${result.netVolume >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {result.netVolume.toFixed(2)} m³
              </p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Numerical net zero?</p>
              <p className={`font-mono font-semibold ${result.isBalanced ? 'text-green-400' : 'text-yellow-400'}`}>
                {result.isBalanced ? 'Yes' : 'No'}
              </p>
            </div>
          </div>

          {massHaul && (
            <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
              <div className="bg-[var(--bg-secondary)] px-4 py-2 border-b border-[var(--border-color)]">
                <h4 className="font-semibold text-sm">Volume Table</h4>
              </div>
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)] text-xs">
                    <th className="text-left py-2 px-4">Station</th>
                    <th className="text-left py-2 px-4">Method / span (m)</th>
                    <th className="text-right py-2 px-4">Cut Area (m²)</th>
                    <th className="text-right py-2 px-4">Fill Area (m²)</th>
                    <th className="text-right py-2 px-4">Cut Vol (m³)</th>
                    <th className="text-right py-2 px-4">Fill Vol (m³)</th>
                    <th className="text-right py-2 px-4">Cum. Cut (m³)</th>
                    <th className="text-right py-2 px-4">Cum. Fill (m³)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.volumeTable.map((row) => (
                    <tr key={row.station} className="border-b border-[color-mix(in_srgb,var(--border-color)_30%,transparent)]">
                      <td className="py-1.5 px-4">{row.station.toFixed(3)}</td>
                      <td className="py-1.5 px-4">{row.methodApplied === 'midsection' ? 'Midsection — group reported at next end' : `${row.methodApplied} / ${row.spanM.toFixed(3)}`}</td>
                      <td className="py-1.5 px-4 text-right text-red-400">{row.cutArea.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right text-green-400">{row.fillArea.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right">{row.methodApplied === 'midsection' ? '—' : row.cutVolume.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right">{row.methodApplied === 'midsection' ? '—' : row.fillVolume.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right text-red-400">{row.cumulativeCut.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right text-green-400">{row.cumulativeFill.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {massHaul && massHaul.diagram.length > 0 && (
        <MassHaulDiagramSVG diagram={massHaul.diagram} balancePoint={massHaul.balancePoint} />
      )}

      <div className="text-xs text-[var(--text-muted)]">
        <p>Average end-area: V = L(A₁ + A₂)/2. Prismoidal: V = L(A₁ + 4Am + A₂)/6; L spans two intervals. The mass-haul line joins group ends because an independent middle-section volume is not available for a prismoidal group.</p>
        {result?.calculationNotes.map(note => <p key={note} className="mt-2">{note}</p>)}
        <p className="mt-2">Numerical net zero is not a construction balance assessment. Project material factors and approved survey/design evidence are still required.</p>
      </div>
    </div>
  );
}
