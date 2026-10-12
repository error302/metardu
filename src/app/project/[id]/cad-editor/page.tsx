'use client';

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, Check, AlertCircle } from 'lucide-react'
import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { buildProjectCadDocument, resolveProjectCadCrs, type ProjectCadStation } from '@/lib/cad/projectCadDocument'
import { parseCadDocument } from '@/lib/cad/cadDocumentValidation'

// Lazy-load the CAD editor
const CADEditor = dynamic(() => import('@/components/cad-editor/CADEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-400 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <span className="text-sm font-mono">Loading Project CAD Editor...</span>
    </div>
  ),
})

interface ProjectRow {
  id: string
  name: string
  lr_number?: string | null
  client_name?: string | null
  surveyor_name?: string | null
  surveyor_license?: string | null
  county?: string | null
  datum?: string | null
  utm_zone?: number | null
  boundary_data?: {
    cadDocument?: CADDocument
    adjustedStations?: Array<{
      pointName?: string
      name?: string
      label?: string
      adjustedEasting?: number
      adjustedNorthing?: number
      easting?: number
      northing?: number
    }>
    stations?: ProjectCadStation[]
  } | null
}

export default function CADEditorPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [doc, setDoc] = useState<CADDocument | null>(null)
  const [project, setProject] = useState<ProjectRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Load project data and build/restore CAD document
  useEffect(() => {
    async function loadPlanData() {
      try {
        setLoading(true)
        setLoadError(null)

        // 1. Fetch project record
        const res = await fetch(`/api/project/${projectId}`)
        if (!res.ok) throw new Error(`Project load failed (${res.status}).`)
        const json = await res.json()
        const proj = (json.data || json.project || json) as ProjectRow
        if (!proj?.id) throw new Error('The project response did not contain a project record.')

        setProject(proj)

        let registeredProjectCrs: string | undefined
        let projectPointRows: ProjectCadStation[] = []
        let pointsWarning: string | undefined
        try {
          const ptsRes = await fetch(`/api/project/${projectId}/points`)
          if (!ptsRes.ok) throw new Error(`Survey point metadata could not be loaded (${ptsRes.status}).`)
          const ptsJson = await ptsRes.json()
          const rawCrs = ptsJson.meta?.project_crs?.horizontal_crs
          if (typeof rawCrs === 'string' && rawCrs.trim()) {
            registeredProjectCrs = resolveProjectCadCrs(rawCrs)
          }
          const pointsList = ptsJson.data || ptsJson.points || []
          if (Array.isArray(pointsList)) {
            projectPointRows = pointsList.map((point: { point_name?: string; easting?: number | string | null; northing?: number | string | null }) => ({
              pointName: point.point_name,
              easting: point.easting,
              northing: point.northing,
            }))
          }
        } catch (error) {
          pointsWarning = error instanceof Error ? error.message : 'Project CRS and survey points could not be refreshed.'
        }

        // Case A: A CAD document was previously saved in boundary_data with actual beacons
        const savedDocument = parseCadDocument(proj.boundary_data?.cadDocument)
        if (savedDocument) {
          let documentCrs = savedDocument.coordinateReferenceSystem
          if (documentCrs) {
            try { documentCrs = resolveProjectCadCrs(documentCrs) } catch { documentCrs = undefined }
          }
          setDoc({ ...savedDocument, ...(documentCrs ? { coordinateReferenceSystem: documentCrs } : { coordinateReferenceSystem: undefined }) })
          if (!documentCrs) setLoadError(pointsWarning || 'No registered projected metre CRS is available. Survey-coordinate DXF export is disabled until the project CRS is registered.')
          else if (pointsWarning) setLoadError(pointsWarning)
          return
        }

        // Case B: Check localStorage backup with actual beacons
        const cached = localStorage.getItem(`cad-doc-${projectId}`)
        if (cached) {
          try {
            const parsed = parseCadDocument(JSON.parse(cached))
            if (parsed) {
              let documentCrs = parsed.coordinateReferenceSystem
              if (documentCrs) {
                try { documentCrs = resolveProjectCadCrs(documentCrs) } catch { documentCrs = undefined }
              }
              setDoc({ ...parsed, ...(documentCrs ? { coordinateReferenceSystem: documentCrs } : { coordinateReferenceSystem: undefined }) })
              setLoadError('Recovered a local CAD backup. Review it against the current project before saving or exporting.')
              return
            }
          } catch {}
        }

        // Case C: Check for adjusted stations from traverse or boundary_data
        const boundaryData = proj.boundary_data ?? {}
        const savedStations = Array.isArray(boundaryData.adjustedStations)
          ? boundaryData.adjustedStations as ProjectCadStation[]
          : Array.isArray(boundaryData.stations)
            ? boundaryData.stations as ProjectCadStation[]
            : []
        const stations = savedStations.length ? savedStations : projectPointRows

        const result = buildProjectCadDocument({
          projectName: proj.name,
          lrNumber: proj.lr_number,
          surveyorName: proj.surveyor_name,
          surveyorLicense: proj.surveyor_license,
          projectCrs: registeredProjectCrs,
          date: new Date().toLocaleDateString('en-GB'),
        }, stations)
        setDoc(result.document)
        const warnings = [
          result.referenceIssue,
          result.omittedStationCount > 0
            ? `${result.omittedStationCount} survey point(s) were omitted because they do not have finite easting and northing coordinates.`
            : undefined,
          pointsWarning,
        ].filter(Boolean)
        if (warnings.length) setLoadError(warnings.join(' '))
      } catch (err) {
        setDoc(null)
        setLoadError(err instanceof Error ? err.message : 'The project CAD drawing could not be loaded.')
      } finally {
        setLoading(false)
      }
    }

    loadPlanData()
  }, [projectId, loadAttempt])

  // Save CAD Document directly into project boundary_data
  const handleSave = useCallback(async (savedDoc: CADDocument) => {
    setSaveStatus('saving')
    try {
      // 1. Backup to localStorage
      localStorage.setItem(`cad-doc-${projectId}`, JSON.stringify(savedDoc))

      // 2. Persist only the CAD artifact. It must not rewrite adjusted survey
      // stations, which are computation evidence owned by another workflow.
      const response = await fetch(`/api/project/${projectId}/cad-document`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: savedDoc }),
      })
      if (!response.ok) throw new Error(`CAD save failed (${response.status}).`)

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
    }
  }, [projectId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm font-mono">Loading project plan...</span>
      </div>
    )
  }

  if (loadError && !doc) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-400" />
            <div>
              <h1 className="font-semibold">Project drawing could not be loaded</h1>
              <p className="mt-1 text-sm text-gray-400">{loadError}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLoadAttempt(value => value + 1)} className="rounded-md bg-cyan-700 px-3 py-2 text-sm hover:bg-cyan-600">Retry</button>
            <button onClick={() => router.push(`/project/${projectId}`)} className="rounded-md border border-gray-700 px-3 py-2 text-sm hover:bg-gray-800">Back to project</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Top Project Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Project
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-100">{project?.name || 'Project Plan'}</span>
            {project?.lr_number && (
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                LR {project.lr_number}
              </span>
            )}
          </div>
        </div>

        {/* Save Status Feedback */}
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <Check className="w-3.5 h-3.5" /> Synced to Project
            </span>
          )}
          {saveStatus === 'error' && (
            <span role="status" className="text-xs text-red-400 flex items-center gap-1 font-medium bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5" /> Server save failed; local backup retained
            </span>
          )}
        </div>
      </div>

      {/* CAD Canvas Editor */}
      <div className="flex-1 overflow-hidden relative">
        {loadError && doc && (
          <div role="status" className="absolute top-2 left-2 right-2 z-20 rounded-md border border-amber-700/60 bg-amber-950/90 px-3 py-2 text-xs text-amber-200">
            {loadError} Resolve this before treating the drawing as a survey-coordinate deliverable.
          </div>
        )}
        {doc && (
          <CADEditor
            initialDocument={doc}
            projectName={project?.name}
            projectId={projectId}
            isStandalone={false}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  )
}
