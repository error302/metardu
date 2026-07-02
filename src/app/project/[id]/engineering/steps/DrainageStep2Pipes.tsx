'use client'

import { useState } from 'react'
import type { DrainageData, PipeRun } from '@/types/engineering'
import { MANNING_N } from '@/lib/engineering/drainageDesign'

/**
 * Drainage Step 2 — Pipe Runs (connect manholes, calculate gradients).
 *
 * Extracted verbatim from src/app/project/[id]/engineering/page.tsx.
 * Uses Manning's equation to compute velocity & full-bore capacity.
 */
export function DrainageStep2Pipes({
  data,
  onSave
}: {
  data: DrainageData | null
  onSave: (pipeRuns: PipeRun[]) => void
}) {
  const manholes = data?.manholes || []

  const computePipes = (): PipeRun[] => {
    if (manholes.length < 2) return []

    const pipes: PipeRun[] = []
    for (let i = 0; i < manholes.length - 1; i++) {
      const mh1 = manholes[i]
      const mh2 = manholes[i + 1]

      const length = mh2.chainage - mh1.chainage
      const fall = mh1.invertLevelOut - mh2.invertLevelOut
      const gradient = fall / length
      const diameter = mh2.pipeDiameterOut / 1000

      const manningN = MANNING_N[mh2.pipeMaterial as keyof typeof MANNING_N] || 0.013
      const velocity = gradient > 0 ? (1 / manningN) * Math.pow(diameter, 2/3) * Math.pow(gradient, 0.5) : 0
      const fullBore = (Math.PI * Math.pow(diameter, 2) / 4) * velocity

      pipes.push({
        fromMH: mh1.name,
        toMH: mh2.name,
        length,
        gradient: gradient * 100,
        velocity,
        fullBoreCapacity: fullBore,
        gradientStatus: gradient > 0.001 ? 'OK' : gradient > 0 ? 'TOO_FLAT' : 'TOO_STEEP'
      })
    }
    return pipes
  }

  const [autoCompute, setAutoCompute] = useState(true)
  const pipes = autoCompute ? computePipes() : data?.pipeRuns || []

  const handleSave = () => {
    onSave(pipes)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Pipe Runs</h3>
        <p className="text-zinc-400 text-sm">Connect manholes with pipe runs and calculate gradients.</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          id="autoCompute" aria-label="Autocompute"
          checked={autoCompute}
          onChange={e => setAutoCompute(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="autoCompute" className="text-sm text-zinc-400">Auto-calculate from manhole invert levels</label>
      </div>

      {pipes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>Add at least 2 manholes to compute pipe runs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="px-3 py-2 text-left">From</th>
                <th className="px-3 py-2 text-left">To</th>
                <th className="px-3 py-2 text-right">Length (m)</th>
                <th className="px-3 py-2 text-right">Gradient (%)</th>
                <th className="px-3 py-2 text-right">Velocity (m/s)</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {pipes.map((p, idx) => (
                <tr key={`${p}-${idx}`} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-white">{p.fromMH}</td>
                  <td className="px-3 py-2 text-white">{p.toMH}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.length.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.gradient.toFixed(3)}%</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.velocity.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      p.gradientStatus === 'OK' ? 'bg-green-900 text-green-400' :
                      p.gradientStatus === 'TOO_FLAT' ? 'bg-amber-900 text-amber-400' :
                      'bg-red-900 text-red-400'
                    }`}>
                      {p.gradientStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
      >
        Save Pipe Runs
      </button>
    </div>
  )
}
