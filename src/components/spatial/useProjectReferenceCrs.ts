'use client'

/**
 * useProjectReferenceCrs — auto-apply the declared project reference.
 *
 * The project's reference-system declaration (project settings, blueprint
 * §4.2) is an explicit statement made once at setup. Every project-bound
 * artifact (fieldbook session header, contour plan, imports) may apply it
 * automatically — this removes a per-form CRS choice and its typos — but:
 *
 *  - the applied value is always SHOWN with provenance ("from the project
 *    declaration") and stays one tap away from an override (CrsPicker);
 *  - a missing declaration is reported, never substituted: METARDU does not
 *    guess a datum from region, device location, or country;
 *  - nothing here transforms data by itself — consumers that transform raw
 *    coordinates keep their explicit confirmation gates.
 */

import { useEffect, useState } from 'react'
import { resolveDeclaredStageReference, type StageReference } from '@/lib/workspaces/stageReference'

export interface ProjectReferenceCrs {
  /** Declared horizontal CRS code (e.g. 'EPSG:21037'), or null when undeclared. */
  crs: string | null
  /** Provenance of the declaration: declared (settings), legacy columns, or missing. */
  source: 'declared' | 'legacy' | 'missing'
  /** Declared vertical datum, when the declaration includes one. */
  verticalDatum: string | null
}

const MISSING: ProjectReferenceCrs = { crs: null, source: 'missing', verticalDatum: null }

function fromStage(reference: StageReference): ProjectReferenceCrs {
  return reference.source === 'missing'
    ? MISSING
    : { crs: reference.code, source: reference.source, verticalDatum: reference.verticalDatum }
}

export function useProjectReferenceCrs(projectId: string | null | undefined): ProjectReferenceCrs {
  const [state, setState] = useState<ProjectReferenceCrs>(MISSING)

  useEffect(() => {
    // No fetch (test harnesses, very old webviews): report missing rather
    // than crash the form — a missing declaration is a reportable state.
    if (!projectId || typeof fetch !== 'function') { setState(MISSING); return }
    let cancelled = false
    setState(MISSING)
    fetch(`/api/project/${encodeURIComponent(projectId)}/reference-system`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload: unknown) => {
        if (cancelled) return
        const referenceSystem = (payload as { data?: { referenceSystem?: unknown } })?.data?.referenceSystem
        setState(fromStage(resolveDeclaredStageReference(referenceSystem)))
      })
      .catch(() => { if (!cancelled) setState(MISSING) })
    return () => { cancelled = true }
  }, [projectId])

  return state
}

/**
 * Auto-apply rule for a form field: apply the declared project CRS only
 * while the field is empty. Never overwrites a value the surveyor picked,
 * and returns whether it applied so callers can show provenance.
 */
export function applyDeclaredCrsIfEmpty(current: string, declared: ProjectReferenceCrs): string | null {
  if (current.trim() === '' && declared.crs) return declared.crs
  return null
}
