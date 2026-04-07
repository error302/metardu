'use client';

import { useState, useMemo } from 'react';
import { z } from 'zod';
import { horizontalCurve, logEngineeringCompute } from '@/lib/engineering/compute';
import { initialiseDXFLayers, addStandardTitleBlock, DXF_LAYERS } from '@/lib/drawing/dxfLayers';
import Drawing from 'dxf-writer';

const HorizontalCurveInputSchema = z.object({
  R: z.number().positive().min(50).max(2000),
  deltaDeg: z.number().positive().min(1).max(180),
  chainageStart: z.number().min(0).default(0),
});

interface HorizontalCurvePanelProps {
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

export function HorizontalCurvePanel({ projectId, projectData, surveyorProfile }: HorizontalCurvePanelProps) {
  const [R, setR] = useState(200);
  const [deltaDeg, setDeltaDeg] = useState(35);
  const [chainageStart, setChainageStart] = useState(1000);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      const input = HorizontalCurveInputSchema.parse({ R, deltaDeg, chainageStart });
      setError(null);
      const res = horizontalCurve(input);
      logEngineeringCompute('horizontal_curve', input, {
        T: res.T, L: res.L, LC: res.LC, M: res.M
      }, { projectId });
      return res;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.errors[0]?.message);
      }
      return null;
    }
  }, [R, deltaDeg, chainageStart, projectId]);

  const exportDXF = () => {
    if (!result) return;

    const drawing = new Drawing();
    initialiseDXFLayers(drawing);

    addStandardTitleBlock(drawing, {
      drawingTitle: 'HORIZONTAL CURVE SETTING OUT',
      lrNumber: projectData?.lr_number ?? 'N/A',
      county: projectData?.county ?? 'N/A',
      district: projectData?.district ?? 'N/A',
      locality: projectData?.locality ?? 'N/A',
      areaHa: 0,
      perimeterM: 0,
      surveyorName: surveyorProfile?.fullName ?? 'N/A',
      registrationNumber: surveyorProfile?.registrationNumber ?? 'N/A',
      firmName: surveyorProfile?.firmName ?? 'N/A',
      date: new Date().toLocaleDateString('en-KE'),
      submissionRef: 'N/A',
      coordinateSystem: 'Arc 1960 / UTM Zone 37S (SRID: 21037)',
      scale: '1:2500',
      sheetNumber: '1 of 1',
      revision: 'R00'
    });

    drawing.setActiveLayer(DXF_LAYERS.CENTRELINE.name);
    
    const centerY = 100;
    const scale = 0.5;

    drawing.drawLine(
      50, centerY - result.T * scale,
      50 + result.L * scale, centerY
    );

    drawing.setActiveLayer(DXF_LAYERS.CHAINAGES.name);
    drawing.drawText(50, centerY + 20, 0.2, 0, `TC @ ${result.chainage_TC.toFixed(3)}m`);
    drawing.drawText(50 + result.L * scale, centerY + 20, 0.2, 0, `CT @ ${result.chainage_CT.toFixed(3)}m`);
    drawing.drawText(50 + result.T * scale, centerY + 40, 0.2, 0, `IP @ ${chainageStart.toFixed(3)}m`);
    drawing.drawText(50, centerY - 30, 0.25, 0, `R=${R}m Δ=${deltaDeg}°`);
    drawing.drawText(50, centerY - 20, 0.2, 0, `T=${result.T.toFixed(3)}m L=${result.L.toFixed(3)}m`);

    const dxfString = drawing.toDxfString();
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horizontal_curve_R${R}_Delta${deltaDeg}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Horizontal Curve Calculator</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Per RDM 1.1 Volume 2, Chapter 3 — Circular Curves
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
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Radius R (m)</label>
          <input
            type="number"
            min={50}
            max={2000}
            value={R}
            onChange={(e) => setR(Number(e.target.value) || 50)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Deflection Angle Δ (°)</label>
          <input
            type="number"
            min={1}
            max={180}
            value={deltaDeg}
            onChange={(e) => setDeltaDeg(Number(e.target.value) || 35)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Chainage at IP (m)</label>
          <input
            type="number"
            min={0}
            value={chainageStart}
            onChange={(e) => setChainageStart(Number(e.target.value) || 0)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Tangent Length (T)</p>
              <p className="font-mono font-semibold text-orange-400">{result.T.toFixed(3)} m</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Curve Length (L)</p>
              <p className="font-mono font-semibold">{result.L.toFixed(3)} m</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Long Chord (LC)</p>
              <p className="font-mono font-semibold">{result.LC.toFixed(3)} m</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Mid-Ordinate (M)</p>
              <p className="font-mono font-semibold">{result.M.toFixed(3)} m</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Chainage TC</p>
              <p className="font-mono font-semibold">{result.chainage_TC.toFixed(3)} m</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Chainage CT</p>
              <p className="font-mono font-semibold">{result.chainage_CT.toFixed(3)} m</p>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">External (E)</p>
              <p className="font-mono font-semibold">{result.E?.toFixed(3) ?? '-'} m</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
            <div className="bg-[var(--bg-secondary)] px-4 py-2 border-b border-[var(--border-color)]">
              <h4 className="font-semibold text-sm">Setting Out Table (20m intervals)</h4>
            </div>
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)] text-xs">
                  <th className="text-left py-2 px-4">Chainage</th>
                  <th className="text-right py-2 px-4">Deflection (°)</th>
                  <th className="text-right py-2 px-4">Chord (m)</th>
                  <th className="text-right py-2 px-4">Increment (m)</th>
                </tr>
              </thead>
              <tbody>
                {result.settingOutTable.slice(0, 15).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)]/30">
                    <td className="py-1.5 px-4">{row.chainage.toFixed(3)}</td>
                    <td className="py-1.5 px-4 text-right">{row.deflectionFromTC.toFixed(4)}°</td>
                    <td className="py-1.5 px-4 text-right">{row.chordFromTC.toFixed(4)}</td>
                    <td className="py-1.5 px-4 text-right">{row.chordIncrement.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.settingOutTable.length > 15 && (
              <div className="px-4 py-2 text-xs text-[var(--text-muted)] text-center">
                ... and {result.settingOutTable.length - 15} more points
              </div>
            )}
          </div>
        </>
      )}

      <div className="text-xs text-[var(--text-muted)]">
        <p><strong>Reference:</strong> RDM 1.1 Equation 3.1 — T = R × tan(Δ/2)</p>
      </div>
    </div>
  );
}
