'use client'

import { useState } from 'react'
import { KRDM2017, KeRRA } from '@/lib/standards/engineering'

export default function SightDistancePage() {
  const [designSpeed, setDesignSpeed] = useState(60)
  const [standard, setStandard] = useState<'KRDM2017' | 'KeRRA'>('KRDM2017')

  const std = standard === 'KRDM2017' ? KRDM2017 : KeRRA
  const ssd = std.minSSD[designSpeed] || designSpeed * 0.7 * 3
  const osd = ssd * 3.5

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Sight Distance Calculator</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Calculate Stopping Sight Distance (SSD) and Overtaking Sight Distance (OSD) per KRDM/KeRRA
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
            <label className="block text-sm text-zinc-400 mb-2">Standard</label>
            <select
              value={standard}
              onChange={e => setStandard(e.target.value as 'KRDM2017' | 'KeRRA')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
            >
              <option value="KRDM2017">KRDM 2017</option>
              <option value="KeRRA">KeRRA (Rural Roads)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="text-sm text-zinc-400 mb-1">Stopping Sight Distance</div>
              <div className="text-2xl font-bold text-amber-400">{ssd.toFixed(0)}m</div>
              <div className="text-xs text-zinc-500 mt-1">SSD = Vt + V²/254(f+g)</div>
            </div>

            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="text-sm text-zinc-400 mb-1">Overtaking Sight Distance</div>
              <div className="text-2xl font-bold text-green-400">{osd.toFixed(0)}m</div>
              <div className="text-xs text-zinc-500 mt-1">OSD ≈ 3.5 × SSD</div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <div className="text-sm text-zinc-400 mb-2">Design Check</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">SSD vs curve radius:</span>
                <span className="text-white">
                  {designSpeed >= 60 && radius >= 150 ? '✓ Adequate' : '⚠ Check radius'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-700 rounded-lg p-4">
          <h3 className="font-medium text-white mb-4">Minimum SSD (per {standard})</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-2">Speed (km/h)</th>
                <th className="text-right py-2">SSD (m)</th>
                <th className="text-right py-2">OSD (m)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(std.minSSD).map(([speed, ssdVal]) => (
                <tr key={speed} className="border-b border-zinc-800">
                  <td className="py-2 text-zinc-400">{speed}</td>
                  <td className="py-2 text-right text-white">{ssdVal}m</td>
                  <td className="py-2 text-right text-zinc-500">{(ssdVal * 3.5).toFixed(0)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const radius = 150