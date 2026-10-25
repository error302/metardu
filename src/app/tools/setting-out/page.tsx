'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import { getAvailableFormats, exportStakeout, type InstrumentFormat } from '@/lib/survey/instrumentWriters'
import { computeSettingOut, type SettingOutResult, type InstrumentStation, type Backsight } from '@/lib/computations/settingOutEngine'
import { extractDesignPointsFromDXF } from '@/lib/survey/dxfDesignExtractor'
import { compareAsBuiltToDesign, parseAsBuiltCsv, type ComparisonReport } from '@/lib/survey/asBuiltComparison'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'

export default function SettingOutPage() {
  const [dxfContent, setDxfContent] = useState('')
  const [stationE, setStationE] = useState('')
  const [stationN, setStationN] = useState('')
  const [stationRL, setStationRL] = useState('')
  const [instrumentHeight, setInstrumentHeight] = useState('')
  const [targetHeight, setTargetHeight] = useState('')
  const [coordinateFrame, setCoordinateFrame] = useState('')
  const [backsightE, setBacksightE] = useState('')
  const [backsightN, setBacksightN] = useState('')
  const [availableLayers, setAvailableLayers] = useState<string[]>([])
  const [selectedLayer, setSelectedLayer] = useState('')
  const [result, setResult] = useState<SettingOutResult | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exportFormat, setExportFormat] = useState<InstrumentFormat>('CSV')
  const [comparison, setComparison] = useState<ComparisonReport | null>(null)
  const [asBuiltInput, setAsBuiltInput] = useState('')

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = reader.result as string
      setDxfContent(content)
      const discovery = extractDesignPointsFromDXF(content)
      setAvailableLayers(discovery.layersFound)
      setSelectedLayer(discovery.layersFound.length === 1 ? discovery.layersFound[0] : '')
      setWarnings(discovery.warnings)
    }
    reader.readAsText(file)
  }, [])

  const handleImport = async () => {
    const numericInputs = [stationE, stationN, stationRL, instrumentHeight, targetHeight, backsightE, backsightN]
    if (!dxfContent || numericInputs.some(value => !value.trim() || !Number.isFinite(Number(value)))) {
      setError('DXF, coordinate frame, station/backsight coordinates, station RL, instrument height and target height are required as finite values')
      return
    }
    let crsCode = coordinateFrame.trim().toUpperCase()
    try {
      const crs = assertProjectedCrs(crsCode)
      if (crs.units !== 'metres') throw new Error(`${crs.code} is not a projected metre CRS`)
      crsCode = crs.code
    } catch (error) {
      setError(error instanceof Error ? `${error.message} The DXF is not transformed; this CRS is a user declaration.` : 'Enter a registered projected metre CRS, for example EPSG:32737')
      return
    }
    if (availableLayers.length > 1 && !selectedLayer) {
      setError('Select the design layer before computing the stakeout list')
      return
    }
    setLoading(true); setError(''); setResult(null); setWarnings([])
    try {
      for (const { label, e, n } of [
        { label: 'Station', e: Number(stationE), n: Number(stationN) },
        { label: 'Backsight', e: Number(backsightE), n: Number(backsightN) },
      ]) {
        const range = validateCoordinateRange(e, n, crsCode)
        if (!range.valid) throw new Error(`${label} is outside the declared ${crsCode} coordinate range: ${range.errors.join('; ')}`)
      }
      // Run the parsing completely on the client (offline-first)
      const extraction = extractDesignPointsFromDXF(dxfContent, {
        layerFilter: selectedLayer ? [selectedLayer] : [],
        defaultTH: Number(targetHeight),
      })
      if (extraction.points.length === 0) {
        throw new Error('No design points found in DXF')
      }
      for (const point of extraction.points) {
        const range = validateCoordinateRange(point.e, point.n, crsCode)
        if (!range.valid) throw new Error(`Design point ${point.id} is outside the declared ${crsCode} coordinate range: ${range.errors.join('; ')}`)
      }

      const station: InstrumentStation = {
        e: parseFloat(stationE),
        n: parseFloat(stationN),
        rl: Number(stationRL),
        ih: Number(instrumentHeight),
      }
      const backsight: Backsight = {
        e: parseFloat(backsightE),
        n: parseFloat(backsightN),
      }

      const computedResult = computeSettingOut(station, backsight, extraction.points)
      setResult(computedResult)
      setWarnings([`CRS ${crsCode} declared by the operator; the DXF coordinates were not transformed.`, ...(extraction.warnings || [])])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process DXF locally')
    }
    finally { setLoading(false) }
  }

  const handleExport = async () => {
    if (!result) return
    try {
      // Generate export locally
      const exportData = exportStakeout(result, exportFormat, { stationName: 'STN1' })
      const blob = new Blob([exportData.content], { type: exportData.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = exportData.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed locally')
    }
  }

  const handleCompare = () => {
    if (!result) return
    setError('')
    setComparison(null)
    try {
      const asBuiltPoints = parseAsBuiltCsv(asBuiltInput)

      const designPoints = result.rows.map(r => ({
        id: r.id, e: r.designE, n: r.designN, rl: r.designRL, th: r.TH,
      }))

      const report = compareAsBuiltToDesign({ designPoints, asBuiltPoints })
      setComparison(report)
    } catch (error) { setComparison(null); setError(error instanceof Error ? error.message : 'Failed to parse as-built CSV. Use: id,easting,northing[,rl]') }
  }

  const inputCls = "w-full h-9 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-600 focus:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] focus:outline-none"

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Setting Out</h1>
          <p className="text-sm text-[var(--text-muted)] mb-2">Import design from DXF → compute stakeout list → export to instrument → compare as-built</p>
        </div>
        <Link href="/tools/setting-out-sheet" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-color)] px-3 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent)]">
          Build a general coordinate sheet
        </Link>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">The coordinate frame is an operator declaration for the untransformed DXF. METARDU checks the registered projected CRS and coordinate ranges; it does not establish datum control or transform the source file.</p>

      {/* Step 1: Import DXF */}
      <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">1. Import Design from DXF</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="dxf-file">DXF File</label>
            <input id="dxf-file" type="file" accept=".dxf" onChange={handleFileUpload}
              className="w-full text-xs text-[var(--text-secondary)]" />
            {dxfContent && <CheckCircle2 className="w-4 h-4 text-green-500 inline ml-2" />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="station-e">Station E</label><input id="station-e" value={stationE} onChange={e => setStationE(e.target.value)} className={inputCls} placeholder="264000" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="station-n">Station N</label><input id="station-n" value={stationN} onChange={e => setStationN(e.target.value)} className={inputCls} placeholder="9861000" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="station-rl">Station RL (m)</label><input id="station-rl" value={stationRL} onChange={e => setStationRL(e.target.value)} className={inputCls} placeholder="Required" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="ih">Instrument height (m)</label><input id="ih" value={instrumentHeight} onChange={e => setInstrumentHeight(e.target.value)} className={inputCls} placeholder="Required" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="target-height">Target height (m)</label><input id="target-height" value={targetHeight} onChange={e => setTargetHeight(e.target.value)} className={inputCls} placeholder="Required" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="coordinate-frame">Coordinate frame / EPSG</label><input id="coordinate-frame" value={coordinateFrame} onChange={e => setCoordinateFrame(e.target.value)} className={inputCls} placeholder="EPSG:32737" /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="backsight-e">Backsight E</label><input id="backsight-e" value={backsightE} onChange={e => setBacksightE(e.target.value)} className={inputCls} /></div>
            <div><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="backsight-n">Backsight N</label><input id="backsight-n" value={backsightN} onChange={e => setBacksightN(e.target.value)} className={inputCls} /></div>
          </div>
        </div>
        {availableLayers.length > 0 && <div className="mt-3"><label className="text-[10px] text-[var(--text-muted)] block mb-1" htmlFor="design-layer">Design layer</label><select id="design-layer" value={selectedLayer} onChange={e => setSelectedLayer(e.target.value)} className={inputCls}><option value="">{availableLayers.length > 1 ? 'Select a layer' : 'All layers'}</option>{availableLayers.map(layer => <option key={layer} value={layer}>{layer}</option>)}</select></div>}
        <button onClick={handleImport} disabled={loading} className="mt-3 px-4 py-2 bg-[var(--accent)] text-black text-xs font-semibold rounded-lg hover:bg-[var(--accent-dim)] disabled:opacity-50">
          {loading ? 'Computing...' : 'Compute Stakeout List'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 text-xs text-yellow-400">
          {warnings.map((w, i) => <div key={i}><AlertCircle className="mr-1 inline h-4 w-4" aria-hidden="true" /> {w}</div>)}
        </div>
      )}
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-xs text-red-400 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

      {/* Step 2: Stakeout List */}
      {result && (
        <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">2. Stakeout List ({result.totalPoints} points)</h2>
            <div className="flex gap-2 items-center">
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value as InstrumentFormat)} className={inputCls + ' w-auto'}>
                {getAvailableFormats().map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-xs font-semibold rounded-lg hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <th className="text-left py-2 px-1">ID</th><th className="text-right">Hz Angle</th><th className="text-right">HD (m)</th><th className="text-right">SD (m)</th><th className="text-right">Design E</th><th className="text-right">Design N</th><th className="text-right">RL</th>
              </tr></thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-[color-mix(in_srgb,var(--border-color)_30%,transparent)] text-[var(--text-secondary)]">
                    <td className="py-1.5 px-1 font-mono">{row.id}</td>
                    <td className="text-right font-mono">{row.HzAngle}</td>
                    <td className="text-right font-mono">{row.HD.toFixed(3)}</td>
                    <td className="text-right font-mono">{row.SD.toFixed(3)}</td>
                    <td className="text-right font-mono">{row.designE.toFixed(3)}</td>
                    <td className="text-right font-mono">{row.designN.toFixed(3)}</td>
                    <td className="text-right font-mono">{row.designRL.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)]">BS bearing: {result.bsBearing} | {result.rows.length} points</div>
        </div>
      )}

      {/* Step 3: As-Built Comparison */}
      {result && (
        <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">3. As-Built Comparison</h2>
          <p className="text-[10px] text-[var(--text-muted)] mb-2">Paste as-built shots (one per line: id,easting,northing,rl)</p>
          <textarea value={asBuiltInput} onChange={e => setAsBuiltInput(e.target.value)} placeholder="P1,264100.010,9861100.005,1500.002" className={inputCls + ' h-20 font-mono mb-2'} />
          <button onClick={handleCompare} className="px-4 py-2 bg-[var(--accent)] text-black text-xs font-semibold rounded-lg hover:bg-[var(--accent-dim)]">Compare As-Built vs Design</button>

          {comparison && (
            <div className="mt-4">
              <div className={`p-3 rounded-lg mb-3 text-sm font-semibold ${comparison.verdict === 'PASS' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : comparison.verdict === 'FAIL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                {comparison.summary}
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]">
                  <th className="text-left py-1">ID</th><th className="text-right">dE (mm)</th><th className="text-right">dN (mm)</th><th className="text-right">dH (mm)</th><th className="text-right">|H| (mm)</th><th className="text-center">Status</th>
                </tr></thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.designId} className={`border-b border-[color-mix(in_srgb,var(--border-color)_30%,transparent)] ${row.passed ? 'text-[var(--text-secondary)]' : 'text-red-400'}`}>
                      <td className="py-1 font-mono">{row.designId}</td>
                      <td className="text-right font-mono">{(row.deltaE * 1000).toFixed(1)}</td>
                      <td className="text-right font-mono">{(row.deltaN * 1000).toFixed(1)}</td>
                      <td className="text-right font-mono">{row.deltaRL !== null ? (row.deltaRL * 1000).toFixed(1) : '—'}</td>
                      <td className="text-right font-mono">{(row.horizontalOffset * 1000).toFixed(1)}</td>
                      <td className="text-center">{row.passed ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
