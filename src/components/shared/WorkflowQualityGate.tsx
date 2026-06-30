'use client'

import { useState, useMemo } from 'react'
import {
  getWorkflowStatus,
  getStepEntryConditions,
  getWorkflowSteps,
  STEP_COLOR_MAP,
  type ProjectWorkflowData,
} from '@/lib/workflows/projectWorkflowEngine'

interface WorkflowQualityGateProps {
  /** The project data */
  project: ProjectWorkflowData
  /** The step the user wants to navigate to */
  targetStepId: string
  /** Callback when user dismisses the gate */
  onDismiss: () => void
  /** Callback when user wants to proceed anyway (warnings only, no critical blockers) */
  onProceedAnyway?: () => void
  /** Callback to navigate to an incomplete step */
  onNavigateToStep?: (stepId: string) => void
}

export default function WorkflowQualityGate({
  project,
  targetStepId,
  onDismiss,
  onProceedAnyway,
  onNavigateToStep,
}: WorkflowQualityGateProps) {
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false)

  const status = useMemo(() => getWorkflowStatus(project), [project])
  const steps = getWorkflowSteps(project.surveyType)
  const targetStepDef = steps.find((s) => s.id === targetStepId)
  const entryConditions = useMemo(
    () => getStepEntryConditions(project, targetStepId),
    [project, targetStepId]
  )

  const criticalBlockers = entryConditions.filter((c) => !c.passed && c.severity === 'critical')
  const warnings = entryConditions.filter((c) => !c.passed && c.severity === 'warning')
  const allPassed = entryConditions.every((c) => c.passed)
  const canProceedAnyway = criticalBlockers.length === 0 && warnings.length > 0 && acknowledgeWarnings

  const targetColors = STEP_COLOR_MAP[targetStepDef?.color ?? 'gray'] ?? STEP_COLOR_MAP.gray

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${targetColors.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full border-2 ${targetColors.border} flex items-center justify-center shrink-0`}>
              <svg className={`w-5 h-5 ${targetColors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Quality Gate: {targetStepDef?.label ?? targetStepId}
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {allPassed
                  ? 'All conditions met — you can proceed.'
                  : 'Some conditions must be met before proceeding.'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 max-h-80 overflow-y-auto">
          {allPassed ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)]">All entry conditions are satisfied. You may proceed.</p>
            </div>
          ) : (
            <>
              {/* Entry conditions checklist */}
              <div className="space-y-2 mb-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Entry Conditions
                </h4>
                {entryConditions.map((condition) => (
                  <div
                    key={condition.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                      condition.passed
                        ? 'bg-green-500/5 border-green-500/20'
                        : condition.severity === 'critical'
                        ? 'bg-red-500/5 border-red-500/20'
                        : 'bg-amber-500/5 border-amber-500/20'
                    }`}
                  >
                    {condition.passed ? (
                      <svg className="w-4 h-4 text-green-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${condition.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${condition.passed ? 'text-green-400' : condition.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                        {condition.label}
                      </p>
                      {!condition.passed && condition.message && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{condition.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Blockers */}
              {criticalBlockers.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">
                    Critical Blockers
                  </h4>
                  {criticalBlockers.map((b, i) => (
                    <p key={i} className="text-sm text-red-400/90 flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      {b.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Warnings with acknowledge */}
              {warnings.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                    Warnings
                  </h4>
                  {warnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-400/90">{w.message}</p>
                  ))}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeWarnings}
                      onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--border-color)] accent-amber-500"
                    />
                    <span className="text-sm text-[var(--text-secondary)]">
                      I acknowledge these warnings and want to proceed anyway
                    </span>
                  </label>
                </div>
              )}

              {/* Navigate to incomplete step */}
              {criticalBlockers.length > 0 && status.currentStep !== steps.find((s) => s.id === targetStepId)?.index && (
                <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">
                    You need to complete earlier steps first.
                  </p>
                  <button
                    onClick={() => {
                      const currentStepDef = steps.find((s) => s.index === status.currentStep)
                      if (currentStepDef && onNavigateToStep) {
                        onNavigateToStep(currentStepDef.id)
                      }
                    }}
                    className="text-sm text-[var(--accent)] hover:text-[var(--accent-dim)] font-medium transition-colors"
                  >
                    Go to current step →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Stay Here
          </button>
          {allPassed ? (
            <button
              type="button"
              onClick={onProceedAnyway ?? onDismiss}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              Proceed
            </button>
          ) : canProceedAnyway ? (
            <button
              type="button"
              onClick={onProceedAnyway}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
            >
              Proceed Anyway
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
