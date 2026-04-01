'use client'

import { useState } from 'react'
import { DRAINAGE_STANDARDS } from '@/lib/standards/engineering'

export default function PipeGradientPage() {
  const [invertIn, setInvertIn] = useState(100.0)
  const [invertOut, setInvertOut] = useState(99.5)
  const [length, setLength] = useState(50)
  const [diameter, setDiameter] = useState(300)
  const [material, setMaterial] = useState<'HDPE' | 'Concrete' | 'uPVC' | 'VCP'>('HDPE')

  const gradient = ((invertIn - invertOut) / length) * 100
  const velocity = gradient > 0 ? (1 / DRAINAGE_STANDARDS.manningN[material]) * Math.pow(diameter / 1000 / 4, 2/3) * Math.sqrt(gradient / 100) : 0
  const capacity = velocity * Math.PI * Math.pow(diameter / 1000, 2) / 4 * 1000

  const status = gradient < DRAINAGE_STANDARDS.minGradient ? 'TOO_FLAT' : gradient > DRAINAGE_STANDARDS.maxGradient ? 'TOO_STEEP' : 'OK'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Pipe Gradient Check</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Verify pipe gradient and calculate velocity/capacity using Manning's Equation
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Invert Level In (m)</label>
              <input
                type="number"
                step="0.001"
                value={invertIn}
                onChange={e => setInvertIn(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Invert Level Out (m)</label>
              <input
                type="number"
                step="0.001"
                value={invertOut}
                onChange={e => setInvertOut(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Pipe Length (m)</label>
              <input
                type="number"
                value={length}
                onChange={e => setLength(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Diameter (mm)</label>
              <select
                value={diameter}
                onChange={e => setDiameter(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              >
                <option value={150}>150mm (6")</option>
                <option value={225}>225mm (9")</option>
                <option value={300}>300mm (12")</option>
                <option value={375}>375mm (15")</option>
                <option value={450}>450mm (18")</option>
                <option value={525}>525mm (21")</option>
                <option value={600}>600mm (24")</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Pipe Material</label>
            <select
              value={material}
              onChange={e => setMaterial(e.target.value as any)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
            >
              <option value="HDPE">HDPE (n=0.011)</option>
              <option value="Concrete">Concrete (n=0.013)</option>
              <option value="uPVC">uPVC (n=0.011)</option>
              <option value="VCP">VCP (n=0.013)</option>
            </select>
          </div>

          <div className={`p-4 rounded-lg border ${
            status === 'OK' ? 'bg-green-900/20 border-green-700' :
            status === 'TOO_FLAT' ? 'bg-red-900/20 border-red-700' :
            'bg-amber-900/20 border-amber-700'
          }`}>
            <div className="text-sm text-zinc-400 mb-1">Gradient Status</div>
            <div className={`text-2xl font-bold ${
              status === 'OK' ? 'text-green-400' :
              status === 'TOO_FLAT' ? 'text-red-400' :
              'text-amber-400'
            }`}>
              {status === 'OK' ? '✓ PASS' : status === 'TOO_FLAT' ? '✗ TOO FLAT' : '⚠ TOO STEEP'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="text-sm text-zinc-400 mb-1">Gradient</div>
              <div className="text-xl font-bold text-white">{gradient.toFixed(3)}%</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
              <div className="text-sm text-zinc-400 mb-1">Velocity</div>
              <div className="text-xl font-bold text-amber-400">{velocity.toFixed(2)} m/s</div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <div className="text-sm text-zinc-400 mb-1">Full Bore Capacity</div>
            <div className="text-lg font-medium text-white">{capacity.toFixed(2)} l/s</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-zinc-700 rounded-lg p-4">
            <h3 className="font-medium text-white mb-3">Standards Reference</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Min Gradient:</span>
                <span className="text-white">{DRAINAGE_STANDARDS.minGradient}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Max Gradient:</span>
                <span className="text-white">{DRAINAGE_STANDARDS.maxGradient}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Min Velocity:</span>
                <span className="text-white">{DRAINAGE_STANDARDS.minVelocity} m/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Max Velocity:</span>
                <span className="text-white">{DRAINAGE_STANDARDS.maxVelocity} m/s</span>
              </div>
            </div>
          </div>

          <div className="border border-zinc-700 rounded-lg p-4">
            <h3 className="font-medium text-white mb-3">Manning's n Values</h3>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(DRAINAGE_STANDARDS.manningN).map(([mat, n]) => (
                  <tr key={mat} className="border-b border-zinc-800">
                    <td className="py-2 text-zinc-400">{mat}</td>
                    <td className="py-2 text-right text-white">n = {n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-zinc-700 rounded-lg p-4">
            <h3 className="font-medium text-white mb-3">Formula</h3>
            <p className="text-sm text-zinc-400 font-mono">
              V = (1/n) × R^(2/3) × S^(1/2)<br/>
              <span className="text-zinc-500">Where: n=Manning's, R=hydraulic radius, S=gradient</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}