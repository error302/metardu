'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Compass,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  X,
  Layers,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import {
  cassiniFeetToUTM,
  utmToCassiniFeet,
} from '@/lib/geo/cassini/helmert'
import { KENYA_TOPO_SHEETS, getUtmZone } from '@/lib/geo/cassini/sheets'
import { FT_TO_M } from '@/lib/geo/cassini/constants'
import {
  utmToWGS84,
} from '@/lib/geo/cassini/verify'
import {
  geographicToUTM,
  utmToGeographic,
  latLonToMGRS,
  mgrsToLatLon,
  latLonToString,
} from '@/lib/geodesy/coordinates'

interface ConvertedState {
  cassini: {
    sheetId: string
    sheetName: string
    eastingFt: number
    northingFt: number
    eastingM: number
    northingM: number
  } | null
  utm: {
    zone: number
    hemisphere: 'N' | 'S'
    easting: number
    northing: number
  } | null
  wgs84: {
    lat: number
    lon: number
    dms: string
    mgrs: string
  } | null
}

export function InstantCoordConverter({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [sourceMode, setSourceMode] = useState<'cassini' | 'utm' | 'wgs84'>('cassini')
  
  // Cassini inputs
  const [selectedSheetId, setSelectedSheetId] = useState('148_4')
  const [cassiniUnit, setCassiniUnit] = useState<'feet' | 'meters'>('feet')
  const [cassiniE, setCassiniE] = useState('148350.0')
  const [cassiniN, setCassiniN] = useState('164200.0')

  // UTM inputs
  const [utmZone, setUtmZone] = useState<number>(37)
  const [utmHemi, setUtmHemi] = useState<'N' | 'S'>('S')
  const [utmE, setUtmE] = useState('257410.0')
  const [utmN, setUtmN] = useState('9857200.0')

  // WGS84 inputs
  const [wgs84Lat, setWgs84Lat] = useState('-1.286389')
  const [wgs84Lon, setWgs84Lon] = useState('36.817223')
  const [mgrsInput, setMgrsInput] = useState('')
  const [isMgrsMode, setIsMgrsMode] = useState(false)

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  // Keyboard shortcut listener (Alt+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        if (isOpen) {
          onClose()
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const selectedSheet = useMemo(() => {
    return KENYA_TOPO_SHEETS.find((s) => s.id === selectedSheetId) || KENYA_TOPO_SHEETS[0]
  }, [selectedSheetId])

  // Conversion calculations
  const results: ConvertedState = useMemo(() => {
    try {
      if (sourceMode === 'cassini') {
        const eVal = parseFloat(cassiniE)
        const nVal = parseFloat(cassiniN)
        if (isNaN(eVal) || isNaN(nVal)) return { cassini: null, utm: null, wgs84: null }

        const eFt = cassiniUnit === 'feet' ? eVal : eVal / FT_TO_M
        const nFt = cassiniUnit === 'feet' ? nVal : nVal / FT_TO_M
        const eM = eFt * FT_TO_M
        const nM = nFt * FT_TO_M

        const utmBatch = cassiniFeetToUTM([{ id: 'in', easting: eFt, northing: nFt }], selectedSheet)
        const utmRes = utmBatch[0]
        if (!utmRes || isNaN(utmRes.utmE) || isNaN(utmRes.utmN)) {
          return { cassini: null, utm: null, wgs84: null }
        }

        const sheetZone = getUtmZone(selectedSheet.id)
        const wgsRes = utmToWGS84(utmRes.utmE, utmRes.utmN, sheetZone)
        let mgrsStr = ''
        try {
          mgrsStr = latLonToMGRS(wgsRes.lat, wgsRes.lon, 5)
        } catch {
          mgrsStr = 'N/A'
        }

        return {
          cassini: {
            sheetId: selectedSheet.id,
            sheetName: selectedSheet.name,
            eastingFt: eFt,
            northingFt: nFt,
            eastingM: eM,
            northingM: nM,
          },
          utm: {
            zone: sheetZone,
            hemisphere: 'S',
            easting: utmRes.utmE,
            northing: utmRes.utmN,
          },
          wgs84: {
            lat: wgsRes.lat,
            lon: wgsRes.lon,
            dms: latLonToString(wgsRes.lat, wgsRes.lon),
            mgrs: mgrsStr,
          },
        }
      } else if (sourceMode === 'utm') {
        const eVal = parseFloat(utmE)
        const nVal = parseFloat(utmN)
        if (isNaN(eVal) || isNaN(nVal)) return { cassini: null, utm: null, wgs84: null }

        const wgsRes = utmToGeographic(eVal, nVal, utmZone, utmHemi)
        const cassiniBatch = utmToCassiniFeet([{ id: 'in', easting: eVal, northing: nVal }], selectedSheet)
        const cassiniRes = cassiniBatch[0]

        let mgrsStr = ''
        try {
          mgrsStr = latLonToMGRS(wgsRes.lat, wgsRes.lon, 5)
        } catch {
          mgrsStr = 'N/A'
        }

        const eFt = cassiniRes?.cassiniE ?? 0
        const nFt = cassiniRes?.cassiniN ?? 0

        return {
          cassini: {
            sheetId: selectedSheet.id,
            sheetName: selectedSheet.name,
            eastingFt: eFt,
            northingFt: nFt,
            eastingM: eFt * FT_TO_M,
            northingM: nFt * FT_TO_M,
          },
          utm: {
            zone: utmZone,
            hemisphere: utmHemi,
            easting: eVal,
            northing: nVal,
          },
          wgs84: {
            lat: wgsRes.lat,
            lon: wgsRes.lon,
            dms: latLonToString(wgsRes.lat, wgsRes.lon),
            mgrs: mgrsStr,
          },
        }
      } else {
        // WGS84 Mode
        let lat = parseFloat(wgs84Lat)
        let lon = parseFloat(wgs84Lon)

        if (isMgrsMode && mgrsInput.trim()) {
          const pt = mgrsToLatLon(mgrsInput.trim())
          if (pt) {
            lat = pt.lat
            lon = pt.lon
          }
        }

        if (isNaN(lat) || isNaN(lon)) return { cassini: null, utm: null, wgs84: null }

        const utmRes = geographicToUTM(lat, lon, utmZone)
        const cassiniBatch = utmToCassiniFeet(
          [{ id: 'in', easting: utmRes.easting, northing: utmRes.northing }],
          selectedSheet
        )
        const cassiniRes = cassiniBatch[0]

        let mgrsStr = ''
        try {
          mgrsStr = latLonToMGRS(lat, lon, 5)
        } catch {
          mgrsStr = 'N/A'
        }

        const eFt = cassiniRes?.cassiniE ?? 0
        const nFt = cassiniRes?.cassiniN ?? 0

        return {
          cassini: {
            sheetId: selectedSheet.id,
            sheetName: selectedSheet.name,
            eastingFt: eFt,
            northingFt: nFt,
            eastingM: eFt * FT_TO_M,
            northingM: nFt * FT_TO_M,
          },
          utm: {
            zone: utmRes.zone,
            hemisphere: utmRes.hemisphere,
            easting: utmRes.easting,
            northing: utmRes.northing,
          },
          wgs84: {
            lat,
            lon,
            dms: latLonToString(lat, lon),
            mgrs: mgrsStr,
          },
        }
      }
    } catch {
      return { cassini: null, utm: null, wgs84: null }
    }
  }, [
    sourceMode,
    cassiniE,
    cassiniN,
    cassiniUnit,
    selectedSheet,
    utmE,
    utmN,
    utmZone,
    utmHemi,
    wgs84Lat,
    wgs84Lon,
    isMgrsMode,
    mgrsInput,
  ])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-[var(--bg-card,#18181b)] border border-[var(--border-color,#27272a)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color,#27272a)] bg-[var(--bg-secondary,#202024)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent,#f59e0b)]/10 text-[var(--accent,#f59e0b)] flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary,#fafafa)] flex items-center gap-2">
                Instant 3-Way Coordinate Converter
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--accent,#f59e0b)]/20 text-[var(--accent,#f59e0b)] font-semibold">
                  Alt+C
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary,#a1a1aa)]">
                Cassini-Soldner (Deed) ↔ UTM Zone 36/37 ↔ WGS84 GPS & MGRS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[var(--text-muted,#71717a)] hover:text-[var(--text-primary,#fafafa)] hover:bg-white/5 flex items-center justify-center transition-colors"
            aria-label="Close coordinate converter"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Mode Tabs */}
        <div className="flex border-b border-[var(--border-color,#27272a)] bg-[var(--bg-tertiary,#141416)] px-6 pt-3 gap-2">
          <button
            onClick={() => setSourceMode('cassini')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              sourceMode === 'cassini'
                ? 'border-[var(--accent,#f59e0b)] text-[var(--accent,#f59e0b)] bg-[var(--bg-card,#18181b)]'
                : 'border-transparent text-[var(--text-muted,#71717a)] hover:text-[var(--text-primary,#fafafa)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Cassini-Soldner (Old Deed)
          </button>
          <button
            onClick={() => setSourceMode('utm')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              sourceMode === 'utm'
                ? 'border-[var(--accent,#f59e0b)] text-[var(--accent,#f59e0b)] bg-[var(--bg-card,#18181b)]'
                : 'border-transparent text-[var(--text-muted,#71717a)] hover:text-[var(--text-primary,#fafafa)]'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            UTM Grid (Zone 36/37)
          </button>
          <button
            onClick={() => setSourceMode('wgs84')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
              sourceMode === 'wgs84'
                ? 'border-[var(--accent,#f59e0b)] text-[var(--accent,#f59e0b)] bg-[var(--bg-card,#18181b)]'
                : 'border-transparent text-[var(--text-muted,#71717a)] hover:text-[var(--text-primary,#fafafa)]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            WGS84 GPS / MGRS
          </button>
        </div>

        {/* Form Inputs Area */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {sourceMode === 'cassini' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Kenya Topo Sheet / Origin Belt
                  </label>
                  <select
                    value={selectedSheetId}
                    onChange={(e) => setSelectedSheetId(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  >
                    {KENYA_TOPO_SHEETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id}) — UTM {getUtmZone(s.id)}S
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Input Measurement Unit
                  </label>
                  <div className="flex rounded-lg border border-[var(--border-color,#27272a)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCassiniUnit('feet')}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        cassiniUnit === 'feet'
                          ? 'bg-[var(--accent,#f59e0b)] text-black font-bold'
                          : 'bg-[var(--bg-tertiary,#141416)] text-[var(--text-secondary,#a1a1aa)]'
                      }`}
                    >
                      Clarke 1858 Feet (ft)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCassiniUnit('meters')}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        cassiniUnit === 'meters'
                          ? 'bg-[var(--accent,#f59e0b)] text-black font-bold'
                          : 'bg-[var(--bg-tertiary,#141416)] text-[var(--text-secondary,#a1a1aa)]'
                      }`}
                    >
                      International Metres (m)
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Cassini Easting ({cassiniUnit === 'feet' ? 'ft' : 'm'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={cassiniE}
                    onChange={(e) => setCassiniE(e.target.value)}
                    placeholder="e.g. 148350.0"
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Cassini Northing ({cassiniUnit === 'feet' ? 'ft' : 'm'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={cassiniN}
                    onChange={(e) => setCassiniN(e.target.value)}
                    placeholder="e.g. 164200.0"
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  />
                </div>
              </div>
            </div>
          )}

          {sourceMode === 'utm' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    UTM Zone
                  </label>
                  <select
                    value={utmZone}
                    onChange={(e) => setUtmZone(parseInt(e.target.value))}
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  >
                    <option value={36}>Zone 36 (Uganda / W. Kenya)</option>
                    <option value={37}>Zone 37 (Nairobi / Central / Coast)</option>
                    <option value={38}>Zone 38 (E. Coast / Somalia)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Hemisphere
                  </label>
                  <select
                    value={utmHemi}
                    onChange={(e) => setUtmHemi(e.target.value as 'N' | 'S')}
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  >
                    <option value="S">Southern (S) - Kenya / Tanzania</option>
                    <option value="N">Northern (N) - N. Kenya / Ethiopia</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Target Cassini Belt
                  </label>
                  <select
                    value={selectedSheetId}
                    onChange={(e) => setSelectedSheetId(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  >
                    {KENYA_TOPO_SHEETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    UTM Easting (m)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={utmE}
                    onChange={(e) => setUtmE(e.target.value)}
                    placeholder="e.g. 257410.0"
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    UTM Northing (m)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={utmN}
                    onChange={(e) => setUtmN(e.target.value)}
                    placeholder="e.g. 9857200.0"
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  />
                </div>
              </div>
            </div>
          )}

          {sourceMode === 'wgs84' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary,#a1a1aa)]">
                  Coordinate Format:
                </span>
                <button
                  type="button"
                  onClick={() => setIsMgrsMode(!isMgrsMode)}
                  className="text-xs text-[var(--accent,#f59e0b)] hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  {isMgrsMode ? 'Switch to Lat / Lon' : 'Switch to MGRS Grid'}
                </button>
              </div>

              {isMgrsMode ? (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                    Military Grid Reference System (MGRS)
                  </label>
                  <input
                    type="text"
                    value={mgrsInput}
                    onChange={(e) => setMgrsInput(e.target.value)}
                    placeholder="e.g. 37M BV 80132 57128"
                    className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] uppercase focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                      Latitude (Decimal Degrees)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={wgs84Lat}
                      onChange={(e) => setWgs84Lat(e.target.value)}
                      placeholder="e.g. -1.286389"
                      className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary,#a1a1aa)] mb-1">
                      Longitude (Decimal Degrees)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={wgs84Lon}
                      onChange={(e) => setWgs84Lon(e.target.value)}
                      placeholder="e.g. 36.817223"
                      className="w-full bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary,#fafafa)] focus:outline-none focus:border-[var(--accent,#f59e0b)]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results Display Section */}
          <div className="mt-4 pt-4 border-t border-[var(--border-color,#27272a)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
              Simultaneous 3-Way Conversions
            </h3>

            {/* 1. Cassini Output Card */}
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-amber-500 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" />
                  Cassini-Soldner ({results.cassini?.sheetName || selectedSheet.name})
                </div>
                {results.cassini ? (
                  <div className="font-mono text-xs text-[var(--text-primary,#fafafa)] mt-1">
                    E: <span className="font-bold">{results.cassini.eastingFt.toFixed(2)} ft</span>{' '}
                    <span className="text-[var(--text-muted,#71717a)]">({results.cassini.eastingM.toFixed(3)} m)</span>
                    <br />
                    N: <span className="font-bold">{results.cassini.northingFt.toFixed(2)} ft</span>{' '}
                    <span className="text-[var(--text-muted,#71717a)]">({results.cassini.northingM.toFixed(3)} m)</span>
                  </div>
                ) : (
                  <div className="text-xs text-red-400 mt-1">Invalid coordinate input</div>
                )}
              </div>
              {results.cassini && (
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `E: ${results.cassini?.eastingFt.toFixed(2)} ft, N: ${results.cassini?.northingFt.toFixed(2)} ft (${results.cassini?.sheetName})`,
                      'cassini'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-[var(--text-secondary,#a1a1aa)] flex items-center gap-1 self-start sm:self-center transition-colors"
                >
                  {copiedKey === 'cassini' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'cassini' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {/* 2. UTM Output Card */}
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3 h-3" />
                  UTM Zone {results.utm?.zone || utmZone}{results.utm?.hemisphere || utmHemi} (Arc 1960 / WGS84)
                </div>
                {results.utm ? (
                  <div className="font-mono text-xs text-[var(--text-primary,#fafafa)] mt-1">
                    E: <span className="font-bold">{results.utm.easting.toFixed(3)} m</span> &nbsp;|&nbsp; 
                    N: <span className="font-bold">{results.utm.northing.toFixed(3)} m</span>
                  </div>
                ) : (
                  <div className="text-xs text-red-400 mt-1">Invalid coordinate input</div>
                )}
              </div>
              {results.utm && (
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `Zone ${results.utm?.zone}${results.utm?.hemisphere} E: ${results.utm?.easting.toFixed(3)} N: ${results.utm?.northing.toFixed(3)}`,
                      'utm'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-[var(--text-secondary,#a1a1aa)] flex items-center gap-1 self-start sm:self-center transition-colors"
                >
                  {copiedKey === 'utm' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'utm' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {/* 3. WGS84 & MGRS Output Card */}
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary,#141416)] border border-[var(--border-color,#27272a)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-emerald-400 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />
                  WGS84 GPS & MGRS
                </div>
                {results.wgs84 ? (
                  <div className="font-mono text-xs text-[var(--text-primary,#fafafa)] mt-1 space-y-0.5">
                    <div>
                      Lat: <span className="font-bold">{results.wgs84.lat.toFixed(6)}°</span>, 
                      Lon: <span className="font-bold">{results.wgs84.lon.toFixed(6)}°</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted,#71717a)]">
                      {results.wgs84.dms}
                    </div>
                    <div className="text-[11px] text-[var(--accent,#f59e0b)] font-semibold">
                      MGRS: {results.wgs84.mgrs}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-red-400 mt-1">Invalid coordinate input</div>
                )}
              </div>
              {results.wgs84 && (
                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        `${results.wgs84?.lat.toFixed(6)}, ${results.wgs84?.lon.toFixed(6)} (${results.wgs84?.mgrs})`,
                        'wgs84'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-[var(--text-secondary,#a1a1aa)] flex items-center gap-1 transition-colors"
                  >
                    {copiedKey === 'wgs84' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'wgs84' ? 'Copied' : 'Copy'}
                  </button>
                  <Link
                    href={`/map?lat=${results.wgs84.lat}&lon=${results.wgs84.lon}&zoom=17`}
                    onClick={onClose}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--accent,#f59e0b)] text-black text-xs font-bold flex items-center gap-1 hover:brightness-110 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Map
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-color,#27272a)] bg-[var(--bg-secondary,#202024)] flex items-center justify-between">
          <Link
            href="/tools/cassini-utm"
            onClick={onClose}
            className="text-xs text-[var(--accent,#f59e0b)] hover:underline flex items-center gap-1"
          >
            Advanced Batch & Sub-sheet Calibration Tool <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--bg-tertiary,#141416)] hover:bg-white/10 text-xs font-medium text-[var(--text-primary,#fafafa)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
