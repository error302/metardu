'use client'

import React, { useState, useMemo } from 'react'
import type { DesignPoint, AsBuiltPoint, ToleranceBand, AsBuiltSurveyResult } from '@/lib/engineering/asBuiltSurvey'
import { compareDesignVsAsBuilt, parseAsBuiltCSV, TOLERANCE_BANDS } from '@/lib/engineering/asBuiltSurvey'

interface AsBuiltSurveyPanelProps {
  projectId?: string
  roadClass?: string
  surfaceType?: 'paved' | 'gravel' | 'earth'
  designPoints?: DesignPoint[]
  onImport?: (points: AsBuiltPoint[]) => void
}

const SURFACE_TYPES: Array<{ key: 'paved' | 'gravel' | 'earth'; label: string; tolerance: ToleranceBand }> = [
  { key: 'paved', label: 'Paved (Asphalt/Concrete)', tolerance: TOLERANCE_BANDS.paved },
  { key: 'gravel', label: 'Gravel', tolerance: TOLERANCE_BANDS.gravel },
  { key: 'earth', label: 'Earth', tolerance: TOLERANCE_BANDS.earth },
]

export default function AsBuiltSurveyPanel({ roadClass, surfaceType = 'paved', designPoints = [] }: AsBuiltSurveyPanelProps) {
  const [activeSurface, setActiveSurface] = useState<'paved' | 'gravel' | 'earth'>(surfaceType)
  const [csvInput, setCsvInput] = useState('')
  const [asBuiltPoints, setAsBuiltPoints] = useState<AsBuiltPoint[]>([])
  const [result, setResult] = useState<AsBuiltSurveyResult | null>(null)

  const tolerance = SURFACE_TYPES.find(s => s.key === activeSurface)!.tolerance

  const handleImport = () => {
    const points = parseAsBuiltCSV(csvInput)
    if (points.length > 0) {
      setAsBuiltPoints(points)
      const r = compareDesignVsAsBuilt(designPoints, points, tolerance)
      setResult(r)
    }
  }

  // Generate synthetic design points for demo
  const demoDesignPoints = useMemo(() => {
    if (designPoints.length > 0) return designPoints
    return Array.from({ length: 51 }, (_, i) => ({
      chainage: i * 20,
      designLevel: 100 + Math.sin(i * 0.15) * 3,
    }))
  }, [designPoints])

  const runComparison = () => {
    if (asBuiltPoints.length === 0) return
    const r = compareDesignVsAsBuilt(demoDesignPoints, asBuiltPoints, tolerance)
    setResult(r)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">As-Built Survey Analysis</h3>
        <p className="text-sm text-gray-500 mt-1">Compare design levels against as-built survey data</p>
      </div>

      {/* Surface Type & Tolerance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="font-medium text-gray-900 mb-3">Surface Type & Tolerances</h4>
        <div className="grid grid-cols-3 gap-3">
          {SURFACE_TYPES.map(st => (
            <button
              key={st.key}
              onClick={() => setActiveSurface(st.key)}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                activeSurface === st.key
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-sm">{st.label}</div>
              <div className="text-xs text-gray-500 mt-1">
                Level: ±{st.tolerance.level}mm | Horiz: ±{st.tolerance.horizontal}mm
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CSV Import */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="font-medium text-gray-900 mb-3">Import As-Built Data (CSV)</h4>
        <p className="text-xs text-gray-500 mb-2">Format: chainage, level, easting, northing (one point per line)</p>
        <textarea
          className="w-full h-32 border border-gray-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={`0, 100.025, 123456.789, 9876543.210\n20, 100.032, 123466.521, 9876550.102\n40, 99.988, 123476.213, 9876556.834\n...`}
          value={csvInput}
          onChange={e => setCsvInput(e.target.value)}
        />
        <div className="flex gap-3 mt-3">
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Import & Compare
          </button>
          {designPoints.length === 0 && (
            <button
              onClick={() => {
                const demoAB = demoDesignPoints.map(d => ({
                  chainage: d.chainage,
                  surveyedLevel: d.designLevel + (Math.random() - 0.5) * 0.06,
                  surveyedEasting: 123456.789 + d.chainage * 0.5,
                  surveyedNorthing: 9876543.21 + d.chainage * 0.7,
                }))
                setAsBuiltPoints(demoAB)
                const r = compareDesignVsAsBuilt(demoDesignPoints, demoAB, tolerance)
                setResult(r)
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              Load Demo Data
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`rounded-xl border-2 p-4 ${result.summary.isCompliant ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Pass Rate</div>
              <div className={`text-2xl font-bold ${result.summary.isCompliant ? 'text-green-700' : 'text-red-700'}`}>
                {result.summary.passRate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">{result.summary.passCount} / {result.summary.totalPoints} points</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Max Deviation</div>
              <div className="text-2xl font-bold text-gray-900">{result.summary.maxLevelDeviation.toFixed(1)} mm</div>
              <div className="text-xs text-gray-500">Tolerance: ±{tolerance.level}mm</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">RMS Error</div>
              <div className="text-2xl font-bold text-gray-900">{result.summary.rmsError.toFixed(1)} mm</div>
              <div className="text-xs text-gray-500">Root Mean Square</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Mean Deviation</div>
              <div className="text-2xl font-bold text-gray-900">{result.summary.meanLevelDeviation.toFixed(1)} mm</div>
              <div className="text-xs text-gray-500">Std Dev: {result.summary.standardDeviation.toFixed(1)}mm</div>
            </div>
          </div>

          {/* Compliance Badge */}
          <div className={`rounded-xl p-4 flex items-center gap-3 ${result.summary.certificationReady ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            {result.summary.certificationReady ? (
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            )}
            <div>
              <div className={`font-medium ${result.summary.certificationReady ? 'text-green-800' : 'text-amber-800'}`}>
                {result.summary.certificationReady ? 'Certificate Ready' : 'Not Ready for Certification'}
              </div>
              {result.summary.issues.length > 0 && (
                <ul className="text-xs text-gray-600 mt-1">
                  {result.summary.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                </ul>
              )}
            </div>
          </div>

          {/* Deviation Profile SVG */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-medium text-gray-900 mb-3">Deviation Profile</h4>
            <DeviationProfileSvg comparisons={result.comparisons} tolerance={tolerance.level} />
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h4 className="font-medium text-gray-900">As-Built Comparison Table</h4>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Chainage</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Design RL</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">As-Built RL</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Deviation</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Tolerance</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparisons.map((row, i) => (
                    <tr key={i} className={row.pass ? 'bg-white' : 'bg-red-50'}>
                      <td className="px-4 py-2 font-mono text-xs">{row.chainage.toFixed(0)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{row.designLevel.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{row.asBuiltLevel.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{row.deviation > 0 ? '+' : ''}{row.deviation.toFixed(1)} mm</td>
                      <td className="px-4 py-2 text-center text-xs text-gray-500">±{row.tolerance}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.pass ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {row.pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── DEVIATION PROFILE SVG ────────────────────────────────────────────────────

function DeviationProfileSvg({ comparisons, tolerance }: { comparisons: Array<{ chainage: number; deviation: number; pass: boolean }>; tolerance: number }) {
  if (comparisons.length === 0) return null

  const width = 900
  const height = 200
  const margin = { top: 20, right: 20, bottom: 40, left: 60 }

  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  const maxCh = Math.max(...comparisons.map(c => c.chainage))
  const minCh = Math.min(...comparisons.map(c => c.chainage))
  const maxDev = Math.max(tolerance * 1.5, Math.max(...comparisons.map(c => Math.abs(c.deviation))))

  const scaleX = (ch: number) => margin.left + ((ch - minCh) / (maxCh - minCh || 1)) * plotW
  const scaleY = (dev: number) => margin.top + plotH / 2 - (dev / maxDev) * (plotH / 2)

  const polyline = comparisons.map(c => `${scaleX(c.chainage)},${scaleY(c.deviation)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Tolerance band */}
      <rect x={margin.left} y={scaleY(tolerance)} width={plotW} height={scaleY(-tolerance) - scaleY(tolerance)} fill="#dcfce7" />
      <line x1={margin.left} y1={scaleY(0)} x2={width - margin.right} y2={scaleY(0)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4,2" />
      <line x1={margin.left} y1={scaleY(tolerance)} x2={width - margin.right} y2={scaleY(tolerance)} stroke="#16a34a" strokeWidth={1} strokeDasharray="4,2" />
      <line x1={margin.left} y1={scaleY(-tolerance)} x2={width - margin.right} y2={scaleY(-tolerance)} stroke="#16a34a" strokeWidth={1} strokeDasharray="4,2" />

      {/* Data line */}
      <polyline fill="none" stroke="#2563eb" strokeWidth={1.5} points={polyline} />

      {/* Points */}
      {comparisons.map((c, i) => (
        <circle key={i} cx={scaleX(c.chainage)} cy={scaleY(c.deviation)} r={3}
          fill={c.pass ? '#16a34a' : '#dc2626'} />
      ))}

      {/* Labels */}
      <text x={width / 2} y={height - 5} textAnchor="middle" className="text-xs" fill="#6b7280">Chainage (m)</text>
      <text x={10} y={height / 2} textAnchor="middle" className="text-xs" fill="#6b7280" transform={`rotate(-90, 10, ${height / 2})`}>Deviation (mm)</text>
      <text x={margin.left + 4} y={scaleY(tolerance) - 4} className="text-xs" fill="#16a34a">+{tolerance}</text>
      <text x={margin.left + 4} y={scaleY(-tolerance) + 12} className="text-xs" fill="#16a34a">-{tolerance}</text>
    </svg>
  )
}
