'use client';

import { useState } from 'react';
import { ENGINEERING_QA, type EngineeringSubtype } from '@/lib/engine/engineering';

interface EngineeringPanelProps {
  projectId: string;
  subtype: EngineeringSubtype;
}

export function DamPanel({ projectId, subtype }: EngineeringPanelProps) {
  const [activeTab, setActiveTab] = useState<'control' | 'geometry' | 'reservoir' | 'settingout'>('control');
  const qa = ENGINEERING_QA.dam;

  const [controlPoints, setControlPoints] = useState<Array<{ easting: number; northing: number; elevation: number }>>([]);
  const [crestLength, setCrestLength] = useState(100);
  const [crestElevation, setCrestElevation] = useState(1500);
  const [crestWidthM, setCrestWidthM] = useState(8);
  const [fullSupplyLevel, setFullSupplyLevel] = useState(1495);
  const [deadStorageLevel, setDeadStorageLevel] = useState(1450);
  const [catchmentAreaKm2, setCatchmentAreaKm2] = useState(50);
  const [upstreamSlopeH, setUpstreamSlopeH] = useState(3);
  const [downstreamSlopeH, setDownstreamSlopeH] = useState(2.5);
  const [foundationLevel, setFoundationLevel] = useState(1400);

  const freeboard = crestElevation - fullSupplyLevel;
  const freeboardWarning = freeboard < 0.5;

  const tabs = [
    { id: 'control', label: 'Control Survey' },
    { id: 'geometry', label: 'Dam Geometry' },
    { id: 'reservoir', label: 'Reservoir' },
    { id: 'settingout', label: 'Setting Out' },
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
          <div className="text-lg font-medium mb-3">Control Points (Benchmark required)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Point</th>
                <th className="text-left py-2">Easting</th>
                <th className="text-left py-2">Northing</th>
                <th className="text-left py-2">Elevation</th>
              </tr>
            </thead>
            <tbody>
              {controlPoints.map((pt, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  <td className="py-2">BM{i + 1}</td>
                  <td className="py-2">{pt.easting.toFixed(3)}</td>
                  <td className="py-2">{pt.northing.toFixed(3)}</td>
                  <td className="py-2">{pt.elevation.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setControlPoints([...controlPoints, { easting: 0, northing: 0, elevation: 0 }])}
            className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
          >
            Add Benchmark
          </button>
        </div>
      )}

      {activeTab === 'geometry' && (
        <div>
          <div className="text-lg font-medium mb-3">Dam Geometry</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Crest Length (m)</label>
              <input
                type="number"
                value={crestLength}
                onChange={(e) => setCrestLength(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Crest Elevation (m)</label>
              <input
                type="number"
                value={crestElevation}
                onChange={(e) => setCrestElevation(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Crest Width (m)</label>
              <input
                type="number"
                value={crestWidthM}
                onChange={(e) => setCrestWidthM(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Foundation Level (m)</label>
              <input
                type="number"
                value={foundationLevel}
                onChange={(e) => setFoundationLevel(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Upstream Slope (H:1V)</label>
              <input
                type="number"
                step={0.1}
                value={upstreamSlopeH}
                onChange={(e) => setUpstreamSlopeH(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Downstream Slope (H:1V)</label>
              <input
                type="number"
                step={0.1}
                value={downstreamSlopeH}
                onChange={(e) => setDownstreamSlopeH(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reservoir' && (
        <div>
          <div className="text-lg font-medium mb-3">Reservoir Data</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Full Supply Level (m)</label>
              <input
                type="number"
                value={fullSupplyLevel}
                onChange={(e) => setFullSupplyLevel(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Dead Storage Level (m)</label>
              <input
                type="number"
                value={deadStorageLevel}
                onChange={(e) => setDeadStorageLevel(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Catchment Area (km²)</label>
              <input
                type="number"
                value={catchmentAreaKm2}
                onChange={(e) => setCatchmentAreaKm2(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400">Freeboard</div>
              <div className={`text-lg ${freeboardWarning ? 'text-red-400' : 'text-green-400'}`}>
                {freeboard.toFixed(2)} m
              </div>
            </div>
          </div>
          {freeboardWarning && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
              <span className="text-red-400 text-sm">⚠ Freeboard below 0.5m minimum — review dam height</span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settingout' && (
        <div>
          <div className="text-lg font-medium mb-3">Setting Out Points</div>
          <div className="p-4 bg-zinc-800 rounded-lg text-sm">
            <div className="text-zinc-400">Key points along dam crest</div>
            <table className="w-full mt-3">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2">Station</th>
                  <th className="text-left py-2">Easting</th>
                  <th className="text-left py-2">Northing</th>
                  <th className="text-left py-2">Elevation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">0+000</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                  <td className="py-2">{crestElevation.toFixed(3)}</td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">{Math.round(crestLength / 2)}+{(crestLength / 2 % 100).toFixed(0).padStart(3, '0')}</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                  <td className="py-2">{crestElevation.toFixed(3)}</td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">{Math.round(crestLength / 100)}+{String(crestLength % 100).padStart(3, '0')}</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                  <td className="py-2">{crestElevation.toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default DamPanel;