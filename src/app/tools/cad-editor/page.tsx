'use client'

import { useState, useEffect, useCallback } from 'react'
import { z } from 'zod'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, FileText, Check, FolderOpen, X, Building } from 'lucide-react'
import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { deriveBoundaryMeasurements } from '@/lib/cadGeometry'
import { parseCadDocument } from '@/lib/cad/cadDocumentValidation'

const projectListSchema = z.object({ data: z.array(z.object({ id: z.string().min(1), name: z.string(), lr_number: z.string().nullable().optional() })) })

// Lazy-load the heavy CADEditor component
const CADEditor = dynamic(() => import('@/components/cad-editor/CADEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-[70vh] bg-gray-950 text-gray-400 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      <span className="text-sm font-mono">Loading METARDU CAD Canvas...</span>
    </div>
  ),
})

// ─── Default Blank Sheet ───────────────────────────────────────────────────
function createDefaultCADDoc(): CADDocument {
  const W = 1122 // A3 Landscape at 96 DPI
  const H = 794

  return {
    beacons: [],
    boundaries: [],
    annotations: [],
    northArrow: {
      x: W - 110,
      y: 90,
      rotation: 0,
      type: 'grid',
      bearing: '0°00\'00"',
    },
    scaleBar: {
      x: 70,
      y: H - 50,
      scaleMeters: 0,
    },
    titleBlock: {
      projectName: 'Untitled survey plan',
      lrNumber: '',
      surveyor: 'Enter licensed surveyor name',
      regNo: 'Enter registration number',
      date: new Date().toLocaleDateString('en-GB'),
      scale: 'Set from verified survey data',
      sheet: '1 of 1',
    },
    width: W,
    height: H,
    backgroundImage: null,
  }
}

// ─── Sample Cadastral Lot ──────────────────────────────────────────────────
function createSampleCadastralDoc(): CADDocument {
  const base = createDefaultCADDoc()
  const cx = base.width / 2 - 50
  const cy = base.height / 2 - 40

  const beacons = [
    { id: 'b1', label: 'B1', x: cx, y: cy, easting: 250100.0, northing: 9800100.0, symbol: 'concrete_beacon' },
    { id: 'b2', label: 'B2', x: cx + 180, y: cy - 30, easting: 250280.0, northing: 9800130.0, symbol: 'concrete_beacon' },
    { id: 'b3', label: 'B3', x: cx + 240, y: cy + 120, easting: 250340.0, northing: 9800020.0, symbol: 'concrete_beacon' },
    { id: 'b4', label: 'B4', x: cx + 80, y: cy + 190, easting: 250180.0, northing: 9799910.0, symbol: 'concrete_beacon' },
    { id: 'b5', label: 'B5', x: cx - 40, y: cy + 110, easting: 250060.0, northing: 9800010.0, symbol: 'concrete_beacon' },
  ]

  const boundaries = deriveBoundaryMeasurements(beacons, [
    { id: 'bdy-1', fromId: 'b1', toId: 'b2', type: 'standard' },
    { id: 'bdy-2', fromId: 'b2', toId: 'b3', type: 'standard' },
    { id: 'bdy-3', fromId: 'b3', toId: 'b4', type: 'road', roadLabel: 'Illustrative reserve' },
    { id: 'bdy-4', fromId: 'b4', toId: 'b5', type: 'standard' },
    { id: 'bdy-5', fromId: 'b5', toId: 'b1', type: 'standard' },
  ])

  return {
    ...base,
    beacons,
    boundaries,
    metersPerPixel: 1,
    titleBlock: {
      ...base.titleBlock,
      projectName: 'ILLUSTRATIVE TRAINING PLAN',
      lrNumber: 'SAMPLE ONLY',
      surveyor: 'Training template — no surveyor record',
      regNo: 'NOT FOR SUBMISSION',
      scale: 'NOT TO SCALE',
    },
  }
}

// ─── Sample Bomet County Subdivision Scheme Plan ───────────────────────────
function createSampleBometSubdivisionDoc(): CADDocument {
  const base = createDefaultCADDoc()
  const originE = 760100
  const originN = 9913100
  const mpp = 0.8 // 1px = 0.8m

  const toSvgX = (e: number) => 120 + (e - originE) * (1 / mpp)
  const toSvgY = (n: number) => base.height - 120 - (n - originN) * (1 / mpp)

  const beacons = [
    // Portion A (0.20 Ha)
    { id: 'bA1', label: 'A1', x: toSvgX(760200), y: toSvgY(9913250), easting: 760200.0, northing: 9913250.0, symbol: 'concrete_beacon' },
    { id: 'bA2', label: 'A2', x: toSvgX(760260), y: toSvgY(9913250), easting: 760260.0, northing: 9913250.0, symbol: 'concrete_beacon' },
    { id: 'bA3', label: 'A3', x: toSvgX(760260), y: toSvgY(9913300), easting: 760260.0, northing: 9913300.0, symbol: 'concrete_beacon' },
    { id: 'bA4', label: 'A4', x: toSvgX(760200), y: toSvgY(9913300), easting: 760200.0, northing: 9913300.0, symbol: 'concrete_beacon' },

    // Portion B (1.00 Ha)
    { id: 'bB1', label: 'B1', x: toSvgX(760260), y: toSvgY(9913200), easting: 760260.0, northing: 9913200.0, symbol: 'concrete_beacon' },
    { id: 'bB2', label: 'B2', x: toSvgX(760380), y: toSvgY(9913200), easting: 760380.0, northing: 9913200.0, symbol: 'concrete_beacon' },
    { id: 'bB3', label: 'B3', x: toSvgX(760380), y: toSvgY(9913330), easting: 760380.0, northing: 9913330.0, symbol: 'concrete_beacon' },
    { id: 'bB4', label: 'B4', x: toSvgX(760260), y: toSvgY(9913330), easting: 760260.0, northing: 9913330.0, symbol: 'concrete_beacon' },

    // Portion C (0.80 Ha)
    { id: 'bC1', label: 'C1', x: toSvgX(760480), y: toSvgY(9913200), easting: 760480.0, northing: 9913200.0, symbol: 'concrete_beacon' },
    { id: 'bC2', label: 'C2', x: toSvgX(760480), y: toSvgY(9913310), easting: 760480.0, northing: 9913310.0, symbol: 'concrete_beacon' },
  ]

  const boundaries = deriveBoundaryMeasurements(beacons, [
    // Portion A loop
    { id: 'bdy-A1', fromId: 'bA1', toId: 'bA2', type: 'standard' },
    { id: 'bdy-A2', fromId: 'bA2', toId: 'bA3', type: 'standard' },
    { id: 'bdy-A3', fromId: 'bA3', toId: 'bA4', type: 'road', roadLabel: 'Sample road reserve' },
    { id: 'bdy-A4', fromId: 'bA4', toId: 'bA1', type: 'standard' },

    // Portion B loop
    { id: 'bdy-B1', fromId: 'bB1', toId: 'bB2', type: 'standard' },
    { id: 'bdy-B2', fromId: 'bB2', toId: 'bB3', type: 'standard' },
    { id: 'bdy-B3', fromId: 'bB3', toId: 'bB4', type: 'road', roadLabel: 'Sample road reserve' },
    { id: 'bdy-B4', fromId: 'bB4', toId: 'bB1', type: 'standard' },

    // Portion C
    { id: 'bdy-C1', fromId: 'bB2', toId: 'bC1', type: 'standard' },
    { id: 'bdy-C2', fromId: 'bC1', toId: 'bC2', type: 'road', roadLabel: 'Sample road reserve' },
    { id: 'bdy-C3', fromId: 'bC2', toId: 'bB3', type: 'standard' },
  ])

  const annotations = [
    { id: 'ann-1', type: 'text' as const, x: toSvgX(760230), y: toSvgY(9913275), text: 'PORTION A · SAMPLE', fontSize: 13, color: '#f59e0b' },
    { id: 'ann-2', type: 'text' as const, x: toSvgX(760320), y: toSvgY(9913265), text: 'PORTION B · SAMPLE', fontSize: 13, color: '#f59e0b' },
    { id: 'ann-3', type: 'text' as const, x: toSvgX(760430), y: toSvgY(9913255), text: 'PORTION C · SAMPLE', fontSize: 13, color: '#f59e0b' },
    { id: 'ann-4', type: 'text' as const, x: toSvgX(760320), y: toSvgY(9913345), text: 'SAMPLE ROAD RESERVE', fontSize: 11, color: '#94a3b8' },
    { id: 'ann-5', type: 'text' as const, x: toSvgX(760495), y: toSvgY(9913255), text: 'SAMPLE ROAD RESERVE', fontSize: 11, color: '#94a3b8' },
  ]

  return {
    ...base,
    beacons,
    boundaries,
    annotations,
    metersPerPixel: mpp,
    originEasting: originE,
    originNorthing: originN,
    titleBlock: {
      ...base.titleBlock,
      projectName: 'ILLUSTRATIVE SUBDIVISION EXERCISE',
      lrNumber: 'SAMPLE ONLY',
      surveyor: 'Training template — no surveyor record',
      regNo: 'NOT FOR SUBMISSION',
      scale: 'NOT TO SCALE',
    },
  }
}

export default function StandaloneCADEditorPage() {
  const [doc, setDoc] = useState<CADDocument | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [projects, setProjects] = useState<Array<{ id: string; name: string; lr_number?: string | null }>>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [savingToProject, setSavingToProject] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectError, setProjectError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [draftWarning, setDraftWarning] = useState('')

  // Load from local storage or initialize blank
  useEffect(() => {
    try {
      const cached = localStorage.getItem('metardu-standalone-cad')
      if (cached) {
        const parsed = parseCadDocument(JSON.parse(cached))
        if (parsed) {
          setDoc(parsed)
          return
        }
        setDraftWarning('The saved local CAD draft is invalid. Its original backup has been retained; review or download it before replacing it.')
      }
    } catch {
      setDraftWarning('The local CAD backup could not be read. Keep a downloaded CAD file before closing this page.')
    }
    setDoc(createDefaultCADDoc())
  }, [])

  // Auto-save local draft
  const handleSaveDraft = useCallback((updatedDoc: CADDocument) => {
    setDoc(updatedDoc)
    try {
      localStorage.setItem('metardu-standalone-cad', JSON.stringify(updatedDoc))
      setDraftWarning('')
    } catch {
      setDraftWarning('Local storage is unavailable or full. Your edits are in memory; download a CAD file before closing this page.')
    }
  }, [])

  const selectTemplate = useCallback((nextDocument: CADDocument) => {
    setDoc(nextDocument)
    setEditorRevision(revision => revision + 1)
    try {
      localStorage.setItem('metardu-standalone-cad', JSON.stringify(nextDocument))
    } catch {
      // Keep the in-memory template available when storage is unavailable.
    }
  }, [])

  // Fetch projects when save-to-project modal opens
  const openSaveToProjectModal = useCallback(async () => {
    setSaveModalOpen(true)
    setSaveSuccessMsg('')
    setProjectError('')
    setSaveError('')
    setProjects([])
    setProjectsLoading(true)
    try {
      const res = await fetch('/api/projects?limit=50')
      if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to attach this drawing to your project.' : 'Your project list could not be loaded. Retry before saving.')
      const parsed = projectListSchema.safeParse(await res.json() as unknown)
      if (!parsed.success) throw new Error('Your project list is incomplete. Retry before saving.')
      const json = parsed.data
      setProjects(json.data)
      setSelectedProjectId(json.data.some((project: { id: string }) => project.id === selectedProjectId) ? selectedProjectId : json.data[0]?.id ?? '')
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Your project list could not be loaded. Please retry.')
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectId])

  // Commit CAD Document directly to project DB
  const handleCommitToProject = useCallback(async () => {
    if (!selectedProjectId || !doc) return
    setSavingToProject(true)
    setSaveSuccessMsg('')
    setSaveError('')

    try {
      const response = await fetch(`/api/project/${encodeURIComponent(selectedProjectId)}/cad-document`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: doc }),
      })
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again before attaching this drawing.' : 'The project drawing could not be saved. Your local draft is retained; retry the save.')
      const result = z.object({ saved: z.literal(true) }).safeParse(await response.json() as unknown)
      if (!result.success) throw new Error('The server did not confirm the drawing was saved. Your local draft is retained.')
      setSaveSuccessMsg('CAD drawing saved to the project. Survey observations and adjusted stations are preserved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The project drawing could not be saved. Your local draft is retained.')
    } finally {
      setSavingToProject(false)
    }
  }, [selectedProjectId, doc])

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100dvh-8rem)] min-h-[480px] md:h-[calc(100dvh-4rem)] md:min-h-[620px] flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Top Breadcrumbs & Starter Actions */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard" className="text-gray-400 hover:text-white">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/tools" className="text-gray-400 hover:text-white">Tools</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-cyan-400 font-semibold">CAD Canvas Editor</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Starter Templates */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => selectTemplate(createDefaultCADDoc())}
            className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 flex items-center gap-1 transition-colors"
            title="Start fresh blank A3 sheet"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" /> Blank Sheet
          </button>
          <button
            onClick={() => selectTemplate(createSampleCadastralDoc())}
            className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 flex items-center gap-1 transition-colors"
            title="Load sample 5-beacon cadastral polygon"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" /> Sample Lot
          </button>
          <button
            onClick={() => selectTemplate(createSampleBometSubdivisionDoc())}
            className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 flex items-center gap-1 transition-colors"
            title="Load Bomet County Subdivision Scheme Plan (Portions A, B, C with road reserves)"
          >
            <Building className="w-3.5 h-3.5 text-emerald-400" /> Bomet Scheme
          </button>
        </div>
      </div>

      {/* Embedded CAD Canvas */}
      {draftWarning && <p role="status" className="shrink-0 px-4 py-2 text-xs text-amber-200 bg-amber-950">{draftWarning}</p>}
      <div className="flex-1 overflow-hidden relative">
        <CADEditor
          key={editorRevision}
          initialDocument={doc}
          isStandalone={true}
          onSave={handleSaveDraft}
          onAttachToProject={openSaveToProjectModal}
        />
      </div>

      {/* Save to Project Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-cyan-400" /> Save Drawing to Project
              </h3>
              <button type="button" aria-label="Close save dialog" onClick={() => setSaveModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Attach this drawing to a project for drafting and review. An unreferenced drawing remains unreferenced; it does not replace survey observations or adjusted stations.
            </p>

            {projectsLoading ? <p role="status" className="text-sm text-gray-300">Loading your projects…</p> : projectError ? <div className="space-y-2"><p role="alert" className="text-sm text-amber-200">{projectError}</p><button type="button" onClick={() => { void openSaveToProjectModal() }} className="text-sm underline text-cyan-300">Retry project list</button><Link href="/login?next=%2Ftools%2Fcad-editor" className="ml-4 text-sm underline text-cyan-300">Sign in</Link></div> : saveSuccessMsg ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4" /> {saveSuccessMsg}
              </div>
            ) : projects.length === 0 ? (
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800 text-center text-xs text-gray-400">
                No existing projects found. <Link href="/projects/new" className="text-cyan-400 underline">Create one first →</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {saveError && <p role="alert" className="text-sm text-amber-200">{saveError}</p>}
                <div>
                  <label className="text-[11px] text-gray-400 uppercase font-mono block mb-1">Select Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.lr_number ? `(LR ${p.lr_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setSaveModalOpen(false)} className="text-xs">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCommitToProject}
                    disabled={savingToProject || !selectedProjectId}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                  >
                    {savingToProject ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    Save & Sync
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
