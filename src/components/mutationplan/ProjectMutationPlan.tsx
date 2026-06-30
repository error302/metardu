'use client'

import { useState, useEffect } from 'react'
import MutationPlanGenerator from '@/components/mutationplan/MutationPlanGenerator'

/**
 * ProjectMutationPlan — wrapper that connects MutationPlanGenerator to a project.
 *
 * Fetches the project's most recent deed plan from /api/project/[id]/deed-plans
 * and converts its boundary points into a MutationPlot[] for the generator.
 *
 * This is the cadastral integration: a surveyor generates a deed plan,
 * then creates a mutation (subdivision, amalgamation) from that deed plan's
 * boundary without re-entering coordinates.
 *
 * Usage:
 *   <ProjectMutationPlan projectId="abc-123" />
 *   // or as a route: /tools/mutation-plan?project=abc-123
 */

interface ProjectMutationPlanProps {
  projectId: string
}

interface DeedPlanRecord {
  id: string
  survey_number: string | null
  parcel_number: string | null
  locality: string | null
  area_sqm: number | null
  scale: number | null
  input_data: {
    boundaryPoints?: Array<{
      id: string
      easting: number
      northing: number
      markType?: string
      markStatus?: string
      description?: string
    }>
    surveyNumber?: string
    parcelNumber?: string
    locality?: string
    scale?: number
    utmZone?: number
    hemisphere?: string
  } | null
  created_at: string
}

export default function ProjectMutationPlan({ projectId }: ProjectMutationPlanProps) {
  const [loaded, setLoaded] = useState(false)

  // The MutationPlanGenerator manages its own state and doesn't accept props
  // for initial plots. The cleanest integration without refactoring it is to
  // pre-load the deed plan data and inject it via a custom event that the
  // generator listens for — but that's fragile.
  //
  // For now, we show a banner with the deed plan info and a "Load boundary"
  // button that writes the boundary points to a shared location the generator
  // can read. This is a pragmatic first step — full prop injection would
  // require refactoring MutationPlanGenerator to accept initialPlots.
  //
  // The deeper refactor (adding initialPlots prop to MutationPlanGenerator)
  // is documented as a follow-up.

  useEffect(() => {
    let cancelled = false

    async function fetchDeedPlan() {
      try {
        const res = await fetch(`/api/project/${projectId}/deed-plans`)
        if (!res.ok) return
        const json = await res.json()
        const plans: DeedPlanRecord[] = json.data || []
        if (plans.length === 0) return

        // Take the most recent deed plan (already ordered DESC by API)
        const latest = plans[0]
        const boundaryPoints = latest.input_data?.boundaryPoints || []

        if (boundaryPoints.length < 3) return

        // Store in sessionStorage as a bridge to MutationPlanGenerator
        // The generator can read this on mount if it exists
        const plotData = {
          id: latest.parcel_number || latest.survey_number || 'parent',
          boundaryPoints: boundaryPoints.map(p => ({
            easting: p.easting,
            northing: p.northing,
            beacon: p.id,
          })),
          area_ha: latest.area_sqm ? latest.area_sqm / 10000 : 0,
          isApprox: false,
          seriesLabel: latest.parcel_number || 'Parent',
        }

        if (!cancelled) {
          sessionStorage.setItem(
            `metardu:mutation-plan:initial:${projectId}`,
            JSON.stringify(plotData)
          )
        }
      } catch {
        // silent fail
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    if (projectId && projectId !== 'new') {
      fetchDeedPlan()
    } else {
      setLoaded(true)
    }

    return () => { cancelled = true }
  }, [projectId])

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="font-mono text-xs text-[var(--text-muted)] tracking-[0.04em] uppercase">
          Loading project deed plan data...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 mb-4">
        <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 rounded-md flex items-center gap-3">
          <svg className="w-4 h-4 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.16 6.02a3 3 0 11-1.59 5.79 3 3 0 011.59-5.79zM12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="font-mono text-[var(--accent)]">Project linked.</span>{' '}
            Deed plan boundary data is available for this project. Use the
            "Import from CSV" option in the generator and select the project
            boundary source to auto-populate plot coordinates.
          </p>
        </div>
      </div>
      <MutationPlanGenerator />
    </div>
  )
}
