'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  ArrowRightLeft,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Globe,
  MapPin,
  Info,
} from 'lucide-react'
import {
  KENYA_CASSINI_ORIGINS,
  cassiniToUTM,
  utmToCassini,
  cassiniToGeographic,
  getCassiniProj4String,
  makeCassiniOrigin,
  CLARKE_1858_A,
  CLARKE_1858_RF,
} from '@/lib/geo/cassini'
import type {
  CassiniOrigin,
  CassiniPoint,
  UTMPoint,
  ConversionResult,
  UTMOutputDatum,
  UTMZone,
} from '@/lib/geo/cassini'

/* ═══════════════════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */

function toDMS(dd: number, posChar: string, negChar: string): string {
  const dir = dd >= 0 ? posChar : negChar
  const abs = Math.abs(dd)
  const deg = Math.floor(abs)
  const minFloat = (abs - deg) * 60
  const min = Math.floor(minFloat)
  const sec = ((minFloat - min) * 60).toFixed(2)
  return `${deg}° ${min}' ${sec}" ${dir}`
}

function r4(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(4)
}

function r3(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(3)
}

function r2(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(2)
}

/** Cassini example data for batch load */
const CASSINI_BATCH_EXAMPLE = `P1,12543.2768,14321.8562
P2,13876.4451,15102.3398
P3,11029.8877,12899.1245
P4,15012.2203,16045.6789`

/** UTM example data for batch load */
const UTM_BATCH_EXAMPLE = `P1,400123.4567,9876543.2100
P2,401876.1234,9875123.4567
P3,399234.5678,9878901.2345
P4,402456.7890,9873456.7890`

/* ═══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

export default function CassiniUTMPage() {
  // ── Direction ──
  const [direction, setDirection] = useState<'cassini-to-utm' | 'utm-to-cassini'>('cassini-to-utm')

  // ── Origin ──
  const [selectedOriginId, setSelectedOriginId] = useState<string>(KENYA_CASSINI_ORIGINS[0].id)
  const [useCustomOrigin, setUseCustomOrigin] = useState(false)
  const [customLat0, setCustomLat0] = useState('-0.25')
  const [customLon0, setCustomLon0] = useState('37.50')
  const [customFE, setCustomFE] = useState('10000')
  const [customFN, setCustomFN] = useState('10000')
  const [proj4Open, setProj4Open] = useState(false)

  // ── Output Datum ──
  const [utmDatum, setUtmDatum] = useState<UTMOutputDatum>('arc1960')
  const [utmZone, setUtmZone] = useState<UTMZone>(37)

  // ── Input Mode ──
  const [inputMode, setInputMode] = useState<'single' | 'batch'>('single')

  // ── Single Point Inputs ──
  const [singleE, setSingleE] = useState('')
  const [singleN, setSingleN] = useState('')
  const [singleZone, setSingleZone] = useState('37')
  const [singleHemisphere, setSingleHemisphere] = useState<'N' | 'S'>('S')

  // ── Batch Input ──
  const [batchText, setBatchText] = useState('')

  // ── Results ──
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(null)
  const [batchResults, setBatchResults] = useState<ConversionResult[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // ── Derived Origin ──
  const activeOrigin: CassiniOrigin = useMemo(() => {
    if (useCustomOrigin) {
      return makeCassiniOrigin({
        lat0: parseFloat(customLat0) || 0,
        lon0: parseFloat(customLon0) || 0,
        fe: parseFloat(customFE) || 0,
        fn: parseFloat(customFN) || 0,
      })
    }
    return KENYA_CASSINI_ORIGINS.find(o => o.id === selectedOriginId) ?? KENYA_CASSINI_ORIGINS[0]
  }, [useCustomOrigin, selectedOriginId, customLat0, customLon0, customFE, customFN])

  const proj4String = useMemo(() => getCassiniProj4String(activeOrigin), [activeOrigin])

  // ── Reset results on direction change ──
  const handleDirectionChange = useCallback((dir: 'cassini-to-utm' | 'utm-to-cassini') => {
    setDirection(dir)
    setSingleResult(null)
    setBatchResults([])
    setBatchErrors([])
    setBatchText('')
  }, [])

  // ── Single Convert ──
  const handleSingleConvert = useCallback(() => {
    const e = parseFloat(singleE)
    const n = parseFloat(singleN)
    if (isNaN(e) || isNaN(n)) return

    if (direction === 'cassini-to-utm') {
      const pts: CassiniPoint[] = [{ easting: e, northing: n }]
      const results = cassiniToUTM(pts, activeOrigin, utmDatum, utmZone)
      setSingleResult(results[0])
    } else {
      const z = parseInt(singleZone) || 37
      const results = utmToCassini(
        [{ easting: e, northing: n, zone: z, hemisphere: singleHemisphere }],
        activeOrigin,
        utmDatum,
        utmZone,
      )
      setSingleResult(results[0])
    }
  }, [singleE, singleN, singleZone, singleHemisphere, direction, activeOrigin, utmDatum, utmZone])

  // ── Batch Convert ──
  const handleBatchConvert = useCallback(() => {
    const lines = batchText.trim().split('\n').filter(l => l.trim())
    const validResults: ConversionResult[] = []
    const errors: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const parts = line.split(',').map(s => s.trim())

      if (direction === 'cassini-to-utm') {
        if (parts.length < 3) {
          errors.push(`Line ${i + 1}: Expected "id,easting,northing" — skipped`)
          continue
        }
        const id = parts[0]
        const e = parseFloat(parts[1])
        const n = parseFloat(parts[2])
        if (isNaN(e) || isNaN(n)) {
          errors.push(`Line ${i + 1} (${id}): Invalid coordinates — skipped`)
          continue
        }
        const results = cassiniToUTM([{ id, easting: e, northing: n }], activeOrigin, utmDatum, utmZone)
        validResults.push(results[0])
      } else {
        if (parts.length < 5) {
          errors.push(`Line ${i + 1}: Expected "id,easting,northing,zone,hemisphere" — skipped`)
          continue
        }
        const id = parts[0]
        const e = parseFloat(parts[1])
        const n = parseFloat(parts[2])
        const z = parseInt(parts[3])
        const h = parts[4].toUpperCase() === 'N' ? 'N' : 'S'
        if (isNaN(e) || isNaN(n) || isNaN(z)) {
          errors.push(`Line ${i + 1} (${id}): Invalid coordinates — skipped`)
          continue
        }
        const results = utmToCassini(
          [{ id, easting: e, northing: n, zone: z, hemisphere: h as 'N' | 'S' }],
          activeOrigin,
          utmDatum,
          utmZone,
        )
        validResults.push(results[0])
      }
    }

    setBatchResults(validResults)
    setBatchErrors(errors)
  }, [batchText, direction, activeOrigin, utmDatum, utmZone])

  // ── Load Example ──
  const handleLoadExample = useCallback(() => {
    const example = direction === 'cassini-to-utm' ? CASSINI_BATCH_EXAMPLE : UTM_BATCH_EXAMPLE
    setBatchText(example)
    setBatchResults([])
    setBatchErrors([])
  }, [direction])

  // ── Copy helpers ──
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  const handleCopySingle = useCallback(() => {
    if (!singleResult) return
    const lines = [
      `Cassini-Soldner ↔ UTM Conversion`,
      `Origin: ${activeOrigin.name}`,
      `Output Datum: ${utmDatum === 'arc1960' ? 'Arc 1960 / UTM' : 'WGS84 / UTM'} ${utmZone}${singleResult.utmZone ? (direction === 'cassini-to-utm' ? 'S' : '') : ''}`,
      ``,
      direction === 'cassini-to-utm'
        ? `Source Cassini: E = ${r4(singleResult.cassiniE)} m, N = ${r4(singleResult.cassiniN)} m`
        : `Source UTM: E = ${r4(singleResult.utmE)} m, N = ${r4(singleResult.utmN)} m`,
      direction === 'cassini-to-utm'
        ? `Result UTM: E = ${r4(singleResult.utmE)} m, N = ${r4(singleResult.utmN)} m (Zone ${utmZone}S)`
        : `Result Cassini: E = ${r4(singleResult.cassiniE)} m, N = ${r4(singleResult.cassiniN)} m`,
      `Geographic: Lat ${r3(singleResult.lat)}° Lon ${r3(singleResult.lon)}°`,
      `  DMS: ${toDMS(singleResult.lat ?? 0, 'N', 'S')}, ${toDMS(singleResult.lon ?? 0, 'E', 'W')}`,
      `Round-trip error: ${r2(singleResult.roundTripError)} mm`,
    ]
    copyToClipboard(lines.join('\n'))
  }, [singleResult, activeOrigin, utmDatum, utmZone, direction, copyToClipboard])

  const handleCopyBatchCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const header = direction === 'cassini-to-utm'
      ? 'ID,Source_E,Source_N,Target_E,Target_N,Lat,Lon,Error_mm'
      : 'ID,Source_E,Source_N,Target_E,Target_N,Lat,Lon,Error_mm'
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        r4(direction === 'cassini-to-utm' ? r.cassiniE : r.utmE),
        r4(direction === 'cassini-to-utm' ? r.cassiniN : r.utmN),
        r4(direction === 'cassini-to-utm' ? r.utmE : r.cassiniE),
        r4(direction === 'cassini-to-utm' ? r.utmN : r.cassiniN),
        r3(r.lat),
        r3(r.lon),
        r2((r.roundTripError ?? 0) * 1000),
      ].join(',')
    )
    copyToClipboard([header, ...rows].join('\n'))
  }, [batchResults, direction, copyToClipboard])

  const handleDownloadCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const header = direction === 'cassini-to-utm'
      ? 'ID,Source_E,Source_N,Target_E,Target_N,Lat,Lon,Error_mm'
      : 'ID,Source_E,Source_N,Target_E,Target_N,Lat,Lon,Error_mm'
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        r4(direction === 'cassini-to-utm' ? r.cassiniE : r.utmE),
        r4(direction === 'cassini-to-utm' ? r.cassiniN : r.utmN),
        r4(direction === 'cassini-to-utm' ? r.utmE : r.cassiniE),
        r4(direction === 'cassini-to-utm' ? r.utmN : r.cassiniN),
        r3(r.lat),
        r3(r.lon),
        r2((r.roundTripError ?? 0) * 1000),
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cassini-utm-${direction}-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [batchResults, direction])

  // ── Batch summary ──
  const batchSummary = useMemo(() => {
    if (batchResults.length === 0) return null
    const errors = batchResults.filter(r => !r.warning)
    const errorVals = errors.map(r => (r.roundTripError ?? 0) * 1000).filter(v => isFinite(v))
    if (errorVals.length === 0) return null
    return {
      count: batchResults.length,
      meanError: errorVals.reduce((a, b) => a + b, 0) / errorVals.length,
      maxError: Math.max(...errorVals),
    }
  }, [batchResults])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-16">
      {/* ── Breadcrumb ── */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/tools">Quick Tools</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Cassini ↔ UTM</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── Page Header ── */}
      <PageHeader
        title="Cassini-Soldner ↔ UTM Converter"
        subtitle="Convert Kenya legacy Cassini-Soldner coordinates (Clarke 1858) to UTM — preset district origins or custom parameters"
        reference="Kenya Survey Regulations 1994 | Clarke 1858 (a=6,378,351m, 1/f=294.26) | Snyder USGS PP 1395"
      />

      {/* ═══════════════════════════════════════════════════════════════════
       *  TWO-PANEL GRID
       * ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid md:grid-cols-2 gap-8">

        {/* ═════════════════════════════════════════════════════════════════
         *  LEFT PANEL — INPUTS
         * ═════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">

          {/* ── 1. Direction Toggle ── */}
          <div className="flex gap-2">
            <button
              onClick={() => handleDirectionChange('cassini-to-utm')}
              className={`btn flex-1 ${direction === 'cassini-to-utm' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Cassini → UTM
            </button>
            <button
              onClick={() => handleDirectionChange('utm-to-cassini')}
              className={`btn flex-1 ${direction === 'utm-to-cassini' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              UTM → Cassini
            </button>
          </div>

          {/* ── 2. Origin Selector Card ── */}
          <div className="card">
            <div className="card-header">
              <span className="label flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-[var(--accent)]" />
                Cassini Origin
              </span>
            </div>
            <div className="card-body space-y-4">
              {/* Dropdown */}
              <div>
                <label className="label text-xs text-[var(--text-muted)] mb-1 block">District Origin</label>
                <select
                  className="input"
                  value={useCustomOrigin ? '__custom__' : selectedOriginId}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setUseCustomOrigin(true)
                    } else {
                      setUseCustomOrigin(false)
                      setSelectedOriginId(e.target.value)
                    }
                  }}
                >
                  {KENYA_CASSINI_ORIGINS.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.description}
                    </option>
                  ))}
                  <option value="__custom__">Custom Origin...</option>
                </select>
              </div>

              {/* Preset: show origin params as readonly */}
              {!useCustomOrigin && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Lat₀ (decimal degrees)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeOrigin.lat0.toFixed(6)} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Lon₀ (decimal degrees)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeOrigin.lon0.toFixed(6)} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">False Easting (m)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeOrigin.fe.toFixed(2)} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">False Northing (m)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeOrigin.fn.toFixed(2)} readOnly />
                  </div>
                </div>
              )}

              {/* Custom: editable fields */}
              {useCustomOrigin && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Latitude of origin (dd)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customLat0}
                      onChange={e => setCustomLat0(e.target.value)}
                      placeholder="-0.25"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Longitude of origin (dd)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customLon0}
                      onChange={e => setCustomLon0(e.target.value)}
                      placeholder="37.50"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">False Easting (m)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customFE}
                      onChange={e => setCustomFE(e.target.value)}
                      placeholder="10000"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">False Northing (m)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customFN}
                      onChange={e => setCustomFN(e.target.value)}
                      placeholder="10000"
                    />
                  </div>
                </div>
              )}

              {/* Collapsible proj4 definition */}
              <div>
                <button
                  onClick={() => setProj4Open(!proj4Open)}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                >
                  {proj4Open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  proj4 CRS Definition
                </button>
                {proj4Open && (
                  <pre className="mt-2 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap break-all">
                    {proj4String}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. Output Datum Card ── */}
          <div className="card">
            <div className="card-header">
              <span className="label flex items-center gap-2 text-sm font-semibold">
                <Globe className="h-4 w-4 text-[var(--accent)]" />
                Output Datum & Zone
              </span>
            </div>
            <div className="card-body space-y-4">
              {/* Datum radio */}
              <div className="flex gap-2">
                <button
                  onClick={() => setUtmDatum('arc1960')}
                  className={`btn flex-1 text-xs ${utmDatum === 'arc1960' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Arc 1960 / UTM 37S (Cadastral)
                </button>
                <button
                  onClick={() => setUtmDatum('wgs84')}
                  className={`btn flex-1 text-xs ${utmDatum === 'wgs84' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  WGS84 / UTM 37S (GPS)
                </button>
              </div>

              {/* UTM Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-[var(--text-muted)]">UTM Zone</label>
                  <select className="input" value={utmZone} onChange={e => setUtmZone(parseInt(e.target.value) as UTMZone)}>
                    <option value={36}>Zone 36</option>
                    <option value={37}>Zone 37 (default)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-[var(--text-muted)] pb-2.5">
                    Kenya spans UTM zones 36 and 37, both Southern hemisphere.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. Input Mode Toggle ── */}
          <div className="flex gap-2">
            <button
              onClick={() => { setInputMode('single'); setBatchResults([]); setBatchErrors([]) }}
              className={`btn flex-1 text-xs ${inputMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Single Point
            </button>
            <button
              onClick={() => { setInputMode('batch'); setSingleResult(null) }}
              className={`btn flex-1 text-xs ${inputMode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Batch (CSV)
            </button>
          </div>

          {/* ── 5. Single Point Input ── */}
          {inputMode === 'single' && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">
                  {direction === 'cassini-to-utm' ? 'Cassini Coordinates' : 'UTM Coordinates'}
                </span>
              </div>
              <div className="card-body space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">
                      {direction === 'cassini-to-utm' ? 'Easting (m)' : 'Easting (m)'}
                    </label>
                    <input
                      className="input font-mono"
                      value={singleE}
                      onChange={e => setSingleE(e.target.value)}
                      placeholder={direction === 'cassini-to-utm' ? '12543.2768' : '400123.4567'}
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">
                      {direction === 'cassini-to-utm' ? 'Northing (m)' : 'Northing (m)'}
                    </label>
                    <input
                      className="input font-mono"
                      value={singleN}
                      onChange={e => setSingleN(e.target.value)}
                      placeholder={direction === 'cassini-to-utm' ? '14321.8562' : '9876543.2100'}
                    />
                  </div>
                </div>

                {/* UTM-specific fields for UTM → Cassini */}
                {direction === 'utm-to-cassini' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label text-xs text-[var(--text-muted)]">Zone</label>
                      <input
                        className="input font-mono"
                        value={singleZone}
                        onChange={e => setSingleZone(e.target.value)}
                        placeholder="37"
                      />
                    </div>
                    <div>
                      <label className="label text-xs text-[var(--text-muted)]">Hemisphere</label>
                      <select
                        className="input"
                        value={singleHemisphere}
                        onChange={e => setSingleHemisphere(e.target.value as 'N' | 'S')}
                      >
                        <option value="N">Northern</option>
                        <option value="S">Southern (Kenya)</option>
                      </select>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSingleConvert}
                  disabled={!singleE || !singleN}
                  className="btn btn-primary w-full"
                >
                  Convert
                </button>
              </div>
            </div>
          )}

          {/* ── 6. Batch Input ── */}
          {inputMode === 'batch' && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">Batch Input (CSV)</span>
              </div>
              <div className="card-body space-y-3">
                <textarea
                  className="input font-mono text-xs resize-none"
                  rows={6}
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  placeholder={
                    direction === 'cassini-to-utm'
                      ? 'id,easting,northing\nP1,12543.2768,14321.8562\nP2,13876.4451,15102.3398'
                      : 'id,easting,northing,zone,hemisphere\nP1,400123.4567,9876543.2100,37,S\nP2,401876.1234,9875123.4567,37,S'
                  }
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleBatchConvert}
                    disabled={!batchText.trim()}
                    className="btn btn-primary flex-1"
                  >
                    Convert Batch
                  </button>
                  <button
                    onClick={handleLoadExample}
                    className="btn btn-secondary"
                  >
                    Load Example
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═════════════════════════════════════════════════════════════════
         *  RIGHT PANEL — RESULTS
         * ═════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">

          {/* ── 1. Single Result Card ── */}
          {inputMode === 'single' && singleResult && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">Conversion Result</span>
                <button onClick={handleCopySingle} className="btn btn-secondary text-xs px-2 py-1">
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="card-body space-y-4">
                {singleResult.warning && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {singleResult.warning}
                  </div>
                )}

                {/* Source */}
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-medium">Source</p>
                  {direction === 'cassini-to-utm' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">Cassini Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.cassiniE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">Cassini Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.cassiniN)} m</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">UTM Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.utmE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">UTM Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.utmN)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">Zone</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{singleResult.utmZone ?? utmZone}S</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Result */}
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-medium">
                    Result ({direction === 'cassini-to-utm' ? 'UTM' : 'Cassini'})
                  </p>
                  {direction === 'cassini-to-utm' ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">UTM Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.utmE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">UTM Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.utmN)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">Zone</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{singleResult.utmZone ?? utmZone}S</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">Cassini Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.cassiniE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">Cassini Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r4(singleResult.cassiniN)} m</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Geographic */}
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-medium">Geographic (WGS84 approx.)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Latitude</p>
                      <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.lat)}°</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">{toDMS(singleResult.lat ?? 0, 'N', 'S')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase">Longitude</p>
                      <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.lon)}°</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">{toDMS(singleResult.lon ?? 0, 'E', 'W')}</p>
                    </div>
                  </div>
                </div>

                {/* Round-trip error */}
                {singleResult.roundTripError !== undefined && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                    <span className="text-xs text-[var(--text-muted)]">Round-trip error</span>
                    <span className={`font-mono text-sm ${(singleResult.roundTripError * 1000) < 10 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                      {r2(singleResult.roundTripError * 1000)} mm
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Empty state for single ── */}
          {inputMode === 'single' && !singleResult && (
            <div className="card">
              <div className="card-body flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-10 w-10 text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  Enter coordinates and click <strong>Convert</strong> to see results
                </p>
              </div>
            </div>
          )}

          {/* ── 2. Batch Results Table ── */}
          {inputMode === 'batch' && batchResults.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">
                  Batch Results ({batchResults.length} points)
                </span>
                <div className="flex gap-2">
                  <button onClick={handleCopyBatchCsv} className="btn btn-secondary text-xs px-2 py-1">
                    {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy CSV
                  </button>
                  <button onClick={handleDownloadCsv} className="btn btn-secondary text-xs px-2 py-1">
                    <Download className="h-3.5 w-3.5" />
                    Download CSV
                  </button>
                </div>
              </div>
              <div className="card-body p-0">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="table-header">
                        <th className="table-cell text-left font-semibold py-2 px-3">ID</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Src E</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Src N</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Tgt E</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Tgt N</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Lat</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Lon</th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Err (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResults.map((r, i) => (
                        <tr key={r.id ?? i} className="table-row">
                          <td className="table-cell py-2 px-3 font-medium text-[var(--text-primary)]">
                            {r.id ?? i + 1}
                            {r.warning && (
                              <span className="ml-1 inline-flex" title={r.warning}>
                                <AlertTriangle className="h-3 w-3 text-[var(--warning)]" />
                              </span>
                            )}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono">
                            {r4(direction === 'cassini-to-utm' ? r.cassiniE : r.utmE)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono">
                            {r4(direction === 'cassini-to-utm' ? r.cassiniN : r.utmN)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--accent)]">
                            {r4(direction === 'cassini-to-utm' ? r.utmE : r.cassiniE)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--accent)]">
                            {r4(direction === 'cassini-to-utm' ? r.utmN : r.cassiniN)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono">{r3(r.lat)}</td>
                          <td className="table-cell py-2 px-3 text-right font-mono">{r3(r.lon)}</td>
                          <td className={`table-cell py-2 px-3 text-right font-mono ${
                            r.roundTripError !== undefined && (r.roundTripError * 1000) < 10
                              ? 'text-[var(--success)]'
                              : 'text-[var(--warning)]'
                          }`}>
                            {r2((r.roundTripError ?? 0) * 1000)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Summary row */}
                    {batchSummary && (
                      <tfoot>
                        <tr className="border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                          <td colSpan={7} className="table-cell py-2 px-3 font-semibold text-[var(--text-muted)]">
                            Count: {batchSummary.count}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                            Avg: {r2(batchSummary.meanError)} / Max: {r2(batchSummary.maxError)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Batch parse errors */}
                {batchErrors.length > 0 && (
                  <div className="px-4 py-3 border-t border-[var(--border-color)]">
                    <p className="text-xs text-[var(--warning)] font-medium mb-1">Parse warnings:</p>
                    {batchErrors.map((err, i) => (
                      <p key={i} className="text-[10px] text-[var(--text-muted)]">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Empty state for batch ── */}
          {inputMode === 'batch' && batchResults.length === 0 && (
            <div className="card">
              <div className="card-body flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-10 w-10 text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  Paste CSV coordinates and click <strong>Convert Batch</strong> to see results
                </p>
              </div>
            </div>
          )}

          {/* ── 3. Info Banner (always visible) ── */}
          <div className="card border-[var(--accent)]/20">
            <div className="card-body">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-primary)]">Datum accuracy notice:</strong>{' '}
                  Datum shift uses approximate Molodensky parameters (dx=-160, dy=-6, dz=-302). For
                  cadastral-grade accuracy (&lt;0.1m), apply district-specific transformation parameters
                  from known control points.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
