'use client'

import { useMemo } from 'react'
import {
  getWorkflowStatus,
  getWorkflowSteps,
  STEP_COLOR_MAP,
  type ProjectWorkflowData,
} from '@/lib/workflows/projectWorkflowEngine'

interface ProjectWorkflowBadgeProps {
  /** Slim project data — enough to compute workflow status */
  project: {
    id: string
    name: string | null
    survey_type?: string | null
    location?: string | null
    utm_zone?: number | null
    hemisphere?: string | null
    workflow_step?: number | null
    workflow_max_unlocked?: number | null
    point_count?: number
    parcel_count?: number
    /** Fieldbook entry count, if available */
    _fieldbookEntryCount?: number
    /** Computation results exist */
    _hasComputationResults?: boolean
    /** Tolerance check status */
    _toleranceCheckPassed?: boolean | null
    /** Tolerance acknowledged */
    _toleranceAcknowledged?: boolean
    /** Deed plan generated */
    _hasDeedPlan?: boolean
    /** Submission package assembled */
    _hasSubmissionPackage?: boolean
  }
}

export default function ProjectWorkflowBadge({ project }: ProjectWorkflowBadgeProps) {
  const status = useMemo(() => {
    const data: ProjectWorkflowData = {
      id: project.id,
      name: project.name,
      surveyType: project.survey_type ?? null,
      location: project.location ?? null,
      utmZone: project.utm_zone ?? null,
      hemisphere: project.hemisphere ?? null,
      currentStep: project.workflow_step ?? 1,
      maxUnlocked: project.workflow_max_unlocked ?? 1,
      pointCount: project.point_count ?? 0,
      fieldbookEntryCount: project._fieldbookEntryCount ?? 0,
      hasComputationResults: project._hasComputationResults ?? false,
      toleranceCheckPassed: project._toleranceCheckPassed ?? null,
      toleranceAcknowledged: project._toleranceAcknowledged ?? false,
      hasDeedPlan: project._hasDeedPlan ?? false,
      hasSubmissionPackage: project._hasSubmissionPackage ?? false,
    }
    return getWorkflowStatus(data)
  }, [project])

  const steps = getWorkflowSteps(project.survey_type)
  const currentStepDef = steps.find((s) => s.index === status.currentStep)
  const colorKey = currentStepDef?.color ?? 'gray'
  const colors = STEP_COLOR_MAP[colorKey] ?? STEP_COLOR_MAP.gray

  return (
    <div className="group/badge relative">
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium ${colors.bg} ${colors.text} ${colors.border} transition-colors`}
      >
        {/* Step label */}
        <span className="truncate max-w-[100px]">{currentStepDef?.label ?? 'Setup'}</span>

        {/* Small progress bar */}
        <div className="w-10 h-1.5 rounded-full bg-black/20 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
            style={{ width: `${status.overallPct}%` }}
          />
        </div>

        {/* Percentage */}
        <span className="font-mono text-[10px] opacity-80">{status.overallPct}%</span>

        {/* Blocker indicator */}
        {status.blockers.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Has blockers" />
        )}
      </div>

      {/* Tooltip on hover */}
      <div className="invisible group-hover/badge:visible opacity-0 group-hover/badge:opacity-100 transition-all absolute z-50 bottom-full left-0 mb-2 w-64 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl text-xs pointer-events-none">
        <p className="font-semibold text-[var(--text-primary)] mb-1.5">
          Workflow: {currentStepDef?.label ?? 'Setup'} (Step {status.currentStep}/{steps.length})
        </p>
        <div className="space-y-1 mb-2">
          {status.steps.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              {s.status === 'complete' ? (
                <svg className="w-3 h-3 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                </svg>
              ) : s.status === 'active' ? (
                <span className="w-3 h-3 rounded-full bg-blue-400 shrink-0" />
              ) : (
                <span className="w-3 h-3 rounded-full bg-gray-600 shrink-0" />
              )}
              <span className={`truncate ${s.status === 'complete' ? 'text-green-400' : s.status === 'active' ? 'text-blue-400' : 'text-gray-500'}`}>
                {s.label}
              </span>
              <span className="ml-auto text-gray-500 font-mono">{s.completionPct}%</span>
            </div>
          ))}
        </div>
        {status.blockers.length > 0 && (
          <div className="pt-1.5 border-t border-[var(--border-color)]">
            <p className="text-red-400 font-medium mb-0.5">Blockers:</p>
            {status.blockers.map((b, i) => (
              <p key={i} className="text-red-400/80">{b}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
