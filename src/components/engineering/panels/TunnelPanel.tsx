'use client';

import { useState } from 'react';
import { ENGINEERING_QA, type EngineeringSubtype } from '@/lib/engine/engineering';

interface EngineeringPanelProps {
  projectId: string;
  subtype: EngineeringSubtype;
}

export function TunnelPanel({ projectId, subtype }: EngineeringPanelProps) {
  const [activeTab, setActiveTab] = useState<'control' | 'geometry' | 'profile' | 'convergence'>('control');
  const qa = ENGINEERING_QA.tunnel;

  const [portalPoints, setPortalPoints] = useState<Array<{ easting: number; northing: number; elevation: number }>>([]);
  const [excavatedWidthM, setExcavatedWidthM] = useState(10);
  const [excavatedHeightM, setExcavatedHeightM] = useState(8);
  const [gradientPercent, setGradientPercent] = useState(0.5);
  const [convergencePoints, setConvergencePoints] = useState<Array<{ chainage: number; label: string }>>([]);

  const totalLengthM = portalPoints.length >= 2
    ? Math.sqrt(
        Math.pow(portalPoints[1].easting - portalPoints[0].easting, 2) +
        Math.pow(portalPoints[1].northing - portalPoints[0].northing, 2)
      )
    : 0;

  const crossSectionArea = excavatedWidthM * excavatedHeightM + (Math.PI * Math.pow(excavatedWidthM / 2, 2) / 2);

  const tabs = [
    { id: 'control', label: 'Control Survey' },
    { id: 'geometry', label: 'Tunnel Geometry' },
    { id: 'profile', label: 'Profile' },
    { id: 'convergence', label: 'Convergence Monitoring' },
  ] as const;

  return (
    <div className="p-4">
      <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
        <div className="text-sm text-zinc-400">QA Standards</div>
        <div className="flex gap-4 mt-1 text-xs">
          <span>Traverse: 1:{qa.traversePrecision}</span>
          <span>Levelling: {qa.levellingClosureMM}</span>
          <span>Angular: {qa.angularClosureSec}</span>
          <span>Horizontal: ±{qa.horizontalClosureMM}mm/km</span>
        </div>
      </div>

      <div className="flex border-b border-zinc-700 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm ${activeTab === tab.id ? 'text-amber-500 border-b-2 border-amber-500' : 'text-zinc-400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'control' && (
        <div>
          <div className="text-lg font-medium mb-3">Portal Coordinates</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Portal</th>
                <th className="text-left py-2">Easting</th>
                <th className="text-left py-2">Northing</th>
                <th className="text-left py-2">Elevation</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-800">
                <td className="py-2">Portal 1 (Inlet)</td>
                <td className="py-2">{portalPoints[0]?.easting.toFixed(3) || '—'}</td>
                <td className="py-2">{portalPoints[0]?.northing.toFixed(3) || '—'}</td>
                <td className="py-2">{portalPoints[0]?.elevation.toFixed(3) || '—'}</td>
              </tr>
              <tr className="border-b border-zinc-800">
                <td className="py-2">Portal 2 (Outlet)</td>
                <td className="py-2">{portalPoints[1]?.easting.toFixed(3) || '—'}</td>
                <td className="py-2">{portalPoints[1]?.northing.toFixed(3) || '—'}</td>
                <td className="py-2">{portalPoints[1]?.elevation.toFixed(3) || '—'}</td>
              </tr>
            </tbody>
          </table>
          <button
            onClick={() => setPortalPoints([{ easting: 0, northing: 0, elevation: 0 }, { easting: 0, northing: 0, elevation: 0 }])}
            className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
          >
            Add Portals
          </button>
          {portalPoints.length >= 2 && (
            <div className="mt-4 p-3 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Tunnel Bearing</div>
              <div className="text-lg text-amber-500">—</div>
              <div className="text-sm text-zinc-400 mt-2">True Length</div>
              <div className="text-lg">{totalLengthM.toFixed(3)} m</div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'geometry' && (
        <div>
          <div className="text-lg font-medium mb-3">Tunnel Geometry</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Excavated Width (m)</label>
              <input
                type="number"
                value={excavatedWidthM}
                onChange={(e) => setExcavatedWidthM(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Excavated Height (m)</label>
              <input
                type="number"
                value={excavatedHeightM}
                onChange={(e) => setExcavatedHeightM(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Gradient (%)</label>
              <input
                type="number"
                step={0.1}
                value={gradientPercent}
                onChange={(e) => setGradientPercent(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Cross-Section Area</div>
              <div className="text-lg text-amber-500">{crossSectionArea.toFixed(2)} m²</div>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg col-span-2">
              <div className="text-sm text-zinc-400">Excavated Volume</div>
              <div className="text-lg">{(crossSectionArea * totalLengthM / 1000).toFixed(2)} m³</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div>
          <div className="text-lg font-medium mb-3">Profile</div>
          <div className="text-sm text-zinc-400">Design elevation per chainage interval</div>
        </div>
      )}

      {activeTab === 'convergence' && (
        <div>
          <div className="text-lg font-medium mb-3">Convergence Monitoring Points</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Chainage</th>
                <th className="text-left py-2">Label</th>
              </tr>
            </thead>
            <tbody>
              {convergencePoints.map((pt, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  <td className="py-2">{pt.chainage.toFixed(3)}</td>
                  <td className="py-2">{pt.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setConvergencePoints([...convergencePoints, { chainage: convergencePoints.length * 50, label: `C${convergencePoints.length + 1}` }])}
            className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
          >
            Add Point
          </button>
        </div>
      )}
    </div>
  );
}

export default TunnelPanel;