'use client';

import { useState, useMemo } from 'react';
import { Pickaxe, Save, CheckCircle, Layers } from 'lucide-react';

interface GridPoint {
  id: string;
  x: number;
  y: number;
  zCurrent: number;
  zDesign: number | null;
}

function computeMiningVolumes(points: GridPoint[]): { cut: number; fill: number; net: number; area: number; details: { x: number; y: number; diff: number }[] } {
  const xs = Array.from(new Set(points.map(p => p.x))).sort((a, b) => a - b);
  const ys = Array.from(new Set(points.map(p => p.y))).sort((a, b) => a - b);
  const grid = new Map(points.map(p => [`${p.x},${p.y}`, p]));

  let cut = 0, fill = 0, area = 0;
  const details: { x: number; y: number; diff: number }[] = [];

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const corners = [
        grid.get(`${xs[i]},${ys[j]}`),
        grid.get(`${xs[i + 1]},${ys[j]}`),
        grid.get(`${xs[i + 1]},${ys[j + 1]}`),
        grid.get(`${xs[i]},${ys[j + 1]}`),
      ];
      if (corners.every(Boolean)) {
        const cellArea = Math.abs(xs[i + 1] - xs[i]) * Math.abs(ys[j + 1] - ys[j]);
        const diffs = corners.map(c => c!.zCurrent - (c!.zDesign ?? 0));
        const avg = diffs.reduce((a, b) => a + b, 0) / 4;
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[j] + ys[j + 1]) / 2;
        details.push({ x: cx, y: cy, diff: avg });
        if (avg > 0) cut += avg * cellArea;
        else fill += Math.abs(avg) * cellArea;
        area += cellArea;
      }
    }
  }
  return { cut, fill, net: cut - fill, area, details };
}

const DEMO_POINTS: GridPoint[] = [
  { id: '1', x: 0, y: 0, zCurrent: 120.5, zDesign: 118.0 },
  { id: '2', x: 10, y: 0, zCurrent: 121.2, zDesign: 118.0 },
  { id: '3', x: 20, y: 0, zCurrent: 120.8, zDesign: 118.0 },
  { id: '4', x: 30, y: 0, zCurrent: 119.5, zDesign: 118.0 },
  { id: '5', x: 0, y: 10, zCurrent: 119.8, zDesign: 118.5 },
  { id: '6', x: 10, y: 10, zCurrent: 120.5, zDesign: 118.5 },
  { id: '7', x: 20, y: 10, zCurrent: 121.0, zDesign: 118.5 },
  { id: '8', x: 30, y: 10, zCurrent: 119.2, zDesign: 118.5 },
  { id: '9', x: 0, y: 20, zCurrent: 119.0, zDesign: 119.0 },
  { id: '10', x: 10, y: 20, zCurrent: 119.5, zDesign: 119.0 },
  { id: '11', x: 20, y: 20, zCurrent: 119.8, zDesign: 119.0 },
  { id: '12', x: 30, y: 20, zCurrent: 118.5, zDesign: 119.0 },
];

export default function MiningComputePanel({ projectId }: { projectId: string }) {
  const [points, setPoints] = useState<GridPoint[]>(DEMO_POINTS);
  const [saved, setSaved] = useState(false);

  const volumes = useMemo(() => computeMiningVolumes(points), [points]);

  const updatePoint = (id: string, field: keyof GridPoint, value: number | null) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    try {
      await fetch(`/api/project/${projectId}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mining', results: { volumes } }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold"><Pickaxe className="w-4 h-4 inline mr-1" />Mining Volume Computation</h3>

      {/* Volume Results */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 bg-zinc-900 rounded border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500">Cut</div>
          <div className="text-sm font-bold text-red-400">{volumes.cut.toFixed(1)} m³</div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500">Fill</div>
          <div className="text-sm font-bold text-green-400">{volumes.fill.toFixed(1)} m³</div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500">Net</div>
          <div className={`text-sm font-bold ${volumes.net >= 0 ? 'text-red-400' : 'text-green-400'}`}>
            {volumes.net >= 0 ? '+' : ''}{volumes.net.toFixed(1)} m³
          </div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-700 text-center">
          <div className="text-xs text-zinc-500">Area</div>
          <div className="text-sm font-bold text-amber-400">{volumes.area.toFixed(0)} m²</div>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-zinc-900 rounded border border-zinc-700 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-800/50">
              <th className="px-2 py-1.5 text-left text-zinc-400">Pt</th>
              <th className="px-2 py-1.5 text-left text-zinc-400">X</th>
              <th className="px-2 py-1.5 text-left text-zinc-400">Y</th>
              <th className="px-2 py-1.5 text-left text-zinc-400">Z Current</th>
              <th className="px-2 py-1.5 text-left text-zinc-400">Z Design</th>
              <th className="px-2 py-1.5 text-left text-zinc-400">Diff</th>
            </tr>
          </thead>
          <tbody>
            {points.map(p => {
              const diff = p.zCurrent - (p.zDesign ?? 0);
              return (
                <tr key={p.id} className="border-b border-zinc-800">
                  <td className="px-2 py-1 font-mono text-zinc-400">{p.id}</td>
                  <td className="px-2 py-1"><input type="number" value={p.x} onChange={e => updatePoint(p.id, 'x', Number(e.target.value))} className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white" /></td>
                  <td className="px-2 py-1"><input type="number" value={p.y} onChange={e => updatePoint(p.id, 'y', Number(e.target.value))} className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white" /></td>
                  <td className="px-2 py-1"><input type="number" step="0.01" value={p.zCurrent} onChange={e => updatePoint(p.id, 'zCurrent', Number(e.target.value))} className="w-18 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white" /></td>
                  <td className="px-2 py-1"><input type="number" step="0.01" value={p.zDesign ?? ''} onChange={e => updatePoint(p.id, 'zDesign', e.target.value ? Number(e.target.value) : null)} className="w-18 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white" /></td>
                  <td className={`px-2 py-1 font-mono font-semibold ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-zinc-400'}`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={handleSave} disabled={saved} className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent)] text-white text-xs rounded hover:bg-[var(--accent-dim)] disabled:opacity-50">
        {saved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}{saved ? 'Saved' : 'Save Results'}
      </button>
    </div>
  );
}
