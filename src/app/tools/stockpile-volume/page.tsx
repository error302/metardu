'use client'

import { useState } from 'react'

interface SurfacePoint {
  id: number
  x: number
  y: number
  z: number
}

interface VolumeResult {
  method: string
  volume: number
  area: number
}

export default function StockpileVolumePage() {
  const [shape, setShape] = useState<'ellipse' | 'rectangle'>('ellipse')
  const [length, setLength] = useState(50)
  const [width, setWidth] = useState(30)
  const [height, setHeight] = useState(8)
  const [slopeAngle, setSlopeAngle] = useState(35)
  const [bulkFactor, setBulkFactor] = useState(1.15)

  const computeVolumes = (): VolumeResult[] => {
    const results: VolumeResult[] = []

    if (shape === 'ellipse') {
      const radiusLong = length / 2
      const radiusShort = width / 2
      const baseArea = Math.PI * radiusLong * radiusShort
      
      const volCone = (1/3) * Math.PI * radiusLong * radiusShort * height
      results.push({ method: 'Elliptical Cone', volume: volCone, area: baseArea })

      const volEllipsoid = (2/3) * Math.PI * radiusLong * radiusShort * height
      results.push({ method: 'Elliptical Hemisphere', volume: volEllipsoid, area: baseArea })

      const avgVol = (volCone + volEllipsoid) / 2
      results.push({ method: 'Average', volume: avgVol, area: baseArea })
    } else {
      const baseArea = length * width
      
      const volPyramid = (1/3) * baseArea * height
      results.push({ method: 'Rectangular Pyramid', volume: volPyramid, area: baseArea })

      const volWedge = (1/2) * baseArea * height
      results.push({ method: 'Rectangular Wedge', volume: volWedge, area: baseArea })

      const avgVol = (volPyramid + volWedge) / 2
      results.push({ method: 'Average', volume: avgVol, area: baseArea })
    }

    return results
  }

  const getSlopeAngleInDegrees = (angle: number) => {
    return Math.tan(angle * Math.PI / 180)
  }

  const computeFromAngle = () => {
    const tanAngle = getSlopeAngleInDegrees(slopeAngle)
    const radius = height / tanAngle
    
    if (shape === 'ellipse') {
      const baseArea = Math.PI * radius * (radius * 0.6)
      const volume = (2/3) * Math.PI * radius * (radius * 0.6) * height
      return { volume, area: baseArea, effectiveRadius: radius }
    } else {
      const baseArea = radius * radius
      const volume = (1/3) * baseArea * height
      return { volume, area: baseArea, effectiveRadius: radius }
    }
  }

  const volumes = computeVolumes()
  const angleResult = computeFromAngle()
  const selectedVolume = volumes[volumes.length - 1].volume
  const looseVolume = selectedVolume * bulkFactor

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Stockpile Volume Calculator</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Estimate volume of stockpiles using geometric methods
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Stockpile Shape</label>
            <div className="flex gap-3">
              <button
                onClick={() => setShape('ellipse')}
                className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition ${
                  shape === 'ellipse' 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Ellipse
              </button>
              <button
                onClick={() => setShape('rectangle')}
                className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition ${
                  shape === 'rectangle' 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Rectangle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Length (m)</label>
              <input
                type="number"
                value={length}
                onChange={e => setLength(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Width (m)</label>
              <input
                type="number"
                value={width}
                onChange={e => setWidth(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                min={1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Max Height (m)</label>
              <input
                type="number"
                step="0.1"
                value={height}
                onChange={e => setHeight(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                min={0.1}
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Slope Angle (°)</label>
              <input
                type="number"
                value={slopeAngle}
                onChange={e => setSlopeAngle(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
                min={10}
                max={45}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Bulk Factor (shrinkage/swell)</label>
            <input
              type="number"
              step="0.01"
              value={bulkFactor}
              onChange={e => setBulkFactor(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
              min={0.5}
              max={2}
            />
            <p className="text-xs text-zinc-500 mt-1">1.15 = 15% swell | 0.85 = 15% shrinkage</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-700">
            <h3 className="text-lg font-semibold text-white mb-4">Volume Results</h3>
            <div className="space-y-4">
              {volumes.map((v, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">{v.method}</span>
                  <span className="text-white font-medium">{v.volume.toFixed(2)} m³</span>
                </div>
              ))}
              <div className="h-px bg-zinc-700 my-2"></div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Base Area</span>
                <span className="text-amber-400">{volumes[0].area.toFixed(2)} m²</span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 rounded-lg border border-amber-500/50">
            <h3 className="text-lg font-semibold text-white mb-4">Adjusted Volume</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">In-situ Volume</span>
                <span className="text-2xl font-bold text-white">{selectedVolume.toFixed(2)} m³</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Loose Volume (×{bulkFactor})</span>
                <span className="text-2xl font-bold text-amber-400">{looseVolume.toFixed(2)} m³</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <h4 className="text-sm font-medium text-white mb-2">Slope Angle Method</h4>
            <p className="text-xs text-zinc-500 mb-2">
              Using {slopeAngle}° angle of repose:
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Effective Radius:</span>
              <span className="text-white">{angleResult.effectiveRadius.toFixed(1)} m</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-zinc-400">Volume:</span>
              <span className="text-white">{angleResult.volume.toFixed(2)} m³</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <h4 className="text-sm font-medium text-white mb-2">Common Slope Angles</h4>
            <div className="space-y-2 text-xs text-zinc-500">
              <div className="flex justify-between">
                <span>Sand/Gravel</span>
                <span>30-35°</span>
              </div>
              <div className="flex justify-between">
                <span>Crushed Rock</span>
                <span>35-40°</span>
              </div>
              <div className="flex justify-between">
                <span>Clay (damp)</span>
                <span>15-25°</span>
              </div>
              <div className="flex justify-between">
                <span>Topsoil (loose)</span>
                <span>30°</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-700">
            <h4 className="text-sm font-medium text-white mb-2">Typical Bulk Factors</h4>
            <div className="space-y-2 text-xs text-zinc-500">
              <div className="flex justify-between">
                <span>Common Earth</span>
                <span>1.10 - 1.15</span>
              </div>
              <div className="flex justify-between">
                <span>Rock (blasted)</span>
                <span>1.20 - 1.30</span>
              </div>
              <div className="flex justify-between">
                <span>Sand</span>
                <span>1.05 - 1.10</span>
              </div>
              <div className="flex justify-between">
                <span>Clay</span>
                <span>1.05 - 1.20</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}