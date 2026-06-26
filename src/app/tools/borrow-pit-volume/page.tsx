'use client';

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface GridPoint {
  id: number
  easting: number
  northing: number
  groundLevel: number
  designLevel: number
}

export default function BorrowPitVolumePage() {
  const { t } = useLanguage()
  const [gridSize, setGridSize] = useState(10)
  const [designElevation, setDesignElevation] = useState(100)
  const [points, setPoints] = useState<GridPoint[]>([
    { id: 1, easting: 0, northing: 0, groundLevel: 98.5, designLevel: 100 },
    { id: 2, easting: 10, northing: 0, groundLevel: 99.2, designLevel: 100 },
    { id: 3, easting: 20, northing: 0, groundLevel: 100.1, designLevel: 100 },
    { id: 4, easting: 0, northing: 10, groundLevel: 97.8, designLevel: 100 },
    { id: 5, easting: 10, northing: 10, groundLevel: 98.9, designLevel: 100 },
    { id: 6, easting: 20, northing: 10, groundLevel: 99.5, designLevel: 100 },
    { id: 7, easting: 0, northing: 20, groundLevel: 96.5, designLevel: 100 },
    { id: 8, easting: 10, northing: 20, groundLevel: 97.2, designLevel: 100 },
    { id: 9, easting: 20, northing: 20, groundLevel: 98.0, designLevel: 100 },
  ])

  const addPoint = () => {
    const lastPoint = points[points.length - 1]
    const newId = points.length + 1
    const newEasting = lastPoint.easting + gridSize
    const newNorthing = lastPoint.northing
    setPoints([...points, { id: newId, easting: newEasting, northing: newNorthing, groundLevel: 100, designLevel: designElevation }])
  }

  const updatePoint = (id: number, field: keyof GridPoint, value: number) => {
    setPoints(points.map((p: any) => p.id === id ? { ...p, [field]: value } : p))
  }

  const removePoint = (id: number) => {
    setPoints(points.filter((p: any) => p.id !== id))
  }

  const computeVolume = () => {
    if (points.length < 4) return { cut: 0, fill: 0, net: 0 }

    const rows = new Map<number, GridPoint[]>()
    points.forEach((p: any) => {
      const row = rows.get(p.northing) || []
      row.push(p)
      rows.set(p.northing, row.sort((a: any, b: any) => a.easting - b.easting))
    })

    const sortedRows = Array.from(rows.values()).sort((a: any, b: any) => a[0].northing - b[0].northing)
    
    let totalCut = 0
    let totalFill = 0

    for (let i = 0; i < sortedRows.length - 1; i++) {
      const row1 = sortedRows[i]
      const row2 = sortedRows[i + 1]
      const length = row2[0].northing - row1[0].northing

      for (let j = 0; j < row1.length - 1; j++) {
        const p1 = row1[j]
        const p2 = row1[j + 1]
        const p3 = row2[j]
        const p4 = row2[j + 1]

        const width = p2.easting - p1.easting

        const h1 = designElevation - p1.groundLevel
        const h2 = designElevation - p2.groundLevel
        const h3 = designElevation - p3.groundLevel
        const h4 = designElevation - p4.groundLevel

        const area = ((h1 + h2 + h3 + h4) / 4) * width * length
        if (area > 0) totalCut += area
        else totalFill += Math.abs(area)
      }
    }

    return { cut: totalCut, fill: totalFill, net: totalCut - totalFill }
  }

  const volume = computeVolume()
  const inputClass = 'w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none transition-colors'
  const smallInputClass = 'bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-[var(--text-primary)] text-right focus:border-[var(--accent)] outline-none'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.borrowPitVolume')}
        subtitle={t('tools.borrowPitVolumeDesc')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Grid Size (m)</label>
              <input
                type="number"
                value={gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className={inputClass}
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Design Elevation (m)</label>
              <input
                type="number"
                step="0.01"
                value={designElevation}
                onChange={e => {
                  const val = Number(e.target.value)
                  setDesignElevation(val)
                  setPoints(points.map((p: any) => ({ ...p, designLevel: val })))
                }}
                className={inputClass}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[500px] table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="text-right">Easting (m)</th>
                    <th className="text-right">Northing (m)</th>
                    <th className="text-right">Ground Level (m)</th>
                    <th className="text-right">Cut/Fill (m)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          value={p.easting}
                          onChange={e => updatePoint(p.id, 'easting', Number(e.target.value))}
                          className={`w-20 ${smallInputClass}`}
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          value={p.northing}
                          onChange={e => updatePoint(p.id, 'northing', Number(e.target.value))}
                          className={`w-20 ${smallInputClass}`}
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={p.groundLevel}
                          onChange={e => updatePoint(p.id, 'groundLevel', Number(e.target.value))}
                          className={`w-24 ${smallInputClass}`}
                        />
                      </td>
                      <td className="text-right font-mono">
                        <span className={p.groundLevel < designElevation ? 'text-green-400' : 'text-amber-400'}>
                          {designElevation - p.groundLevel > 0 ? '+' : ''}{(designElevation - p.groundLevel).toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => removePoint(p.id)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={addPoint}
            className="btn btn-secondary"
          >
            {t('toolUI.addPoint')}
          </button>
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <span className="label">Volume Summary</span>
            </div>
            <div className="card-body space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Cut Volume</span>
                <span className="text-2xl font-bold text-green-400">{volume.cut.toFixed(2)} m³</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Fill Volume</span>
                <span className="text-2xl font-bold text-amber-400">{volume.fill.toFixed(2)} m³</span>
              </div>
              <div className="border-t border-[var(--border-color)] my-2"></div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Net Volume</span>
                <span className={`text-2xl font-bold ${volume.net >= 0 ? 'text-green-400' : 'text-amber-400'}`}>
                  {volume.net.toFixed(2)} m³
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Method</h4>
              <p className="text-xs text-[var(--text-muted)]">
                Grid Method (Average Height)<br/>
                V = ((h1 + h2 + h3 + h4) / 4) x width x length
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
