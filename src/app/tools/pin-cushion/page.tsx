'use client'

import React, { useState, useMemo } from 'react'
import {
  analyzePinCushion,
  MonumentRecovery,
  PinCushionInput,
  PinCushionResult,
} from '@/lib/survey/pinCushionAnalysis'
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
  Target,
  Download,
  Printer,
  Plus,
  Trash2,
  Upload,
  ScatterChart,
  ShieldCheck,
  Scale,
} from 'lucide-react'

const PRESET_DISPUTES: Record<string, { name: string; monumentId: string; monumentType: string; recoveries: MonumentRecovery[] }> = {
  kajiado_corner: {
    name: 'Disputed Corner MB-03 (4 Registered Surveyors)',
    monumentId: 'MB-03',
    monumentType: 'concrete',
    recoveries: [
      { id: 'REC-1', easting: 250242.512, northing: 9845142.015, date: '2023-03-12', surveyor: 'Surv. Mutua (MISK 210)', method: 'GNSS RTK', weight: 1.0 },
      { id: 'REC-2', easting: 250242.528, northing: 9845142.008, date: '2023-08-20', surveyor: 'Surv. Omondi (MISK 188)', method: 'Total Station', weight: 2.0 },
      { id: 'REC-3', easting: 250242.518, northing: 9845142.022, date: '2024-02-14', surveyor: 'Surv. Wanjiku (MISK 304)', method: 'GNSS RTK', weight: 1.0 },
      { id: 'REC-4', easting: 250242.610, northing: 9845142.115, date: '2024-09-01', surveyor: 'Disputed Peg (Unlicensed)', method: 'Tape & Compass', weight: 0.5 },
    ],
  },
  subdivision_epoch: {
    name: 'Multi-Epoch RTK Boundary Pin Re-Observation',
    monumentId: 'CP-14',
    monumentType: 'iron_pin',
    recoveries: [
      { id: 'EP-1', easting: 215400.012, northing: 9918200.010, date: '2026-01-15', surveyor: 'Crew Alpha (Base NRBI)', method: 'GNSS RTK', weight: 1.0 },
      { id: 'EP-2', easting: 215400.016, northing: 9918200.014, date: '2026-02-10', surveyor: 'Crew Alpha (Base KADO)', method: 'GNSS RTK', weight: 1.0 },
      { id: 'EP-3', easting: 215400.010, northing: 9918200.008, date: '2026-03-05', surveyor: 'Quality Audit (Static)', method: 'GNSS Static', weight: 2.5 },
    ],
  },
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value)
  const protectedValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${protectedValue.replace(/"/g, '""')}"`
}

export default function PinCushionPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('kajiado_corner')
  const [monumentId, setMonumentId] = useState('MB-03')
  const [monumentType, setMonumentType] = useState('concrete')
  const [recoveries, setRecoveries] = useState<MonumentRecovery[]>(PRESET_DISPUTES.kajiado_corner.recoveries)
  const [useWeightedMean, setUseWeightedMean] = useState(true)
  const [coordinateReference, setCoordinateReference] = useState('')
  const [coordinatesConfirmed, setCoordinatesConfirmed] = useState(false)
  const [reviewToleranceMm, setReviewToleranceMm] = useState('')

  // Modals & form state
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  // Handle preset change
  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key)
    const p = PRESET_DISPUTES[key]
    if (p) {
      setMonumentId(p.monumentId)
      setMonumentType(p.monumentType)
      setRecoveries(p.recoveries)
    }
  }

  // Edit recovery item
  const updateRecovery = <K extends keyof MonumentRecovery,>(index: number, field: K, value: MonumentRecovery[K]) => {
    const next = [...recoveries]
    next[index] = { ...next[index], [field]: value }
    setRecoveries(next)
  }

  const addRecovery = () => {
    const last = recoveries[recoveries.length - 1]
    const nextNum = recoveries.length + 1
    setRecoveries([
      ...recoveries,
      {
        id: `REC-${nextNum}`,
        easting: last ? last.easting + 0.01 : 250000.0,
        northing: last ? last.northing + 0.01 : 9800000.0,
        date: new Date().toISOString().slice(0, 10),
        surveyor: 'Field Surveyor',
        method: 'GNSS RTK',
        weight: 1.0,
      },
    ])
  }

  const removeRecovery = (index: number) => {
    if (recoveries.length <= 2) {
      alert('At least 2 recovery observations are required for pin-cushion dispersion analysis.')
      return
    }
    setRecoveries(recoveries.filter((_, i) => i !== index))
  }

  // Parse pasted CSV
  const handleApplyPasted = () => {
    try {
      const lines = pasteText.trim().split('\n')
      const parsed: MonumentRecovery[] = []
      for (const line of lines) {
        const parts = line.split(/[,\s\t]+/).filter(Boolean)
        if (parts.length >= 3) {
          const id = parts[0]
          const e = parseFloat(parts[1])
          const n = parseFloat(parts[2])
          const surveyor = parts[3] || 'Surveyor'
          const method = parts[4] || 'GNSS RTK'
          const weight = parseFloat(parts[5]) || 1.0
          if (!isNaN(e) && !isNaN(n)) {
            parsed.push({
              id,
              easting: e,
              northing: n,
              date: new Date().toISOString().slice(0, 10),
              surveyor,
              method,
              weight,
            })
          }
        }
      }
      if (parsed.length >= 2) {
        setRecoveries(parsed)
        setPasteModalOpen(false)
        setPasteText('')
      } else {
        alert('Please enter at least 2 valid recoveries (Format: ID, Easting, Northing, [Surveyor], [Method], [Weight]).')
      }
    } catch {
      alert('Error parsing recovery schedule.')
    }
  }

  // Compute statistical analysis
  const result = useMemo<PinCushionResult | null>(() => {
    if (recoveries.length < 2 || !coordinateReference.trim() || !coordinatesConfirmed) return null
    if (recoveries.some((item) => !Number.isFinite(item.easting) || !Number.isFinite(item.northing))) return null
    try {
      const input: PinCushionInput = {
        monumentId,
        monumentType,
        recoveries,
        useWeightedMean,
      }
      return analyzePinCushion(input)
    } catch {
      return null
    }
  }, [recoveries, monumentId, monumentType, useWeightedMean, coordinateReference, coordinatesConfirmed])

  // Compare the measured spread only with a criterion explicitly entered by
  // the surveyor. An empty field means no pass/fail judgement is made.
  const reviewStatus = useMemo(() => {
    if (!result) return null
    const spreadMm = result.maxSpread * 1000
    const tolerance = Number(reviewToleranceMm)
    if (!reviewToleranceMm || !Number.isFinite(tolerance) || tolerance <= 0) {
      return {
        level: 'Measured spread',
        color: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
        desc: `Maximum observed spread: ${spreadMm.toFixed(1)} mm. Set a project review threshold to compare it; this is not an acceptance decision.`,
      }
    }
    if (spreadMm <= tolerance) {
      return {
        level: 'Within selected review threshold',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        desc: `Maximum observed spread is ${spreadMm.toFixed(1)} mm against your ${tolerance} mm review threshold. This is not a legal or registry decision.`,
      }
    } else {
      return {
        level: 'Above selected review threshold',
        color: 'text-red-400 bg-red-500/10 border-red-500/30',
        desc: `Maximum observed spread is ${spreadMm.toFixed(1)} mm, above your ${tolerance} mm review threshold. Review the observations and applicable requirements.`,
      }
    }
  }, [result, reviewToleranceMm])

  // SVG Plot Bounds and Scaling
  const plotData = useMemo(() => {
    if (!result || recoveries.length < 2) return null

    const allE = recoveries.map((r) => r.easting)
    const allN = recoveries.map((r) => r.northing)
    const minE = Math.min(...allE)
    const maxE = Math.max(...allE)
    const minN = Math.min(...allN)
    const maxN = Math.max(...allN)

    const spanE = Math.max(maxE - minE, 0.04)
    const spanN = Math.max(maxN - minN, 0.04)
    const padE = spanE * 0.35
    const padN = spanN * 0.35

    const vMinE = minE - padE
    const vMaxE = maxE + padE
    const vMinN = minN - padN
    const vMaxN = maxN + padN

    const width = 450
    const height = 450

    const scaleE = width / (vMaxE - vMinE)
    const scaleN = height / (vMaxN - vMinN)

    const toX = (e: number) => (e - vMinE) * scaleE
    const toY = (n: number) => height - (n - vMinN) * scaleN // Invert Y

    const meanCoord = useWeightedMean ? result.weightedMeanPosition : result.meanPosition

    return {
      width,
      height,
      toX,
      toY,
      scaleE,
      scaleN,
      meanX: toX(meanCoord.easting),
      meanY: toY(meanCoord.northing),
      vMinE,
      vMaxE,
      vMinN,
      vMaxN,
    }
  }, [result, recoveries, useWeightedMean])

  // Export a review report, never a survey or statutory certificate.
  const handlePrintReport = () => {
    if (!result) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const consensusCoord = useWeightedMean ? result.weightedMeanPosition : result.meanPosition
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Boundary Recovery Review — ${escapeHtml(monumentId)}</title>
          <style>
            body { font-family: 'Times New Roman', Georgia, serif; padding: 40px; color: #111; line-height: 1.6; }
            h1 { text-align: center; text-transform: uppercase; font-size: 16pt; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 8px; border: 1px solid #333; font-size: 10pt; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; font-size: 10pt; }
            th, td { border: 1px solid #666; padding: 6px; text-align: left; }
            th { background: #f0f0f0; }
            .consensus-box { background: #f9f9f9; border: 2px solid #222; padding: 16px; margin-bottom: 24px; }
          </style>
        </head>
        <body>
          <h1>Boundary Recovery Review</h1>
          <p><strong>Monument ID:</strong> ${escapeHtml(monumentId)} &nbsp;|&nbsp; <strong>Monument Type:</strong> ${escapeHtml(monumentType)} &nbsp;|&nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Declared CRS:</strong> ${escapeHtml(coordinateReference)}; operator confirms projected coordinates in metres. METARDU does not verify or transform this reference system.</p>
          <p><strong>METARDU draft — for licensed surveyor review.</strong> This analysis is not a legal opinion, certified survey, official tolerance check, or registry approval. Confirm the project CRS, evidence and applicable current requirements independently.</p>
          <p><strong>Dataset status:</strong> ${selectedPreset ? 'Fictional demonstration data; not field evidence.' : 'User-entered data; verify source records.'}</p>
          <div class="consensus-box">
            <h3 style="margin-top:0;">Calculated central coordinate (review only)</h3>
            <p><strong>Easting:</strong> ${consensusCoord.easting.toFixed(4)} m<br/>
            <strong>Northing:</strong> ${consensusCoord.northing.toFixed(4)} m<br/>
            <strong>Positional Spread:</strong> ${(result.maxSpread * 1000).toFixed(1)} mm<br/>
            <strong>Review indicator:</strong> ${escapeHtml(reviewStatus?.level ?? 'Not assessed')}</p>
          </div>
          <h3>Observed Recoveries (${recoveries.length} Epochs)</h3>
          <table>
            <tr><th>ID</th><th>Easting (m)</th><th>Northing (m)</th><th>Surveyor / Source</th><th>Method</th><th>Weight</th><th>Outlier?</th></tr>
            ${recoveries
              .map((r) => {
                const isOutlier = result.outliers.some((o) => o.id === r.id)
                return `<tr>
                <td>${escapeHtml(r.id)}</td>
                <td>${r.easting.toFixed(3)}</td>
                <td>${r.northing.toFixed(3)}</td>
                <td>${escapeHtml(r.surveyor || '—')}</td>
                <td>${escapeHtml(r.method || '—')}</td>
                <td>${r.weight || 1}</td>
                <td>${isOutlier ? '<strong>Flagged for review</strong>' : 'Retained by selected analysis'}</td>
              </tr>`
              })
              .join('')}
          </table>
          <p><strong>Standard Deviation:</strong> &sigma;E = ${(result.standardDeviation.easting * 1000).toFixed(
            1
          )} mm, &sigma;N = ${(result.standardDeviation.northing * 1000).toFixed(1)} mm</p>
          <p><strong>95% Confidence Ellipse:</strong> Semi-Major = ${(
            result.confidenceEllipse.semiMajor * 1000
          ).toFixed(1)} mm, Semi-Minor = ${(result.confidenceEllipse.semiMinor * 1000).toFixed(1)} mm</p>
          <p>Generated by METARDU for review. Any professional decision, verification and signature must be made by the responsible licensed surveyor.</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 300)
  }

  // Export CSV
  const handleExportCsv = () => {
    if (!result) return
    const consensusCoord = useWeightedMean ? result.weightedMeanPosition : result.meanPosition
    const rows: Array<Array<string | number>> = [
      ['Document', 'METARDU boundary recovery review draft'],
      ['Monument_ID', monumentId],
      ['Declared_CRS', coordinateReference],
      ['Projected_Metre_Coordinates_Confirmed', 'Operator declared; not independently verified'],
      ['Dataset_Status', selectedPreset ? 'Fictional demonstration data; not field evidence' : 'User-entered data; verify source records'],
      ['Calculated_Central_Easting_m', consensusCoord.easting.toFixed(4)],
      ['Calculated_Central_Northing_m', consensusCoord.northing.toFixed(4)],
      ['Maximum_Spread_mm', (result.maxSpread * 1000).toFixed(1)],
      ['Review_Threshold_mm', reviewToleranceMm || 'Not set'],
      [],
      ['Recovery_ID', 'Easting_m', 'Northing_m', 'Surveyor_or_Source', 'Method', 'Weight', 'Delta_E_mm', 'Delta_N_mm', 'Flagged_By_Selected_Analysis'],
    ]
    recoveries.forEach((r) => {
      const dE = (r.easting - consensusCoord.easting) * 1000
      const dN = (r.northing - consensusCoord.northing) * 1000
      const isOut = result.outliers.some((o) => o.id === r.id)
      rows.push([r.id, r.easting.toFixed(4), r.northing.toFixed(4), r.surveyor || '', r.method || '', r.weight || 1, dE.toFixed(1), dN.toFixed(1), isOut ? 'Yes' : 'No'])
    })

    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeMonumentId = monumentId.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80) || 'unidentified'
    a.download = `METARDU_Boundary_Review_${safeMonumentId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pin-Cushion Analysis</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          badge="BOUNDARY RECOVERY REVIEW"
          title="Pin-Cushion Boundary Corner Dispute &amp; Recovery Analysis"
          subtitle="Compare multiple monument recovery observations, calculate a weighted or unweighted central coordinate, inspect dispersion and confidence estimates, and optionally compare the spread with a project-specific review threshold. Results require professional review and do not establish a boundary or certify compliance."
          reference="Statistical summary for surveyor review; confirm methods, CRS, uncertainty assumptions and applicable requirements independently."
        />

        {selectedPreset && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Demonstration dataset: the preloaded observations and identities are fictional and are not field evidence. Replace them with verified project records before using or exporting this analysis.
          </p>
        )}

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 space-y-3">
          <label className="block text-sm font-medium" htmlFor="pin-cushion-crs">Declared projected CRS</label>
          <input
            id="pin-cushion-crs"
            value={coordinateReference}
            onChange={(event) => setCoordinateReference(event.target.value)}
            placeholder="Enter the project's declared CRS (for example, an EPSG code)"
            autoComplete="off"
            className="w-full max-w-xl rounded-lg border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm font-mono"
          />
          <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
            <input type="checkbox" checked={coordinatesConfirmed} onChange={(event) => setCoordinatesConfirmed(event.target.checked)} className="mt-0.5" />
            <span>I confirm all recovery coordinates use this projected CRS and metres. This declaration is not independently verified and METARDU does not transform coordinates.</span>
          </label>
          {(!coordinateReference.trim() || !coordinatesConfirmed) && (
            <p className="text-xs text-amber-300">Declare and confirm the project CRS to calculate spread or generate a review report.</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div>
            <label htmlFor="review-tolerance-mm" className="block text-sm font-medium">Optional project review threshold (mm)</label>
            <input
              id="review-tolerance-mm"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={reviewToleranceMm}
              onChange={(event) => setReviewToleranceMm(event.target.value)}
              className="mt-1 w-56 rounded-lg border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm"
              placeholder="Leave blank for measurement only"
            />
          </div>
          <p className="max-w-xl text-xs text-[var(--text-muted)]">This comparison uses the threshold you enter. METARDU does not supply an official or statutory tolerance here.</p>
        </div>

        {/* Status Banner */}
        {reviewStatus && result && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${reviewStatus.color}`}>
            <div className="flex items-center gap-3">
              <Scale className="w-6 h-6" />
              <div>
                <div className="text-base font-extrabold">{reviewStatus.level}</div>
                <div className="text-xs opacity-90">{reviewStatus.desc}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrintReport}
                className="py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print Review Report
              </button>
              <button
                onClick={handleExportCsv}
                className="py-1.5 px-3 rounded-xl bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1.5 hover:opacity-90"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>
        )}

        {/* Main Grid: Left Inputs (7 cols), Right Plot & Results (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Recoveries Table */}
          <div className="lg:col-span-7 space-y-6">
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--accent)]" />
                  <h2 className="text-sm font-bold">Monument Recoveries ({recoveries.length} Observations)</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Recovery example selection"
                    value={selectedPreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    className="rounded-lg border border-[var(--border-color)] bg-black/20 px-2.5 py-1 text-xs focus:outline-none"
                  >
                    {Object.entries(PRESET_DISPUTES).map(([k, v]) => (
                      <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPasteModalOpen(true)}
                    className="py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Paste CSV
                  </button>
                  <button
                    onClick={addRecovery}
                    className="py-1 px-2.5 rounded-lg bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Epoch
                  </button>
                </div>
              </div>

              {/* Monument Particulars */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Monument Beacon ID</label>
                  <input aria-label="Monument beacon identifier"
                    type="text"
                    value={monumentId}
                    onChange={(e) => setMonumentId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs font-bold font-mono focus:outline-none focus:border-[var(--accent)] text-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Monument Physical Mark</label>
                  <select aria-label="Monument type"
                    value={monumentType}
                    onChange={(e) => setMonumentType(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="concrete" className="bg-[var(--bg-secondary)]">Concrete Pillar</option>
                    <option value="iron_pin" className="bg-[var(--bg-secondary)]">Iron Pin</option>
                    <option value="pillar" className="bg-[var(--bg-secondary)]">Triangulation Beacon</option>
                    <option value="peg" className="bg-[var(--bg-secondary)]">Wooden Peg</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="weightedCheck"
                    checked={useWeightedMean}
                    onChange={(e) => setUseWeightedMean(e.target.checked)}
                    className="rounded border-[var(--border-color)] text-[var(--accent)]"
                  />
                  <label htmlFor="weightedCheck" className="text-xs font-medium cursor-pointer">
                    Apply Observation Weights
                  </label>
                </div>
              </div>

              {/* Table of Recoveries */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {recoveries.map((r, idx) => {
                  const isOutlier = result?.outliers.some((o) => o.id === r.id)
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border transition-colors space-y-2 text-xs ${
                        isOutlier
                          ? 'border-red-500/40 bg-red-500/10'
                          : 'border-[var(--border-color)] bg-black/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input aria-label={`Recovery ${idx + 1} identifier`}
                            type="text"
                            value={r.id}
                            onChange={(e) => updateRecovery(idx, 'id', e.target.value)}
                            className="w-16 bg-transparent font-mono font-bold focus:outline-none"
                          />
                          <input aria-label={`Recovery ${idx + 1} surveyor`}
                            type="text"
                            value={r.surveyor}
                            placeholder="Surveyor / Agency"
                            onChange={(e) => updateRecovery(idx, 'surveyor', e.target.value)}
                            className="bg-transparent text-[var(--text-secondary)] focus:outline-none w-44"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          {isOutlier && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">
                              REJECTED OUTLIER
                            </span>
                          )}
                          <button aria-label={`Remove recovery ${idx + 1}`}
                            onClick={() => removeRecovery(idx)}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-[var(--text-secondary)]">E: </span>
                          <input aria-label={`Recovery ${idx + 1} easting in metres`}
                            type="number"
                            step="0.001"
                            value={r.easting}
                            onChange={(e) => updateRecovery(idx, 'easting', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-transparent font-mono focus:outline-none font-semibold"
                          />
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)]">N: </span>
                          <input aria-label={`Recovery ${idx + 1} northing in metres`}
                            type="number"
                            step="0.001"
                            value={r.northing}
                            onChange={(e) => updateRecovery(idx, 'northing', parseFloat(e.target.value) || 0)}
                            className="w-24 bg-transparent font-mono focus:outline-none font-semibold"
                          />
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)]">Method: </span>
                          <select aria-label={`Recovery ${idx + 1} observation method`}
                            value={r.method}
                            onChange={(e) => updateRecovery(idx, 'method', e.target.value)}
                            className="bg-transparent border border-[var(--border-color)] rounded px-1 text-[10px]"
                          >
                            <option value="GNSS RTK" className="bg-[var(--bg-secondary)]">GNSS RTK</option>
                            <option value="Total Station" className="bg-[var(--bg-secondary)]">Total Station</option>
                            <option value="GNSS Static" className="bg-[var(--bg-secondary)]">GNSS Static</option>
                            <option value="Tape & Compass" className="bg-[var(--bg-secondary)]">Tape & Compass</option>
                          </select>
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)]">Weight: </span>
                          <input aria-label={`Recovery ${idx + 1} relative weight`}
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="5.0"
                            value={r.weight}
                            onChange={(e) => updateRecovery(idx, 'weight', parseFloat(e.target.value) || 1)}
                            className="w-12 bg-transparent font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Error Ellipse Plot & Statistical Summary */}
          <div className="lg:col-span-5 space-y-6">
            {/* SVG Dispersion & Error Ellipse Plot */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ScatterChart className="w-4 h-4 text-[var(--accent)]" />
                  95% Confidence Error Ellipse &amp; Scatter
                </h3>
                <span className="text-xs font-mono text-[var(--text-secondary)]">Millimeter Domain</span>
              </div>

              <div className="w-full h-72 bg-black/40 border border-[var(--border-color)] rounded-xl overflow-hidden flex items-center justify-center relative p-3">
                {plotData && result && (
                  <svg width="100%" height="100%" viewBox={`0 0 ${plotData.width} ${plotData.height}`}>
                    {/* Grid crosshairs at resolved centroid */}
                    <line
                      x1="0"
                      y1={plotData.meanY}
                      x2={plotData.width}
                      y2={plotData.meanY}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1={plotData.meanX}
                      y1="0"
                      x2={plotData.meanX}
                      y2={plotData.height}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="4 4"
                    />

                    {/* 95% Confidence Error Ellipse */}
                    <ellipse
                      cx={plotData.meanX}
                      cy={plotData.meanY}
                      rx={Math.max(result.confidenceEllipse.semiMajor * plotData.scaleE, 6)}
                      ry={Math.max(result.confidenceEllipse.semiMinor * plotData.scaleN, 6)}
                      fill="rgba(59, 130, 246, 0.1)"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                      transform={`rotate(${result.confidenceEllipse.rotation} ${plotData.meanX} ${plotData.meanY})`}
                    />

                    {/* Observed Recoveries Scatter */}
                    {recoveries.map((r, i) => {
                      const px = plotData.toX(r.easting)
                      const py = plotData.toY(r.northing)
                      const isOutlier = result.outliers.some((o) => o.id === r.id)
                      return (
                        <g key={i}>
                          <circle
                            cx={px}
                            cy={py}
                            r="5"
                            fill={isOutlier ? '#ef4444' : '#eab308'}
                            stroke="white"
                            strokeWidth="1.5"
                          />
                          <text
                            x={px + 8}
                            y={py - 6}
                            fill={isOutlier ? '#ef4444' : '#d4d4d8'}
                            fontSize="10"
                            fontFamily="monospace"
                          >
                            {r.id} {isOutlier ? '(Outlier)' : ''}
                          </text>
                        </g>
                      )
                    })}

                    {/* Resolved Consensus Center */}
                    <circle
                      cx={plotData.meanX}
                      cy={plotData.meanY}
                      r="7"
                      fill="#22c55e"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </svg>
                )}

                <div className="absolute bottom-2 left-2 text-[10px] text-[var(--text-secondary)] bg-black/70 px-2 py-1 rounded">
                  <span className="text-green-400">Resolved Centroid</span> &nbsp;|&nbsp; <span className="text-amber-400">Observed Epochs</span> &nbsp;|&nbsp; <span className="text-red-400">Outliers</span>
                </div>
              </div>
            </div>

            {/* Statistical Results Card */}
            {result && (
              <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold border-b border-[var(--border-color)] pb-2 flex items-center justify-between">
                  <span>Statistical Least-Squares Consensus</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)] space-y-1">
                    <div className="text-[10px] text-[var(--text-secondary)]">CONSENSUS COORDINATES ({useWeightedMean ? 'Weighted' : 'Arithmetic'})</div>
                    <div className="font-mono text-sm font-bold text-emerald-400">
                      E: {(useWeightedMean ? result.weightedMeanPosition : result.meanPosition).easting.toFixed(4)} m
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-400">
                      N: {(useWeightedMean ? result.weightedMeanPosition : result.meanPosition).northing.toFixed(4)} m
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-black/20 border border-[var(--border-color)]">
                      <div className="text-[10px] text-[var(--text-secondary)]">Max Spread</div>
                      <div className="font-mono font-bold text-sm text-[var(--accent)]">
                        {(result.maxSpread * 1000).toFixed(1)} mm
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/20 border border-[var(--border-color)]">
                      <div className="text-[10px] text-[var(--text-secondary)]">Outliers Flagged</div>
                      <div className="font-mono font-bold text-sm text-red-400">
                        {result.outliers.length} point(s)
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[var(--text-secondary)] pt-1">
                    <div>&sigma; Easting: ±{(result.standardDeviation.easting * 1000).toFixed(1)} mm</div>
                    <div>&sigma; Northing: ±{(result.standardDeviation.northing * 1000).toFixed(1)} mm</div>
                    <div>Semi-Major (a): {(result.confidenceEllipse.semiMajor * 1000).toFixed(1)} mm</div>
                    <div>Semi-Minor (b): {(result.confidenceEllipse.semiMinor * 1000).toFixed(1)} mm</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal: Paste CSV */}
        {pasteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-base font-bold">Paste Monument Recovery Observations</h3>
                <button aria-label="Close coordinate import" onClick={() => setPasteModalOpen(false)} className="text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Format: <code>ID, Easting, Northing, [Surveyor], [Method], [Weight]</code> (one recovery per line).
              </p>
              <textarea aria-label="Recovery observations to import"
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="REC-1, 250242.512, 9845142.015, Surv. Mutua, GNSS RTK, 1.0&#10;REC-2, 250242.528, 9845142.008, Surv. Omondi, Total Station, 2.0"
                className="w-full rounded-xl border border-[var(--border-color)] bg-black/30 p-3 text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setPasteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyPasted}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-black font-bold text-xs hover:opacity-90"
                >
                  Apply Recoveries
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
