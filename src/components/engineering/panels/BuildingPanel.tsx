'use client';

import { useState } from 'react';
import { ENGINEERING_QA, type EngineeringSubtype } from '@/lib/engine/engineering';

interface EngineeringPanelProps {
  projectId: string;
  subtype: EngineeringSubtype;
}

export function BuildingPanel({ projectId, subtype }: EngineeringPanelProps) {
  const [activeTab, setActiveTab] = useState<'control' | 'corners' | 'settingout' | 'floors'>('control');
  const qa = ENGINEERING_QA.building;

  const [controlPoints, setControlPoints] = useState<Array<{ easting: number; northing: number; elevation?: number }>>([]);
  const [buildingCorners, setBuildingCorners] = useState<Array<{ label: string; easting: number; northing: number; elevation: number }>>([]);
  const [floorCount, setFloorCount] = useState(1);
  const [floorHeightM, setFloorHeightM] = useState(3.0);

  const tabs = [
    { id: 'control', label: 'Control Points' },
    { id: 'corners', label: 'Building Corners' },
    { id: 'settingout', label: 'Setting Out' },
    { id: 'floors', label: 'Floor Layout' },
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
          <div className="text-lg font-medium mb-3">Control Points (min 3 required)</div>
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
                  <td className="py-2">CP{i + 1}</td>
                  <td className="py-2">{pt.easting.toFixed(3)}</td>
                  <td className="py-2">{pt.northing.toFixed(3)}</td>
                  <td className="py-2">{pt.elevation?.toFixed(3) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setControlPoints([...controlPoints, { easting: 0, northing: 0 }])}
            className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
          >
            Add Control Point
          </button>
        </div>
      )}

      {activeTab === 'corners' && (
        <div>
          <div className="text-lg font-medium mb-3">Building Corners</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2">Corner</th>
                <th className="text-left py-2">Easting</th>
                <th className="text-left py-2">Northing</th>
                <th className="text-left py-2">Elevation</th>
              </tr>
            </thead>
            <tbody>
              {buildingCorners.map((corner, i) => (
                <tr key={i} className="border-b border-zinc-800">
                  <td className="py-2">{corner.label}</td>
                  <td className="py-2">{corner.easting.toFixed(3)}</td>
                  <td className="py-2">{corner.northing.toFixed(3)}</td>
                  <td className="py-2">{corner.elevation.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              placeholder="Label (A, B, C...)"
              className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm w-24"
            />
            <input
              type="number"
              placeholder="Easting"
              className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm w-28"
            />
            <input
              type="number"
              placeholder="Northing"
              className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm w-28"
            />
            <input
              type="number"
              placeholder="Elevation"
              className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm w-24"
            />
            <button
              onClick={() => setBuildingCorners([...buildingCorners, { label: String.fromCharCode(65 + buildingCorners.length), easting: 0, northing: 0, elevation: 0 }])}
              className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {activeTab === 'settingout' && (
        <div>
          <div className="text-lg font-medium mb-3">Setting Out Schedule</div>
          <div className="p-4 bg-zinc-800 rounded-lg text-sm">
            <div className="text-zinc-400">Bearing and distance from nearest control point</div>
            <table className="w-full mt-3">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2">Point</th>
                  <th className="text-left py-2">From</th>
                  <th className="text-left py-2">Bearing</th>
                  <th className="text-left py-2">Distance</th>
                </tr>
              </thead>
              <tbody>
                {buildingCorners.map((corner, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    <td className="py-2">{corner.label}</td>
                    <td className="py-2">CP1</td>
                    <td className="py-2">—</td>
                    <td className="py-2">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'floors' && (
        <div>
          <div className="text-lg font-medium mb-3">Floor Layout</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">Number of Floors</label>
              <input
                type="number"
                min={1}
                value={floorCount}
                onChange={(e) => setFloorCount(parseInt(e.target.value) || 1)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400">Floor Height (m)</label>
              <input
                type="number"
                step={0.1}
                value={floorHeightM}
                onChange={(e) => setFloorHeightM(parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400">Total Building Height: {(floorCount * floorHeightM).toFixed(2)} m</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BuildingPanel;