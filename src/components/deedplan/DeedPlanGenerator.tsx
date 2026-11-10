'use client';

import { useState, useRef } from 'react'
import { FileText, Download, Save, AlertCircle, Plus, Trash2, Printer, Upload } from 'lucide-react'
import { DeedPlanInput, DeedPlanOutput, BoundaryPoint, BeaconType } from '@/types/deedPlan'
import { generateDeedPlan } from '@/lib/compute/deedPlanApi'
import { computeArea } from '@/lib/compute/deedPlan'
import { saveDeedPlan } from '@/lib/api-client/deedPlans'
import { printDeedPlan } from '@/lib/print/deedPlanPrint'
import { trackDeedGenerate, trackDeedDownload } from '@/lib/analytics/events'
interface DeedPlanGeneratorProps {
  projectId: string
  initialPoints?: BoundaryPoint[]
  initialGrid?: Pick<DeedPlanInput, 'datum' | 'utmZone' | 'hemisphere'>
}

const SCALES = [250, 500, 1000, 1250, 2500, 5000, 10000] as const
const MARK_TYPES: BeaconType[] = ['PSC', 'SSC', 'BM', 'MASONRY_NAIL', 'IRON_PIN', 'CONCRETE_BEACON', 'INDICATORY', 'RIVET', 'TBM']
const MARK_STATUSES = ['UNRECORDED', 'FOUND', 'SET', 'REFERENCED', 'DESTROYED', 'NOT_FOUND'] as const

const FOUR_ACRE_SAMPLE: DeedPlanInput = {
  surveyNumber: 'RS087_2026_014_R00',
  drawingNumber: 'FR-583-83-SUBDIV-A',
  parcelNumber: 'A / L.R. Kajiado-Kaputiei North-18462',
  locality: 'Kitengela, Kaputiei North',
  area: 0,
  registrationSection: 'Kaputiei North',
  county: 'Kajiado',
  utmZone: 37,
  hemisphere: 'S',
  scale: 1000,
  datum: 'ARC1960',
  projectionType: 'UTM',
  boundaryPoints: [
    { id: 'AB1', easting: 4332.6, northing: 114190.94, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'I.P.C NEW from sample final coordinate list' },
    { id: 'AB2', easting: 4259, northing: 114198.58, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'I.P.C NEW from sample final coordinate list' },
    { id: 'AB3', easting: 4279.99, northing: 114400.63, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'I.P.C NEW from sample final coordinate list' },
    { id: 'AB4', easting: 4356.24, northing: 114424.48, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'I.P.C.U NEW from sample final coordinate list' },
  ],
  abuttalNorth: 'Remainder parcel B',
  abuttalSouth: 'Access road reserve',
  abuttalEast: 'Neighbouring agricultural holding',
  abuttalWest: 'Remainder parcel B',
  surveyorName: 'Samuel K. Muriithi',
  iskNumber: 'ISK-1402',
  firmName: 'METARDU Survey Consultants Ltd',
  firmAddress: 'Nairobi, Kenya',
  surveyDate: '',
  signatureDate: '',
  clientName: 'Kaputiei Holdings Ltd',
  titleDeedNumber: 'FR No. 583/83',
  drawnBy: 'SKM',
  checkedBy: 'METARDU QA',
}

export default function DeedPlanGenerator({ projectId, initialPoints = [], initialGrid }: DeedPlanGeneratorProps) {
  const [step, setStep] = useState<'input' | 'preview' | 'export'>('input')
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState<DeedPlanOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [input, setInputState] = useState<DeedPlanInput>({
    surveyNumber: '',
    drawingNumber: '',
    parcelNumber: '',
    locality: '',
    area: 0,
    registrationSection: '',
    county: '',
    utmZone: 37,
    hemisphere: 'S',
    scale: 1000,
    datum: 'ARC1960',
    projectionType: 'UTM',
    boundaryPoints: initialPoints.length > 0 ? initialPoints : [],
    abuttalNorth: '',
    abuttalSouth: '',
    abuttalEast: '',
    abuttalWest: '',
    surveyorName: '',
    iskNumber: '',
    firmName: '',
    firmAddress: '',
    surveyDate: new Date().toISOString().split('T')[0],
    signatureDate: new Date().toISOString().split('T')[0],
    ...initialGrid,
  })

  const inputRef = useRef(input)
  const generating = useRef(false)
  const saving = useRef(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [referenceConfirmed, setReferenceConfirmed] = useState(Boolean(initialGrid))

  function setInput(next: DeedPlanInput | ((previous: DeedPlanInput) => DeedPlanInput)) {
    const value = typeof next === 'function' ? next(inputRef.current) : next
    inputRef.current = value
    setInputState(value)
    setOutput(null)
    setSaveState('idle')
    setError(null)
  }

  const handleGenerate = async () => {
    if (generating.current) return
    if (!referenceConfirmed) {
      setError('Confirm the coordinate grid before generating the draft.')
      return
    }
    const snapshot = input
    generating.current = true
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateDeedPlan(snapshot)
      if (inputRef.current !== snapshot) return
      trackDeedGenerate(snapshot.scale)
      setOutput(result)
      setStep('preview')
    } catch (err) {
      if (inputRef.current === snapshot) setError(err instanceof Error ? err.message : 'Failed to generate deed plan')
    } finally {
      generating.current = false
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!output || projectId === 'new' || saving.current || saveState === 'saved') return
    saving.current = true
    setSaveState('saving')
    setError(null)
    try {
      await saveDeedPlan(projectId, { ...input, area: computeArea(input.boundaryPoints) }, output)
      if (inputRef.current === input) setSaveState('saved')
    } catch (err) {
      if (inputRef.current === input) {
        setSaveState('idle')
        setError(err instanceof Error ? err.message : 'Could not save the project draft.')
      }
    } finally { saving.current = false }
  }

  const handleDownloadSVG = () => {
    if (!output) return
    trackDeedDownload()
    const blob = new Blob([output.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${input.parcelNumber || 'deed-plan'}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPNG = () => {
    if (!output) return
    setError(null)
    const url = URL.createObjectURL(new Blob([output.svg], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 3200
        canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas is unavailable. Download the SVG instead.')
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          if (!blob) { setError('PNG could not be created. Download the SVG instead.'); return }
          const png = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = png
          link.download = (input.parcelNumber || 'deed-plan') + '.png'
          link.click()
          setTimeout(() => URL.revokeObjectURL(png), 1000)
        }, 'image/png')
      } catch (error) {
        setError(error instanceof Error ? error.message : 'PNG could not be created.')
      } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); setError('PNG could not be created. Download the SVG instead.') }
    img.src = url
  }

  const handlePrintA3 = () => {
    if (!output) return
    try { printDeedPlan({ input }) }
    catch (error) { setError(error instanceof Error ? error.message : 'Print preview could not open.') }
  }

  const addBoundaryPoint = () => {
    const index = input.boundaryPoints.length + 1
    setInput({
      ...input,
      boundaryPoints: [
        ...input.boundaryPoints,
        {
          id: `P${index}`,
          easting: 0,
          northing: 0,
          markType: 'INDICATORY',
          markStatus: 'UNRECORDED',
          description: '',
        },
      ],
    })
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (!text) return

      try {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        const imported: BoundaryPoint[] = []

        for (const line of lines) {
          // Skip header if present
          const parts = line.split(/[,\t\s]+/).filter(Boolean)
          if (/^(point|point_name|id|pt|name)$/i.test(parts[0]) && /^(easting|e)$/i.test(parts[1])) continue
          if (parts.length >= 3) {
            const id = parts[0]
            const easting = parseFloat(parts[1])
            const northing = parseFloat(parts[2])
            if (!isNaN(easting) && !isNaN(northing)) {
              imported.push({
                id,
                easting,
                northing,
                markType: MARK_TYPES.includes(parts[3] as BeaconType) ? parts[3] as BeaconType : 'INDICATORY',
                markStatus: 'UNRECORDED',
                description: parts.slice(4).join(' ') || 'Imported field coordinate',
              })
            }
          }
        }

        if (imported.length > 0) {
          setInput(prev => ({
            ...prev,
            boundaryPoints: imported,
          }))
          setError(null)
        } else {
          setError('No valid coordinates found in file. Format expected: PointID, Easting, Northing')
        }
      } catch {
        setError('Failed to parse coordinate file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const removeBoundaryPoint = (index: number) => {
    setInput({
      ...input,
      boundaryPoints: input.boundaryPoints.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Draft a deed plan</h1>

      {/* Step Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setStep('input')}
          className={`px-4 py-2 rounded-lg transition-colors ${step === 'input' ? 'bg-[var(--accent)] text-black font-semibold' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'}`}
        >
          1. Input
        </button>
        <button
          onClick={() => output && setStep('preview')}
          disabled={!output}
          className={`px-4 py-2 rounded-lg transition-colors ${step === 'preview' ? 'bg-[var(--accent)] text-black font-semibold' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'} ${!output ? 'opacity-50' : ''}`}
        >
          2. Preview
        </button>
        <button
          onClick={() => output && setStep('export')}
          disabled={!output}
          className={`px-4 py-2 rounded-lg transition-colors ${step === 'export' ? 'bg-[var(--accent)] text-black font-semibold' : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'} ${!output ? 'opacity-50' : ''}`}
        >
          3. Export
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-red-800/60 bg-red-950/30 text-red-300 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* INPUT STEP */}
      {step === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Project Info */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Project Information</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="dpg-survey-number" className="block text-sm font-medium mb-1">Survey Number</label>
                <input
                  id="dpg-survey-number"
                  type="text"
                  value={input.surveyNumber}
                  onChange={(e) => setInput({ ...input, surveyNumber: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="ISK/2024/001"
                />
              </div>
              <div>
                <label htmlFor="dpg-drawing-number" className="block text-sm font-medium mb-1">Drawing Number</label>
                <input id="dpg-drawing-number"
                  type="text"
                  value={input.drawingNumber}
                  onChange={(e) => setInput({ ...input, drawingNumber: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-parcel-number" className="block text-sm font-medium mb-1">Parcel Number</label>
                <input
                  id="dpg-parcel-number"
                  type="text"
                  value={input.parcelNumber}
                  onChange={(e) => setInput({ ...input, parcelNumber: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="LOT 1234/NAIROBI"
                />
              </div>
              <div>
                <label htmlFor="dpg-locality" className="block text-sm font-medium mb-1">Locality</label>
                <input id="dpg-locality"
                  type="text"
                  value={input.locality}
                  onChange={(e) => setInput({ ...input, locality: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-registration-section" className="block text-sm font-medium mb-1">Registration Section</label>
                <input id="dpg-registration-section"
                  type="text"
                  value={input.registrationSection}
                  onChange={(e) => setInput({ ...input, registrationSection: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-county" className="block text-sm font-medium mb-1">County</label>
                <input id="dpg-county"
                  type="text"
                  value={input.county}
                  onChange={(e) => setInput({ ...input, county: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-scale" className="block text-sm font-medium mb-1">Scale</label>
                <select
                  id="dpg-scale"
                  value={input.scale}
                  onChange={(e) => setInput({ ...input, scale: Number(e.target.value) as 500 | 1000 | 2500 | 5000 })}
                  className="input w-full text-sm"
                >
                  {SCALES.map((s) => (
                    <option key={s} value={s}>1 : {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dpg-datum" className="block text-sm font-medium mb-1">Datum</label>
                <select
                  id="dpg-datum"
                  value={input.datum}
                  disabled={Boolean(initialGrid)}
                  onChange={(e) => { setInput({ ...input, datum: e.target.value as 'ARC1960' | 'WGS84' }); setReferenceConfirmed(false) }}
                  className="input w-full text-sm"
                >
                  <option value="WGS84">WGS84</option>
                  <option value="ARC1960">ARC1960</option>
                </select>
              </div>
              <div className="mt-4 p-3 border border-[var(--border-color)] rounded">
                <p className="text-xs font-semibold mb-2 text-[var(--text-secondary)] uppercase tracking-wide">SRVY2025-1 & Grid Corrections</p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="dpg-submission-number" className="block text-xs font-medium mb-1">Submission Number (SRVY2025-1)</label>
                    <input
                      id="dpg-submission-number"
                      type="text"
                      value={input.submissionNumber || ''}
                      onChange={(e) => setInput({ ...input, submissionNumber: e.target.value })}
                      className="input w-full text-sm"
                      placeholder="RS149_2025_001_R00"
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Format: RS###_YYYY_###_R## — from SRVY2025-1</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="dpg-sheet-number" className="block text-xs font-medium mb-1">Sheet No.</label>
                      <input
                        id="dpg-sheet-number"
                        type="number"
                        min="1"
                        value={input.sheetNumber || ''}
                        onChange={(e) => setInput({ ...input, sheetNumber: e.target.value ? Number(e.target.value) : undefined })}
                        className="input w-full text-sm"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label htmlFor="dpg-total-sheets" className="block text-xs font-medium mb-1">Total Sheets</label>
                      <input
                        id="dpg-total-sheets"
                        type="number"
                        min="1"
                        value={input.totalSheets || ''}
                        onChange={(e) => setInput({ ...input, totalSheets: e.target.value ? Number(e.target.value) : undefined })}
                        className="input w-full text-sm"
                        placeholder="1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="dpg-scale-factor" className="block text-xs font-medium mb-1">Scale Factor (SF)</label>
                      <input
                        id="dpg-scale-factor"
                        type="number"
                        step="0.000001"
                        value={input.scaleFactor || ''}
                        onChange={(e) => setInput({ ...input, scaleFactor: e.target.value ? Number(e.target.value) : undefined })}
                        className="input w-full text-sm"
                        placeholder="0.99979"
                      />
                      <p className="text-xs text-[var(--text-muted)] mt-1">Grid-to-Ground correction</p>
                    </div>
                    <div>
                      <label htmlFor="dpg-mean-elevation" className="block text-xs font-medium mb-1">Mean Elevation (m)</label>
                      <input
                        id="dpg-mean-elevation"
                        type="number"
                        step="0.1"
                        value={input.meanElevation ?? ''}
                        onChange={(e) => setInput({ ...input, meanElevation: e.target.value ? Number(e.target.value) : undefined })}
                        className="input w-full text-sm"
                        placeholder="1820.0"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="dpg-grid-area" className="block text-xs font-medium mb-1">Grid Area (m²)</label>
                    <input
                      id="dpg-grid-area"
                      type="number"
                      step="0.01"
                      value={input.gridArea || ''}
                      onChange={(e) => setInput({ ...input, gridArea: e.target.value ? Number(e.target.value) : undefined })}
                      className="input w-full text-sm"
                      placeholder="Leave blank if not applicable"
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Area from UTM coordinates before SF correction</p>
                  </div>
                  <div>
                    <label htmlFor="dpg-control-class" className="block text-xs font-medium mb-1">Control Class</label>
                    <select
                      id="dpg-control-class"
                      value={input.controlClass || ''}
                      onChange={(e) => setInput({ ...input, controlClass: e.target.value as 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | undefined })}
                      className="input w-full text-sm"
                    >
                      <option value="">Select accuracy class...</option>
                      <option value="FIRST">First Order — 1:50,000 precision</option>
                      <option value="SECOND">Second Order — 1:20,000 precision</option>
                      <option value="THIRD">Third Order — 1:10,000 precision</option>
                      <option value="FOURTH">Fourth Order — 1:5,000 precision</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Surveyor Info */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Surveyor's Certificate</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="dpg-client-name" className="block text-sm font-medium mb-1">Client Name</label>
                <input
                  id="dpg-client-name"
                  type="text"
                  value={input.clientName || ''}
                  onChange={(e) => setInput({ ...input, clientName: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="Name of the client/owner"
                />
              </div>
              <div>
                <label htmlFor="dpg-surveyor-name" className="block text-sm font-medium mb-1">Surveyor Name</label>
                <input id="dpg-surveyor-name"
                  type="text"
                  value={input.surveyorName}
                  onChange={(e) => setInput({ ...input, surveyorName: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-isk-number" className="block text-sm font-medium mb-1">ISK Number</label>
                <input id="dpg-isk-number"
                  type="text"
                  value={input.iskNumber}
                  onChange={(e) => setInput({ ...input, iskNumber: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-title-deed-number" className="block text-sm font-medium mb-1">Title Deed Number</label>
                <input
                  id="dpg-title-deed-number"
                  type="text"
                  value={input.titleDeedNumber || ''}
                  onChange={(e) => setInput({ ...input, titleDeedNumber: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="e.g. FR No. 583/83"
                />
              </div>
              <div>
                <label htmlFor="dpg-firm-name" className="block text-sm font-medium mb-1">Firm Name</label>
                <input id="dpg-firm-name"
                  type="text"
                  value={input.firmName}
                  onChange={(e) => setInput({ ...input, firmName: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-survey-date" className="block text-sm font-medium mb-1">Survey Date</label>
                <input id="dpg-survey-date"
                  type="date"
                  value={input.surveyDate}
                  onChange={(e) => setInput({ ...input, surveyDate: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
            </div>

            <h3 className="text-lg font-semibold mt-6 mb-4">Abuttals</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dpg-abuttal-north" className="block text-sm font-medium mb-1">North</label>
                <input id="dpg-abuttal-north"
                  type="text"
                  value={input.abuttalNorth}
                  onChange={(e) => setInput({ ...input, abuttalNorth: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-abuttal-south" className="block text-sm font-medium mb-1">South</label>
                <input id="dpg-abuttal-south"
                  type="text"
                  value={input.abuttalSouth}
                  onChange={(e) => setInput({ ...input, abuttalSouth: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-abuttal-east" className="block text-sm font-medium mb-1">East</label>
                <input id="dpg-abuttal-east"
                  type="text"
                  value={input.abuttalEast}
                  onChange={(e) => setInput({ ...input, abuttalEast: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="dpg-abuttal-west" className="block text-sm font-medium mb-1">West</label>
                <input id="dpg-abuttal-west"
                  type="text"
                  value={input.abuttalWest}
                  onChange={(e) => setInput({ ...input, abuttalWest: e.target.value })}
                  className="input w-full text-sm"
                />
              </div>
            </div>
          </div>

          {/* Boundary Points */}
          <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Boundary Points</h2>
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCSVUpload}
                  accept=".csv,.txt,.dat"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] text-sm"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV / Coordinates
                </button>
                <button
                  type="button"
                  onClick={() => { setInput({ ...FOUR_ACRE_SAMPLE, ...initialGrid }); setReferenceConfirmed(false) }}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] text-sm"
                >
                  <FileText className="h-4 w-4" />
                  Load 4-Acre Sample
                </button>
                <button
                  type="button"
                  onClick={addBoundaryPoint}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] text-sm font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  Add Point
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left py-2">Easting</th>
                    <th className="text-left py-2">Northing</th>
                    <th className="text-left py-2">Mark Type</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Description</th>
                    <th className="w-12 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {input.boundaryPoints.map((point, i) => (
                    <tr key={point.id} className="border-b">
                      <td className="py-2">
                        <input aria-label="Id"
                          type="text"
                          value={point.id}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, id: e.target.value }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="w-24 px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="py-2">
                        <input aria-label="Easting"
                          type="number"
                          value={point.easting}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, easting: parseFloat(e.target.value) }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="w-32 px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="py-2">
                        <input aria-label="Northing"
                          type="number"
                          value={point.northing}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, northing: parseFloat(e.target.value) }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="w-32 px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="py-2">
                        <select
                          value={point.markType}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, markType: e.target.value as BeaconType }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="px-2 py-1 border rounded"
                        >
                          {MARK_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <select
                          value={point.markStatus}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, markStatus: e.target.value as 'FOUND' | 'SET' | 'REFERENCED' }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="px-2 py-1 border rounded"
                        >
                          {MARK_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <input
                          type="text"
                          value={point.description || ''}
                          onChange={(e) => {
                            const newPoints = [...input.boundaryPoints]
                            newPoints[i] = { ...point, description: e.target.value }
                            setInput({ ...input, boundaryPoints: newPoints })
                          }}
                          className="w-48 px-2 py-1 border rounded"
                          aria-label="Beacon description"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeBoundaryPoint(i)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border text-red-600 hover:bg-red-50"
                          aria-label={`Remove ${point.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-wrap items-end gap-3">
            <label className="text-sm">UTM zone
              <input className="input ml-2 w-20" type="number" min={1} max={60} value={input.utmZone || ''} disabled={Boolean(initialGrid)}
                onChange={event => { setInput({ ...input, utmZone: Number(event.target.value) }); setReferenceConfirmed(false) }} />
            </label>
            <label className="text-sm">Hemisphere
              <select className="input ml-2" value={input.hemisphere} disabled={Boolean(initialGrid)}
                onChange={event => { setInput({ ...input, hemisphere: event.target.value === 'N' ? 'N' : 'S' }); setReferenceConfirmed(false) }}>
                <option value="N">North</option><option value="S">South</option>
              </select>
            </label>
            {(!initialGrid || !referenceConfirmed) && <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={referenceConfirmed} onChange={event => { setReferenceConfirmed(event.target.checked); setOutput(null) }} />
              I checked the coordinate grid
            </label>}
          </div>
          <div className="lg:col-span-2 flex justify-end gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !referenceConfirmed}
              className="flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:opacity-50 font-bold"
            >
              {isGenerating ? (
                <>Generating...</>
              ) : (
                <>
                  <FileText className="h-5 w-5" />
                  Generate Deed Plan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PREVIEW STEP */}
      {step === 'preview' && output && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-color)] p-4 tabular-nums">
            <p className="font-semibold">Draft geometry</p>
            <p className="text-sm text-[var(--text-secondary)]">Perimeter {output.closureCheck.perimeter.toFixed(2)} m. Check the drawing and bearings against the source survey before issue.</p>
          </div>

          {/* SVG Preview */}
          <div className="bg-white rounded-lg p-4 border overflow-auto">
            <div
              className="mx-auto [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: output.svg }}
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('export')}
              className="flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] font-bold"
            >
              Continue to Export
            </button>
          </div>
        </div>
      )}

      {/* EXPORT STEP */}
      {step === 'export' && output && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button
              onClick={handlePrintA3}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] font-bold"
            >
              <Printer className="h-5 w-5" />
              Print A3 draft
            </button>
            <button
              onClick={handleDownloadPNG}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] font-bold"
            >
              <Download className="h-5 w-5" />
              Download PNG
            </button>
            <button
              onClick={handleDownloadSVG}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)]"
            >
              <Download className="h-5 w-5" />
              Download SVG
            </button>
            {projectId !== 'new' && <button
              onClick={handleSave}
              disabled={saveState !== 'idle'}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] font-bold"
            >
              <Save className="h-5 w-5" />
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Draft saved' : 'Save to project'}
            </button>}
          </div>

          {/* Bearing Schedule */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Bearing Schedule</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Leg</th>
                    <th className="text-left py-2">From</th>
                    <th className="text-left py-2">To</th>
                    <th className="text-left py-2">Bearing (WCB)</th>
                    <th className="text-right py-2">Distance (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {output.bearingSchedule.map((leg, i) => (
                    <tr key={`${leg}-${i}`} className="border-b">
                      <td className="py-2">{i + 1}</td>
                      <td className="py-2">{leg.fromPoint}</td>
                      <td className="py-2">{leg.toPoint}</td>
                      <td className="py-2 font-mono">{leg.bearing}</td>
                      <td className="py-2 text-right">{leg.distance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Beacon Description Schedule */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Beacon Description Schedule</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Beacon ID</th>
                    <th className="text-left py-2">Mark Type</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {input.boundaryPoints.map((point) => (
                    <tr key={point.id} className="border-b">
                      <td className="py-2 font-semibold">{point.id}</td>
                      <td className="py-2">{point.markType}</td>
                      <td className="py-2">{point.markStatus || '—'}</td>
                      <td className="py-2">{point.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
