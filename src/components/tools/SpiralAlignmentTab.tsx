'use client';

/**
 * SpiralAlignmentTab — Tier 2 UI for the spiral-to-curve alignment engine.
 *
 * Roadmap reference: docs/ROADMAP.md → Tier 2 → "Spiral-to-curve alignment
 * engine". Renders as a 5th tab on `/tools/curves`.
 *
 * Inputs:  radius, intersection angle, spiral length, PI chainage,
 *          optional PI coordinates + approach bearing for world coords.
 * Outputs: TS/SC/CS/ST stations, T/Lc/p/k/θs, SVG plan diagram,
 *          station table, CSV export.
 */

import { useState, useMemo, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Spline, AlertTriangle, MapPin, Copy } from 'lucide-react';
import { downloadCSV } from '@/lib/export/helpers';
import {
  computeSpiralAlignment,
  stationSpiralAlignment,
  alignmentToCoordinateArray,
  stationAtDistance,
  type SpiralAlignmentResult,
} from '@/lib/survey/curves/spiralAlignment';

export function SpiralAlignmentTab() {
  const [input, setInput] = useState({
    radius: '300',
    intersectionAngleDeg: '30',
    spiralLength: '60',
    piChainage: '1000',
    approachBearingDeg: '0',
    piEasting: '',
    piNorthing: '',
    horizontalCrs: '',
  });
  const [result, setResult] = useState<SpiralAlignmentResult | null>(null);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const updateInput = (field: keyof typeof input, value: string) => {
    revision.current++;
    setInput(previous => ({ ...previous, [field]: value }));
    setResult(null);
    setError('');
  };
  const requiredNumber = (value: string) => value.trim() ? Number(value) : NaN;

  const compute = () => {
    setError('');
    revision.current++;
    try {
      const r = computeSpiralAlignment({
        radius: requiredNumber(input.radius),
        intersectionAngleDeg: requiredNumber(input.intersectionAngleDeg),
        spiralLength: requiredNumber(input.spiralLength),
        piChainage: requiredNumber(input.piChainage),
        approachBearingDeg: input.approachBearingDeg
          ? Number(input.approachBearingDeg)
          : undefined,
        piEasting: input.piEasting ? Number(input.piEasting) : undefined,
        piNorthing: input.piNorthing ? Number(input.piNorthing) : undefined,
      });
      stationSpiralAlignment(r, 2); // Validate the finest diagram/export sampling before rendering.
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  };

  const stations = useMemo(() => {
    if (!result) return [];
    return stationSpiralAlignment(result, 10);
  }, [result]);

  // Load CRS/export code only after an export action. A late import cannot
  // download an earlier design after the surveyor has edited the inputs.
  const withExports = async (action: (exporters: typeof import('@/lib/survey/curves/spiralAlignmentExport')) => void | Promise<void>) => {
    const current = revision.current;
    try {
      const exporters = await import('@/lib/survey/curves/spiralAlignmentExport');
      if (current === revision.current) await action(exporters);
    } catch (failure) {
      if (current === revision.current) setError(failure instanceof Error ? failure.message : 'Export could not be completed.');
    }
  };
  const exportCSV = () => result && withExports(exporters => {
    downloadCSV(exporters.spiralAlignmentSurveyCSV(result, input.horizontalCrs), 'spiral-alignment.csv');
  });
  const exportGeoJSON = () => result && withExports(exporters => {
    const content = exporters.spiralAlignmentGeoJSON(result, input.horizontalCrs);
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/geo+json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'spiral-alignment.geojson'; link.click();
    URL.revokeObjectURL(url);
  });
  const copyCoords = () => result && withExports(async exporters => {
    await navigator.clipboard.writeText(JSON.stringify(exporters.spiralAlignmentRecord(result, input.horizontalCrs), null, 2));
  });

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Spline className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="font-display text-lg text-[var(--text-primary)]">
            Spiral-to-Curve Alignment
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field
            label="Radius R (m)"
            value={input.radius}
            onChange={v => updateInput('radius', v)}
          />
          <Field
            label="Intersection Δ (deg)"
            value={input.intersectionAngleDeg}
            onChange={v => updateInput('intersectionAngleDeg', v)}
          />
          <Field
            label="Spiral length Ls (m)"
            value={input.spiralLength}
            onChange={v => updateInput('spiralLength', v)}
          />
          <Field
            label="PI chainage (m)"
            value={input.piChainage}
            onChange={v => updateInput('piChainage', v)}
          />
          <Field
            label="Approach bearing (deg, opt)"
            value={input.approachBearingDeg}
            onChange={v => updateInput('approachBearingDeg', v)}
          />
          <Field
            label="PI easting (opt)"
            value={input.piEasting}
            onChange={v => updateInput('piEasting', v)}
          />
          <Field
            label="PI northing (opt)"
            value={input.piNorthing}
            onChange={v => updateInput('piNorthing', v)}
          />
          <Field
            label="Horizontal CRS (EPSG code, optional)"
            type="text"
            value={input.horizontalCrs}
            onChange={v => updateInput('horizontalCrs', v)}
          />
        </div>

        {error && (
          <div className="mt-3 bg-red-950/30 border border-red-800/50 text-red-300 text-xs p-3 rounded flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        )}

        <Button onClick={compute} className="mt-4" size="sm">
          Compute Alignment
        </Button>
      </div>

      {/* Results */}
      {result && (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            {result.piCoord
              ? `Projected coordinates · ${input.horizontalCrs.trim() || 'horizontal CRS undeclared'}.`
              : 'Local tangent frame · X forward along the approach, Y right.'}
            {' '}Draft numerical design; verify approved geometry and field control before set-out.
            GeoJSON requires PI coordinates and a declared projected CRS, and is a geographic map preview.
          </p>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5">
            <h3 className="font-display text-lg text-[var(--text-primary)] mb-3">
              Key Stations & Geometry
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="TS chainage" value={`${result.tsChainage.toFixed(3)} m`} />
              <Stat label="SC chainage" value={`${result.scChainage.toFixed(3)} m`} />
              <Stat label="CS chainage" value={`${result.csChainage.toFixed(3)} m`} />
              <Stat label="ST chainage" value={`${result.stChainage.toFixed(3)} m`} />
              <Stat label="Tangent T" value={`${result.T.toFixed(3)} m`} />
              <Stat label="Curve length Lc" value={`${result.Lc.toFixed(3)} m`} />
              <Stat label="Total length" value={`${result.totalLength.toFixed(3)} m`} />
              <Stat label="Spiral angle θs" value={`${((result.thetaSRad * 180) / Math.PI).toFixed(4)}°`} />
              <Stat label="Tangent shift p" value={`${result.p.toFixed(4)} m`} />
              <Stat label="Tangent extension k" value={`${result.k.toFixed(4)} m`} />
              <Stat label="Δ (rad)" value={`${result.deltaRad.toFixed(6)}`} />
              <Stat label="θs (rad)" value={`${result.thetaSRad.toFixed(6)}`} />
            </div>
          </div>

          {/* SVG plan diagram */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-[var(--text-primary)]">
                Plan Diagram
              </h3>
              <div className="flex gap-2 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5 bg-[var(--accent)]" /> Alignment
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> TS/ST
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" /> SC/CS
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> PI
                </span>
              </div>
            </div>
            <SpiralPlanDiagram result={result} />
          </div>

          {/* Station table */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-display text-lg text-[var(--text-primary)]">
                Station Table ({stations.length} rows)
              </h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyCoords} title="Copy the numerical design, source inputs and coordinate reference as JSON">
                  <Copy className="w-3 h-3 mr-1" /> Survey JSON
                </Button>
                <Button variant="outline" size="sm" onClick={exportGeoJSON} disabled={!result.piCoord || !input.horizontalCrs.trim()} title="WGS84 longitude/latitude map preview; requires declared source CRS and PI coordinates">
                  <MapPin className="w-3 h-3 mr-1" /> GeoJSON
                </Button>
                <Button variant="outline" size="sm" onClick={exportCSV}>
                  <Download className="w-3 h-3 mr-1" /> CSV
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--bg-card)]">
                  <tr className="text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border-color)]">
                    <th className="text-right py-2 pr-3 font-medium">Chainage (m)</th>
                    <th className="text-right py-2 px-3 font-medium">Dist from TS</th>
                    <th className="text-right py-2 px-3 font-medium">{result.piCoord ? 'Easting (m)' : 'Local X (m)'}</th>
                    <th className="text-right py-2 px-3 font-medium">{result.piCoord ? 'Northing (m)' : 'Local Y (m)'}</th>
                    <th className="text-right py-2 px-3 font-medium">Offset +right (m)</th>
                    <th className="text-right py-2 px-3 font-medium">Chord defl. (°)</th>
                    <th className="text-right py-2 px-3 font-medium">Tangent bearing (°)</th>
                    <th className="text-left py-2 pl-3 font-medium">Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[var(--border-color)] last:border-b-0 ${
                        s.segment === 'circular'
                          ? 'bg-[var(--bg-secondary)]'
                          : s.segment === 'entry-spiral'
                            ? 'bg-cyan-950/10'
                            : s.segment === 'exit-spiral'
                              ? 'bg-amber-950/10'
                              : ''
                      }`}
                    >
                      <td className="py-1.5 pr-3 text-right font-mono">{s.chainage.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.distanceFromTS.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.easting.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.northing.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.offset.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.deflectionDeg.toFixed(4)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.tangentBearingDeg.toFixed(4)}</td>
                      <td className="py-1.5 pl-3">
                        <span
                          className={`text-[10px] uppercase tracking-wide ${
                            s.segment === 'circular'
                              ? 'text-[var(--accent)]'
                              : s.segment.includes('spiral')
                                ? 'text-cyan-400'
                                : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {s.segment}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'number' | 'text';
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-[var(--text-muted)]">{label}</Label>
      <Input
        id={id}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 font-mono text-sm bg-[var(--bg-secondary)] border-[var(--border-color)]"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded p-2">
      <div className="text-[var(--text-muted)] text-[10px] uppercase tracking-wide">
        {label}
      </div>
      <div className="font-mono text-[var(--text-primary)] text-sm mt-0.5">{value}</div>
    </div>
  );
}

// ─── Plan Diagram ───────────────────────────────────────────────────────────

function SpiralPlanDiagram({ result }: { result: SpiralAlignmentResult }) {
  const WIDTH = 800;
  const HEIGHT = 400;
  const PAD = 40;

  // Get alignment coordinates (local frame if no PI)
  const coords = useMemo(
    () => alignmentToCoordinateArray(result, 2),
    [result]
  );

  if (coords.length < 2) {
    return <p className="text-xs text-[var(--text-muted)]">No coordinates to plot.</p>;
  }

  // Compute scale to fit
  const pi = result.piCoord ? [result.piCoord.easting, result.piCoord.northing] : [result.T, 0];
  const xs = [...coords.map(c => c[0]), pi[0]];
  const ys = [...coords.map(c => c[1]), pi[1]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const scale = Math.min((WIDTH - 2 * PAD) / dx, (HEIGHT - 2 * PAD) / dy);
  const offsetX = (WIDTH - dx * scale) / 2;
  const offsetY = (HEIGHT - dy * scale) / 2;

  const tx = (x: number) => offsetX + (x - minX) * scale;
  // Invert Y because SVG Y grows downward
  const ty = (y: number) => HEIGHT - offsetY - (y - minY) * scale;

  const pathD = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${tx(c[0]).toFixed(1)} ${ty(c[1]).toFixed(1)}`)
    .join(' ');

  // Tangent lines (approach and departure)
  const ts = coords[0];
  const st = coords[coords.length - 1];

  // Key markers use exact chainages rather than guessed sample indices.
  const keyPoint = (distance: number) => {
    const station = stationAtDistance(result, distance);
    return station ? [station.easting, station.northing] : coords[0];
  };
  const sc = keyPoint(result.input.spiralLength);
  const cs = keyPoint(result.input.spiralLength + result.Lc);

  return (
    <svg
      role="img"
      aria-label="Spiral alignment plan"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      style={{ minWidth: 500 }}
    >
      {/* Approach tangent */}
      <line
        x1={tx(ts[0])}
        y1={ty(ts[1])}
        x2={tx(pi[0])}
        y2={ty(pi[1])}
        stroke="#71717a"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.6"
      />
      {/* Departure tangent */}
      <line
        x1={tx(st[0])}
        y1={ty(st[1])}
        x2={tx(pi[0])}
        y2={ty(pi[1])}
        stroke="#71717a"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.6"
      />
      {/* Alignment */}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2.5" />

      <g>
        <circle cx={tx(pi[0])} cy={ty(pi[1])} r="4" fill="#f87171" />
        <text x={tx(pi[0]) + 10} y={ty(pi[1]) - 10} fontSize="11" fill="#f87171" fontFamily="monospace">PI</text>
      </g>

      {/* TS marker */}
      <g>
        <circle cx={tx(ts[0])} cy={ty(ts[1])} r="6" fill="#fbbf24" stroke="#1A1816" strokeWidth="1" />
        <text x={tx(ts[0])} y={ty(ts[1]) - 12} textAnchor="middle" fontSize="11" fill="#fbbf24" fontFamily="monospace">
          {result.input.spiralLength === 0 ? 'TS / SC' : 'TS'}
        </text>
      </g>
      {/* SC marker */}
      {result.input.spiralLength > 0 && <g>
        <circle cx={tx(sc[0])} cy={ty(sc[1])} r="5" fill="#22d3ee" stroke="#1A1816" strokeWidth="1" />
        <text x={tx(sc[0])} y={ty(sc[1]) - 10} textAnchor="middle" fontSize="10" fill="#22d3ee" fontFamily="monospace">
          SC
        </text>
      </g>}
      {/* CS marker */}
      {result.input.spiralLength > 0 && <g>
        <circle cx={tx(cs[0])} cy={ty(cs[1])} r="5" fill="#22d3ee" stroke="#1A1816" strokeWidth="1" />
        <text x={tx(cs[0])} y={ty(cs[1]) - 10} textAnchor="middle" fontSize="10" fill="#22d3ee" fontFamily="monospace">
          CS
        </text>
      </g>}
      {/* ST marker */}
      <g>
        <circle cx={tx(st[0])} cy={ty(st[1])} r="6" fill="#fbbf24" stroke="#1A1816" strokeWidth="1" />
        <text x={tx(st[0])} y={ty(st[1]) - 12} textAnchor="middle" fontSize="11" fill="#fbbf24" fontFamily="monospace">
          {result.input.spiralLength === 0 ? 'CS / ST' : 'ST'}
        </text>
      </g>
    </svg>
  );
}
