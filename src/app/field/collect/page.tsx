'use client';

/**
 * /field/collect — Field Data Collector
 *
 * The purpose-built field data collection experience.
 * Replaces the old GPS-only beacon capture with a full-featured collector
 * that supports both total stations and GNSS rovers.
 *
 * Features:
 *   - Instrument connection (Bluetooth/Serial/Web)
 *   - Station setup (IH, TH, backsight, atmospheric)
 *   - One-tap measurement capture
 *   - Live QC (tolerance checking per RDM 1.1)
 *   - Stakeout mode
 *   - Offline-first (IndexedDB + auto-sync)
 */

import { useCallback, useEffect, useState } from 'react'
import { FieldDataCollector } from '@/components/field/FieldDataCollector'
import { ProjectPicker } from '@/components/field/ProjectPicker'
import { collectionSurveyType, type CollectionSurveyType } from '@/lib/field/projectContext'

export default function FieldCollectPage() {
  const [routeContext, setRouteContext] = useState<{ ready: boolean; projectId: string | null; roadSurvey: boolean }>({
    ready: false,
    projectId: null,
    roadSurvey: false,
  })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [surveyType, setSurveyType] = useState<CollectionSurveyType | null>(null)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    setRouteContext({
      ready: true,
      projectId: searchParams.get('projectId'),
      roadSurvey: searchParams.get('profile') === 'road',
    })
  }, [])

  const { ready, projectId: initialProjectId, roadSurvey } = routeContext

  const handlePick = useCallback((id: string, type?: string, name?: string) => {
    setProjectId(id)
    setProjectName(name ?? '')
    setSurveyType(roadSurvey ? 'engineering' : collectionSurveyType(type))
  }, [roadSurvey])

  if (!ready) {
    return <div className="min-h-screen bg-[var(--bg-primary)] p-6 text-sm text-[var(--text-muted)]">Preparing field session…</div>
  }

  if (!projectId) {
    return (
      <ProjectPicker
        onPick={handlePick}
        title="Field Data Collector"
        subtitle={roadSurvey ? 'Opening the saved road field plan for point collection' : 'Select a project to begin collecting measurements'}
        initialProjectId={initialProjectId}
        initialSurveyType={roadSurvey ? 'engineering' : undefined}
        allowOfflineRoadPlans={roadSurvey}
      />
    )
  }

  if (!surveyType) return <div className="mx-auto max-w-2xl px-4 py-8">
    <h1 className="text-2xl font-semibold">Choose the field workflow</h1>
    <p className="mt-3 text-sm text-[var(--text-secondary)]">{projectName || 'This project'} needs an explicit measurement workflow. This choice does not change its reference system or project type.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">{(['cadastral','engineering','topographic','control'] as const).map(type=><button key={type} type="button" onClick={()=>setSurveyType(type)} className="btn btn-secondary min-h-11 capitalize">{type}</button>)}</div>
  </div>
  return <FieldDataCollector projectId={projectId} projectName={projectName} surveyType={surveyType} roadSurvey={roadSurvey} />
}
