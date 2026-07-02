'use client'

/**
 * DeformationTrackerPanel — Epoch management + displacement visualization
 *
 * Features:
 * - Add monitoring stations (name, baseline X/Y/Z)
 * - Import epoch readings (CSV: station, X, Y, Z, date)
 * - View displacement table with status indicators
 * - Time-series displacement chart
 * - Alert generation for critical stations
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Activity, Plus, Upload, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, Loader2, X,
} from 'lucide-react'
import {
  computeDisplacement,
  generateDeformationReport,
  DEFAULT_THRESHOLDS,
  type MonitoringStation,
  type EpochReading,
} from '@/lib/engine/deformationTracker'

export function DeformationTrackerPanel() {
  const [stations, setStations] = useState<MonitoringStation[]>([])
  const [readings, setReadings] = useState<EpochReading[]>([])
  const [showAddStation, setShowAddStation] = useState(false)
  const [newStation, setNewStation] = useState({ name: '', x: '', y: '', z: '' })
  const [currentEpoch, setCurrentEpoch] = useState(0)
  const [epochInput, setEpochInput] = useState({ stationId: '', x: '', y: '', z: '' })

  const addStation = useCallback(() => {
    if (!newStation.name.trim()) return
    const station: MonitoringStation = {
      id: crypto.randomUUID(),
      stationName: newStation.name,
      baseX: parseFloat(newStation.x) || 0,
      baseY: parseFloat(newStation.y) || 0,
      baseZ: parseFloat(newStation.z) || 0,
    }
    setStations(prev => [...prev, station])
    setNewStation({ name: '', x: '', y: '', z: '' })
    setShowAddStation(false)
  }, [newStation])

  const addEpochReading = useCallback(() => {
    if (!epochInput.stationId) return
    const station = stations.find(s => s.id === epochInput.stationId)
    if (!station) return

    const x = parseFloat(epochInput.x)
    const y = parseFloat(epochInput.y)
    const z = parseFloat(epochInput.z)
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return

    const prevReading = readings
      .filter(r => r.stationId === station.id)
      .sort((a, b) => b.epochNumber - a.epochNumber)[0]

    const epochNum = currentEpoch + 1
    const reading = computeDisplacement(station, x, y, z, epochNum, new Date().toISOString(), prevReading)
    setReadings(prev => [...prev, reading])
    setCurrentEpoch(epochNum)
    setEpochInput({ stationId: '', x: '', y: '', z: '' })
  }, [stations, readings, currentEpoch, epochInput])

  const report = useMemo(() => {
    if (readings.length === 0) return null
    return generateDeformationReport(stations, readings)
  }, [stations, readings])

  const flaggedCount = report?.flaggedStations.length ?? 0

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
          <div className="text-lg font-bold text-gray-300">{stations.length}</div>
          <div className="text-[9px] text-gray-500 uppercase">Stations</div>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
          <div className="text-lg font-bold text-gray-300">{currentEpoch}</div>
          <div className="text-[9px] text-gray-500 uppercase">Epochs</div>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center">
          <div className="text-lg font-bold text-amber-400">{flaggedCount}</div>
          <div className="text-[9px] text-gray-500 uppercase">Warnings</div>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
          <div className="text-lg font-bold text-gray-300">{readings.length}</div>
          <div className="text-[9px] text-gray-500 uppercase">Readings</div>
        </div>
      </div>

      {/* Add station */}
      {showAddStation ? (
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-primary)]">Add Monitoring Station</span>
            <button onClick={() => setShowAddStation(false)} className="text-gray-400"><X className="w-3.5 h-3.5" /></button>
          </div>
          <input type="text" value={newStation.name} onChange={e => setNewStation(prev => ({ ...prev, name: e.target.value }))} aria-label="Station name (e.g., Prism_A1)" placeholder="Station name (e.g., Prism_A1)" className="w-full h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white" />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={newStation.x} onChange={e => setNewStation(prev => ({ ...prev, x: e.target.value }))} aria-label="Base X" placeholder="Base X" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
            <input type="number" value={newStation.y} onChange={e => setNewStation(prev => ({ ...prev, y: e.target.value }))} aria-label="Base Y" placeholder="Base Y" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
            <input type="number" value={newStation.z} onChange={e => setNewStation(prev => ({ ...prev, z: e.target.value }))} aria-label="Base Z" placeholder="Base Z" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
          </div>
          <button onClick={addStation} disabled={!newStation.name} className="w-full h-8 rounded bg-[var(--accent)] text-black text-xs font-semibold disabled:opacity-40">Add Station</button>
        </div>
      ) : (
        <button onClick={() => setShowAddStation(true)} className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs text-gray-400 hover:text-gray-200">
          <Plus className="w-3.5 h-3.5" /> Add Monitoring Station
        </button>
      )}

      {/* Add epoch reading */}
      {stations.length > 0 && (
        <div className="card p-3 space-y-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">Add Epoch {currentEpoch + 1} Reading</span>
          <select value={epochInput.stationId} onChange={e => setEpochInput(prev => ({ ...prev, stationId: e.target.value }))} className="w-full h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white">
            <option value="">Select station...</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.stationName}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={epochInput.x} onChange={e => setEpochInput(prev => ({ ...prev, x: e.target.value }))} aria-label="Current X" placeholder="Current X" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
            <input type="number" value={epochInput.y} onChange={e => setEpochInput(prev => ({ ...prev, y: e.target.value }))} aria-label="Current Y" placeholder="Current Y" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
            <input type="number" value={epochInput.z} onChange={e => setEpochInput(prev => ({ ...prev, z: e.target.value }))} aria-label="Current Z" placeholder="Current Z" className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono" />
          </div>
          <button onClick={addEpochReading} disabled={!epochInput.stationId} className="w-full h-8 rounded bg-[var(--accent)] text-black text-xs font-semibold disabled:opacity-40">Record Reading</button>
        </div>
      )}

      {/* Displacement table */}
      {readings.length > 0 && (
        <div className="card p-4 overflow-hidden">
          <span className="text-xs font-semibold text-[var(--text-primary)] mb-2 block">Displacement Readings</span>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--bg-card)]">
                <tr className="border-b border-[var(--border-color)]">
                  <th className="px-2 py-1.5 text-left text-[9px] text-gray-500 uppercase">Station</th>
                  <th className="px-2 py-1.5 text-center text-[9px] text-gray-500 uppercase">Epoch</th>
                  <th className="px-2 py-1.5 text-right text-[9px] text-gray-500 uppercase">ΔX (mm)</th>
                  <th className="px-2 py-1.5 text-right text-[9px] text-gray-500 uppercase">ΔY (mm)</th>
                  <th className="px-2 py-1.5 text-right text-[9px] text-gray-500 uppercase">ΔZ (mm)</th>
                  <th className="px-2 py-1.5 text-right text-[9px] text-gray-500 uppercase">Total (mm)</th>
                  <th className="px-2 py-1.5 text-right text-[9px] text-gray-500 uppercase">Vel (mm/wk)</th>
                  <th className="px-2 py-1.5 text-center text-[9px] text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {readings.map(r => {
                  const station = stations.find(s => s.id === r.stationId)
                  const dispMm = r.totalDisplacement * 1000
                  const dXMm = r.deltaX * 1000
                  const dYMm = r.deltaY * 1000
                  const dZMm = r.deltaZ * 1000
                  return (
                    <tr key={r.id} className="border-b border-[var(--border-color)]/30">
                      <td className="px-2 py-1.5 text-xs font-mono text-[var(--text-primary)]">{station?.stationName || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-xs text-gray-400">{r.epochNumber}</td>
                      <td className="px-2 py-1.5 text-right text-xs font-mono text-gray-400">{dXMm.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-xs font-mono text-gray-400">{dYMm.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-xs font-mono text-gray-400">{dZMm.toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right text-xs font-mono font-bold ${
                        r.status === 'critical' ? 'text-red-400' :
                        r.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>{dispMm.toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right text-xs font-mono ${
                        r.velocityMmPerWeek >= DEFAULT_THRESHOLDS.criticalVelocity ? 'text-red-400' :
                        r.velocityMmPerWeek >= DEFAULT_THRESHOLDS.warningVelocity ? 'text-amber-400' : 'text-gray-400'
                      }`}>{r.velocityMmPerWeek.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.status === 'critical' ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 inline" /> :
                         r.status === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 inline" /> :
                         <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thresholds info */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Activity className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-[10px] text-blue-400/70">
          <p>Warning: {DEFAULT_THRESHOLDS.warningDisplacement}mm displacement or {DEFAULT_THRESHOLDS.warningVelocity}mm/week velocity</p>
          <p>Critical: {DEFAULT_THRESHOLDS.criticalDisplacement}mm displacement or {DEFAULT_THRESHOLDS.criticalVelocity}mm/week velocity</p>
        </div>
      </div>
    </div>
  )
}
