'use client'

import { useState } from 'react'
import { adjustNetwork, Station, Observation, AdjustmentResult } from '@/lib/survey/networkAdjustment'
import { generateNetworkDXF } from '@/lib/survey/networkAdjustmentDXF'

interface Props {
  projectId: string
  projectData: Record<string, any>
  surveyorProfile?: { fullName: string; registrationNumber: string; firmName: string } | null
}

const EMPTY_STATION: Omit<Station, 'id'> = {
  name: '', easting: 0, northing: 0, elevation: 0, isFixed: false,
}

const EMPTY_OBS: Omit<Observation, 'from' | 'to'> = {
  deltaE: 0, deltaN: 0, deltaH: 0, stdDev: 0.005,
}

export function NetworkAdjustmentPanel({ projectId, projectData, surveyorProfile }: Props) {
  const [stations, setStations] = useState<Station[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [result, setResult] = useState<AdjustmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const addStation = () => {
    setStations(prev => [...prev, {
      ...EMPTY_STATION,
      id: `stn-${Date.now()}`,
    }])
  }

  const updateStation = (id: string, field: keyof Station, value: any) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const removeStation = (id: string) => {
    setStations(prev => prev.filter(s => s.id !== id))
    setObservations(prev => prev.filter(o => o.from !== id && o.to !== id))
  }

  const addObservation = () => {
    if (stations.length < 2) return
    setObservations(prev => [...prev, {
      ...EMPTY_OBS,
      from: stations[0].id,
      to: stations[1].id,
    }])
  }

  const updateObservation = (idx: number, field: keyof Observation, value: any) => {
    setObservations(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o))
  }

  const removeObservation = (idx: number) => {
    setObservations(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCompute = () => {
    setError(null)
    setResult(null)
    try {
      const res = adjustNetwork(stations, observations)
      setResult(res)
      saveResult(res)
    } catch (err: any) {
      setError(err.message ?? 'Adjustment failed.')
    }
  }

  const saveResult = async (res: AdjustmentResult) => {
    setSaving(true)
    try {
      await fetch(`/api/project/${projectId}/network-adjustment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stations,
          observations,
          adjusted_stations: res.adjustedStations,
          summary: {
            iterations: res.iterations,
            sigma_zero: res.sigmaZero,
            dof: res.degreesOfFreedom,
            passed_tolerance: res.passedTolerance,
          },
          status: res.passedTolerance ? 'adjusted' : 'failed',
        }),
      })
    } catch {
      // non-fatal
    } finally {
      setSaving(false)
    }
  }

  const handleExportDXF = async () => {
    if (!result) return
    const profile = surveyorProfile ?? { fullName: 'Unknown', registrationNumber: 'N/A', firmName: 'N/A' }
    const dxfString = generateNetworkDXF({
      adjustedStations: result.adjustedStations,
      observations,
      projectData,
      surveyorProfile: profile,
    })
    const blob = new Blob([dxfString], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `network-adjustment-${projectId}.dxf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">GPS Network Adjustment</h2>
        <p className="text-sm text-zinc-400">
          Least squares adjustment of GPS/GNSS baselines. Arc 1960 / UTM Zone 37S.
          At least one fixed control station required.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-zinc-300">Control Stations</h3>
          <button
            onClick={addStation}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Add Station
          </button>
        </div>

        {stations.length === 0 && (
          <p className="text-sm text-zinc-500 italic">No stations added yet.</p>
        )}

        <div className="space-y-3">
          {stations.map(s => (
            <div key={s.id} className="grid grid-cols-7 gap-2 items-center bg-zinc-800 p-3 rounded-lg">
              <input
                className="col-span-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="Name"
                value={s.name}
                onChange={e => updateStation(s.id, 'name', e.target.value)}
              />
              <input
                type="number" step="0.001"
                className="col-span-2 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="Easting (m)"
                value={s.easting || ''}
                onChange={e => updateStation(s.id, 'easting', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number" step="0.001"
                className="col-span-2 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="Northing (m)"
                value={s.northing || ''}
                onChange={e => updateStation(s.id, 'northing', parseFloat(e.target.value) || 0)}
              />
              <label className="flex items-center gap-1 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={s.isFixed}
                  onChange={e => updateStation(s.id, 'isFixed', e.target.checked)}
                />
                Fixed
              </label>
              <button
                onClick={() => removeStation(s.id)}
                className="text-red-400 text-sm hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-zinc-300">Baseline Observations</h3>
          <button
            onClick={addObservation}
            disabled={stations.length < 2}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-40"
          >
            + Add Baseline
          </button>
        </div>

        {observations.length === 0 && (
          <p className="text-sm text-zinc-500 italic">No baselines added yet.</p>
        )}

        <div className="space-y-3">
          {observations.map((obs, idx) => (
            <div key={idx} className="grid grid-cols-7 gap-2 items-center bg-zinc-800 p-3 rounded-lg">
              <select
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                value={obs.from}
                onChange={e => updateObservation(idx, 'from', e.target.value)}
              >
                {stations.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
              </select>
              <select
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                value={obs.to}
                onChange={e => updateObservation(idx, 'to', e.target.value)}
              >
                {stations.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
              </select>
              <input
                type="number" step="0.001"
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="ΔE (m)"
                value={obs.deltaE || ''}
                onChange={e => updateObservation(idx, 'deltaE', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number" step="0.001"
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="ΔN (m)"
                value={obs.deltaN || ''}
                onChange={e => updateObservation(idx, 'deltaN', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number" step="0.001"
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="ΔH (m)"
                value={obs.deltaH || ''}
                onChange={e => updateObservation(idx, 'deltaH', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number" step="0.0001"
                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white"
                placeholder="σ (m)"
                value={obs.stdDev || ''}
                onChange={e => updateObservation(idx, 'stdDev', parseFloat(e.target.value) || 0.005)}
              />
              <button
                onClick={() => removeObservation(idx)}
                className="text-red-400 text-sm hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <button
          onClick={handleCompute}
          disabled={stations.length < 2 || observations.length === 0}
          className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 font-medium"
        >
          Run Adjustment
        </button>
        {result && (
          <button
            onClick={handleExportDXF}
            className="bg-gray-700 text-white px-5 py-2 rounded-lg hover:bg-gray-600 font-medium"
          >
            Export DXF
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-5">
          <div className={`p-4 rounded-lg border ${result.passedTolerance ? 'bg-green-900/30 border-green-700' : 'bg-amber-900/30 border-amber-700'}`}>
            <h3 className="font-semibold mb-2 text-white">
              {result.passedTolerance ? '✅ Adjustment Passed' : '⚠️ Adjustment — Check Residuals'}
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-zinc-300">
              <div><span className="text-zinc-500">σ₀ (ref std dev)</span><br /><strong>{result.sigmaZero.toFixed(4)}</strong></div>
              <div><span className="text-zinc-500">Degrees of freedom</span><br /><strong>{result.degreesOfFreedom}</strong></div>
              <div><span className="text-zinc-500">Iterations</span><br /><strong>{result.iterations}</strong></div>
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-3 text-sm text-amber-400 list-disc list-inside space-y-1">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-medium text-zinc-300 mb-2">Adjusted Coordinates</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse text-zinc-300">
                <thead>
                  <tr className="bg-zinc-800 text-left">
                    <th className="px-3 py-2 border border-zinc-700">Station</th>
                    <th className="px-3 py-2 border border-zinc-700">Easting (m)</th>
                    <th className="px-3 py-2 border border-zinc-700">Northing (m)</th>
                    <th className="px-3 py-2 border border-zinc-700">Residual E (m)</th>
                    <th className="px-3 py-2 border border-zinc-700">Residual N (m)</th>
                    <th className="px-3 py-2 border border-zinc-700">Semi-major (m)</th>
                    <th className="px-3 py-2 border border-zinc-700">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {result.adjustedStations.map(s => (
                    <tr key={s.id} className="hover:bg-zinc-800/50">
                      <td className="px-3 py-2 border border-zinc-700 font-medium">{s.name || s.id}</td>
                      <td className="px-3 py-2 border border-zinc-700 font-mono">{s.easting.toFixed(4)}</td>
                      <td className="px-3 py-2 border border-zinc-700 font-mono">{s.northing.toFixed(4)}</td>
                      <td className="px-3 py-2 border border-zinc-700 font-mono">{s.residualE.toFixed(5)}</td>
                      <td className="px-3 py-2 border border-zinc-700 font-mono">{s.residualN.toFixed(5)}</td>
                      <td className="px-3 py-2 border border-zinc-700 font-mono">{s.semiMajor.toFixed(5)}</td>
                      <td className="px-3 py-2 border border-zinc-700">{s.isFixed ? '🔒 Fixed' : 'Free'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {saving && <p className="text-sm text-zinc-500 italic">Saving results…</p>}
        </section>
      )}
    </div>
  )
}