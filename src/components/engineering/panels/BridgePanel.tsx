'use client';

import { useState } from 'react';
import { ENGINEERING_QA, type EngineeringSubtype } from '@/lib/engine/engineering';

interface EngineeringPanelProps {
  projectId: string;
  subtype: EngineeringSubtype;
}

export function BridgePanel({ projectId, subtype }: EngineeringPanelProps) {
  const [activeTab, setActiveTab] = useState<'control' | 'spans' | 'structure' | 'settingout'>('control');
  const qa = ENGINEERING_QA.bridge;

  const [centreLine, setCentreLine] = useState<Array<{ easting: number; northing: number; elevation?: number }>>([]);
  const [spanCount, setSpanCount] = useState(1);
  const [spanLengths, setSpanLengths] = useState<number[]>([30]);
  const [widthM, setWidthM] = useState(10);
  const [approachLength, setApproachLength] = useState(30);
  const [waterLevel, setWaterLevel] = useState<number | undefined>();
  const [bedLevel, setBedLevel] = useState<number | undefined>();
  const [clearanceM, setClearanceM] = useState<number | undefined>();
  const [skewAngle, setSkewAngle] = useState(0);

  const totalLength = spanLengths.reduce((a, b) => a + b, 0);

  const clearanceWarning = clearanceM !== undefined && clearanceM < 1.5;

  const tabs = [
    { id: 'control', label: 'Control Survey' },
    { id: 'spans', label: 'Span Layout' },
    { id: 'structure', label: 'Structure Data' },
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
          <div className="text-lg font-medium mb-3">Control Points (min 4 required)</div>
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
              {centreLine.map((pt, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  <td className="py-2">CP{i + 1}</td>
                  <td className="py-2">{pt.easting.toFixed(3)}</td>
                  <td className="py-2">{pt.northing.toFixed(3)}</td>
                  <td className="py-2">{pt.elevation?.toFixed(3) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setCentreLine([...centreLine, { easting: 0, northing: 0 }])}
            className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
          >
            Add Control Point
          </button>
        </div>
      )}

      {activeTab === 'spans' && (
        <div>
          <div className="text-lg font-medium mb-3">Span Layout</div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-zinc-400">Number of Spans</label>
              <input
                type="number"
                min={1}
                value={spanCount}
                onChange={(e) => {
                  const n = parseInt(e.target.value) || 1;
                  setSpanCount(n);
                  while (spanLengths.length < n) setSpanLengths([...spanLengths, 30]);
                  while (spanLengths.length > n) spanLengths.pop();
                }}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Total Bridge Length</label>
              <div className="mt-1 text-lg text-amber-500">{totalLength.toFixed(3)} m</div>
            </div>
          </div>
          <div className="space-y-2">
            {spanLengths.map((len, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-sm text-zinc-400 w-20">Span {i + 1}:</span>
                <input
                  type="number"
                  value={len}
                  onChange={(e) => {
                    const newLengths = [...spanLengths];
                    newLengths[i] = parseFloat(e.target.value) || 0;
                    setSpanLengths(newLengths);
                  }}
                  className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
                <span className="text-sm text-zinc-400">m</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'structure' && (
        <div>
          <div className="text-lg font-medium mb-3">Structure Data</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Bridge Width (m)</label>
              <input
                type="number"
                value={widthM}
                onChange={(e) => setWidthM(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Approach Length (m each)</label>
              <input
                type="number"
                value={approachLength}
                onChange={(e) => setApproachLength(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Skew Angle (°)</label>
              <input
                type="number"
                value={skewAngle}
                onChange={(e) => setSkewAngle(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Water Level (m)</label>
              <input
                type="number"
                value={waterLevel || ''}
                onChange={(e) => setWaterLevel(parseFloat(e.target.value) || undefined)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Bed Level (m)</label>
              <input
                type="number"
                value={bedLevel || ''}
                onChange={(e) => setBedLevel(parseFloat(e.target.value) || undefined)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Vertical Clearance (m)</label>
              <input
                type="number"
                value={clearanceM || ''}
                onChange={(e) => setClearanceM(parseFloat(e.target.value) || undefined)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
          </div>
          {clearanceWarning && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
              <span className="text-red-400 text-sm">⚠ Clearance below 1.5m minimum — review design</span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settingout' && (
        <div>
          <div className="text-lg font-medium mb-3">Setting Out Schedule</div>
          <div className="p-4 bg-zinc-800 rounded-lg text-sm">
            <div className="text-zinc-400">Abutment positions computed from control points</div>
            <table className="w-full mt-3">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2">Point</th>
                  <th className="text-left py-2">From Control</th>
                  <th className="text-left py-2">Bearing</th>
                  <th className="text-left py-2">Distance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">Abutment 1 Start</td>
                  <td className="py-2">CP1</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">Abutment 1 End</td>
                  <td className="py-2">CP1</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">Abutment 2 Start</td>
                  <td className="py-2">CP1</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                </tr>
                <tr className="border-b border-zinc-800">
                  <td className="py-2">Abutment 2 End</td>
                  <td className="py-2">CP1</td>
                  <td className="py-2">—</td>
                  <td className="py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default BridgePanel;