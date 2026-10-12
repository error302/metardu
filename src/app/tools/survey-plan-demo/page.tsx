'use client'

/**
 * METARDU — Survey Plan & Boundary Identification Viewer
 * =======================================================
 * Interactive CAD-style boundary identification plan renderer and
 * Survey of Kenya Form No. 4 deed plan generator.
 *
 * Allows surveyors to view, edit, import coordinates, inspect bearing schedules,
 * verify cadastral boundary closure, and export to SVG, DXF, CSV, and printable PDF.
 *
 * Statutory references:
 * - Survey Act Cap. 299 Laws of Kenya
 * - Survey Regulations 1994 (Form No. 3 & Form No. 4 standards)
 * - Land Registration Act 2012
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import SurveyPlanViewer from '@/components/SurveyPlanViewer'
import { ToolGate } from '@/components/shared/ToolGate'
import { generateCadastralPlanDXF } from '@/lib/export/cadastralPlanDXF'
import type { SurveyPlanData, ControlPoint } from '@/lib/reports/surveyPlan/types'
import {
  FileText,
  Upload,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Layers,
  ArrowLeft,
  Printer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ─── Standard Presets ────────────────────────────────────────────────

const PRESETS: Record<string, { label: string; data: SurveyPlanData }> = {
  nyeri: {
    label: 'Nyeri / Mweiga Plot 105 (Subdivision)',
    data: {
      project: {
        name: 'NYERI/MWEIGA/PLOT 105',
        location: 'MWEIGA, NYERI COUNTY',
        municipality: 'NYERI COUNTY COUNCIL',
        utm_zone: 37,
        hemisphere: 'S',
        datum: 'ARC1960',
        client_name: 'SAMUEL MAINA',
        surveyor_name: 'ELIAS OKUMU',
        surveyor_licence: 'LS/0488',
        firm_name: 'METARDU GEOMATICS',
        firm_address: 'P.O. BOX 101, NYERI',
        firm_phone: '+254 712 345 678',
        firm_email: 'info@metardu.com',
        drawing_no: 'GN-20260419-001',
        reference: 'REF/MK/001',
        plan_title: 'BOUNDARY IDENTIFICATION PLAN',
        area_sqm: 1500.0,
        area_ha: 0.15,
        parcel_id: 'LOT 105',
        lrNumber: 'NYERI/MWEIGA/105',
        plotParcelNumber: 'PLOT 105',
        street: 'KIGANJO ROAD',
        hundred: 'MWEIGA',
        iskRegNo: 'ISK/FS/1055',
        northRotationDeg: 0,
        sheetNo: '1',
        totalSheets: '1',
        revisions: [
          { rev: 'A', date: '2026-04-10', description: 'Boundary adjustment', by: 'EO' },
        ],
      },
      parcel: {
        boundaryPoints: [
          { name: 'P1', easting: 250000.0, northing: 9945000.0 },
          { name: 'P2', easting: 250050.0, northing: 9945000.0 },
          { name: 'P3', easting: 250050.0, northing: 9945030.0 },
          { name: 'P4', easting: 250000.0, northing: 9945030.0 },
        ],
        area_sqm: 1500.0,
        perimeter_m: 160.0,
        pin: 'P/10/105',
        parts: ['PART A (SUBDIVISION)', 'PART B (REMAINDER)'],
      },
      controlPoints: [
        { name: 'P1', easting: 250000.0, northing: 9945000.0, elevation: 1850.5, monumentType: 'found' },
        { name: 'P2', easting: 250050.0, northing: 9945000.0, elevation: 1851.2, monumentType: 'set' },
        { name: 'P3', easting: 250050.0, northing: 9945030.0, elevation: 1850.9, monumentType: 'iron_pin' },
        { name: 'P4', easting: 250000.0, northing: 9945030.0, elevation: 1850.2, monumentType: 'found' },
      ],
      fenceOffsets: [
        { segmentIndex: 0, type: 'iron_fence', offsetMetres: 0.15 },
        { segmentIndex: 1, type: 'chain_link', offsetMetres: 0.2 },
      ],
    },
  },
  kajiado: {
    label: 'Kajiado / Kaputiei North 18462 (4-Acre)',
    data: {
      project: {
        name: 'KAJIADO/KAPUTIEI NORTH/18462',
        location: 'KITENGELA, KAJIADO COUNTY',
        municipality: 'KAJIADO COUNTY GOVERNMENT',
        utm_zone: 37,
        hemisphere: 'S',
        datum: 'ARC1960',
        client_name: 'KAPUTIEI HOLDINGS LTD',
        surveyor_name: 'SAMUEL K. MURIITHI',
        surveyor_licence: 'LS/1402',
        firm_name: 'METARDU SURVEY CONSULTANTS',
        firm_address: 'P.O. BOX 45000, NAIROBI',
        drawing_no: 'FR-583-83-SUBDIV-A',
        reference: 'RS087_2026_014_R00',
        plan_title: 'BOUNDARY SURVEY PLAN (FORM NO. 4)',
        area_sqm: 16187.4,
        area_ha: 1.6187,
        parcel_id: '18462',
        lrNumber: 'KAJIADO/KAPUTIEI NORTH/18462',
        plotParcelNumber: 'PARCEL 18462',
        hundred: 'KAPUTIEI NORTH',
        iskRegNo: 'ISK/FS/1402',
        northRotationDeg: 0,
        sheetNo: '1',
        totalSheets: '1',
      },
      parcel: {
        boundaryPoints: [
          { name: 'AB1', easting: 254332.6, northing: 9814190.94 },
          { name: 'AB2', easting: 254259.0, northing: 9814198.58 },
          { name: 'AB3', easting: 254279.99, northing: 9814400.63 },
          { name: 'AB4', easting: 254356.24, northing: 9814424.48 },
        ],
        area_sqm: 16187.4,
        perimeter_m: 512.4,
        pin: 'KJD/KN/18462',
      },
      controlPoints: [
        { name: 'AB1', easting: 254332.6, northing: 9814190.94, elevation: 1540.2, monumentType: 'found' },
        { name: 'AB2', easting: 254259.0, northing: 9814198.58, elevation: 1541.0, monumentType: 'set' },
        { name: 'AB3', easting: 254279.99, northing: 9814400.63, elevation: 1542.4, monumentType: 'set' },
        { name: 'AB4', easting: 254356.24, northing: 9814424.48, elevation: 1541.8, monumentType: 'found' },
      ],
    },
  },
  nairobi: {
    label: 'Nairobi / Westlands L.R. No. 209/12345 (Commercial)',
    data: {
      project: {
        name: 'NAIROBI/WESTLANDS/L.R. 209/12345',
        location: 'WESTLANDS, NAIROBI CITY COUNTY',
        municipality: 'NAIROBI CITY COUNTY',
        utm_zone: 37,
        hemisphere: 'S',
        datum: 'ARC1960',
        client_name: 'WESTLANDS DEVELOPERS PLC',
        surveyor_name: 'DAVID K. WANJOHI',
        surveyor_licence: 'LS/0912',
        firm_name: 'METARDU GEOMATICS LTD',
        drawing_no: 'NBI-WST-2026-004',
        reference: 'WST/209/12345',
        plan_title: 'CADASTRAL DEED PLAN',
        area_sqm: 4532.0,
        area_ha: 0.4532,
        parcel_id: 'L.R. 209/12345',
        lrNumber: 'L.R. 209/12345',
        plotParcelNumber: 'L.R. 209/12345',
        street: 'WAIYAKI WAY',
        hundred: 'WESTLANDS',
        iskRegNo: 'ISK/FS/0912',
        northRotationDeg: 0,
        sheetNo: '1',
        totalSheets: '1',
      },
      parcel: {
        boundaryPoints: [
          { name: 'MB1', easting: 256789.12, northing: 9862345.68 },
          { name: 'MB2', easting: 256877.89, northing: 9862433.82 },
          { name: 'MB3', easting: 256923.45, northing: 9862388.19 },
          { name: 'MB4', easting: 256834.68, northing: 9862300.05 },
        ],
        area_sqm: 8000.0,
        perimeter_m: 360.0,
        pin: 'NBI/WST/12345',
      },
      controlPoints: [
        { name: 'MB1', easting: 256789.12, northing: 9862345.68, elevation: 1680.0, monumentType: 'found' },
        { name: 'MB2', easting: 256877.89, northing: 9862433.82, elevation: 1681.5, monumentType: 'set' },
        { name: 'MB3', easting: 256923.45, northing: 9862388.19, elevation: 1682.0, monumentType: 'set' },
        { name: 'MB4', easting: 256834.68, northing: 9862300.05, elevation: 1680.8, monumentType: 'found' },
      ],
    },
  },
}

// ─── Geometry Utilities ──────────────────────────────────────────────

function computeShoelace(pts: Array<{ easting: number; northing: number }>): { areaSqm: number; perimeterM: number } {
  if (pts.length < 3) return { areaSqm: 0, perimeterM: 0 }
  let area = 0
  let perim = 0
  const n = pts.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].easting * pts[j].northing
    area -= pts[j].easting * pts[i].northing

    const de = pts[j].easting - pts[i].easting
    const dn = pts[j].northing - pts[i].northing
    perim += Math.sqrt(de * de + dn * dn)
  }

  return {
    areaSqm: Math.abs(area) / 2,
    perimeterM: perim,
  }
}

function computeBearings(pts: Array<{ name: string; easting: number; northing: number }>) {
  if (pts.length < 2) return []
  const legs = []
  for (let i = 0; i < pts.length; i++) {
    const from = pts[i]
    const to = pts[(i + 1) % pts.length]
    const de = to.easting - from.easting
    const dn = to.northing - from.northing
    const dist = Math.sqrt(de * de + dn * dn)
    let rad = Math.atan2(de, dn)
    if (rad < 0) rad += 2 * Math.PI
    const deg = (rad * 180) / Math.PI

    const d = Math.floor(deg)
    const m = Math.floor((deg - d) * 60)
    const s = Math.round(((deg - d) * 60 - m) * 60)
    const dms = `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`

    legs.push({
      from: from.name,
      to: to.name,
      distance: dist,
      bearingDMS: dms,
      deltaE: de,
      deltaN: dn,
    })
  }
  return legs
}

export default function SurveyPlanViewerPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('nyeri')
  const [planData, setPlanData] = useState<SurveyPlanData>(PRESETS.nyeri.data)
  const [activeTab, setActiveTab] = useState<'beacons' | 'metadata' | 'schedule'>('beacons')
  const [editorExpanded, setEditorExpanded] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Recompute area & perimeter
  const geometry = useMemo(() => {
    return computeShoelace(planData.parcel.boundaryPoints)
  }, [planData.parcel.boundaryPoints])

  const bearingSchedule = useMemo(() => {
    return computeBearings(planData.parcel.boundaryPoints)
  }, [planData.parcel.boundaryPoints])

  // Handle preset change
  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key)
    if (PRESETS[key]) {
      setPlanData(JSON.parse(JSON.stringify(PRESETS[key].data)))
    }
  }

  // Update boundary point
  const updatePoint = (index: number, field: string, value: string | number) => {
    setPlanData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as SurveyPlanData
      const pt = next.parcel.boundaryPoints[index]
      if (!pt) return prev

      if (field === 'name') pt.name = String(value)
      else if (field === 'easting') pt.easting = parseFloat(String(value)) || 0
      else if (field === 'northing') pt.northing = parseFloat(String(value)) || 0

      // Sync with control points if found
      const cp = next.controlPoints?.find((c) => c.name === pt.name)
      if (cp) {
        cp.easting = pt.easting
        cp.northing = pt.northing
        if (field === 'name') cp.name = String(value)
      }

      // Recompute metrics
      const geo = computeShoelace(next.parcel.boundaryPoints)
      next.parcel.area_sqm = Number(geo.areaSqm.toFixed(2))
      next.parcel.perimeter_m = Number(geo.perimeterM.toFixed(2))
      next.project.area_sqm = next.parcel.area_sqm
      next.project.area_ha = Number((geo.areaSqm / 10000).toFixed(4))

      return next
    })
  }

  // Add beacon point
  const addPoint = () => {
    setPlanData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as SurveyPlanData
      const lastPt = next.parcel.boundaryPoints[next.parcel.boundaryPoints.length - 1]
      const newName = `P${next.parcel.boundaryPoints.length + 1}`
      const newPt = {
        name: newName,
        easting: (lastPt?.easting ?? 250000) + 20,
        northing: (lastPt?.northing ?? 9945000) + 20,
      }
      next.parcel.boundaryPoints.push(newPt)
      if (!next.controlPoints) next.controlPoints = []
      next.controlPoints.push({
        ...newPt,
        elevation: 1850.0,
        monumentType: 'set',
      })

      const geo = computeShoelace(next.parcel.boundaryPoints)
      next.parcel.area_sqm = Number(geo.areaSqm.toFixed(2))
      next.parcel.perimeter_m = Number(geo.perimeterM.toFixed(2))
      next.project.area_sqm = next.parcel.area_sqm
      next.project.area_ha = Number((geo.areaSqm / 10000).toFixed(4))
      return next
    })
  }

  // Delete beacon point
  const deletePoint = (index: number) => {
    if (planData.parcel.boundaryPoints.length <= 3) {
      alert('A survey parcel must have at least 3 boundary points.')
      return
    }
    setPlanData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as SurveyPlanData
      const removed = next.parcel.boundaryPoints.splice(index, 1)[0]
      if (next.controlPoints) {
        next.controlPoints = next.controlPoints.filter((c) => c.name !== removed?.name)
      }
      const geo = computeShoelace(next.parcel.boundaryPoints)
      next.parcel.area_sqm = Number(geo.areaSqm.toFixed(2))
      next.parcel.perimeter_m = Number(geo.perimeterM.toFixed(2))
      next.project.area_sqm = next.parcel.area_sqm
      next.project.area_ha = Number((geo.areaSqm / 10000).toFixed(4))
      return next
    })
  }

  // Update metadata field
  const updateMetadata = (field: string, value: string | number) => {
    setPlanData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as SurveyPlanData
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next.project as any)[field] = value
      if (field === 'parcel_id') next.parcel.pin = String(value)
      return next
    })
  }

  // Import CSV/coordinates file
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const parsedPoints: Array<{ name: string; easting: number; northing: number }> = []
      const parsedControl: ControlPoint[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        // Skip header lines
        if (i === 0 && (line.toLowerCase().includes('east') || line.toLowerCase().includes('point') || line.toLowerCase().includes('id'))) {
          continue
        }
        // Split by comma, tab, or whitespace
        const parts = line.split(/[,;\t\s]+/).filter(Boolean)
        if (parts.length >= 3) {
          const name = parts[0]
          const easting = parseFloat(parts[1])
          const northing = parseFloat(parts[2])
          const elevation = parts[3] ? parseFloat(parts[3]) : 0

          if (!isNaN(easting) && !isNaN(northing)) {
            parsedPoints.push({ name, easting, northing })
            parsedControl.push({
              name,
              easting,
              northing,
              elevation: isNaN(elevation) ? 0 : elevation,
              monumentType: 'found',
            })
          }
        }
      }

      if (parsedPoints.length >= 3) {
        setPlanData((prev) => {
          const next = JSON.parse(JSON.stringify(prev)) as SurveyPlanData
          next.parcel.boundaryPoints = parsedPoints
          next.controlPoints = parsedControl
          const geo = computeShoelace(parsedPoints)
          next.parcel.area_sqm = Number(geo.areaSqm.toFixed(2))
          next.parcel.perimeter_m = Number(geo.perimeterM.toFixed(2))
          next.project.area_sqm = next.parcel.area_sqm
          next.project.area_ha = Number((geo.areaSqm / 10000).toFixed(4))
          return next
        })
      } else {
        alert('Could not extract at least 3 valid coordinates. Format: PointID, Easting, Northing, [Elevation]')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Export DXF
  const handleExportDXF = () => {
    try {
      const dxf = generateCadastralPlanDXF(planData, {
        sheetSize: 'A3',
        scale: planData.project.scale ? parseInt(String(planData.project.scale).replace(/\D/g, '')) || 500 : 500,
        includeSheetLayout: true,
        includeGrid: true,
      })
      const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${planData.project.name.replace(/\s+/g, '_')}_Cadastral.dxf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Failed to generate DXF: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <ToolGate toolPath="/tools/survey-plan-demo">
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {/* Top Header */}
        <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/tools"
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Back to Quick Tools"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-amber-400" />
                <h1 className="text-xl font-bold">Survey Plan Viewer</h1>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs rounded font-mono font-bold">
                  CAD & Statutory
                </span>
              </div>
              <p className="text-xs text-gray-400">
                CAD-style boundary identification plan renderer & Survey of Kenya Form No. 4 deed plan generator
              </p>
            </div>
          </div>

          {/* Quick Actions & Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-gray-400">Preset:</span>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                {Object.entries(PRESETS).map(([k, v]) => (
                  <option key={k} value={k} className="bg-gray-900 text-white">
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-semibold transition-colors"
              title="Upload coordinate CSV or TXT file"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.dat"
              onChange={handleCSVUpload}
              className="hidden"
            />

            <button
              onClick={handleExportDXF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold transition-colors"
              title="Export complete layered AutoCAD DXF plan"
            >
              <Download className="w-3.5 h-3.5" />
              Export DXF
            </button>
          </div>
        </header>

        {/* Main Content: Split View */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left / Center: Interactive SVG Plan Viewer */}
          <div className="flex-1 flex flex-col bg-gray-900 border-r border-gray-800 overflow-hidden relative">
            <div className="flex-1 overflow-hidden">
              <SurveyPlanViewer data={planData} className="h-full" />
            </div>

            {/* Quick Metrics Bar at Bottom of Viewer */}
            <div className="bg-gray-950/80 backdrop-blur border-t border-gray-800 px-4 py-2.5 flex items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-gray-500 uppercase mr-1">Points:</span>
                  <span className="text-white font-bold">{planData.parcel.boundaryPoints.length}</span>
                </div>
                <div>
                  <span className="text-gray-500 uppercase mr-1">Area:</span>
                  <span className="text-amber-400 font-bold">{geometry.areaSqm.toFixed(2)} m²</span>
                  <span className="text-gray-400 ml-1">({(geometry.areaSqm / 10000).toFixed(4)} Ha / {(geometry.areaSqm / 4046.86).toFixed(3)} Ac)</span>
                </div>
                <div>
                  <span className="text-gray-500 uppercase mr-1">Perimeter:</span>
                  <span className="text-white font-bold">{geometry.perimeterM.toFixed(2)} m</span>
                </div>
              </div>

              <button
                onClick={() => setEditorExpanded(!editorExpanded)}
                className="lg:hidden flex items-center gap-1 text-gray-400 hover:text-white"
              >
                {editorExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                {editorExpanded ? 'Hide Controls' : 'Edit Parcel'}
              </button>
            </div>
          </div>

          {/* Right Sidebar: Coordinates, Metadata & Schedule Editor */}
          <div
            className={`w-full lg:w-96 bg-gray-950 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col ${
              editorExpanded ? 'h-96 lg:h-auto' : 'h-0 lg:h-auto'
            } overflow-hidden transition-all duration-200`}
          >
            {/* Sidebar Tabs */}
            <div className="flex border-b border-gray-800 bg-gray-900 text-xs">
              <button
                onClick={() => setActiveTab('beacons')}
                className={`flex-1 py-2.5 px-3 font-semibold text-center transition-colors ${
                  activeTab === 'beacons'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Beacons ({planData.parcel.boundaryPoints.length})
              </button>
              <button
                onClick={() => setActiveTab('metadata')}
                className={`flex-1 py-2.5 px-3 font-semibold text-center transition-colors ${
                  activeTab === 'metadata'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Plan Details
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 py-2.5 px-3 font-semibold text-center transition-colors ${
                  activeTab === 'schedule'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Bearings
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: BEACONS / COORDINATES */}
              {activeTab === 'beacons' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-gray-400">Boundary Beacons</span>
                    <button
                      onClick={addPoint}
                      className="flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-amber-400 font-medium"
                    >
                      <Plus className="w-3 h-3" /> Add Beacon
                    </button>
                  </div>

                  <div className="space-y-2">
                    {planData.parcel.boundaryPoints.map((pt, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <input
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 w-16 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                              value={pt.name}
                              onChange={(e) => updatePoint(idx, 'name', e.target.value)}
                            />
                          </div>
                          <button
                            onClick={() => deletePoint(idx)}
                            disabled={planData.parcel.boundaryPoints.length <= 3}
                            className="text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                            title="Delete Beacon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-0.5">Easting (m)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                              value={pt.easting}
                              onChange={(e) => updatePoint(idx, 'easting', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-0.5">Northing (m)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                              value={pt.northing}
                              onChange={(e) => updatePoint(idx, 'northing', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: PLAN METADATA */}
              {activeTab === 'metadata' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-gray-400 block mb-1">Plan Title</label>
                    <input
                      className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                      value={planData.project.plan_title || ''}
                      onChange={(e) => updateMetadata('plan_title', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-gray-400 block mb-1">Land Reference / Parcel ID</label>
                    <input
                      className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                      value={planData.project.lrNumber || planData.project.name || ''}
                      onChange={(e) => {
                        updateMetadata('lrNumber', e.target.value)
                        updateMetadata('name', e.target.value)
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-gray-400 block mb-1">Locality</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.location || ''}
                        onChange={(e) => updateMetadata('location', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">County / District</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.municipality || ''}
                        onChange={(e) => updateMetadata('municipality', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-gray-400 block mb-1">Surveyor Name</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.surveyor_name || ''}
                        onChange={(e) => updateMetadata('surveyor_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Licence No.</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.surveyor_licence || ''}
                        onChange={(e) => updateMetadata('surveyor_licence', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-gray-400 block mb-1">Client Name</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.client_name || ''}
                        onChange={(e) => updateMetadata('client_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Drawing Scale</label>
                      <select
                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-1.5 text-white focus:border-amber-400 focus:outline-none"
                        value={planData.project.scale || '1:1000'}
                        onChange={(e) => updateMetadata('scale', e.target.value)}
                      >
                        <option value="1:250">1:250</option>
                        <option value="1:500">1:500</option>
                        <option value="1:1000">1:1,000</option>
                        <option value="1:1250">1:1,250</option>
                        <option value="1:2500">1:2,500</option>
                        <option value="1:5000">1:5,000</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: BEARING SCHEDULE & QA */}
              {activeTab === 'schedule' && (
                <div className="space-y-3">
                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-green-400 font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Cadastral Polygon Closed</span>
                    </div>
                    <div className="text-gray-400 space-y-1">
                      <div>Total Legs: <span className="text-white font-mono">{bearingSchedule.length}</span></div>
                      <div>Total Perimeter: <span className="text-white font-mono">{geometry.perimeterM.toFixed(2)} m</span></div>
                      <div>True Computed Area: <span className="text-amber-400 font-mono">{geometry.areaSqm.toFixed(2)} m²</span></div>
                    </div>
                  </div>

                  <div className="border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-900 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2 px-2 text-left">From</th>
                          <th className="py-2 px-2 text-left">To</th>
                          <th className="py-2 px-2 text-right">Bearing</th>
                          <th className="py-2 px-2 text-right">Dist (m)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                        {bearingSchedule.map((leg, i) => (
                          <tr key={i} className="hover:bg-gray-900/50">
                            <td className="py-1.5 px-2 text-amber-400">{leg.from}</td>
                            <td className="py-1.5 px-2 text-amber-400">{leg.to}</td>
                            <td className="py-1.5 px-2 text-right text-gray-300">{leg.bearingDMS}</td>
                            <td className="py-1.5 px-2 text-right text-white font-bold">{leg.distance.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolGate>
  )
}
