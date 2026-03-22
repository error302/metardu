'use client'

import { useState } from 'react'
import { sightDistanceCheck, checkRadiusCompliance, getFrictionFactor, getMinRadius, type SightDistanceInput } from '@/lib/computations/roadDesignEngine'

export default function SightDistanceChecker() {
  const [designSpeed, setDesignSpeed] = useState('80')
  const [terrain, setTerrain] = useState<'flat' | 'rolling' | 'mountainous'>('rolling')
  const [gradient, setGradient] = useState('0')
  const [proposedSSD, setProposedSSD] = useState('')
  const [proposedRadius, setProposedRadius] = useState('')
  const [result, setResult] = useState<ReturnType<typeof sightDistanceCheck> | null>(null)
  const [radiusResult, setRadiusResult] = useState<ReturnType<typeof checkRadiusCompliance> | null>(null)

  function computeSSD() {
    const input: SightDistanceInput = {
      designSpeed: parseInt(designSpeed) || 80,
      roadClass: 'DR4',
      terrain,
      gradient: parseFloat(gradient) || 0,
      proposedSSD: proposedSSD ? parseFloat(proposedSSD) : undefined,
    }
    setResult(sightDistanceCheck(input))
  }

  function computeRadius() {
    const R = parseFloat(proposedRadius)
    if (!R) return
    const res = checkRadiusCompliance(R, parseInt(designSpeed) || 80, terrain)
    setRadiusResult(res)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Design Speed (km/h)</label>
          <input value={designSpeed} onChange={e => setDesignSpeed(e.target.value)} type="number" min="30" max="120"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Terrain</label>
          <select value={terrain} onChange={e => setTerrain(e.target.value as typeof terrain)}
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm">
            <option value="flat">Flat</option>
            <option value="rolling">Rolling</option>
            <option value="mountainous">Mountainous</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Gradient (%)</label>
          <input value={gradient} onChange={e => setGradient(e.target.value)} type="number" step="0.1"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">+ uphill, − downhill</p>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Proposed SSD (m) — optional</label>
          <input value={proposedSSD} onChange={e => setProposedSSD(e.target.value)} type="number" min="0"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={computeSSD} className="px-5 py-2 bg-[var(--accent)] text-white rounded text-sm font-medium hover:opacity-90">
          Check Sight Distance
        </button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Computed SSD (level)', `${result.ssdComputed.toFixed(2)} m`, 'RDM 1.3 §3.3'],
              ['Grade Correction', `${result.ssdGradeCorrection.toFixed(2)} m`, 'RDM 1.3 §3.3'],
              ['Minimum SSD', `${result.ssdMin} m`, 'RDM 1.3 Table 3-5'],
              ['SSD Status', result.ssdStatus === 'GREEN' ? `✓ PASS (${result.ssdMin}m min)` : `✗ FAIL`, result.ssdStatus === 'GREEN' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'],
              ['Minimum PSD', `${result.psdMin} m`, 'RDM 1.3 Table 3-6'],
              ['Friction Factor f', result.frictionFactor.toFixed(2), 'RDM 1.3 Table 3-4'],
            ].map(([label, value, source]) => (
              <div key={label} className={`bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded p-3 ${label === 'SSD Status' ? (result.ssdStatus === 'GREEN' ? 'border-green-800' : 'border-red-800') : ''}`}>
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className={`text-lg font-mono ${label === 'SSD Status' ? (result.ssdStatus === 'GREEN' ? 'text-green-400' : 'text-red-400') : 'text-[var(--text-primary)]'}`}>{value}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{source}</p>
              </div>
            ))}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium mb-2">Show Computation Steps</summary>
            <div className="space-y-1">
              {result.steps.map((step, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-2 font-mono py-1 border-b border-[var(--border-color)]/20">
                  <span className="text-[var(--text-secondary)]">{step.description}</span>
                  <span className="text-[var(--text-muted)]">=</span>
                  <span className="text-[var(--text-primary)]">{step.value}</span>
                  <span className="text-[var(--text-muted)] text-right">{step.formula}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      <hr className="border-[var(--border-color)]/50" />

      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Minimum Radius Compliance</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Proposed Radius R (m)</label>
          <input value={proposedRadius} onChange={e => setProposedRadius(e.target.value)} type="number" min="1"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Min Radius for {designSpeed}km/h, {terrain}</label>
          <div className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm font-mono h-[42px] flex items-center">
            {getMinRadius(parseInt(designSpeed) || 80, terrain)} m
          </div>
        </div>
        <div className="flex items-end">
          <button onClick={computeRadius} className="px-5 py-2 bg-[var(--accent)] text-white rounded text-sm font-medium hover:opacity-90">
            Check Compliance
          </button>
        </div>
      </div>

      {radiusResult && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Minimum Radius', `${radiusResult.minRadius.toFixed(0)} m`, 'RDM 1.3 Table 3-3'],
            ['Proposed / Min Ratio', `${radiusResult.ratio.toFixed(3)}×`, 'RDM 1.3 Table 3-3'],
            ['Compliance Status', radiusResult.status === 'GREEN' ? '✓ PASS — R ≥ Rmin' : '✗ FAIL — R < Rmin', radiusResult.status === 'GREEN' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'],
          ].map(([label, value, source]) => (
            <div key={label} className={`bg-[var(--bg-tertiary)] border rounded p-3 ${radiusResult.status === 'GREEN' && label.includes('Compliance') ? 'border-green-800' : label.includes('Compliance') ? 'border-red-800' : 'border-[var(--border-color)]'}`}>
              <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
              <p className={`text-lg font-mono ${label.includes('Compliance') ? (radiusResult.status === 'GREEN' ? 'text-green-400' : 'text-red-400') : 'text-[var(--text-primary)]'}`}>{value}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{source}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
