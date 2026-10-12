'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Download, Printer, Copy, Check, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CADDocument } from './CADEditor'
import type { SubdivisionPlanData } from '@/lib/reports/subdivisionPlan/types'
import { renderSubdivisionPlan } from '@/lib/reports/subdivisionPlan/subdivisionPlanRenderer'
import { closedSubdivisionPortionFromCad } from '@/lib/reports/subdivisionPlan/fromCadDocument'
import { resolveProjectCadCrs } from '@/lib/cad/projectCadDocument'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'
import { coordinateArea } from '@/lib/engine/area'
import { escapeXml } from '@/lib/xml/escape'

interface SubdivisionPlanModalProps {
  isOpen: boolean
  onClose: () => void
  cadDoc?: CADDocument
  initialPlanData?: Partial<SubdivisionPlanData>
}

export function SubdivisionPlanModal({
  isOpen,
  onClose,
  cadDoc,
  initialPlanData,
}: SubdivisionPlanModalProps) {
  // Start with an empty draft and only carry forward user/project supplied values.
  const initialData = useMemo<SubdivisionPlanData>(() => {
    const empty: SubdivisionPlanData = {
      countyName: '', parcelNumber: '', ward: '', location: '', userCategory: '',
      portions: [], roadReserves: [], truncations: [], abuttals: [],
      locationPlan: { landmarkName: '', nearbyParcels: [], accessRoadLabel: '' },
      owner: { name: '', address: '', idNo: '' },
      planner: { name: '', address: '', rppNo: '' },
      surveyor: { name: '', address: '', lsNo: '' },
      notes: [],
    }
    const supplied = initialPlanData || {}
    const base: SubdivisionPlanData = {
      ...empty,
      ...supplied,
      locationPlan: { ...empty.locationPlan, ...supplied.locationPlan },
      owner: { ...empty.owner, ...supplied.owner },
      planner: { ...empty.planner, ...supplied.planner },
      surveyor: { ...empty.surveyor, ...supplied.surveyor },
    }

    if (cadDoc?.titleBlock.lrNumber) base.parcelNumber = cadDoc.titleBlock.lrNumber
    if (cadDoc?.titleBlock.surveyor) base.surveyor.name = cadDoc.titleBlock.surveyor
    if (cadDoc?.titleBlock.regNo) base.surveyor.lsNo = cadDoc.titleBlock.regNo

    const cadBoundary = closedSubdivisionPortionFromCad(cadDoc)
    if (!base.portions.length && cadBoundary) {
      base.projectCrs = cadBoundary.projectCrs
      base.portions = [cadBoundary.portion]
    } else if (!base.projectCrs && cadDoc?.coordinateReferenceSystem) {
      try {
        base.projectCrs = resolveProjectCadCrs(cadDoc.coordinateReferenceSystem)
      } catch {
        base.projectCrs = undefined
      }
    }
    return base
  }, [cadDoc, initialPlanData])

  const [planData, setPlanData] = useState<SubdivisionPlanData>(initialData)
  const [activeTab, setActiveTab] = useState<'preview' | 'metadata' | 'portions'>('preview')
  const [copied, setCopied] = useState(false)
  const registeredCrs = useMemo(() => {
    if (!planData.projectCrs) return undefined
    try { return resolveProjectCadCrs(planData.projectCrs) } catch { return undefined }
  }, [planData.projectCrs])
  const portionAreas = useMemo(() => planData.portions.map((portion) => (
    registeredCrs && isSimplePolygonRing(portion.boundaryPoints)
      ? coordinateArea(portion.boundaryPoints).areaHa
      : null
  )), [planData.portions, registeredCrs])

  useEffect(() => {
    if (isOpen) setPlanData(initialData)
  }, [initialData, isOpen])

  // Re-generate SVG string on data change
  const svgOutput = useMemo(() => {
    try {
      return renderSubdivisionPlan(planData)
    } catch (err) {
      console.error('Failed to render subdivision plan:', err)
      return '<svg><text x="20" y="30" fill="red">Render Error</text></svg>'
    }
  }, [planData])

  // Download SVG file
  const handleDownloadSVG = useCallback(() => {
    const blob = new Blob([svgOutput], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fileName = `subdivision-scheme-${(planData.parcelNumber || 'plan').replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }, [svgOutput, planData.parcelNumber])

  // Print / PDF export
  const handlePrintPDF = useCallback(() => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print/export the Subdivision Scheme Plan.')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
      <title>Subdivision Scheme Plan - ${escapeXml(planData.parcelNumber || 'METARDU')}</title>
          <style>
            @page {
              size: A3 landscape;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 420mm;
              height: 297mm;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            svg {
              width: 420mm;
              height: 297mm;
              display: block;
            }
          </style>
        </head>
        <body>
          ${svgOutput}
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }, [svgOutput, planData.parcelNumber])

  // Copy SVG markup to clipboard
  const handleCopySVG = useCallback(() => {
    navigator.clipboard.writeText(svgOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [svgOutput])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-4 md:p-6 overflow-hidden">
      {/* Top Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-t-xl px-5 py-3.5 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-bold text-gray-100 flex items-center gap-2">
              Subdivision / Amalgamation Scheme Plan
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                Draft · not an authority form
              </span>
            </h2>
            <p className="text-xs text-gray-400 font-mono">
              A3 draft from supplied data · verify current county submission requirements
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopySVG}
            className="text-xs h-8 bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200"
            title="Copy SVG markup to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? 'Copied' : 'Copy SVG'}
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadSVG}
            className="text-xs h-8 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> Download SVG
          </Button>

          <Button
            size="sm"
            onClick={handlePrintPDF}
            className="text-xs h-8 bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            <Printer className="w-3.5 h-3.5 mr-1" /> Print / PDF (A3)
          </Button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Container: Left Sidebar & Right SVG Viewer */}
      <div className="flex-1 flex flex-col md:flex-row bg-gray-950 border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
        {/* Left Form Panel */}
        <div className="w-full md:w-80 lg:w-96 bg-gray-900/70 border-r border-gray-800 p-4 overflow-y-auto space-y-4 shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-gray-800 pb-2 gap-2 text-xs font-mono">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded transition-colors ${activeTab === 'preview' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-gray-400 hover:text-gray-200'}`}
            >
              General Info
            </button>
            <button
              onClick={() => setActiveTab('portions')}
              className={`px-3 py-1 rounded transition-colors ${activeTab === 'portions' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Portions ({planData.portions.length})
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-3 py-1 rounded transition-colors ${activeTab === 'metadata' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-gray-400 hover:text-gray-200'}`}
            >
              People & source
            </button>
          </div>

          {activeTab === 'preview' && (
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">County / authority (enter as supplied)</label>
                <Input
                  value={planData.countyName}
                  onChange={e => setPlanData(prev => ({ ...prev, countyName: e.target.value }))}
                  placeholder="County or approving authority"
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">Parcel Number (LR No / RIM No)</label>
                <Input
                  value={planData.parcelNumber}
                  onChange={e => setPlanData(prev => ({ ...prev, parcelNumber: e.target.value }))}
                  placeholder="e.g. KER/BOMET/SILIBWET/1024"
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">Ward / administrative area</label>
                <Input
                  value={planData.ward}
                  onChange={e => setPlanData(prev => ({ ...prev, ward: e.target.value }))}
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">Location / Landmark Description</label>
                <Input
                  value={planData.location}
                  onChange={e => setPlanData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g. TENWEK (NEAR SILIBWET PRY SCHOOL)"
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>

              <div className="rounded border border-gray-800 bg-gray-950 px-3 py-2">
                <div className="text-[10px] text-gray-400 uppercase font-mono">Project CRS</div>
                <div className="mt-1 text-xs font-mono text-gray-200">{registeredCrs || 'Not registered · geometry will not be plotted'}</div>
                <p className="mt-1 text-[10px] leading-4 text-gray-500">Scale is calculated from the geometry fit. Print on A3 at 100% to retain that scale.</p>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">Land Use Category</label>
                <Input
                  value={planData.userCategory}
                  onChange={e => setPlanData(prev => ({ ...prev, userCategory: e.target.value }))}
                  placeholder="e.g. AGRICULTURAL / RESIDENTIAL"
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-gray-800">
                <span className="text-[11px] font-bold text-gray-200 block mb-2">Location reference · not to scale</span>
                <label className="text-[10px] text-gray-400 uppercase font-mono block mb-1">Landmark Name</label>
                <Input
                  value={planData.locationPlan.landmarkName}
                  onChange={e => setPlanData(prev => ({
                    ...prev,
                    locationPlan: { ...prev.locationPlan, landmarkName: e.target.value }
                  }))}
                  placeholder="PRY SCHOOL / CENTRE"
                  className="h-8 bg-gray-950 border-gray-800 text-xs"
                />
              </div>
            </div>
          )}

          {activeTab === 'portions' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-bold text-gray-200">Proposed Portions</span>
                <span className="text-[10px] font-mono text-cyan-400">
                  Total: {planData.portions.length > 0 && portionAreas.every((area) => area !== null)
                    ? `${portionAreas.reduce((sum, area) => sum + (area || 0), 0).toFixed(4)} Ha`
                    : 'Area unavailable'}
                </span>
              </div>

              {planData.portions.length === 0 && (
                <p className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-200">
                  No closed parcel boundary is available. Import or draw a closed boundary in the project CAD editor, and confirm its registered metre CRS before generating a plan.
                </p>
              )}

              {planData.portions.map((portion, idx) => (
                <div key={portion.id} className="p-2.5 bg-gray-950 border border-gray-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-100 font-mono text-xs">Portion {portion.label}</span>
                    <span className="text-[10px] text-amber-400 font-mono">{portion.user || 'Land use not supplied'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block font-mono">Calculated area</label>
                      <div className="h-7 flex items-center text-xs text-gray-200 font-mono">
                        {portionAreas[idx] === null ? 'Unavailable' : `${portionAreas[idx]!.toFixed(4)} ha`}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block font-mono">Label</label>
                      <Input
                        value={portion.label}
                        onChange={e => {
                          const val = e.target.value
                          setPlanData(prev => {
                            const updated = [...prev.portions]
                            updated[idx] = { ...updated[idx], label: val }
                            return { ...prev, portions: updated }
                          })
                        }}
                        className="h-7 text-xs bg-gray-900 border-gray-700 font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-500 font-mono">Area is derived from this closed ring in {registeredCrs || 'an unregistered CRS'}.</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-gray-200 block">Registered Owner</span>
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block">Owner Name</label>
                  <Input
                    value={planData.owner.name}
                    onChange={e => setPlanData(prev => ({
                      ...prev,
                      owner: { ...prev.owner, name: e.target.value }
                    }))}
                    className="h-7 text-xs bg-gray-900 border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block">ID Number</label>
                  <Input
                    value={planData.owner.idNo}
                    onChange={e => setPlanData(prev => ({
                      ...prev,
                      owner: { ...prev.owner, idNo: e.target.value }
                    }))}
                    className="h-7 text-xs bg-gray-900 border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block">Postal Address</label>
                  <Input
                    value={planData.owner.address}
                    onChange={e => setPlanData(prev => ({
                      ...prev,
                      owner: { ...prev.owner, address: e.target.value }
                    }))}
                    className="h-7 text-xs bg-gray-900 border-gray-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-gray-200 block">Physical planner · user entered</span>
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block">Planner name</label>
                  <Input
                    value={planData.planner.name}
                    onChange={e => setPlanData(prev => ({
                      ...prev,
                      planner: { ...prev.planner, name: e.target.value }
                    }))}
                    className="h-7 text-xs bg-gray-900 border-gray-700"
                  />
                </div>
                <label className="text-[9px] text-gray-400 uppercase font-mono block">RPP number</label>
                <Input
                  value={planData.planner.rppNo}
                  onChange={e => setPlanData(prev => ({ ...prev, planner: { ...prev.planner, rppNo: e.target.value } }))}
                  className="h-7 text-xs bg-gray-900 border-gray-700"
                />
                <div>
                  <label className="text-[9px] text-gray-400 uppercase font-mono block">Address</label>
                  <Input
                    value={planData.planner.address}
                    onChange={e => setPlanData(prev => ({
                      ...prev,
                      planner: { ...prev.planner, address: e.target.value }
                    }))}
                    className="h-7 text-xs bg-gray-900 border-gray-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-gray-200 block">Licensed surveyor · user entered</span>
                <label className="text-[9px] text-gray-400 uppercase font-mono block">Surveyor name</label>
                <Input
                  value={planData.surveyor.name}
                  onChange={e => setPlanData(prev => ({ ...prev, surveyor: { ...prev.surveyor, name: e.target.value } }))}
                  className="h-7 text-xs bg-gray-900 border-gray-700"
                />
                <label className="text-[9px] text-gray-400 uppercase font-mono block">L.S. registration number</label>
                <Input
                  value={planData.surveyor.lsNo}
                  onChange={e => setPlanData(prev => ({ ...prev, surveyor: { ...prev.surveyor, lsNo: e.target.value } }))}
                  className="h-7 text-xs bg-gray-900 border-gray-700"
                />
                <label className="text-[9px] text-gray-400 uppercase font-mono block">Address</label>
                <Input
                  value={planData.surveyor.address}
                  onChange={e => setPlanData(prev => ({ ...prev, surveyor: { ...prev.surveyor, address: e.target.value } }))}
                  className="h-7 text-xs bg-gray-900 border-gray-700"
                />
                <p className="text-[10px] leading-4 text-gray-500">METARDU does not verify identity, qualifications or registration status.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right SVG Preview Canvas */}
        <div className="flex-1 bg-gray-900/40 p-4 md:p-6 flex items-center justify-center overflow-auto relative">
          <div
            className="w-full max-w-5xl aspect-[420/297] bg-white shadow-2xl rounded-sm border border-gray-700 overflow-hidden [&>svg]:block [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: svgOutput }}
          />
        </div>
      </div>
    </div>
  )
}
export default SubdivisionPlanModal
