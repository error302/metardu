'use client';

import { useState, useMemo } from 'react';
import { z } from 'zod';
import { crossSectionVolume, massHaulDiagram, logEngineeringCompute } from '@/lib/engineering/compute';
import { initialiseDXFLayers, DXF_LAYERS } from '@/lib/drawing/dxfLayers';
import renderTitleBlock from '@/lib/drawing/titleBlockRenderer';
import { TITLE_BLOCK_TEMPLATES } from '@/lib/drawing/titleBlockTemplates';
import type { TitleBlockData } from '@/lib/drawing/dxfLayers';
import Drawing from 'dxf-writer';

const VolumeInputSchema = z.object({
  areas: z.array(z.number()).min(2),
  stationInterval: z.number().positive().max(100).default(20),
  method: z.enum(['prismoidal', 'end-area']).default('prismoidal'),
});

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

export function VolumesPanel({ projectId, projectData, surveyorProfile }: VolumesPanelProps) {
  const [areas, setAreas] = useState<number[]>([5, 8, 12, 15, 10, 5, 3, -2, -5, -3]);
  const [stationInterval, setStationInterval] = useState(20);
  const [method, setMethod] = useState<'prismoidal' | 'end-area'>('prismoidal');
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      const input = VolumeInputSchema.parse({ areas, stationInterval, method });
      setError(null);
      const res = crossSectionVolume(input);
      logEngineeringCompute('cross_section_volume', input, res, { projectId });
      return res;
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.errors[0]?.message);
      }
      return null;
    }
  }, [areas, stationInterval, method, projectId]);

  const massHaul = useMemo(() => {
    if (!result) return null;
    const cumulative = areas.map((a, i) => {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += areas[j];
      return sum;
    });
    return massHaulDiagram({ cumulativeVolumes: cumulative, stationInterval });
  }, [areas, stationInterval, result]);

  const updateArea = (index: number, value: number) => {
    const newAreas = [...areas];
    newAreas[index] = value;
    setAreas(newAreas);
  };

  const exportDXF = () => {
    if (!result) return;

    const drawing = new Drawing();
    initialiseDXFLayers(drawing);

    const tb: TitleBlockData = {
      drawingTitle: TITLE_BLOCK_TEMPLATES.eng_volumes.drawingTitle,
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
    }
    renderTitleBlock(drawing, 'eng_volumes', tb)

    const baseY = 100;
    const scale = 2;

    drawing.setActiveLayer(DXF_LAYERS.PROFILE.name);
    
    let prevX = 50;
    let prevY = baseY;
    
    areas.forEach((area, i) => {
      const x = 50 + i * 20 * scale;
      const y = baseY - area * scale;
      drawing.drawLine(prevX, prevY, x, y);
      prevX = x;
      prevY = y;
    });

    drawing.setActiveLayer(DXF_LAYERS.CHAINAGES.name);
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
            Per RDM 1.1 Volume 3, Chapter 2 — Earthworks
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
          <label className="block text-xs text-[var(--text-muted)] mb-1">Station Interval (m)</label>
          <input
            type="number"
            min={5}
            max={100}
            value={stationInterval}
            onChange={(e) => setStationInterval(Number(e.target.value) || 20)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'prismoidal' | 'end-area')}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm"
          >
            <option value="prismoidal">Prismoidal (RDM 1.1 preferred)</option>
            <option value="end-area">End-Area (simple)</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
        <div className="bg-[var(--bg-secondary)] px-4 py-2 border-b border-[var(--border-color)]">
          <h4 className="font-semibold text-sm">Cross-Section Areas (positive = cut, negative = fill)</h4>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {areas.map((area, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs text-[var(--text-muted)] w-8">{i * stationInterval}</span>
                <input
                  type="number"
                  value={area}
                  onChange={(e) => updateArea(i, Number(e.target.value) || 0)}
                  className={`w-16 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm font-mono text-right ${area > 0 ? 'text-red-400' : 'text-green-400'}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-muted)]">Total Cut</p>
              <p className="font-mono font-semibold text-red-400">{result.totalCut.toFixed(2)} m³</p>
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
              <p className="text-xs text-[var(--text-muted)]">Balanced?</p>
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
                    <th className="text-right py-2 px-4">Cut Area</th>
                    <th className="text-right py-2 px-4">Fill Area</th>
                    <th className="text-right py-2 px-4">Cut Vol</th>
                    <th className="text-right py-2 px-4">Fill Vol</th>
                    <th className="text-right py-2 px-4">Cum. Cut</th>
                    <th className="text-right py-2 px-4">Cum. Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {result.volumeTable.slice(0, 15).map((row, i) => (
                    <tr key={i} className="border-b border-[var(--border-color)]/30">
                      <td className="py-1.5 px-4">{row.station.toFixed(0)}</td>
                      <td className="py-1.5 px-4 text-right text-red-400">{row.cutArea.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right text-green-400">{row.fillArea.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right">{row.cutVolume.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-right">{row.fillVolume.toFixed(2)}</td>
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

      <div className="text-xs text-[var(--text-muted)]">
        <p><strong>Reference:</strong> RDM 1.1 Volume 3 — Prismoidal: V = (d/6)(A₁ + 4Am + A₂)</p>
      </div>
    </div>
  );
}
