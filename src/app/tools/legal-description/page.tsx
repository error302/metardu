'use client'

import React, { useState, useMemo } from 'react'
import {
  generateLegalDescription,
  LegalDescriptionInput,
} from '@/lib/documents/legalDescriptionWriter'
import { escapeDocumentHtml } from '@/lib/documents/escapeDocumentHtml'
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
  FileText,
  Download,
  Copy,
  Check,
  Printer,
  Plus,
  Trash2,
  Upload,
  MapPin,
  Building,
  Compass,
} from 'lucide-react'

type Beacon = LegalDescriptionInput['beacons'][0]

const PRESET_PARCELS: Record<string, { name: string; lr: string; locality: string; beacons: Beacon[] }> = {
  kajiado_subdivision: {
    name: 'Kajiado 5-Acre Freehold Subdivision',
    lr: 'Kajiado/Kaputiei-North/1209',
    locality: 'Kitengela, Kajiado County',
    beacons: [
      { id: 'MB-01', easting: 250100.0, northing: 9845000.0, monumentType: 'concrete' },
      { id: 'MB-02', easting: 250242.5, northing: 9845000.0, monumentType: 'concrete' },
      { id: 'MB-03', easting: 250242.5, northing: 9845142.0, monumentType: 'iron_pin' },
      { id: 'MB-04', easting: 250100.0, northing: 9845142.0, monumentType: 'concrete' },
    ],
  },
  naivasha_estate: {
    name: 'Naivasha 15-Acre Agricultural Parcel',
    lr: 'Nakuru/Naivasha-Block-4/88',
    locality: 'Moi South Lake Road, Nakuru County',
    beacons: [
      { id: 'B-1', easting: 215400.0, northing: 9918200.0, monumentType: 'pillar' },
      { id: 'B-2', easting: 215680.0, northing: 9918230.0, monumentType: 'concrete' },
      { id: 'B-3', easting: 215750.0, northing: 9918450.0, monumentType: 'concrete' },
      { id: 'B-4', easting: 215520.0, northing: 9918510.0, monumentType: 'iron_pin' },
      { id: 'B-5', easting: 215350.0, northing: 9918380.0, monumentType: 'concrete' },
    ],
  },
  township_commercial: {
    name: 'Eldoret CBD Commercial Township Block',
    lr: 'Uasin Gishu/Municipality-Block-8/412',
    locality: 'Uganda Road, Eldoret Municipality',
    beacons: [
      { id: 'CP-1', easting: 752100.0, northing: 56900.0, monumentType: 'concrete' },
      { id: 'CP-2', easting: 752185.0, northing: 56900.0, monumentType: 'concrete' },
      { id: 'CP-3', easting: 752185.0, northing: 56960.0, monumentType: 'iron_pin' },
      { id: 'CP-4', easting: 752100.0, northing: 56960.0, monumentType: 'concrete' },
    ],
  },
}

export default function LegalDescriptionPage() {
  // Project particulars
  const [landRef, setLandRef] = useState('')
  const [regSection, setRegSection] = useState('')
  const [locality, setLocality] = useState('')
  const [datum, setDatum] = useState('')
  const [surveyorName, setSurveyorName] = useState('')
  const [surveyorLicense, setSurveyorLicense] = useState('')
  const [surveyDate, setSurveyDate] = useState('')
  const [referenceConfirmed, setReferenceConfirmed] = useState(false)
  const [closingBearing] = useState(true)

  // Beacons state
  const [beacons, setBeacons] = useState<Beacon[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string>('')

  // Modals & UI states
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [copiedStatus, setCopiedStatus] = useState(false)

  // Handle preset selection
  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key)
    const p = PRESET_PARCELS[key]
    if (p) {
      setLandRef('SYNTHETIC-' + key)
      setLocality('Synthetic example — not a surveyed site')
      setRegSection('Synthetic example')
      setDatum('Synthetic local metre grid')
      setReferenceConfirmed(false)
      setBeacons(p.beacons.map(point => ({ ...point })))
    } else {
      setBeacons([]); setLandRef(''); setLocality(''); setRegSection(''); setDatum(''); setReferenceConfirmed(false)
    }
  }

  // Update single beacon
  const updateBeacon = <K extends keyof Beacon>(index: number, field: K, value: Beacon[K]) => {
    const next = [...beacons]
    next[index] = { ...next[index], [field]: value }
    setBeacons(next)
  }

  const addBeacon = () => {
    const nextNum = beacons.length + 1
    setBeacons([
      ...beacons,
      {
        id: `MB-0${nextNum}`,
        easting: NaN,
        northing: NaN,
        monumentType: 'unknown',
      },
    ])
  }

  const removeBeacon = (index: number) => {
    if (beacons.length <= 3) {
      alert('A closed parcel boundary requires at least 3 beacons.')
      return
    }
    setBeacons(beacons.filter((_, i) => i !== index))
  }

  // Handle paste coordinate schedule
  const handleApplyPasted = () => {
    try {
      const lines = pasteText.trim().split('\n')
      const parsed: Beacon[] = []
      for (const line of lines) {
        const parts = line.split(/[,\s\t]+/).filter(Boolean)
        if (parts.length >= 3) {
          const id = parts[0]
          const e = Number(parts[1])
          const n = Number(parts[2])
          const type = (parts[3] as Beacon['monumentType']) || 'unknown'
          if (Number.isFinite(e) && Number.isFinite(n) && ['unknown', 'concrete', 'iron_pin', 'peg', 'tree', 'natural', 'pillar'].includes(type)) {
            parsed.push({ id, easting: e, northing: n, monumentType: type })
          } else { throw new Error('Invalid row') }
        } else { throw new Error('Incomplete row') }
      }
      if (parsed.length >= 3) {
        setBeacons(parsed)
        setPasteModalOpen(false)
        setPasteText('')
      } else {
        alert('Please enter at least 3 valid beacons (Format: ID, Easting, Northing, [MonumentType]).')
      }
    } catch {
      alert('Error parsing coordinate schedule.')
    }
  }

  const finiteBoundary = beacons.length >= 3 && beacons.every(point => Number.isFinite(point.easting) && Number.isFinite(point.northing))

  // Generate draft prose
  const generatedText = useMemo(() => {
    if (!referenceConfirmed || !datum.trim()) return 'Declare and confirm the metre-based coordinate reference before generating a draft.'
    if (!finiteBoundary) return 'Please enter at least 3 beacons to form a closed boundary polygon.'
    try {
      const draft = generateLegalDescription({
        landReference: landRef || '[Land Reference]',
        registrationSection: regSection || '[Registration Section]',
        locality: locality || '[Locality]',
        datum,
        surveyorName: surveyorName || '[Surveyor Name]',
        surveyorLicense: surveyorLicense || '[License No.]',
        surveyDate: surveyDate || '[Date]',
        closingBearing,
        beacons,
      })
      return selectedPreset ? draft.replace('For professional review;', 'SYNTHETIC EXAMPLE — NOT FIELD EVIDENCE\nFor professional review;') : draft
    } catch (e: unknown) {
      return `Error generating description: ${e instanceof Error ? e.message : 'Invalid boundary input'}`
    }
  }, [landRef, regSection, locality, datum, surveyorName, surveyorLicense, surveyDate, closingBearing, beacons, finiteBoundary, referenceConfirmed, selectedPreset])
  const canExport = generatedText.startsWith('DRAFT BOUNDARY DESCRIPTION')

  // Inverse leg calculations & Shoelace Area
  const traverseAnalysis = useMemo(() => {
    if (!canExport) return { areaHa: 0, areaAcres: 0, perimeterM: 0, legs: [] }

    let areaM2 = 0
    let perimeterM = 0
    const legs: Array<{ from: string; to: string; distance: number; bearingDeg: number }> = []

    const n = beacons.length
    for (let i = 0; i < n; i++) {
      const p1 = beacons[i]
      const p2 = beacons[(i + 1) % n]
      areaM2 += p1.easting * p2.northing - p2.easting * p1.northing

      const dx = p2.easting - p1.easting
      const dy = p2.northing - p1.northing
      const dist = Math.sqrt(dx * dx + dy * dy)
      let bearing = (Math.atan2(dx, dy) * 180) / Math.PI
      if (bearing < 0) bearing += 360

      perimeterM += dist
      legs.push({ from: p1.id, to: p2.id, distance: dist, bearingDeg: bearing })
    }

    const absArea = Math.abs(areaM2) / 2
    return {
      areaHa: absArea / 10000,
      areaAcres: absArea / 4046.8564224,
      perimeterM,
      legs,
    }
  }, [beacons, canExport])

  // SVG Polygon Preview Math
  const { viewBox, pointsStr, minX, maxX } = useMemo(() => {
    if (!finiteBoundary) return { viewBox: '0 0 100 100', pointsStr: '', minX: 0, maxX: 100, minY: 0, maxY: 100 }

    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity
    beacons.forEach((b) => {
      bMinX = Math.min(bMinX, b.easting)
      bMinY = Math.min(bMinY, b.northing)
      bMaxX = Math.max(bMaxX, b.easting)
      bMaxY = Math.max(bMaxY, b.northing)
    })

    const pad = Math.max(bMaxX - bMinX, bMaxY - bMinY) * 0.2 || 20
    const vMinX = bMinX - pad
    const vMinY = bMinY - pad
    const vMaxX = bMaxX + pad
    const vMaxY = bMaxY + pad

    const width = vMaxX - vMinX
    const height = vMaxY - vMinY

    const vBox = `${vMinX} ${-vMaxY} ${width} ${height}`
    const pts = beacons.map((b) => `${b.easting},${-b.northing}`).join(' ')

    return { viewBox: vBox, pointsStr: pts, minX: vMinX, maxX: vMaxX, minY: vMinY, maxY: vMaxY }
  }, [beacons, finiteBoundary])

  // Copy to clipboard
  const handleCopy = () => {
    if (!canExport) return
    navigator.clipboard.writeText(generatedText)
    setCopiedStatus(true)
    setTimeout(() => setCopiedStatus(false), 2500)
  }

  // Print direct
  const handlePrint = () => {
    if (!canExport) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Legal Description — ${escapeDocumentHtml(landRef)}</title>
          <style>
            body { font-family: "Times New Roman", Georgia, serif; padding: 40px; line-height: 1.8; color: #111; font-size: 12pt; }
            h1 { font-size: 16pt; text-align: center; margin-bottom: 24px; text-transform: uppercase; }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            .header-table td { padding: 4px 8px; border: 1px solid #ccc; font-size: 10pt; }
            .prose-text { white-space: pre-wrap; text-align: justify; }
            .footer { margin-top: 40px; border-top: 1px solid #333; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>Statutory Metes &amp; Bounds Legal Description</h1>
          <table class="header-table">
            <tr><td><strong>Land Reference:</strong> ${escapeDocumentHtml(landRef)}</td><td><strong>Locality:</strong> ${escapeDocumentHtml(locality)}</td></tr>
            <tr><td><strong>Datum / Projection:</strong> ${escapeDocumentHtml(datum)}</td><td><strong>Survey Date:</strong> ${escapeDocumentHtml(surveyDate)}</td></tr>
            <tr><td><strong>Entered reviewer / surveyor:</strong> ${escapeDocumentHtml(surveyorName)}</td><td><strong>Entered licence reference (unverified):</strong> ${escapeDocumentHtml(surveyorLicense)}</td></tr>
          </table>
          <div class="prose-text">${escapeDocumentHtml(generatedText)}</div>
          <div class="footer">
            <p>UNVERIFIED DRAFT — professional boundary, reference and documentary review required.</p>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 300)
  }

  // Download real Word Document (.doc XML/HTML format)
  const handleDownloadWordDoc = () => {
    if (!canExport) return
    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Legal Description ${escapeDocumentHtml(landRef)}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; }
          h1 { text-align: center; font-size: 15pt; font-weight: bold; }
          p { text-align: justify; margin-bottom: 12pt; }
          table { width: 100%; border-collapse: collapse; margin-top: 12pt; margin-bottom: 12pt; }
          th, td { border: 1pt solid #000; padding: 5pt; font-size: 10pt; }
        </style>
      </head>
      <body>
        <h1>DRAFT BOUNDARY DESCRIPTION</h1>
        <p><strong>Parcel Reference:</strong> ${escapeDocumentHtml(landRef)}</p>
        <p><strong>Registration Section:</strong> ${escapeDocumentHtml(regSection)}</p>
        <p><strong>Locality:</strong> ${escapeDocumentHtml(locality)}</p>
        <p><strong>Datum:</strong> ${escapeDocumentHtml(datum)}</p>
        <hr/>
        <div style="white-space: pre-wrap;">${escapeDocumentHtml(generatedText)}</div>
        <br/><br/>
        <p>_______________________________<br/>
        <strong>${escapeDocumentHtml(surveyorName)}</strong><br/>
        Entered licence reference (unverified): ${escapeDocumentHtml(surveyorLicense)}<br/>
        Date: ${escapeDocumentHtml(surveyDate)}</p>
      </body>
      </html>
    `
    const blob = new Blob([docContent], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Legal_Description_${(landRef || 'Parcel').replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`
    link.click()
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
              <BreadcrumbPage>Legal Description Writer</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          badge="CONVEYANCING &amp; TITLE"
          title="Boundary Description Draft"
          subtitle="Prepare a draft from entered metre-based grid coordinates. Geometry, boundary evidence, title records and professional review remain required; this tool does not certify ownership or official compliance."
          reference="Declared metre-based grid · planar geometry · professional review"
        />

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-[var(--text-secondary)] mb-1">Computed Parcel Extent</div>
            <div className="text-xl font-black font-mono text-[var(--accent)]">
              {canExport ? traverseAnalysis.areaHa.toFixed(4) : '—'} Ha
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              ({canExport ? traverseAnalysis.areaAcres.toFixed(3) : '—'} Acres)
            </div>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-[var(--text-secondary)] mb-1">Total Boundary Perimeter</div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
              {canExport ? traverseAnalysis.perimeterM.toFixed(2) : '—'} m
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              {beacons.length} entered boundary vertices
            </div>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-[var(--text-secondary)] mb-1">Commencement vertex</div>
            <div className="text-xl font-black font-mono text-emerald-400">
              {beacons[0]?.id || 'Not provided'}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              E {beacons[0]?.easting.toFixed(2)} | N {beacons[0]?.northing.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Main Workbench: Inputs on Left (6 cols), Preview on Right (6 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Coordinates */}
          <div className="lg:col-span-6 space-y-6">
            {/* Project Details */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Building className="w-4 h-4 text-[var(--accent)]" />
                  1. Title & Registration Particulars
                </h2>
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetSelect(e.target.value)}
                  className="rounded-lg border border-[var(--border-color)] bg-black/20 px-2.5 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Your records — start empty</option>
                  {Object.entries(PRESET_PARCELS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                      Synthetic example: {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Land Reference / Parcel No.
                  </label>
                  <input
                    type="text"
                    value={landRef}
                    onChange={(e) => setLandRef(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)] font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Registration Section
                  </label>
                  <input
                    type="text"
                    value={regSection}
                    onChange={(e) => setRegSection(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Locality & County
                  </label>
                  <input
                    type="text"
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Declared metre-based coordinate reference
                  </label>
                  <input type="text" placeholder="Enter the full CRS / grid reference from your source records"
                    value={datum}
                    onChange={(e) => { setDatum(e.target.value); setReferenceConfirmed(false) }}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Licensed Land Surveyor
                  </label>
                  <input
                    type="text"
                    value={surveyorName}
                    onChange={(e) => setSurveyorName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    SRB License Registration No.
                  </label>
                  <input
                    type="text"
                    value={surveyorLicense}
                    onChange={(e) => setSurveyorLicense(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={referenceConfirmed} onChange={event => setReferenceConfirmed(event.target.checked)} />I confirm these coordinates use the declared metre-based grid. This does not verify the boundary or establish ground distances.</label>
            <label className="block text-sm">Recorded survey date (if known)<input type="date" value={surveyDate} onChange={event => setSurveyDate(event.target.value)} className="block border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2" /></label>
            {selectedPreset && <p role="status" className="text-sm text-[var(--warning)]">Synthetic example. Edited outputs remain labelled synthetic.</p>}
            {/* Beacons Schedule Manager */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--accent)]" />
                  2. Boundary Beacon Schedule ({beacons.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPasteModalOpen(true)}
                    className="py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[11px] font-medium transition-colors flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Paste Schedule
                  </button>
                  <button
                    onClick={addBeacon}
                    className="py-1 px-2.5 rounded-lg bg-[var(--accent)] text-black text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Beacon
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {beacons.map((b, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border-color)] bg-black/20 text-xs"
                  >
                    <input
                      type="text"
                      value={b.id}
                      onChange={(e) => updateBeacon(idx, 'id', e.target.value)}
                      className="w-16 bg-transparent font-bold font-mono focus:outline-none text-[var(--accent)]"
                    />
                    <div className="flex-1 flex gap-1 items-center">
                      <span className="text-[10px] text-zinc-500">E:</span>
                      <input
                        type="number"
                        step="0.001"
                        value={Number.isFinite(b.easting) ? b.easting : ''}
                        onChange={(e) => updateBeacon(idx, 'easting', e.target.value.trim() === '' ? NaN : Number(e.target.value))}
                        className="w-full bg-transparent font-mono text-xs focus:outline-none"
                      />
                    </div>
                    <div className="flex-1 flex gap-1 items-center">
                      <span className="text-[10px] text-zinc-500">N:</span>
                      <input
                        type="number"
                        step="0.001"
                        value={Number.isFinite(b.northing) ? b.northing : ''}
                        onChange={(e) => updateBeacon(idx, 'northing', e.target.value.trim() === '' ? NaN : Number(e.target.value))}
                        className="w-full bg-transparent font-mono text-xs focus:outline-none"
                      />
                    </div>
                    <select
                      value={b.monumentType}
                      onChange={(e) => updateBeacon(idx, 'monumentType', e.target.value as Beacon['monumentType'])}
                      className="w-24 bg-transparent border border-[var(--border-color)] rounded px-1 py-0.5 text-[10px]"
                    >
                      <option value="unknown">Marker not recorded</option>
                      <option value="concrete" className="bg-[var(--bg-secondary)]">Concrete</option>
                      <option value="iron_pin" className="bg-[var(--bg-secondary)]">Iron Pin</option>
                      <option value="pillar" className="bg-[var(--bg-secondary)]">Pillar</option>
                      <option value="peg" className="bg-[var(--bg-secondary)]">Peg</option>
                      <option value="natural" className="bg-[var(--bg-secondary)]">Natural</option>
                    </select>
                    <button
                      onClick={() => removeBeacon(idx)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Diagram & Legal Prose (6 cols) */}
          <div className="lg:col-span-6 space-y-6">
            {/* SVG Boundary Diagram */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[var(--accent)]" />
                  Parcel Boundary Vector Diagram
                </h3>
                <span className="text-xs font-mono text-[var(--text-secondary)]">
                  {traverseAnalysis.legs.length} sides
                </span>
              </div>

              <div className="w-full h-52 bg-black/40 border border-[var(--border-color)] rounded-xl overflow-hidden flex items-center justify-center relative p-3">
                {canExport && (
                  <svg viewBox={viewBox} className="w-full h-full select-none">
                    <polygon
                      points={pointsStr}
                      fill="rgba(217, 119, 6, 0.12)"
                      stroke="#d97706"
                      strokeWidth={(maxX - minX) / 100}
                    />
                    {beacons.map((b, i) => (
                      <g key={i}>
                        <circle
                          cx={b.easting}
                          cy={-b.northing}
                          r={(maxX - minX) / 70}
                          fill="#d97706"
                          stroke="white"
                          strokeWidth="1.5"
                        />
                      </g>
                    ))}
                  </svg>
                )}
                <div className="absolute bottom-2 left-2 text-[10px] text-[var(--text-secondary)] bg-black/70 px-2 py-1 rounded">
                  Area: {traverseAnalysis.areaHa.toFixed(3)} Ha ({traverseAnalysis.areaAcres.toFixed(2)} Acres)
                </div>
              </div>
            </div>

            {/* Generated Statutory Legal Text */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  Statutory Metes &amp; Bounds Text
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy} disabled={!canExport}
                    className="py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    {copiedStatus ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStatus ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handlePrint} disabled={!canExport}
                    className="py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* Text Area */}
              <div className="p-4 rounded-xl bg-black/30 border border-[var(--border-color)] font-sans text-xs leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap text-justify text-[var(--text-primary)]">
                {generatedText}
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                <button
                  onClick={handleDownloadWordDoc} disabled={!canExport}
                  className="w-full py-2.5 px-4 rounded-xl bg-[var(--accent)] text-black font-bold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-md shadow-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
                >
                  <Download className="w-4 h-4" /> Download Formatted Word Document (.doc)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Paste Schedule */}
        {pasteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-base font-bold">Paste Coordinate Schedule</h3>
                <button onClick={() => setPasteModalOpen(false)} className="text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Format: <code>BeaconID, Easting, Northing, [MonumentType]</code> (one beacon per line).
              </p>
              <textarea
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="MB-01, 250100.0, 9845000.0, concrete&#10;MB-02, 250242.5, 9845000.0, concrete&#10;MB-03, 250242.5, 9845142.0, iron_pin&#10;MB-04, 250100.0, 9845142.0, concrete"
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
                  Apply Schedule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
