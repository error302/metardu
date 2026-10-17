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

export default function FieldCollectPage() {
  const [routeContext, setRouteContext] = useState<{ ready: boolean; projectId: string | null; roadSurvey: boolean }>({
    ready: false,
    projectId: null,
    roadSurvey: false,
  })
  const [projectId, setProjectId] = useState<string | null>(null)
  const [surveyType, setSurveyType] = useState<'cadastral' | 'engineering' | 'topographic' | 'control'>('cadastral')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    setRouteContext({
      ready: true,
      projectId: searchParams.get('projectId'),
      roadSurvey: searchParams.get('profile') === 'road',
    })
  }, [])

  const { ready, projectId: initialProjectId, roadSurvey } = routeContext

  const handlePick = useCallback((id: string, type?: string) => {
    setProjectId(id)
    if (roadSurvey) {
      setSurveyType('engineering')
    } else if (type && ['cadastral', 'engineering', 'topographic', 'control'].includes(type)) {
      setSurveyType(type as 'cadastral' | 'engineering' | 'topographic' | 'control')
    }
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

  return <FieldDataCollector projectId={projectId} surveyType={surveyType} roadSurvey={roadSurvey} />
}
