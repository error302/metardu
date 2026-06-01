'use client'

import { useState, useMemo, useCallback } from 'react'
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
  ShieldCheck,
} from 'lucide-react'
import {
  KENYA_TOPO_SHEETS,
  cassiniFeetToUTM,
  utmToCassiniFeet,
  verifyWithCommonPoints,
  CLARKE_1858_A_FT,
  CLARKE_1880_A_M,
} from '@/lib/geo/cassini'
import type {
  CassiniFeetPoint,
  UTMPoint,
  ConversionResult,
  TopoSheetParams,
  VerificationResult,
} from '@/lib/geo/cassini'

/* ═══════════════════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */

function r3(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(3)
}

function r1(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(1)
}

function r4(n: number | undefined): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(4)
}

/** Cassini example data for batch load (in FEET) */
const CASSINI_BATCH_EXAMPLE = `SKP209,-130490.6,-348685.6
149S3,22492.0,-533392.5
SKP208,-132480.9,-514849.9`

/** UTM example data for batch load (in METRES) */
const UTM_BATCH_EXAMPLE = `P1,237730.756,9893875.453
P2,284419.1,9837592.78
P3,237160.304,9843205.245`

/* ═══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════ */

export default function CassiniUTMPage() {
  // ── Direction ──
  const [direction, setDirection] = useState<'cassini-to-utm' | 'utm-to-cassini'>('cassini-to-utm')

  // ── Topo Sheet Selection ──
  const [selectedSheetId, setSelectedSheetId] = useState<string>(KENYA_TOPO_SHEETS[0].id)
  const [useCustomParams, setUseCustomParams] = useState(false)
  const [customP, setCustomP] = useState('0.3048')
  const [customQ, setCustomQ] = useState('0')
  const [customCx, setCustomCx] = useState('277474.6')
  const [customCy, setCustomCy] = useState('10000198.4')
  const [paramsOpen, setParamsOpen] = useState(false)

  // ── Input Mode ──
  const [inputMode, setInputMode] = useState<'single' | 'batch'>('single')

  // ── Single Point Inputs ──
  const [singleE, setSingleE] = useState('')
  const [singleN, setSingleN] = useState('')

  // ── Batch Input ──
  const [batchText, setBatchText] = useState('')

  // ── Results ──
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(null)
  const [batchResults, setBatchResults] = useState<ConversionResult[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // ── Verification ──
  const [showVerification, setShowVerification] = useState(false)

  // ── Derived Sheet Params ──
  const activeSheet: TopoSheetParams = useMemo(() => {
    if (useCustomParams) {
      return {
        id: 'custom',
        name: 'Custom Parameters',
        description: 'User-defined Helmert transformation parameters.',
        P: parseFloat(customP) || 0.3048,
        Q: parseFloat(customQ) || 0,
        Cx: parseFloat(customCx) || 0,
        Cy: parseFloat(customCy) || 0,
        commonPoints: [],
      }
    }
    return KENYA_TOPO_SHEETS.find(s => s.id === selectedSheetId) ?? KENYA_TOPO_SHEETS[0]
  }, [useCustomParams, selectedSheetId, customP, customQ, customCx, customCy])

  // ── Verification Results ──
  const verificationResults = useMemo(() => {
    if (!showVerification || activeSheet.commonPoints.length === 0) return []
    return verifyWithCommonPoints(activeSheet)
  }, [showVerification, activeSheet])

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
      const pts: CassiniFeetPoint[] = [{ easting: e, northing: n }]
      const results = cassiniFeetToUTM(pts, activeSheet)
      setSingleResult(results[0])
    } else {
      const pts: UTMPoint[] = [{ easting: e, northing: n }]
      const results = utmToCassiniFeet(pts, activeSheet)
      setSingleResult(results[0])
    }
  }, [singleE, singleN, direction, activeSheet])

  // ── Batch Convert ──
  const handleBatchConvert = useCallback(() => {
    const lines = batchText.trim().split('\n').filter(l => l.trim())
    const validResults: ConversionResult[] = []
    const errors: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const parts = line.split(',').map(s => s.trim())

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

      if (direction === 'cassini-to-utm') {
        const results = cassiniFeetToUTM([{ id, easting: e, northing: n }], activeSheet)
        validResults.push(results[0])
      } else {
        const results = utmToCassiniFeet([{ id, easting: e, northing: n }], activeSheet)
        validResults.push(results[0])
      }
    }

    setBatchResults(validResults)
    setBatchErrors(errors)
  }, [batchText, direction, activeSheet])

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
    const srcUnit = direction === 'cassini-to-utm' ? 'ft' : 'm'
    const tgtUnit = direction === 'cassini-to-utm' ? 'm' : 'ft'
    const lines = [
      `Cassini-Soldner ↔ UTM Conversion (Helmert 4-Parameter)`,
      `Topo Sheet: ${activeSheet.name}`,
      `Datum: Arc 1960 / UTM Zone 37S`,
      ``,
      direction === 'cassini-to-utm'
        ? `Source Cassini: E = ${r1(singleResult.cassiniE)} ft, N = ${r1(singleResult.cassiniN)} ft`
        : `Source UTM: E = ${r3(singleResult.utmE)} m, N = ${r3(singleResult.utmN)} m`,
      direction === 'cassini-to-utm'
        ? `Result UTM: E = ${r3(singleResult.utmE)} m, N = ${r3(singleResult.utmN)} m`
        : `Result Cassini: E = ${r1(singleResult.cassiniE)} ft, N = ${r1(singleResult.cassiniN)} ft`,
      `Conformal E: ${r1(singleResult.conformalE)} ft`,
    ]
    if (singleResult.warning) {
      lines.push(`Warning: ${singleResult.warning}`)
    }
    copyToClipboard(lines.join('\n'))
  }, [singleResult, activeSheet, direction, copyToClipboard])

  const handleCopyBatchCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const srcUnit = direction === 'cassini-to-utm' ? 'ft' : 'm'
    const tgtUnit = direction === 'cassini-to-utm' ? 'm' : 'ft'
    const header = `ID,Src_E(${srcUnit}),Src_N(${srcUnit}),Tgt_E(${tgtUnit}),Tgt_N(${tgtUnit}),Conformal_E(ft)`
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        direction === 'cassini-to-utm' ? r1(r.cassiniE) : r3(r.utmE),
        direction === 'cassini-to-utm' ? r1(r.cassiniN) : r3(r.utmN),
        direction === 'cassini-to-utm' ? r3(r.utmE) : r1(r.cassiniE),
        direction === 'cassini-to-utm' ? r3(r.utmN) : r1(r.cassiniN),
        r1(r.conformalE),
      ].join(',')
    )
    copyToClipboard([header, ...rows].join('\n'))
  }, [batchResults, direction, copyToClipboard])

  const handleDownloadCsv = useCallback(() => {
    if (batchResults.length === 0) return
    const srcUnit = direction === 'cassini-to-utm' ? 'ft' : 'm'
    const tgtUnit = direction === 'cassini-to-utm' ? 'm' : 'ft'
    const header = `ID,Src_E(${srcUnit}),Src_N(${srcUnit}),Tgt_E(${tgtUnit}),Tgt_N(${tgtUnit}),Conformal_E(ft)`
    const rows = batchResults.map(r =>
      [
        r.id ?? '',
        direction === 'cassini-to-utm' ? r1(r.cassiniE) : r3(r.utmE),
        direction === 'cassini-to-utm' ? r1(r.cassiniN) : r3(r.utmN),
        direction === 'cassini-to-utm' ? r3(r.utmE) : r1(r.cassiniE),
        direction === 'cassini-to-utm' ? r3(r.utmN) : r1(r.cassiniN),
        r1(r.conformalE),
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
        subtitle="Kenya Survey Department 4-parameter Helmert transformation — Cassini (FEET, Clarke 1858) ↔ UTM (METRES, Clarke 1880 / Arc 1960)"
        reference="Gacoki (FIG 2018) | Arc 1960 datum | UTM Zone 37S | Cassini meridian 37°E"
      />

      {/* ── Units Banner ── */}
      <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Units:</strong> Cassini inputs are in <strong>International Feet</strong> (Clarke 1858).
          UTM outputs are in <strong>Metres</strong> (Clarke 1880 / Arc 1960, UTM Zone 37S).
          The P parameter (~0.3048) handles the feet→metres conversion.
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
       *  TWO-PANEL GRID
       * ═════════════════════════════════════════════════════════════════ */}
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
              Cassini (ft) → UTM (m)
            </button>
            <button
              onClick={() => handleDirectionChange('utm-to-cassini')}
              className={`btn flex-1 ${direction === 'utm-to-cassini' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              UTM (m) → Cassini (ft)
            </button>
          </div>

          {/* ── 2. Topo Sheet Selector Card ── */}
          <div className="card">
            <div className="card-header">
              <span className="label flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-[var(--accent)]" />
                Topographic Sheet
              </span>
            </div>
            <div className="card-body space-y-4">
              {/* Dropdown */}
              <div>
                <label className="label text-xs text-[var(--text-muted)] mb-1 block">Select Sheet</label>
                <select
                  className="input"
                  value={useCustomParams ? '__custom__' : selectedSheetId}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setUseCustomParams(true)
                    } else {
                      setUseCustomParams(false)
                      setSelectedSheetId(e.target.value)
                    }
                  }}
                >
                  {KENYA_TOPO_SHEETS.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.description}
                    </option>
                  ))}
                  <option value="__custom__">Custom Helmert Parameters...</option>
                </select>
              </div>

              {/* Preset: show sheet params as readonly */}
              {!useCustomParams && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">P (scale factor)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeSheet.P} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Q (rotation factor)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeSheet.Q} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Cx (easting trans.)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeSheet.Cx} readOnly />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Cy (northing trans.)</label>
                    <input className="input font-mono text-xs opacity-75" value={activeSheet.Cy} readOnly />
                  </div>
                </div>
              )}

              {/* Custom: editable fields */}
              {useCustomParams && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">P (scale factor)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customP}
                      onChange={e => setCustomP(e.target.value)}
                      placeholder="0.3048"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Q (rotation factor)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customQ}
                      onChange={e => setCustomQ(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Cx (easting translation, m)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customCx}
                      onChange={e => setCustomCx(e.target.value)}
                      placeholder="277474.6"
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">Cy (northing translation, m)</label>
                    <input
                      className="input font-mono text-xs"
                      value={customCy}
                      onChange={e => setCustomCy(e.target.value)}
                      placeholder="10000198.4"
                    />
                  </div>
                </div>
              )}

              {/* Collapsible common points */}
              {!useCustomParams && activeSheet.commonPoints.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowVerification(!showVerification)}
                    className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  >
                    {showVerification ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <ShieldCheck className="h-3 w-3" />
                    Verify common points ({activeSheet.commonPoints.length} stations)
                  </button>
                  {showVerification && verificationResults.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="table-header">
                            <th className="table-cell text-left py-1.5 px-2">Station</th>
                            <th className="table-cell text-right py-1.5 px-2">dE (m)</th>
                            <th className="table-cell text-right py-1.5 px-2">dN (m)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verificationResults.map((v) => (
                            <tr key={v.station} className="table-row">
                              <td className="table-cell py-1.5 px-2 font-medium">{v.station}</td>
                              <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                                Math.abs(v.residualE) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                              }`}>
                                {v.residualE.toFixed(4)}
                              </td>
                              <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                                Math.abs(v.residualN) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                              }`}>
                                {v.residualN.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Collapsible transformation details */}
              <div>
                <button
                  onClick={() => setParamsOpen(!paramsOpen)}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                >
                  {paramsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Transformation details
                </button>
                {paramsOpen && (
                  <pre className="mt-2 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[10px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
{`Formula:
  E_UTM  = P × E_conformal + Q × |N_cass| + Cx
  N_UTM  = -Q × E_conformal + P × |N_cass| + Cy

  E_conformal = E + E³/(6×a×b) + E⁵/(24×a²×b²)

Clarke 1858 (input):  a = ${CLARKE_1858_A_FT.toLocaleString()} ft
Clarke 1880 (output): a = ${CLARKE_1880_A_M.toLocaleString()} m
Datum: Arc 1960 / UTM Zone 37S
Central meridian: 39°E, Scale: 0.9996`}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. Input Mode Toggle ── */}
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

          {/* ── 4. Single Point Input ── */}
          {inputMode === 'single' && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">
                  {direction === 'cassini-to-utm' ? 'Cassini Coordinates (FEET)' : 'UTM Coordinates (METRES)'}
                </span>
              </div>
              <div className="card-body space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">
                      Easting ({direction === 'cassini-to-utm' ? 'ft' : 'm'})
                    </label>
                    <input
                      className="input font-mono"
                      value={singleE}
                      onChange={e => setSingleE(e.target.value)}
                      placeholder={direction === 'cassini-to-utm' ? '-130490.6' : '237730.756'}
                    />
                  </div>
                  <div>
                    <label className="label text-xs text-[var(--text-muted)]">
                      Northing ({direction === 'cassini-to-utm' ? 'ft' : 'm'})
                    </label>
                    <input
                      className="input font-mono"
                      value={singleN}
                      onChange={e => setSingleN(e.target.value)}
                      placeholder={direction === 'cassini-to-utm' ? '-348685.6' : '9893875.453'}
                    />
                  </div>
                </div>

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

          {/* ── 5. Batch Input ── */}
          {inputMode === 'batch' && (
            <div className="card">
              <div className="card-header">
                <span className="label text-sm font-semibold">
                  Batch Input (CSV) — {direction === 'cassini-to-utm' ? 'Cassini (ft)' : 'UTM (m)'}
                </span>
              </div>
              <div className="card-body space-y-3">
                <textarea
                  className="input font-mono text-xs resize-none"
                  rows={6}
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  placeholder={
                    direction === 'cassini-to-utm'
                      ? 'id,easting_ft,northing_ft\nSKP209,-130490.6,-348685.6\n149S3,22492.0,-533392.5'
                      : 'id,easting_m,northing_m\nP1,237730.756,9893875.453\nP2,284419.1,9837592.78'
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
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r1(singleResult.cassiniE)} ft</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">Cassini Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r1(singleResult.cassiniN)} ft</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">UTM Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.utmE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">UTM Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.utmN)} m</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Result */}
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-medium">
                    Result ({direction === 'cassini-to-utm' ? 'UTM (metres)' : 'Cassini (feet)'})
                  </p>
                  {direction === 'cassini-to-utm' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">UTM Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.utmE)} m</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">UTM Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r3(singleResult.utmN)} m</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">Cassini Easting</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r1(singleResult.cassiniE)} ft</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                        <p className="text-[10px] text-[var(--accent)] uppercase">Cassini Northing</p>
                        <p className="font-mono text-sm text-[var(--text-primary)]">{r1(singleResult.cassiniN)} ft</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Intermediate: conformal correction */}
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider font-medium">Intermediate</p>
                  <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase">Conformal-corrected Easting</p>
                    <p className="font-mono text-sm text-[var(--text-primary)]">{r1(singleResult.conformalE)} ft</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      Correction: {r4(singleResult.conformalE - singleResult.cassiniE)} ft from raw E
                    </p>
                  </div>
                </div>

                {/* Sheet info */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                  <span className="text-xs text-[var(--text-muted)]">Sheet: {activeSheet.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    P={activeSheet.P} Q={activeSheet.Q}
                  </span>
                </div>
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
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Cassini values in FEET (negative northing for south of origin)
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
                        <th className="table-cell text-right font-semibold py-2 px-3">
                          Src E ({direction === 'cassini-to-utm' ? 'ft' : 'm'})
                        </th>
                        <th className="table-cell text-right font-semibold py-2 px-3">
                          Src N ({direction === 'cassini-to-utm' ? 'ft' : 'm'})
                        </th>
                        <th className="table-cell text-right font-semibold py-2 px-3">
                          Tgt E ({direction === 'cassini-to-utm' ? 'm' : 'ft'})
                        </th>
                        <th className="table-cell text-right font-semibold py-2 px-3">
                          Tgt N ({direction === 'cassini-to-utm' ? 'm' : 'ft'})
                        </th>
                        <th className="table-cell text-right font-semibold py-2 px-3">Conf. E (ft)</th>
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
                            {direction === 'cassini-to-utm' ? r1(r.cassiniE) : r3(r.utmE)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono">
                            {direction === 'cassini-to-utm' ? r1(r.cassiniN) : r3(r.utmN)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--accent)]">
                            {direction === 'cassini-to-utm' ? r3(r.utmE) : r1(r.cassiniE)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--accent)]">
                            {direction === 'cassini-to-utm' ? r3(r.utmN) : r1(r.cassiniN)}
                          </td>
                          <td className="table-cell py-2 px-3 text-right font-mono text-[var(--text-muted)]">
                            {r1(r.conformalE)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                        <td colSpan={6} className="table-cell py-2 px-3 font-semibold text-[var(--text-muted)]">
                          Sheet: {activeSheet.name} — {batchResults.length} points converted
                        </td>
                      </tr>
                    </tfoot>
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
        </div>
      </div>
    </div>
  )
}
