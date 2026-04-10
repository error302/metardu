'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  reduceSoundings,
  computeTidalConstants,
  generateTideCurve,
  parseSoundingCSV,
  parseTideCSV,
  reducedSoundingsToCSV,
  type Sounding,
  type TideObservation,
  type ReducedSounding,
  type TidalConstants,
  type TideCurvePoint,
} from '@/lib/engine/tidalReduction'

type Tab = 'input' | 'reduce' | 'chart'

const SAMPLE_SOUNDINGS_CSV = `easting,northing,depth,time
358420.5,9877200.3,12.5,2025-01-15T06:00:00Z
358425.2,9877200.8,11.8,2025-01-15T06:15:00Z
358430.0,9877201.2,10.2,2025-01-15T06:30:00Z
358435.1,9877200.5,9.5,2025-01-15T06:45:00Z
358440.0,9877200.0,8.8,2025-01-15T07:00:00Z
358445.3,9877200.7,8.2,2025-01-15T07:15:00Z
358450.1,9877201.0,7.5,2025-01-15T07:30:00Z
358455.0,9877200.4,6.8,2025-01-15T07:45:00Z
358420.8,9877205.1,13.2,2025-01-15T08:00:00Z
358426.0,9877205.5,12.5,2025-01-15T08:15:00Z
358431.2,9877205.0,11.0,2025-01-15T08:30:00Z
358436.5,9877205.3,9.8,2025-01-15T08:45:00Z
358441.0,9877205.8,9.2,2025-01-15T09:00:00Z
358446.2,9877205.2,8.5,2025-01-15T09:15:00Z
358451.0,9877205.0,7.8,2025-01-15T09:30:00Z`

const SAMPLE_TIDE_CSV = `time,level
2025-01-15T05:00:00Z,0.5
2025-01-15T06:00:00Z,1.2
2025-01-15T07:00:00Z,1.8
2025-01-15T08:00:00Z,2.1
2025-01-15T09:00:00Z,1.9
2025-01-15T10:00:00Z,1.4
2025-01-15T11:00:00Z,0.8
2025-01-15T12:00:00Z,0.3
2025-01-15T13:00:00Z,-0.2
2025-01-15T14:00:00Z,-0.5
2025-01-15T15:00:00Z,-0.3
2025-01-15T16:00:00Z,0.2
2025-01-15T17:00:00Z,0.7
2025-01-15T18:00:00Z,1.1
2025-01-15T19:00:00Z,1.5
2025-01-15T20:00:00Z,1.7`

export function TidalReductionPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('input')
  const [soundingCSV, setSoundingCSV] = useState('')
  const [tideCSV, setTideCSV] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Parse inputs
  const soundings = useMemo(() => parseSoundingCSV(soundingCSV), [soundingCSV])
  const tideObs = useMemo(() => parseTideCSV(tideCSV), [tideCSV])

  // Reduce soundings
  const reducedSoundings = useMemo((): ReducedSounding[] | null => {
    if (soundings.length === 0 || tideObs.length === 0) return null
    setError(null)
    try {
      return reduceSoundings(soundings, tideObs)
    } catch (e: any) {
      setError(e.message)
      return null
    }
  }, [soundings, tideObs])

  // Tidal constants
  const tidalConstants = useMemo((): TidalConstants | null => {
    if (tideObs.length < 2) return null
    try {
      return computeTidalConstants(tideObs)
    } catch {
      return null
    }
  }, [tideObs])

  // Tide curve for chart
  const tideCurve = useMemo((): TideCurvePoint[] => {
    if (tideObs.length < 2) return []
    return generateTideCurve(tideObs, 120)
  }, [tideObs])

  const loadSample = useCallback(() => {
    setSoundingCSV(SAMPLE_SOUNDINGS_CSV)
    setTideCSV(SAMPLE_TIDE_CSV)
    setError(null)
  }, [])

  const handleFileUpload = useCallback((type: 'soundings' | 'tides') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (type === 'soundings') setSoundingCSV(text)
      else setTideCSV(text)
      setError(null)
    }
    reader.readAsText(file)
  }, [])

  const exportReducedCSV = useCallback(() => {
    if (!reducedSoundings) return
    const csv = reducedSoundingsToCSV(reducedSoundings)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reduced_soundings.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [reducedSoundings])

  const handleRunReduction = useCallback(() => {
    setError(null)
    try {
      if (soundings.length === 0) {
        setError('No soundings parsed. Check CSV format.')
        return
      }
      if (tideObs.length === 0) {
        setError('No tide observations parsed. Check CSV format.')
        return
      }
      setActiveTab('reduce')
    } catch (e: any) {
      setError(e.message)
    }
  }, [soundings, tideObs])

  // Chart dimensions
  const chartWidth = 700
  const chartHeight = 200
  const chartPadding = { top: 20, right: 20, bottom: 30, left: 50 }

  const tideChartSVG = useMemo(() => {
    if (tideCurve.length === 0) return null

    const levels = tideCurve.map(p => p.level)
    const minLevel = Math.min(...levels) - 0.3
    const maxLevel = Math.max(...levels) + 0.3
    const levelRange = maxLevel - minLevel || 1

    const times = tideCurve.map(p => new Date(p.time).getTime())
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const timeRange = maxTime - minTime || 1

    const plotW = chartWidth - chartPadding.left - chartPadding.right
    const plotH = chartHeight - chartPadding.top - chartPadding.bottom

    const toX = (t: number) => chartPadding.left + ((t - minTime) / timeRange) * plotW
    const toY = (l: number) => chartPadding.top + (1 - (l - minLevel) / levelRange) * plotH

    const zeroY = toY(0)

    const pathD = tideCurve.map((p, i) => {
      const x = toX(new Date(p.time).getTime())
      const y = toY(p.level)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')

    const obsPoints = tideObs.map(t => {
      const x = toX(new Date(t.time).getTime())
      const y = toY(t.tideLevel)
      return { x, y }
    })

    const soundingPoints = reducedSoundings
      ? reducedSoundings.slice(0, 30).map(s => {
          const x = toX(new Date(s.time).getTime())
          const y = toY(s.tideLevel)
          return { x, y }
        })
      : []

    const yTicks: number[] = []
    const tickStep = levelRange > 3 ? 1 : 0.5
    for (let l = Math.ceil(minLevel / tickStep) * tickStep; l <= maxLevel; l += tickStep) {
      yTicks.push(l)
    }

    const xTicks: Array<{ label: string; x: number }> = []
    const numTicks = Math.min(6, tideCurve.length)
    for (let i = 0; i < numTicks; i++) {
      const idx = Math.floor((i / (numTicks - 1)) * (tideCurve.length - 1))
      const p = tideCurve[idx]
      const d = new Date(p.time)
      const label = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
      xTicks.push({ label, x: toX(new Date(p.time).getTime()) })
    }

    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
        <rect x={chartPadding.left} y={chartPadding.top} width={plotW} height={plotH} fill="#f8fafc" rx="2" />

        {yTicks.map(l => (
          <line key={`y-${l}`} x1={chartPadding.left} y1={toY(l)} x2={chartPadding.left + plotW} y2={toY(l)} stroke="#e2e8f0" strokeWidth="0.5" />
        ))}
        {xTicks.map((t, i) => (
          <line key={`x-${i}`} x1={t.x} y1={chartPadding.top} x2={t.x} y2={chartPadding.top + plotH} stroke="#e2e8f0" strokeWidth="0.5" />
        ))}

        <line x1={chartPadding.left} y1={zeroY} x2={chartPadding.left + plotW} y2={zeroY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" />
        <text x={chartPadding.left - 4} y={zeroY + 3} textAnchor="end" fill="#ef4444" fontSize="9" fontFamily="Calibri, sans-serif">CD (0)</text>

        <path d={pathD} fill="none" stroke="#1B3A5C" strokeWidth="2" />

        {obsPoints.map((p, i) => (
          <circle key={`obs-${i}`} cx={p.x} cy={p.y} r="3" fill="#1B3A5C" stroke="white" strokeWidth="1" />
        ))}

        {soundingPoints.map((p, i) => (
          <circle key={`snd-${i}`} cx={p.x} cy={p.y} r="2.5" fill="#f59e0b" stroke="white" strokeWidth="1" />
        ))}

        {yTicks.map(l => (
          <text key={`yl-${l}`} x={chartPadding.left - 4} y={toY(l) + 3} textAnchor="end" fill="#6b7280" fontSize="8" fontFamily="Calibri, sans-serif">
            {l.toFixed(1)}
          </text>
        ))}

        {xTicks.map((t, i) => (
          <text key={`xl-${i}`} x={t.x} y={chartHeight - 8} textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="Calibri, sans-serif">
            {t.label}
          </text>
        ))}

        <text x={chartWidth / 2} y={chartHeight - 2} textAnchor="middle" fill="#4b5563" fontSize="9" fontFamily="Calibri, sans-serif" fontWeight="600">
          Time (UTC)
        </text>
        <text x={12} y={chartHeight / 2} textAnchor="middle" fill="#4b5563" fontSize="9" fontFamily="Calibri, sans-serif" fontWeight="600" transform={`rotate(-90, 12, ${chartHeight / 2})`}>
          Level (m above CD)
        </text>

        <circle cx={chartPadding.left + 10} cy={chartPadding.top + 10} r="3" fill="#1B3A5C" />
        <text x={chartPadding.left + 18} y={chartPadding.top + 13} fill="#374151" fontSize="8" fontFamily="Calibri, sans-serif">Tide Obs.</text>
        <circle cx={chartPadding.left + 80} cy={chartPadding.top + 10} r="2.5" fill="#f59e0b" />
        <text x={chartPadding.left + 88} y={chartPadding.top + 13} fill="#374151" fontSize="8" fontFamily="Calibri, sans-serif">Soundings</text>
        <line x1={chartPadding.left + 150} y1={chartPadding.top + 10} x2={chartPadding.left + 165} y2={chartPadding.top + 10} stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
        <text x={chartPadding.left + 169} y={chartPadding.top + 13} fill="#374151" fontSize="8" fontFamily="Calibri, sans-serif">Chart Datum</text>
      </svg>
    )
  }, [tideCurve, tideObs, reducedSoundings, chartWidth, chartHeight, chartPadding])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#1B3A5C]">Tidal Reduction — Hydrographic Soundings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Reduce observed echo-sounder depths to Chart Datum using tide gauge data.
          <br />
          <span className="text-xs text-gray-400">
            Ref: IHO S-44 Ed.6 §5.2 · Admiralty Tide Tables · RDM 1.1 §12
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { id: 'input' as Tab, label: 'Input Data' },
          { id: 'reduce' as Tab, label: 'Reduction' },
          { id: 'chart' as Tab, label: 'Tide Curve' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-[#1B3A5C] text-[#1B3A5C]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Input Tab */}
      {activeTab === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Soundings Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Soundings</h3>
              <span className="text-xs text-gray-400">{soundings.length} points</span>
            </div>
            <textarea
              value={soundingCSV}
              onChange={e => { setSoundingCSV(e.target.value); setError(null) }}
              placeholder={`easting,northing,depth,time\n358420.5,9877200.3,12.5,2025-01-15T06:00:00Z\n...`}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none resize-y"
            />
            <label className="text-xs text-[#1B3A5C] hover:underline cursor-pointer font-medium">
              Upload Soundings CSV
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload('soundings')} className="hidden" />
            </label>
            <p className="text-[10px] text-gray-400">Format: easting,northing,depth,time (ISO 8601)</p>
          </div>

          {/* Tide Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Tide Observations</h3>
              <span className="text-xs text-gray-400">{tideObs.length} observations</span>
            </div>
            <textarea
              value={tideCSV}
              onChange={e => { setTideCSV(e.target.value); setError(null) }}
              placeholder={`time,level\n2025-01-15T06:00:00Z,1.2\n...`}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none resize-y"
            />
            <label className="text-xs text-[#1B3A5C] hover:underline cursor-pointer font-medium">
              Upload Tide CSV
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload('tides')} className="hidden" />
            </label>
            <p className="text-[10px] text-gray-400">Format: time,level (m above CD)</p>
          </div>

          {/* Actions */}
          <div className="lg:col-span-2 flex gap-3">
            <button
              onClick={loadSample}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Load Sample Data
            </button>
            <button
              onClick={handleRunReduction}
              disabled={soundings.length === 0 || tideObs.length === 0}
              className="px-5 py-2 bg-[#1B3A5C] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A5C]/90 disabled:opacity-40 transition-colors"
            >
              Run Tidal Reduction
            </button>
          </div>

          {/* Tidal Constants Summary */}
          {tidalConstants && (
            <div className="lg:col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tidal Constants (from observations)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'MHWS', value: `${tidalConstants.MHWS.toFixed(3)} m`, desc: 'Mean High Water Springs' },
                  { label: 'MLWS', value: `${tidalConstants.MLWS.toFixed(3)} m`, desc: 'Mean Low Water Springs' },
                  { label: 'MSL', value: `${tidalConstants.MSL.toFixed(3)} m`, desc: 'Mean Sea Level' },
                  { label: 'Range', value: `${tidalConstants.springRange.toFixed(3)} m`, desc: 'Spring Range' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[10px] text-gray-400">{item.desc}</p>
                    <p className="text-sm font-bold text-[#1B3A5C]">{item.label}: {item.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                {tidalConstants.observationCount} observations over {tidalConstants.periodHours.toFixed(1)} hours
              </p>
            </div>
          )}
        </div>
      )}

      {/* Reduction Tab */}
      {activeTab === 'reduce' && (
        <div className="space-y-4">
          {reducedSoundings ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(() => {
                  const depths = reducedSoundings.map(s => s.reducedDepth)
                  const obsDepths = reducedSoundings.map(s => s.observedDepth)
                  const tides = reducedSoundings.map(s => s.tideLevel)
                  return [
                    { label: 'Reduced Soundings', value: `${reducedSoundings.length}`, color: 'text-[#1B3A5C]' },
                    { label: 'Mean Reduced Depth', value: `${(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(3)} m`, color: 'text-gray-700' },
                    { label: 'Min Reduced Depth', value: `${Math.min(...depths).toFixed(3)} m`, color: 'text-gray-700' },
                    { label: 'Max Reduced Depth', value: `${Math.max(...depths).toFixed(3)} m`, color: 'text-gray-700' },
                    { label: 'Mean Tide Level', value: `${(tides.reduce((a, b) => a + b, 0) / tides.length).toFixed(3)} m`, color: 'text-gray-500' },
                    { label: 'Min Observed Depth', value: `${Math.min(...obsDepths).toFixed(3)} m`, color: 'text-gray-500' },
                    { label: 'Max Tide Correction', value: `${Math.max(...tides).toFixed(3)} m`, color: 'text-gray-500' },
                    { label: 'Min Tide Correction', value: `${Math.min(...tides).toFixed(3)} m`, color: 'text-gray-500' },
                  ]
                })().map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-bold mt-1 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Reduced Soundings Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#1B3A5C] px-4 py-2">
                  <h3 className="text-white font-semibold text-sm">Reduced Soundings</h3>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Easting</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Northing</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Obs. Depth</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Tide Level</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 font-bold">Reduced Depth</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reducedSoundings.map((s, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.easting.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.northing.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.observedDepth.toFixed(3)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-500">{s.tideLevel.toFixed(3)}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold text-[#1B3A5C]">
                            {s.reducedDepth.toFixed(3)}
                            {s.reducedDepth <= 0 && <span className="text-red-500 ml-1">↑CD</span>}
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">{new Date(s.time).toISOString().slice(11, 16)}Z</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Formula note */}
              <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg p-3">
                <strong>Reduction formula:</strong> Reduced Depth = Observed Depth + Tide Level (above CD)
                <br />
                <strong>Interpolation:</strong> Linear between consecutive tide observations ·
                <strong>Ref:</strong> IHO S-44 Ed.6 §5.2 · Admiralty Tide Tables
              </div>

              {/* Export */}
              <button
                onClick={exportReducedCSV}
                className="px-5 py-2.5 bg-[#1B3A5C] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A5C]/90 transition-colors"
              >
                Export Reduced Soundings CSV
              </button>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No reduction results yet.</p>
              <p className="text-xs mt-1">Go to Input Data tab, load data, and run tidal reduction.</p>
              <button
                onClick={() => setActiveTab('input')}
                className="mt-3 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Go to Input Data
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chart Tab */}
      {activeTab === 'chart' && (
        <div className="space-y-4">
          {tideChartSVG ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Tide Curve with Sounding Positions</h3>
              {tideChartSVG}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No tide data to display.</p>
              <p className="text-xs mt-1">Load tide observations in the Input Data tab.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
