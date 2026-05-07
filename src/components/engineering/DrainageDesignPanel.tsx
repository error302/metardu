'use client'

import React, { useState } from 'react'
import { manningPipeCapacity, rationalMethodCatchment, manningChannelCapacity, sizePipe, MANNING_N, RUNOFF_COEFFICIENTS, STANDARD_PIPE_SIZES } from '@/lib/engineering/drainageDesign'

type Tab = 'pipe' | 'catchment' | 'channel'

export default function DrainageDesignPanel({ roadLength = 1000 }: { roadLength?: number }) {
  const [tab, setTab] = useState<Tab>('pipe')

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">Drainage Design</h3>
        <p className="text-sm text-gray-500 mt-1">Manning&apos;s equation, Rational Method, pipe & channel sizing — RDM 1.3</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {([['pipe', 'Pipe Sizing'], ['catchment', 'Catchment'], ['channel', 'Channel']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === k ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'pipe' && <PipeSizingTab />}
      {tab === 'catchment' && <CatchmentTab />}
      {tab === 'channel' && <ChannelTab />}
    </div>
  )
}

// ─── PIPE SIZING TAB ──────────────────────────────────────────────────────────

function PipeSizingTab() {
  const [peakFlow, setPeakFlow] = useState(0.5)
  const [slope, setSlope] = useState(0.5)
  const [material, setMaterial] = useState('Concrete pipe')
  const [customDiameter, setCustomDiameter] = useState(300)
  const [showResult, setShowResult] = useState(false)

  const manningN = MANNING_N[material] || 0.013
  const slopeDecimal = slope / 100

  const sizing = peakFlow > 0 ? sizePipe(peakFlow, manningN, slopeDecimal) : null
  const customResult = manningPipeCapacity({ diameter: customDiameter, manningN, slope: slopeDecimal })
  const minSlopeForCustom = (manningN && customDiameter)
    ? Math.pow(0.6 * manningN / Math.pow((customDiameter / 1000) / 4, 2 / 3), 2) * 100
    : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-medium text-gray-900">Pipe Sizing</h4>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Peak Flow (m³/s)</label>
            <input type="number" step="0.01" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={peakFlow} onChange={e => { setPeakFlow(parseFloat(e.target.value) || 0); setShowResult(false) }} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pipe Slope (%)</label>
            <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={slope} onChange={e => { setSlope(parseFloat(e.target.value) || 0); setShowResult(false) }} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Material (Manning&apos;s n = {manningN})</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={material} onChange={e => setMaterial(e.target.value)}>
              {Object.entries(MANNING_N).map(([name, n]) => (
                <option key={name} value={name}>{name} (n={n})</option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowResult(true)}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Size Pipe
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h4 className="font-medium text-gray-900">Custom Pipe Check</h4>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Diameter (mm)</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={customDiameter} onChange={e => setCustomDiameter(parseInt(e.target.value))}>
              {STANDARD_PIPE_SIZES.map(d => <option key={d} value={d}>{d} mm</option>)}
            </select>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Full Bore Capacity</span><span className="font-mono font-medium">{customResult.fullBoreCapacity.toFixed(4)} m³/s</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Full Bore Velocity</span><span className={`font-mono font-medium ${customResult.isSelfCleansing ? 'text-green-600' : 'text-red-600'}`}>{customResult.fullBoreVelocity.toFixed(2)} m/s</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Self-Cleansing (≥0.6 m/s)</span><span className={customResult.isSelfCleansing ? 'text-green-600' : 'text-red-600'}>{customResult.isSelfCleansing ? 'YES' : 'NO'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Velocity Acceptable</span><span className={customResult.isVelocityAcceptable ? 'text-green-600' : 'text-amber-600'}>{customResult.isVelocityAcceptable ? 'YES' : 'NO (check lining)'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Min Slope for Self-Cleansing</span><span className="font-mono">{minSlopeForCustom.toFixed(2)}%</span></div>
          </div>
        </div>
      </div>

      {showResult && sizing && (
        <div className={`rounded-xl border-2 p-6 ${sizing ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <h4 className="font-medium text-gray-900 mb-3">Recommended Pipe Size</h4>
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-xs text-gray-500">Diameter</div><div className="text-xl font-bold">{sizing.diameter} mm</div></div>
            <div><div className="text-xs text-gray-500">Capacity</div><div className="text-xl font-bold">{sizing.capacity.toFixed(4)} m³/s</div></div>
            <div><div className="text-xs text-gray-500">Velocity</div><div className="text-xl font-bold">{sizing.velocity.toFixed(2)} m/s</div></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CATCHMENT TAB ────────────────────────────────────────────────────────────

function CatchmentTab() {
  const [area, setArea] = useState(10)
  const [landUse, setLandUse] = useState('Grass/Park')
  const [intensity, setIntensity] = useState(50)

  const C = RUNOFF_COEFFICIENTS[landUse]?.typical || 0.15
  const result = rationalMethodCatchment({ area, runoffCoefficient: C, rainfallIntensity: intensity, timeOfConcentration: 10 })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Catchment Analysis (Rational Method)</h4>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Catchment Area (hectares)</label>
            <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={area} onChange={e => setArea(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Land Use (C = {C})</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={landUse} onChange={e => setLandUse(e.target.value)}>
              {Object.entries(RUNOFF_COEFFICIENTS).map(([name, val]) => (
                <option key={name} value={name}>{name} (C: {val.min}–{val.max}, typical {val.typical})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rainfall Intensity (mm/hr)</label>
            <input type="number" step="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={intensity} onChange={e => setIntensity(parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-6 space-y-3">
          <h4 className="font-medium text-gray-900">Results</h4>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Peak Flow (Q = CIA/360)</span><span className="font-mono font-bold text-blue-600">{result.peakFlow.toFixed(4)} m³/s</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Catchment Area</span><span className="font-mono">{area} ha</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Effective Area (C × A)</span><span className="font-mono">{result.effectiveArea.toFixed(2)} ha</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Recommended Return Period</span><span className="font-medium">{result.returnPeriod}</span></div>
          <div className="mt-4 p-3 bg-white rounded-lg border text-xs text-gray-500">
            <strong>Formula:</strong> Q = (C × I × A) / 360 = ({C} × {intensity} × {area}) / 360 = {result.peakFlow.toFixed(4)} m³/s
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CHANNEL TAB ─────────────────────────────────────────────────────────────

function ChannelTab() {
  const [bedWidth, setBedWidth] = useState(1.0)
  const [sideSlope, setSideSlope] = useState(1.5)
  const [manningN, setManningN] = useState(0.015)
  const [slope, setSlope] = useState(0.5)
  const [flowDepth, setFlowDepth] = useState(0.5)

  const result = manningChannelCapacity({ bedWidth, sideSlope, manningN, slope: slope / 100, flowDepth })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h4 className="font-medium text-gray-900">Trapezoidal Channel Design</h4>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bed Width (m)</label>
          <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={bedWidth} onChange={e => setBedWidth(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Side Slope (H:V)</label>
          <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={sideSlope} onChange={e => setSideSlope(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Manning&apos;s n</label>
          <input type="number" step="0.001" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={manningN} onChange={e => setManningN(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Slope (%)</label>
          <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={slope} onChange={e => setSlope(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Flow Depth (m)</label>
          <input type="number" step="0.1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={flowDepth} onChange={e => setFlowDepth(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="font-medium text-gray-900 mb-4">Channel Cross-Section</h4>
        <ChannelCrossSectionSvg bedWidth={bedWidth} sideSlope={sideSlope} flowDepth={flowDepth} />
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-500">Flow Area</span><span className="font-mono">{result.flowArea.toFixed(4)} m²</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Wetted Perimeter</span><span className="font-mono">{result.wettedPerimeter.toFixed(4)} m</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Hydraulic Radius</span><span className="font-mono">{result.hydraulicRadius.toFixed(4)} m</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Velocity</span><span className={`font-mono font-bold ${result.isSelfCleansing ? 'text-green-600' : 'text-red-600'}`}>{result.velocity.toFixed(3)} m/s</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Discharge</span><span className="font-mono font-bold text-blue-600">{result.discharge.toFixed(4)} m³/s</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Top Width</span><span className="font-mono">{result.topWidth.toFixed(2)} m</span></div>
        </div>
      </div>
    </div>
  )
}

// ─── CHANNEL CROSS-SECTION SVG ────────────────────────────────────────────────

function ChannelCrossSectionSvg({ bedWidth, sideSlope, flowDepth }: { bedWidth: number; sideSlope: number; flowDepth: number }) {
  const svgW = 350
  const svgH = 200
  const scale = 40 // px per metre
  const cx = svgW / 2
  const groundY = 40
  const channelBottom = groundY + 80

  const bw = bedWidth * scale
  const z = sideSlope
  const fd = flowDepth * scale
  const y = fd

  const leftToeX = cx - bw / 2 - z * y
  const rightToeX = cx + bw / 2 + z * y
  const waterY = channelBottom - y
  const leftWaterX = cx - bw / 2 - z * y
  const rightWaterX = cx + bw / 2 + z * y

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
      {/* Ground */}
      <rect x={0} y={groundY} width={svgW} height={svgH - groundY} fill="#f5f5f4" />
      {/* Channel excavation */}
      <polygon points={`${leftToeX},${channelBottom} ${cx - bw / 2},${channelBottom} ${cx + bw / 2},${channelBottom} ${rightToeX},${channelBottom}`} fill="#e5e7eb" />
      {/* Channel sides */}
      <line x1={leftToeX} y1={groundY} x2={cx - bw / 2} y2={channelBottom} stroke="#6b7280" strokeWidth={2} />
      <line x1={rightToeX} y1={groundY} x2={cx + bw / 2} y2={channelBottom} stroke="#6b7280" strokeWidth={2} />
      <line x1={cx - bw / 2} y1={channelBottom} x2={cx + bw / 2} y2={channelBottom} stroke="#6b7280" strokeWidth={2} />
      {/* Water */}
      <polygon points={`${leftWaterX},${channelBottom} ${cx - bw / 2},${channelBottom} ${cx + bw / 2},${channelBottom} ${rightWaterX},${channelBottom} ${rightWaterX},${waterY} ${cx + bw / 2},${waterY} ${cx - bw / 2},${waterY} ${leftWaterX},${waterY}`} fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth={1} />
      {/* Flow depth arrow */}
      <line x1={cx + bw / 2 + 15} y1={channelBottom} x2={cx + bw / 2 + 15} y2={waterY} stroke="#2563eb" strokeWidth={1.5} markerEnd="url(#arrowUp)" />
      <text x={cx + bw / 2 + 25} y={(channelBottom + waterY) / 2 + 4} fill="#2563eb" fontSize="10">{flowDepth.toFixed(2)}m</text>
      {/* Bed width */}
      <text x={cx} y={channelBottom + 15} textAnchor="middle" fill="#6b7280" fontSize="10">{bedWidth.toFixed(1)}m</text>
      <defs>
        <marker id="arrowUp" viewBox="0 0 10 10" refX="5" refY="10" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 10 L 5 0 L 10 10" fill="none" stroke="#2563eb" strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  )
}
