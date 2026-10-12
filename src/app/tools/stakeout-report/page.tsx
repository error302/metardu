'use client'

/**
 * METARDU — Stakeout Cut Sheet / Variance Report Tool
 * =====================================================
 * UI for reviewing stakeout sessions, entering design vs. staked
 * coordinates, configuring tolerances, and generating printable cut sheets.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  Target,
  Download,
  Printer,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  FileText,
  Upload,
  Layers,
  Scale,
  Building,
} from 'lucide-react'
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
  computeStakeoutReport,
  generateStakeoutCutSheetHTML,
  type StakeoutPoint,
  type StakeoutReportInput,
  type StakeoutReportResult,
} from '@/lib/reports/stakeoutCutSheet'
import { parseStakeoutCsv, STAKEOUT_CSV_HEADER } from '@/lib/reports/stakeoutCsv'

const SAMPLE_DATASETS: Record<string, { name: string; project: string; lr: string; method: StakeoutReportInput['method']; points: StakeoutPoint[] }> = {
  column_grid: {
    name: 'Synthetic foundation example',
    project: 'Synthetic foundation training sample',
    lr: '',
    method: 'Total Station',
    points: [
      {
        pointId: 'COL-A1',
        design: { easting: 275100.000, northing: 9840200.000, elevation: 1520.500 },
        staked: { easting: 275100.008, northing: 9840200.005, elevation: 1520.503 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'COL-A2',
        design: { easting: 275112.000, northing: 9840200.000, elevation: 1520.500 },
        staked: { easting: 275112.012, northing: 9840200.009, elevation: 1520.495 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'COL-B1',
        design: { easting: 275100.000, northing: 9840218.000, elevation: 1520.500 },
        staked: { easting: 275100.005, northing: 9840218.014, elevation: 1520.502 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'COL-B2',
        design: { easting: 275112.000, northing: 9840218.000, elevation: 1520.500 },
        staked: { easting: 275112.009, northing: 9840218.007, elevation: 1520.498 },
        timestamp: new Date().toISOString(),
      },
    ],
  },
  road_chainage: {
    name: 'Synthetic road example',
    project: 'Synthetic road training sample',
    lr: '',
    method: 'GNSS RTK',
    points: [
      {
        pointId: 'CH_4000',
        design: { easting: 260100.000, northing: 9815000.000, elevation: 1640.200 },
        staked: { easting: 260100.025, northing: 9815000.018, elevation: 1640.208 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'CH_4020',
        design: { easting: 260118.500, northing: 9815007.200, elevation: 1640.350 },
        staked: { easting: 260118.532, northing: 9815007.225, elevation: 1640.344 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'CH_4040',
        design: { easting: 260136.900, northing: 9815014.800, elevation: 1640.510 },
        staked: { easting: 260136.921, northing: 9815014.795, elevation: 1640.518 },
        timestamp: new Date().toISOString(),
      },
      {
        pointId: 'CH_4060',
        design: { easting: 260155.100, northing: 9815022.900, elevation: 1640.680 },
        staked: { easting: 260155.148, northing: 9815022.942, elevation: 1640.672 },
        timestamp: new Date().toISOString(),
      },
    ],
  },
}

export default function StakeoutReportPage() {
  // Project metadata
  const [projectName, setProjectName] = useState('')
  const [landReference, setLandReference] = useState('')
  const [surveyorName, setSurveyorName] = useState('')
  const [surveyorLicense, setSurveyorLicense] = useState('')
  const [instrument, setInstrument] = useState('')
  const [instrumentSerial, setInstrumentSerial] = useState('')
  const [method, setMethod] = useState<NonNullable<StakeoutReportInput['method']> | ''>('')
  const [crs, setCrs] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [verticalDatum, setVerticalDatum] = useState('')
  const [designRevision, setDesignRevision] = useState('')
  const [toleranceReference, setToleranceReference] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  // Tolerance
  const [horizontalTol, setHorizontalTol] = useState(NaN)
  const [verticalTol, setVerticalTol] = useState<number | undefined>(undefined)

  // Points
  const [points, setPoints] = useState<StakeoutPoint[]>([])
  const [pointPage, setPointPage] = useState(0)
  const pageSize = 50
  const visiblePage = Math.min(pointPage, Math.max(0, Math.ceil(points.length / pageSize) - 1))

  // Handle preset select
  const handlePresetSelect = (key: string) => {
    setPointPage(0)
    setSelectedPreset(key)
    const ds = SAMPLE_DATASETS[key]
    if (ds) {
      setProjectName(ds.project)
      setLandReference(ds.lr)
      setMethod(ds.method ?? '')
      setPoints(ds.points.map(point => ({ ...point, timestamp: '', design: { ...point.design }, staked: { ...point.staked } })))
      setCrs('EPSG:21037')
      setHorizontalTol(0.015)
      setVerticalTol(0.01)
      setToleranceReference('SYNTHETIC-EXAMPLE-01 — demonstration limits only')
      setVerticalDatum('Synthetic local benchmark')
      setDesignRevision('SYNTHETIC-REV-1')
    } else {
      setPoints([])
      setProjectName('')
      setLandReference('')
      setCrs('')
      setMethod('')
      setHorizontalTol(NaN)
      setVerticalTol(undefined)
      setToleranceReference('')
      setVerticalDatum('')
      setDesignRevision('')
    }
  }

  const addPoint = useCallback(() => {
    let next = points.length + 1
    while (points.some(point => point.pointId === `P-${String(next).padStart(2, '0')}`)) next += 1
    const nextId = `P-${String(next).padStart(2, '0')}`
    setPoints((prev) => [
      ...prev,
      {
        pointId: nextId,
        design: {
          easting: NaN,
          northing: NaN,
        },
        staked: {
          easting: NaN,
          northing: NaN,
        },
        timestamp: '',
      },
    ])
    setPointPage(Math.floor(points.length / pageSize))
  }, [points])

  const removePoint = useCallback((index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updatePoint = useCallback(
    (index: number, field: string, value: number | string | undefined) => {
      setPoints((prev) => {
        const updated = [...prev]
        const point = { ...updated[index] }

        if (field === 'pointId') {
          point.pointId = value as string
        } else if (field === 'notes' || field === 'timestamp') {
          point[field] = value as string
        } else if (field === 'accuracyM') {
          point.accuracyM = value as number | undefined
        } else if (field.startsWith('design.')) {
          const key = field.replace('design.', '') as 'easting' | 'northing' | 'elevation'
          point.design = { ...point.design, [key]: value as number }
        } else if (field.startsWith('staked.')) {
          const key = field.replace('staked.', '') as 'easting' | 'northing' | 'elevation'
          point.staked = { ...point.staked, [key]: value as number }
        }

        updated[index] = point
        return updated
      })
    },
    []
  )

  const { report, reportError } = useMemo(() => {
    const input: StakeoutReportInput = {
      projectName: projectName || 'Unnamed Project',
      landReference: landReference || undefined,
      surveyorName,
      surveyorLicense: surveyorLicense || undefined,
      reportDate: new Date().toISOString().slice(0, 10),
      instrument: instrument || undefined,
      instrumentSerial: instrumentSerial || undefined,
      method: method || undefined,
      crs,
      verticalDatum,
      designRevision,
      synthetic: Boolean(selectedPreset),
      tolerance: {
        horizontalM: horizontalTol,
        verticalM: verticalTol,
        reference: toleranceReference,
      },
      points,
    }
    try {
      return { report: computeStakeoutReport(input), reportError: null }
    } catch (error) {
      return { report: null as StakeoutReportResult | null, reportError: error instanceof Error ? error.message : 'Review the entered observations.' }
    }
  }, [projectName, landReference, surveyorName, surveyorLicense, instrument, instrumentSerial, method, crs, horizontalTol, verticalTol, points, selectedPreset, verticalDatum, designRevision, toleranceReference])

  const printReport = useCallback(() => {
    if (!report || report.points.length === 0) return
    const html = generateStakeoutCutSheetHTML(report)
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setTimeout(() => printWindow.print(), 300)
    }
  }, [report])

  const downloadReport = useCallback(() => {
    if (!report || report.points.length === 0) return
    const html = generateStakeoutCutSheetHTML(report)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stakeout-cutsheet-${report.metadata.projectName.replace(/\s+/g, '-')}.html`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [report])

  const handleCSVImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      setImportError('CSV exceeds the 2 MB cut-sheet import limit.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const imported = parseStakeoutCsv(String(ev.target?.result ?? ''))
        if (selectedPreset) {
          setProjectName('')
          setLandReference('')
          setCrs('')
          setHorizontalTol(NaN)
          setVerticalTol(undefined)
          setToleranceReference('')
          setVerticalDatum('')
          setDesignRevision('')
        }
        setPoints(imported)
        setPointPage(0)
        setSelectedPreset('')
        setImportError(null)
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'CSV could not be read; your current observations are preserved.')
      }
    }
    reader.onerror = () => setImportError('The CSV file could not be read. Your current observations are preserved.')
    reader.readAsText(file)
    e.target.value = ''
  }, [selectedPreset])

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([STAKEOUT_CSV_HEADER + '\n'], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'METARDU-stakeout-observations-template.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
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
              <BreadcrumbPage>Stakeout Cut Sheet</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          badge="CONSTRUCTION QA &amp; STAKEOUT"
          title="Stakeout Cut Sheet &amp; Construction Variance Report"
          subtitle="Compare entered design and measured coordinates against project-issued tolerances. Prepare a draft cut sheet with clear limits, missing evidence, and review status."
          reference="Project criteria and reference systems must be entered and verified."
        />

        {/* Action / Preset Bar */}
        <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Data:</span>
            <select
              aria-label="Example data selection"
              value={selectedPreset}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Your observations — start empty</option>
              {Object.entries(SAMPLE_DATASETS).map(([k, v]) => (
                <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={printReport}
              disabled={!report || report.points.length === 0}
              className="py-1.5 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--accent)]" /> Print Cut Sheet
            </button>
            <button
              onClick={downloadReport}
              disabled={!report || report.points.length === 0}
              className="py-1.5 px-3 rounded-xl bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Download HTML Report
            </button>
          </div>
        </div>

        {selectedPreset && <p role="status" className="text-sm text-[var(--warning)]">Synthetic example. These values and limits are for demonstration; edits remain marked synthetic in exports.</p>}
        {(importError || reportError) && <p role="alert" className="text-sm text-[var(--warning)]">{importError || reportError}</p>}

        {/* Main Grid: Left Configuration & Table (8 cols), Right Stats & Verdict (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Config & Points Table */}
          <div className="lg:col-span-8 space-y-6">
            {/* Project Details */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Building className="w-4 h-4 text-[var(--accent)]" />
                  1. Project &amp; Instrument Particulars
                </h2>
                <span className="text-xs text-[var(--text-secondary)]">Draft comparison</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Project Name</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)] font-semibold"
                    placeholder="Project Name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Parcel / LR No.</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    placeholder="L.R. No."
                    value={landReference}
                    onChange={(e) => setLandReference(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Surveyor Name</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    placeholder="Surveyor Name"
                    value={surveyorName}
                    onChange={(e) => setSurveyorName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Survey Instrument</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    placeholder="Instrument"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Survey Method</label>
                  <select
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                  >
                    <option value="">Not recorded</option>
                    <option value="Total Station" className="bg-[var(--bg-secondary)]">Total Station</option>
                    <option value="GNSS RTK" className="bg-[var(--bg-secondary)]">GNSS RTK</option>
                    <option value="GNSS PPK" className="bg-[var(--bg-secondary)]">GNSS PPK</option>
                    <option value="GNSS Static" className="bg-[var(--bg-secondary)]">GNSS Static</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-secondary)] block mb-1">Projected metre CRS (EPSG code)</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    value={crs}
                    aria-label="Projected metre CRS"
                    placeholder="Enter the job EPSG code"
                    onChange={(e) => setCrs(e.target.value)}
                  />
                </div>
                <label className="text-xs text-[var(--text-secondary)]">Vertical datum / benchmark
                  <input aria-label="Vertical datum or benchmark" className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs" value={verticalDatum} onChange={e => setVerticalDatum(e.target.value)} />
                </label>
                <label className="text-xs text-[var(--text-secondary)]">Design drawing / revision
                  <input aria-label="Design revision" className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs" value={designRevision} onChange={e => setDesignRevision(e.target.value)} />
                </label>
              </div>
            </div>

            {/* Tolerance Preset Box */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[var(--accent)]" />
                  2. Entered Project Tolerances
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Drawing / specification reference</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                    aria-label="Tolerance specification reference"
                    value={toleranceReference}
                    onChange={e => setToleranceReference(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Horizontal Tol ± (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--accent)] font-semibold"
                    aria-label="Horizontal tolerance in metres"
                    value={Number.isFinite(horizontalTol) ? horizontalTol : ''}
                    onChange={(e) => setHorizontalTol(e.target.value.trim() ? Number(e.target.value) : NaN)}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Vertical Tol ± (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--accent)] font-semibold"
                    value={verticalTol ?? ''}
                    aria-label="Vertical tolerance in metres"
                    placeholder="Not assessed when blank"
                    onChange={(e) => {
                      setVerticalTol(e.target.value.trim() ? Number(e.target.value) : undefined)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Points Table */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--accent)]" />
                  3. Stakeout Observation Schedule ({points.length} points)
                </h2>
                <div className="flex gap-2">
                  <button onClick={downloadTemplate} className="text-xs underline">CSV template</button>
                  <label className="cursor-pointer py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                    <input aria-label="Import stakeout CSV" type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
                  </label>
                  <button
                    onClick={addPoint}
                    className="py-1 px-2.5 rounded-lg bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Point
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                      <th className="py-2 px-2 text-left">ID</th>
                      <th className="py-2 px-2 text-right">Design E</th>
                      <th className="py-2 px-2 text-right">Design N</th>
                      <th className="py-2 px-2 text-right">Design Z</th>
                      <th className="py-2 px-2 text-right">Staked E</th>
                      <th className="py-2 px-2 text-right">Staked N</th>
                      <th className="py-2 px-2 text-right">Staked Z</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((point, rowIndex) => {
                      const idx = visiblePage * pageSize + rowIndex
                      return (
                      <React.Fragment key={idx}><tr className="border-b border-[var(--border-color)]/50 hover:bg-white/5 transition-colors">
                        <td className="py-1.5 px-2">
                          <input
                            className="w-16 bg-transparent font-mono font-bold text-[var(--accent)] focus:outline-none"
                            value={point.pointId}
                            aria-label={`Point ${idx + 1} identifier`}
                            onChange={(e) => updatePoint(idx, 'pointId', e.target.value)}
                          />
                        </td>
                        {(['design.easting', 'design.northing', 'design.elevation', 'staked.easting', 'staked.northing', 'staked.elevation'] as const).map((field) => (
                          <td key={field} className="py-1.5 px-2">
                            <input
                              type="number"
                              step="0.001"
                              className="w-20 bg-transparent text-right font-mono text-xs focus:outline-none font-medium"
                              aria-label={`${point.pointId || `Point ${idx + 1}`} ${field}`}
                              value={(() => {
                                const [group, key] = field.split('.') as ['design' | 'staked', 'easting' | 'northing' | 'elevation']
                                const value = point[group][key]
                                return Number.isFinite(value) ? value : ''
                              })()}
                              onChange={(e) => updatePoint(idx, field, e.target.value.trim() ? Number(e.target.value) : field.endsWith('elevation') ? undefined : NaN)}
                            />
                          </td>
                        ))}
                        <td className="py-1.5 px-2 text-center">
                          <button
                            onClick={() => removePoint(idx)}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      <tr><td colSpan={8} className="p-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="text-[10px]">Reported precision (m; 0 = unknown)
                            <input aria-label={`${point.pointId} reported precision`} type="number" step="0.001" className="w-full bg-[var(--bg-primary)] p-2" value={point.accuracyM ?? ''} onChange={e => updatePoint(idx, 'accuracyM', e.target.value.trim() ? Number(e.target.value) : undefined)} />
                          </label>
                          <label className="text-[10px]">Observed at (include timezone)
                            <input aria-label={`${point.pointId} observed at`} className="w-full bg-[var(--bg-primary)] p-2" placeholder="ISO date/time with Z or +03:00" value={point.timestamp} onChange={e => updatePoint(idx, 'timestamp', e.target.value)} />
                          </label>
                          <label className="text-[10px]">Observation notes
                            <input aria-label={`${point.pointId} notes`} className="w-full bg-[var(--bg-primary)] p-2" value={point.notes ?? ''} onChange={e => updatePoint(idx, 'notes', e.target.value)} />
                          </label>
                        </div>
                      </td></tr></React.Fragment>
                    )})}
                  </tbody>
                </table>
              </div>
              {points.length > pageSize && <div className="flex justify-between items-center gap-2 text-xs">
                <button disabled={visiblePage === 0} onClick={() => setPointPage(visiblePage - 1)} className="p-2 border border-[var(--border-color)] disabled:opacity-40">Previous rows</button>
                <span>Rows {visiblePage * pageSize + 1}–{Math.min((visiblePage + 1) * pageSize, points.length)} of {points.length}. The report includes all rows.</span>
                <button disabled={(visiblePage + 1) * pageSize >= points.length} onClick={() => setPointPage(visiblePage + 1)} className="p-2 border border-[var(--border-color)] disabled:opacity-40">Next rows</button>
              </div>}
            </div>
          </div>

          {/* Right Column: Results & Tolerance Verdict */}
          <div className="lg:col-span-4 space-y-6">
            {report && (
              <>
                {/* Overall Verdict Banner */}
                <div
                  className={`rounded-2xl p-5 border text-center transition-colors shadow-md ${
                    report.summary.overallPass
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : report.summary.status === 'FAIL' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  {report.summary.overallPass ? (
                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-2" />
                  ) : report.summary.status === 'FAIL' ? (
                    <XCircle className="w-12 h-12 mx-auto text-red-400 mb-2" />
                  ) : <TriangleAlert className="w-12 h-12 mx-auto text-amber-400 mb-2" />}
                  <h3
                    className={`text-xl font-black ${
                      report.summary.overallPass ? 'text-emerald-400' : report.summary.status === 'FAIL' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {report.summary.overallPass ? 'WITHIN ENTERED LIMITS' : report.summary.failedPoints || report.summary.warningPoints ? 'ENTERED LIMITS EXCEEDED' : 'ASSESSMENT INCOMPLETE'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {report.summary.passedPoints} of {report.summary.totalPoints} points within tolerance (
                    {report.summary.passRate.toFixed(1)}%)
                  </p>
                  <p className="text-xs mt-2">{report.summary.unassessedPoints} not assessed; {report.summary.warningPoints} warnings. Draft comparison — professional review required.</p>
                  {verticalTol === undefined && <p className="text-xs mt-2">Horizontal criteria only; vertical levels are not assessed.</p>}
                </div>

                {/* Variance Statistics Box */}
                <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                    Residual Offset Statistics
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-[var(--text-secondary)]">Max H Offset:</div>
                    <div className="text-right font-mono font-bold text-[var(--text-primary)]">
                      {(report.summary.maxHorizontalOffset * 1000).toFixed(1)} mm
                    </div>

                    <div className="text-[var(--text-secondary)]">Avg H Offset:</div>
                    <div className="text-right font-mono font-bold text-[var(--text-primary)]">
                      {(report.summary.avgHorizontalOffset * 1000).toFixed(1)} mm
                    </div>

                    <div className="text-[var(--text-secondary)]">RMS H Offset:</div>
                    <div className="text-right font-mono font-bold text-emerald-400">
                      {(report.summary.rmsHorizontalOffset * 1000).toFixed(1)} mm
                    </div>

                    {report.summary.maxVerticalOffset !== undefined && (
                      <>
                        <div className="text-[var(--text-secondary)]">Max V Offset:</div>
                        <div className="text-right font-mono font-bold text-[var(--text-primary)]">
                          {(report.summary.maxVerticalOffset * 1000).toFixed(1)} mm
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Per-Point Breakdown */}
                <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
                  <h3 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                    Point-by-Point Tolerance Check
                  </h3>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {report.points.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((p, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                          p.pass
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : p.status === 'FAIL' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
                        }`}
                      >
                        <div>
                          <span className="font-mono font-bold text-[var(--text-primary)]">{p.pointId}</span>
                          <span className="text-[10px] text-[var(--text-secondary)] ml-2">
                            &Delta;H: {(p.horizontalOffset * 1000).toFixed(1)}mm
                          </span>
                          <p className="text-[10px] text-[var(--text-secondary)] mt-1">{p.statusReason}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.pass ? 'bg-emerald-500/20 text-emerald-400' : p.status === 'FAIL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {p.status === 'INFO' ? 'NOT ASSESSED' : p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
