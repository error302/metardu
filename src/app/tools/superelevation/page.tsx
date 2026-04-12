'use client'

import { useState } from 'react'

export default function SuperelevationPage() {
  const [designSpeed, setDesignSpeed] = useState(60)
  const [radius, setRadius] = useState(200)

  const e = Math.pow(designSpeed, 2) / (127 * radius)
  const superelevation = Math.min(e * 100, 10)
  const maxE = 10

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Superelevation Calculator</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Calculate required superelevation rate per KRDM/KeRRA | Formula: e = V²/127R
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Design Speed (km/h)</label>
            <input
              type="number"
              value={designSpeed}
              onChange={e => setDesignSpeed(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              min={20}
              max={120}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Curve Radius (m)</label>
            <input
              type="number"
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              min={25}
              max={1000}
            />
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <div className="text-sm text-zinc-400 mb-1">Calculated Superelevation</div>
            <div className="text-3xl font-bold text-amber-400">{superelevation.toFixed(2)}%</div>
            <div className="text-xs text-zinc-500 mt-1">
              Max allowable: {maxE}% per KRDM
            </div>
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <div className="text-sm text-zinc-400 mb-1">Minimum Radius Check</div>
            <div className="text-lg font-medium text-white">
              {radius >= 30 ? '✓ Pass' : '✗ Fail'} (KRDM min: 30m at {designSpeed}km/h)
            </div>
          </div>
        </div>

        <div className="border border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium text-white mb-4">Reference Table (KRDM 2017)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-2">Speed (km/h)</th>
                <th className="text-right py-2">Min Radius (m)</th>
              </tr>
            </thead>
            <tbody>
              {[
                [30, 30], [40, 60], [50, 100], [60, 150],
                [70, 230], [80, 320], [90, 430], [100, 560]
              ].map(([speed, r]) => (
                <tr key={speed} className="border-b border-zinc-800">
                  <td className="py-2 text-zinc-400">{speed}</td>
                  <td className="py-2 text-right text-zinc-400">{r}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}