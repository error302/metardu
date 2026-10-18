'use client';

import { useState, useEffect, useCallback, useRef } from 'react'
import {z} from 'zod'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, Check, AlertCircle } from 'lucide-react'
import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { buildProjectCadDocument, resolveProjectCadCrs, type ProjectCadStation } from '@/lib/cad/projectCadDocument'
import { parseCadDocument } from '@/lib/cad/cadDocumentValidation'
import workspaceStyles from '@/components/cad-editor/CadWorkspace.module.css'

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

const pointRowSchema=z.object({point_name:z.string().optional(),easting:z.union([z.number().finite(),z.string()]).nullable().optional(),northing:z.union([z.number().finite(),z.string()]).nullable().optional(),horizontal_crs:z.string().nullable().optional()})
const pointsEnvelopeSchema=z.object({data:z.array(pointRowSchema).optional(),points:z.array(pointRowSchema).optional(),meta:z.object({project_crs:z.object({horizontal_crs:z.string().optional()}).nullable().optional()}).optional()})

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
  const [saveNotice, setSaveNotice] = useState('')
  const currentProject = useRef(projectId)
  currentProject.current = projectId
  const savingProjects = useRef(new Set<string>())

  // Load project data and build/restore CAD document
  useEffect(() => {
    const controller = new AbortController()
    async function loadPlanData() {
      try {
        setLoading(true)
        setLoadError(null)
        setDoc(null)
        setProject(null)
        setSaveStatus('idle')
        setSaveNotice('')

        // 1. Fetch project record
        const res = await fetch(`/api/project/${projectId}`, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(`Project load failed (${res.status}).`)
        const json = z.object({data:z.unknown().optional(),project:z.unknown().optional()}).passthrough().parse(await res.json() as unknown)
        const proj = z.object({id:z.string().uuid(),name:z.string()}).passthrough().parse(json.data??json.project??json) as unknown as ProjectRow
        if (controller.signal.aborted) return
        if (proj.id !== projectId) throw new Error('The response belongs to a different project. No drawing was loaded.')

        setProject(proj)

        let registeredProjectCrs: string | undefined
        let projectPointRows: ProjectCadStation[] = []
        let pointsWarning: string | undefined
        try {
          const ptsRes = await fetch(`/api/project/${projectId}/points`, { signal: controller.signal, cache: 'no-store' })
          if (!ptsRes.ok) throw new Error(`Survey point metadata could not be loaded (${ptsRes.status}).`)
          const ptsJson = pointsEnvelopeSchema.parse(await ptsRes.json() as unknown)
          const rawCrs = ptsJson.meta?.project_crs?.horizontal_crs
          if (typeof rawCrs === 'string' && rawCrs.trim()) {
            registeredProjectCrs = resolveProjectCadCrs(rawCrs)
          }
          const pointsList = ptsJson.data || ptsJson.points || []
          if (Array.isArray(pointsList)) {
            projectPointRows = pointsList.map(point => {
              if (!registeredProjectCrs || point.horizontal_crs !== registeredProjectCrs) {
                throw new Error(`Point ${point.point_name || '(unnamed)'} has a missing or different source grid. Review its CRS through the import workflow before drafting.`)
              }
              return { pointName: point.point_name, easting: point.easting, northing: point.northing }
            })
          }
        } catch (error) {
          pointsWarning = error instanceof Error ? error.message : 'Project CRS and survey points could not be refreshed.'
        }
        if (controller.signal.aborted) return
        if (pointsWarning) throw new Error(pointsWarning)

        const restoreDrawing = (saved: CADDocument, recovered = false) => {
          if (saved.coordinateReferenceSystem) {
            const documentCrs = resolveProjectCadCrs(saved.coordinateReferenceSystem)
            if (!registeredProjectCrs) throw new Error('The current project CRS could not be confirmed. The saved drawing is preserved; reload the project reference before drafting.')
            if (documentCrs !== registeredProjectCrs) throw new Error('The saved drawing has a different CRS from the current project. Its coordinates were preserved. Review the reference; no automatic relabeling or transformation was performed.')
          }
          setDoc(saved)
          if (recovered) setLoadError('Recovered a local CAD backup. Review it against the current project before saving or exporting.')
          else if (!saved.coordinateReferenceSystem) setLoadError('The saved drawing has no declared CRS. Survey-coordinate export requires a reviewed drawing reference.')
        }

        // Case A: A CAD document was previously saved in boundary_data with actual beacons
        const savedDocument = parseCadDocument(proj.boundary_data?.cadDocument)
        if (savedDocument) {
          restoreDrawing(savedDocument)
          return
        }

        // Case B: Check localStorage backup with actual beacons
        let cached: string | null = null
        try { cached = localStorage.getItem(`cad-doc-${projectId}`) } catch { /* Server data remains available if device storage is blocked. */ }
        if (cached) {
          let parsed: CADDocument | null = null
          try {
            parsed = parseCadDocument(JSON.parse(cached))
          } catch { /* A malformed cache cannot replace authoritative project data. */ }
          if (parsed) { restoreDrawing(parsed, true); return }
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
        if (controller.signal.aborted) return
        setDoc(null)
        setLoadError(err instanceof Error ? err.message : 'The project CAD drawing could not be loaded.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadPlanData()
    return () => controller.abort()
  }, [projectId, loadAttempt])

  // Save CAD Document directly into project boundary_data
  const handleSave = useCallback(async (savedDoc: CADDocument) => {
    if (savingProjects.current.has(projectId)) return
    savingProjects.current.add(projectId)
    setSaveStatus('saving')
    setSaveNotice('')
    let localBackup = false
    try {
      localStorage.setItem(`cad-doc-${projectId}`, JSON.stringify(savedDoc))
      localBackup = true
    } catch { /* Device quota must not prevent an authenticated server save. */ }
    try {
      // 2. Persist only the CAD artifact. It must not rewrite adjusted survey
      // stations, which are computation evidence owned by another workflow.
      const response = await fetch(`/api/project/${projectId}/cad-document`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: savedDoc }),
      })
      if (!response.ok) throw new Error(`CAD save failed (${response.status}).`)
      z.object({ saved: z.literal(true), updatedAt: z.string().datetime({ offset: true }) }).parse(await response.json())

      if (currentProject.current === projectId) {
        setSaveStatus('saved')
        setSaveNotice(localBackup ? '' : 'Saved to project; device backup unavailable. Download a drawing backup before working offline.')
        setTimeout(() => {
          if (currentProject.current === projectId) setSaveStatus(status => status === 'saved' ? 'idle' : status)
        }, 2500)
      }
    } catch {
      if (currentProject.current === projectId) {
        setSaveStatus('error')
        setSaveNotice(localBackup ? 'Server save failed; local backup retained' : 'Server save failed; device backup unavailable. Keep this drawing open and download a backup before retrying.')
      }
    } finally {
      savingProjects.current.delete(projectId)
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
    <div className={`${workspaceStyles.workspace} h-full min-h-0 flex flex-col bg-[var(--bg-primary)]`}>
      {/* Top Project Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="min-h-11 text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded hover:bg-gray-800 transition-colors"
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
              <AlertCircle className="w-3.5 h-3.5" /> {saveNotice}
            </span>
          )}
        </div>
      </div>
      {saveStatus === 'saved' && saveNotice && <p role="status" className="shrink-0 bg-[var(--bg-secondary)] px-4 py-2 text-xs text-amber-300">{saveNotice}</p>}

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
