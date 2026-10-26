'use client';

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import RoadWorkbenchEditor from '@/components/engineering/RoadWorkbenchEditor'
import { roadGroundAssociationIssue } from '@/lib/engineering/roadGroundAssociation'
import {Check,Lock} from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/api-client/client'
import { z } from 'zod'
import { apiGet, apiPost } from '@/lib/api/client'
import { saveProjectEngineeringData, hydrateSavedEngineeringRoad } from '@/lib/engineering/projectEngineeringPersistence'
import { roadAlignmentMirrorPayload, roadFromAlignmentMirror } from '@/lib/engineering/roadAlignmentMirror'
import { resolveStageReference, resolveDeclaredStageReference, type StageReference } from '@/lib/workspaces/stageReference'
import type {
  EngineeringData,
  EngineeringMode,
  EngineeringStandard,
  RoadDesignData,
  DrainageData,
} from '@/types/engineering'
import type { SurveyorProfileSubmission } from '@/lib/api-client/community'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'
import { LoadingState } from '@/components/shared/LoadingState'
import type { EngineeringProject, EngineeringStepId } from './shared'
import { getEngineeringSteps } from './getEngineeringSteps'
import { renderStepContent } from './steps/renderStepContent'
import { QuickComputeTab } from './QuickComputeTab'

// ponytail: response schemas — Phase 4 wave 2 will move these to src/lib/api/schemas/

// GET /api/engineering/alignment returns { data: <alignment row or null> }.
// Use z.union([schema, z.null()]) instead of .nullable() so we keep .passthrough() on the inner object.
const alignmentRowSchema = z.object({
  id: z.union([z.string(), z.number()]),
  road_name: z.string().nullable().optional(),
  start_chainage: z.union([z.number(), z.string(), z.null()]).optional(),
  datum: z.string().nullable().optional(),
  coordinate_system: z.string().nullable().optional(),
  design_speed: z.union([z.number(), z.string(), z.null()]).optional(),
  road_class: z.string().nullable().optional(),
  standard: z.string().nullable().optional(),
  cross_section_template: z.unknown().optional(),
  ips: z.array(z.record(z.unknown())).optional(),
  vips: z.array(z.record(z.unknown())).optional(),
  stations: z.array(z.record(z.unknown())).optional(),
}).passthrough()

const alignmentResponseSchema = z.object({
  data: z.union([alignmentRowSchema, z.null()]),
}).passthrough()
const projectReferenceResponseSchema = z.object({ referenceSystem: z.record(z.unknown()).nullable() })

// POST /api/engineering/alignment returns { data: { id, ... } }
const alignmentMutationSchema = z.object({
  data: alignmentRowSchema,
}).passthrough()

// The three sub-resource POSTs return various shapes — accept any object payload.
const subResourceMutationSchema = z.record(z.unknown())

interface ProjectDbRow {
  id: string
  user_id?: string | null
  engineering_data?: unknown
  [key: string]: unknown
}

interface SurveyorProfileDbRow {
  isk_number?: string | null
  verified_isk?: boolean | null
  full_name?: string | null
  firm_name?: string | null
}

export default function EngineeringWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dbClient] = useState(createClient)

  const [project, setProject] = useState<EngineeringProject | null>(null)
  const [surveyorProfile, setSurveyorProfile] = useState<SurveyorProfileSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectLoadError, setProjectLoadError] = useState('')
  const [loadingEngineering, setLoadingEngineering] = useState(false)
  const [activeStep, setActiveStep] = useState<EngineeringStepId>('setup')
  const [saving, setSaving] = useState(false)
  const [landingTab,setLandingTab]=useState<'workflow'|'design'>('workflow')
  const [engineeringLoadError, setEngineeringLoadError] = useState('')
  const engineeringLoadGeneration = useRef(0)
  const projectLoadGeneration = useRef(0)
  const appliedStepRef = useRef<string | null>(null)

  // Sub-tab for quick compute panels
  const requestedStep = searchParams.get('step')
  const activeTab = searchParams.get('tab') || (requestedStep?'workflow':landingTab)

  // --- Load engineering data from the relational DB backend ---
  const loadEngineeringData = useCallback(async (projectId: string, roadName?: string) => {
    const generation = ++engineeringLoadGeneration.current
    setLoadingEngineering(true)
    setEngineeringLoadError('')
    try {
      const result = await apiGet(
        `/api/engineering/alignment?project_id=${encodeURIComponent(projectId)}${roadName ? `&road_name=${encodeURIComponent(roadName)}` : ''}`,
        alignmentResponseSchema,
        { ttlMs: 0 },
      )
      if (generation !== engineeringLoadGeneration.current) return
      const dbData = result.data

      if (!dbData) {
        // No alignment row yet — nothing to hydrate
        setLoadingEngineering(false)
        return
      }

      const roadFromDb = roadFromAlignmentMirror(dbData)

      // Merge into the existing engineering_data, preserving mode/drainage
      setProject(prev => {
        if (!prev || prev.id !== projectId) return prev
        const current: EngineeringData = prev.engineering_data || { mode: 'road', standard: 'KRDM2017' }
        return {
          ...prev,
          engineering_data: hydrateSavedEngineeringRoad(current, roadFromDb),
        }
      })
    } catch {
      if (generation === engineeringLoadGeneration.current) setEngineeringLoadError('Saved alignment records could not be loaded. Your saved project draft is unchanged. Check your connection and retry.')
    } finally {
      if (generation === engineeringLoadGeneration.current) setLoadingEngineering(false)
    }
  }, [])

  const fetchProject = useCallback(async () => {
    const generation = ++projectLoadGeneration.current
    setLoading(true)
    setProjectLoadError('')
    try {
    const projectResult = (await dbClient
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single()) as { data: ProjectDbRow | null; error: { message: string } | null }
    const { data, error } = projectResult
    if (generation !== projectLoadGeneration.current) return

    if (error) {
      setProjectLoadError('The project could not be loaded. Check your connection or access, then retry.')
      return
    }
    if (!data) {
      setProject(null)
      return
    }
    if (data.id !== params.id) throw new Error('Unexpected project response')

    const referenceResult = await apiGet(`/api/project/${encodeURIComponent(data.id)}/reference-system`, projectReferenceResponseSchema, { ttlMs: 0 })
    if (generation !== projectLoadGeneration.current) return
    const legacyReference = {
      datum: typeof data.datum === 'string' ? data.datum : null,
      utm_zone: typeof data.utm_zone === 'number' ? data.utm_zone : null,
      hemisphere: typeof data.hemisphere === 'string' ? data.hemisphere : null,
    }
    const declaredReference = referenceResult.referenceSystem
    const projectReferenceSystem: StageReference = declaredReference
      ? resolveDeclaredStageReference(declaredReference)
      : resolveStageReference(null, legacyReference)
    if (declaredReference && !projectReferenceSystem.code) throw new Error('Invalid saved reference system')
    const engData = (data?.engineering_data ?? null) as EngineeringData | null
    setLandingTab(engData?.mode==='road'&&engData.road?'design':'workflow')
    setProject({ ...data, engineering_data: engData, projectReferenceSystem } as EngineeringProject)

    const profileResult = (await dbClient
      .from('surveyor_profiles')
      .select('isk_number, verified_isk, full_name, firm_name')
      .eq('user_id', data.user_id)
      .single()) as { data: SurveyorProfileDbRow | null }
    const profile = profileResult.data
    if (generation !== projectLoadGeneration.current) return

    if (profile) {
      setSurveyorProfile({
        registrationNumber: profile.isk_number ?? '',
        iskNumber: profile.isk_number ?? '',
        verifiedIsk: profile.verified_isk ?? false,
        fullName: profile.full_name ?? '',
        firmName: profile.firm_name ?? '',
        isKMemberActive: profile.verified_isk ?? true
      })
    }

    } catch {
      if (generation === projectLoadGeneration.current) setProjectLoadError('The project could not be loaded. Check your connection or access, then retry.')
    } finally {
      if (generation === projectLoadGeneration.current) setLoading(false)
    }
  }, [params.id, dbClient])

  useEffect(() => {
    void fetchProject()
    return () => { projectLoadGeneration.current += 1 }
  }, [fetchProject])

  // Load engineering data from the relational backend after project is fetched
  const projectId = project?.id
  const savedRoadName = project?.engineering_data?.road?.roadName
  useEffect(() => {
    if (projectId && !loading) {
      void loadEngineeringData(projectId, savedRoadName)
    }
    return () => { engineeringLoadGeneration.current += 1 }
  }, [projectId, savedRoadName, loading, loadEngineeringData])

  useEffect(() => {
    if (!project || !requestedStep || appliedStepRef.current === requestedStep) return
    appliedStepRef.current = requestedStep
    const matchingStep = getEngineeringSteps(project.engineering_data || null)
      .find(step => step.id === requestedStep)
    if (matchingStep) setActiveStep(matchingStep.id)
  }, [project, requestedStep])

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current)},[])
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if(toastTimer.current)clearTimeout(toastTimer.current)
    setToast({ message, type })
    if(type==='success')toastTimer.current=setTimeout(() => setToast(null), 3000)
  }

  const handleModeChange = async (newMode: EngineeringMode) => {
    if (!project) return
    setSaving(true)

    try {
      const current = project.engineering_data || { mode: 'road' as EngineeringMode, standard: 'KRDM2017' as EngineeringStandard }
      const updated: EngineeringData = {
        ...current,
        mode: newMode,
        standard: current.standard || 'KRDM2017'
      }

      await saveProjectEngineeringData(dbClient, project.id, updated)

      setProject({ ...project, engineering_data: updated })
      setActiveStep('setup')
      showToast('Mode switched successfully')
    } catch (failure) {
      showToast(failure instanceof Error?failure.message:'The save is unconfirmed. Keep the current inputs and recover the saved project before retrying.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Save the entire current engineering state to the relational backend ---
  const saveToBackend = useCallback(async (engData: EngineeringData): Promise<boolean> => {
    if (!project) return false
    const road = engData.road
    if (!road) return false
    if (roadGroundAssociationIssue(road)) return false

    try {
      const payload = roadAlignmentMirrorPayload(road, project.id)
      const alignResult = await apiPost('/api/engineering/alignment', alignmentMutationSchema, payload.header)
      const aId = alignResult.data?.id
      if (!aId) throw new Error('No alignment ID returned')
      // Full snapshots explicitly replace even an emptied input list.
      await apiPost('/api/engineering/ips', subResourceMutationSchema, { alignment_id: aId, ips: payload.ips })
      await apiPost('/api/engineering/vips', subResourceMutationSchema, { alignment_id: aId, replace: true, vips: payload.vips })
      await apiPost('/api/engineering/stations', subResourceMutationSchema, { alignment_id: aId, replace: true, stations: payload.stations })

      return true
    } catch {
      return false
    }
  }, [project])

  const handleSave = async (data: Partial<EngineeringData>) => {
    if (!project) return false
    setSaving(true)

    try {
      const current = project.engineering_data || { mode: 'road' as EngineeringMode, standard: 'KRDM2017' as EngineeringStandard }

      let updated: EngineeringData
      if (data.mode) {
        updated = {
          ...current,
          mode: data.mode,
          standard: data.standard || current.standard || 'KRDM2017'
        }
      } else {
        updated = {
          ...current,
          mode: current.mode || 'road',
          standard: current.standard || 'KRDM2017',
          road: data.road ? { ...current.road, ...data.road } as RoadDesignData : current.road,
          roadFieldPlan: data.roadFieldPlan ?? current.roadFieldPlan,
          drainage: data.drainage ? { ...current.drainage, ...data.drainage } as DrainageData : current.drainage,
        }
      }

      // Save to database (engineering_data JSONB column)
      await saveProjectEngineeringData(dbClient, project.id, updated)

      setProject({ ...project, engineering_data: updated })

      // Also persist to relational backend for road mode
      if (data.road && updated.road) {
        const backendOk = await saveToBackend(updated)
        if (backendOk) {
          showToast('Saved successfully')
        } else {
          showToast('Saved to the project. The legacy alignment mirror did not sync.', 'error')
        }
      } else {
        showToast('Saved successfully')
      }
      return true
    } catch (failure) {
      showToast(failure instanceof Error?failure.message:'The save is unconfirmed. Keep the current inputs and recover the saved project before retrying.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  // Save All handler — persists the full current state to the backend
  const handleSaveAll = async () => {
    if (!project || !project.engineering_data) return
    setSaving(true)
    try {
      // First ensure local state is up to date
      await saveProjectEngineeringData(dbClient, project.id, project.engineering_data)

      if (project.engineering_data.mode === 'road' && project.engineering_data.road) {
        const backendOk = await saveToBackend(project.engineering_data)
        if (backendOk) {
          showToast('All engineering data saved to backend')
        } else {
          showToast('Saved to the project. The legacy alignment mirror did not sync.', 'error')
        }
      } else {
        showToast('All data saved')
      }
    } catch (failure) {
      showToast(failure instanceof Error?failure.message:'The save is unconfirmed. Keep the current inputs and recover the saved project before retrying.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading engineering project" />
  }

  if (projectLoadError) {
    return <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="text-amber-300">{projectLoadError}</p>
      <button type="button" onClick={() => void fetchProject()} className="rounded-lg border border-zinc-600 px-4 py-2 text-amber-300">Retry project load</button>
      <button type="button" onClick={() => router.push('/dashboard')} className="text-zinc-400">Back to Dashboard</button>
    </div>
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-red-400">Project not found</div>
        <button onClick={() => router.push('/dashboard')} className="text-amber-500 mt-4">Back to Dashboard</button>
      </div>
    )
  }

  const steps = getEngineeringSteps(project.engineering_data || null)
  const currentStep = steps.find((s) => s.id === activeStep) || steps[0]
  const mode = project.engineering_data?.mode || 'road'

  if(activeTab==='design' && mode==='road'){
    const reference=project.projectReferenceSystem??resolveStageReference(null,project)
    return <div className="mx-auto min-w-0 max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
      <nav aria-label="Engineering navigation" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link className="min-h-11 py-3 underline underline-offset-4" href="/dashboard">Projects</Link>
        <span className="min-w-0 break-words text-[var(--text-secondary)]">{project.name}</span>
        <Link className="min-h-11 py-3 underline underline-offset-4" href={`/project/${project.id}/engineering?tab=workflow`}>Input workflow</Link>
      </nav>
      {engineeringLoadError&&<p role="alert" className="border-l-2 border-amber-500 pl-3 text-sm">{engineeringLoadError}</p>}
      {loadingEngineering&&<p role="status" className="text-xs text-[var(--text-secondary)]">Reading saved alignment records…</p>}
      {toast&&<p role={toast.type==='error'?'alert':'status'} className="border-l-2 border-amber-500 pl-3 text-sm">{toast.message}</p>}
      <RoadWorkbenchEditor key={project.id} projectId={project.id} road={project.engineering_data?.road??null} reference={reference} disabled={loadingEngineering||saving} onSave={road=>handleSave({road})}/>
    </div>
  }
  // Quick Compute Panel Mode
  if (activeTab !== 'workflow' && activeTab!=='design') {
    return (
      <QuickComputeTab
        projectId={params.id}
        project={project}
        surveyorProfile={surveyorProfile}
        activeTab={activeTab}
      />
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-zinc-500 hover:text-zinc-300 text-sm">← Projects</button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-white">{project.name}</h1>
            <div className="text-xs text-zinc-500">Engineering Mode • {mode === 'road' ? 'Road Design' : 'Drainage Survey'}</div>
          </div>
          {mode==='road'&&project.engineering_data?.road&&<Link href={`/project/${project.id}/engineering?tab=design`} className="inline-flex min-h-11 items-center rounded border border-zinc-700 px-3 text-xs text-zinc-200">Visual workspace</Link>}
          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded">{mode === 'road' ? 'Road Design' : 'Drainage Survey'}</span>
          <button
            onClick={handleSaveAll}
            disabled={saving || loadingEngineering}
            className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Saving...' : 'Save All ↓'}
          </button>
          <button
            onClick={() => router.push(`/project/${params.id}/engineering?tab=curves`)}
            className="text-xs px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30"
          >
            Quick Compute →
          </button>
          <button
            onClick={() => router.push(`/tools/pipe-network?projectId=${encodeURIComponent(params.id)}`)}
            className="text-xs px-3 py-1 bg-cyan-500/15 text-cyan-300 rounded hover:bg-cyan-500/25"
          >
            Drainage Pipe Network →
          </button>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div role={toast.type==='error'?'alert':'status'} className={`mx-auto max-w-7xl px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Saving indicator */}
      {engineeringLoadError && <div role="alert" className="mb-4 rounded border border-amber-700 p-3 text-sm text-amber-200">
        <p>{engineeringLoadError}</p>
        <button type="button" disabled={loadingEngineering || !projectId} onClick={() => { if (projectId) void loadEngineeringData(projectId, savedRoadName) }} className="mt-2 min-h-11 rounded border border-amber-700 px-3">Retry alignment load</button>
      </div>}
      {(saving || loadingEngineering) && (
        <div role="status" className="mx-auto max-w-7xl bg-zinc-800 border-b border-zinc-600 text-zinc-300 px-4 py-2 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {loadingEngineering ? 'Loading engineering data...' : 'Saving...'}
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">
        <nav className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-800">
          <div className="p-4">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Workflow</div>
            <ol className="space-y-1">
              {steps.map((step, idx) => {
                const isActive = step.id === activeStep
                const isLocked = step.status === 'locked'
                return (
                  <li key={step.id}>
                    <button
                      disabled={isLocked || saving}
                      onClick={() => setActiveStep(step.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-3 ${
                        isActive ? 'bg-zinc-800 border border-zinc-700' :
                        isLocked ? 'opacity-40 cursor-not-allowed' :
                        'hover:bg-zinc-900 border border-transparent'
                      }`}
                    >
                      <span className={`shrink-0 w-6 h-6 rounded-full text-xs flex items-center justify-center mt-0.5 ${
                        step.status === 'complete' ? 'bg-amber-500 text-black' :
                        step.status === 'in_progress' ? 'bg-blue-500 text-white' :
                        step.status === 'locked' ? 'bg-zinc-800 text-zinc-600' :
                        'bg-zinc-700 text-zinc-300'
                      }`}>
                        {step.status === 'complete' ? <Check className="h-4 w-4" aria-label="Complete"/> : isLocked ? <Lock className="h-3 w-3" aria-label="Locked"/> : idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isLocked ? 'text-zinc-600' : isActive ? 'text-white' : 'text-zinc-300'}`}>
                          {step.label}
                        </div>
                        <div className="text-xs text-zinc-600 truncate">{step.description}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </nav>

        <main className="flex-1 min-w-0 p-4 lg:p-8">
          <div className="mb-4">
            <MobileDesktopNotice>
              Engineering workflows are desktop-first because they include alignments, long sections, cross sections, and export review. Use mobile for quick reference only.
            </MobileDesktopNotice>
          </div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">{currentStep?.label}</h2>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            {renderStepContent(currentStep?.id || 'setup', project, project.engineering_data || null, handleSave, handleModeChange)}
          </div>
        </main>
      </div>
    </div>
  )
}
