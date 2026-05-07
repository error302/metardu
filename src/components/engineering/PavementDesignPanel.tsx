'use client'

import React, { useState, useMemo } from 'react'
import { designPavement, computeLayerQuantities, classifyTraffic, classifySubgrade, computeESA } from '@/lib/engineering/pavementDesign'
import type { TrafficData, SubgradeData, PavementDesignResult, PavementLayer } from '@/lib/engineering/pavementDesign'

interface PavementDesignPanelProps {
  roadClass?: string
  carriagewayWidth?: number
  roadLength?: number
  onLayersChange?: (layers: PavementLayer[]) => void
}

export default function PavementDesignPanel({ roadClass, carriagewayWidth = 7.0, roadLength = 1000 }: PavementDesignPanelProps) {
  const [traffic, setTraffic] = useState<TrafficData>({
    aadt: 5000, heavyVehiclePercentage: 15, growthRate: 4, designPeriod: 20,
    directionalSplit: 0.5, laneFactor: 0.85, numberOfLanes: 2, vehicleDamageFactor: 1.5,
  })
  const [subgrade, setSubgrade] = useState<SubgradeData>({ cbr: 8 })
  const [result, setResult] = useState<PavementDesignResult | null>(null)

  const handleDesign = () => {
    const r = designPavement(traffic, subgrade)
    setResult(r)
    onLayersChange?.(r.layers)
  }

  const quantities = useMemo(() => {
    if (!result) return []
    return computeLayerQuantities(result.layers, roadLength, carriagewayWidth)
  }, [result, roadLength, carriagewayWidth])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">Pavement Layer Design</h3>
        <p className="text-sm text-gray-500 mt-1">KeNHA Pavement & Materials Design Manual — CBR-based method</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Data */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="font-medium text-gray-900 mb-4">Traffic Data</h4>
          <div className="space-y-3">
            {[
              { label: 'AADT (veh/day)', value: 'aadt', type: 'number' },
              { label: 'Heavy Vehicles (%)', value: 'heavyVehiclePercentage', type: 'number' },
              { label: 'Growth Rate (%/yr)', value: 'growthRate', type: 'number' },
              { label: 'Design Period (years)', value: 'designPeriod', type: 'number' },
              { label: 'Directional Split', value: 'directionalSplit', type: 'number' },
              { label: 'Lane Factor', value: 'laneFactor', type: 'number' },
              { label: 'No. of Lanes', value: 'numberOfLanes', type: 'number' },
              { label: 'Vehicle Damage Factor', value: 'vehicleDamageFactor', type: 'number' },
            ].map(f => (
              <div key={f.value}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type={f.type} step="any" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={traffic[f.value as keyof TrafficData] as number}
                  onChange={e => setTraffic({ ...traffic, [f.value]: parseFloat(e.target.value) || 0 })} />
              </div>
            ))}
          </div>
        </div>

        {/* Subgrade Data */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="font-medium text-gray-900 mb-4">Subgrade Data</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">CBR (%) — {classifySubgrade(subgrade.cbr)}</label>
              <input type="range" min={1} max={100} className="w-full" value={subgrade.cbr}
                onChange={e => setSubgrade({ ...subgrade, cbr: parseInt(e.target.value) })} />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1% (SG4)</span><span className="font-medium text-gray-700">{subgrade.cbr}%</span><span>100% (SG1)</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Soil Type</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={subgrade.soilType || ''} onChange={e => setSubgrade({ ...subgrade, soilType: e.target.value })}>
                <option value="">Select...</option>
                <option value="granular">Granular</option>
                <option value="clay">Clay</option>
                <option value="silt">Silt</option>
                <option value="sand">Sand</option>
                <option value="rock">Rock</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Road Length (m)</label>
              <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={roadLength} onChange={e => void 0} readOnly />
            </div>
          </div>

          <button onClick={handleDesign}
            className="w-full mt-6 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Design Pavement
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <div className="text-xs text-blue-600 uppercase tracking-wider">ESA</div>
              <div className="text-2xl font-bold text-blue-800">{result.esaMillions.toFixed(3)}M</div>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <div className="text-xs text-purple-600 uppercase tracking-wider">Traffic Class</div>
              <div className="text-2xl font-bold text-purple-800">{result.trafficClass}</div>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="text-xs text-amber-600 uppercase tracking-wider">Subgrade Class</div>
              <div className="text-2xl font-bold text-amber-800">{result.subgradeClass}</div>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <div className="text-xs text-green-600 uppercase tracking-wider">Total Thickness</div>
              <div className="text-2xl font-bold text-green-800">{result.totalThickness} mm</div>
            </div>
          </div>

          {/* Pavement Structure Diagram */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-medium text-gray-900 mb-3">Pavement Structure</h4>
            <PavementStructureDiagram layers={result.layers} />
          </div>

          {/* Layer Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h4 className="font-medium text-gray-900">Layer Schedule</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Layer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Thickness</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                </tr>
              </thead>
              <tbody>
                {result.layers.map((layer, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">
                      <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: layer.color }} />
                      {layer.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{layer.material}</td>
                    <td className="px-4 py-2 text-right font-mono">{layer.thicknessMm} mm</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{layer.description}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right font-mono">{result.totalThickness} mm</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Material Quantities */}
          {quantities.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="font-medium text-gray-900">Material Quantities (L={roadLength}m × W={carriagewayWidth}m)</h4>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Layer</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Volume (m³)</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Tonnage</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Density (kg/m³)</th>
                  </tr>
                </thead>
                <tbody>
                  {quantities.map((q, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{q.layer}</td>
                      <td className="px-4 py-2 text-right font-mono">{q.volumeM3.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-mono">{q.tonnage.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{q.density}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── PAVEMENT STRUCTURE SVG ───────────────────────────────────────────────────

function PavementStructureDiagram({ layers }: { layers: PavementLayer[] }) {
  const width = 400
  const layerHeight = 50
  const subgradeHeight = 60
  const height = layers.length * layerHeight + subgradeHeight + 60
  const padX = 80
  const padY = 30
  const layerWidth = width - padX * 2

  const totalThickness = layers.reduce((s, l) => s + l.thicknessMm, 0)

  let y = padY

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-md mx-auto">
      {layers.map((layer, i) => {
        const currentY = y
        y += layerHeight
        return (
          <g key={i}>
            <rect x={padX} y={currentY} width={layerWidth} height={layerHeight} fill={layer.color} rx={i === 0 ? 6 : 0} />
            {i > 0 && <line x1={padX} y1={currentY} x2={padX + layerWidth} y2={currentY} stroke="white" strokeWidth={1} />}
            <text x={padX + layerWidth / 2} y={currentY + layerHeight / 2 + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="500">
              {layer.name}
            </text>
            <text x={padX - 8} y={currentY + layerHeight / 2 + 4} textAnchor="end" fill="#374151" fontSize="10" fontWeight="500">
              {layer.thicknessMm}
            </text>
          </g>
        )
      })}
      {/* Subgrade */}
      <rect x={padX} y={y} width={layerWidth} height={subgradeHeight} fill="#d1d5db" rx={0} />
      <text x={padX + layerWidth / 2} y={y + subgradeHeight / 2 + 4} textAnchor="middle" fill="#374151" fontSize="11">Subgrade</text>
      {/* Total annotation */}
      <text x={padX - 8} y={padY - 10} textAnchor="end" fill="#374151" fontSize="12" fontWeight="600">
        {totalThickness} mm
      </text>
      <line x1={padX - 25} y1={padY} x2={padX - 25} y2={y} stroke="#374151" strokeWidth={1.5} />
      <line x1={padX - 30} y1={padY} x2={padX - 20} y2={padY} stroke="#374151" strokeWidth={1.5} />
      <line x1={padX - 30} y1={y} x2={padX - 20} y2={y} stroke="#374151" strokeWidth={1.5} />
    </svg>
  )
}
