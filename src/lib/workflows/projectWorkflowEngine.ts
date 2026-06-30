/**
 * Project Workflow State Machine
 *
 * Manages the cadastral surveying workflow with entry/exit conditions,
 * quality gates, and completion tracking.
 *
 * Cadastral workflow steps:
 * 1. Setup — always unlocked; complete when project has name + survey_type + location
 * 2. Field Collection — requires Setup complete; complete when ≥3 survey points or fieldbook entries
 * 3. Computation — requires Field Collection complete; complete when traverse/leveling computed
 * 4. Quality Review — requires Computation complete; complete when tolerance check passes OR acknowledged
 * 5. Map & Deed Plan — requires Quality Review complete; complete when deed plan generated
 * 6. Submission — requires Deed Plan complete; complete when submission package assembled
 */

import type { SurveyType } from '@/types/project'

/* ── Types ──────────────────────────────────────────────────────────────── */

export type StepStatus = 'locked' | 'active' | 'complete'

export interface WorkflowStepDef {
  id: string
  index: number
  label: string
  description: string
  color: string /** Colour key for badges */
  entryConditions: EntryCondition[]
  completionCriteria: CompletionCriterion[]
  routeSuffix: string | null
}

export interface EntryCondition {
  id: string
  label: string
  check: (project: ProjectWorkflowData) => boolean
  severity: 'critical' | 'warning'
  message: string
}

export interface CompletionCriterion {
  id: string
  label: string
  check: (project: ProjectWorkflowData) => boolean
  weight: number /** 0-1 — how much this criterion contributes to completionPct */
}

export interface ProjectWorkflowData {
  id: string
  name: string | null
  surveyType: string | null
  location: string | null
  utmZone: number | null
  hemisphere: string | null
  currentStep: number
  maxUnlocked: number
  /** Number of survey points in the project */
  pointCount: number
  /** Number of fieldbook entries */
  fieldbookEntryCount: number
  /** Whether a traverse/leveling computation has been run with results */
  hasComputationResults: boolean
  /** Whether quality review tolerance check passed */
  toleranceCheckPassed: boolean | null
  /** Whether tolerance failure was acknowledged by surveyor */
  toleranceAcknowledged: boolean
  /** Whether a deed plan has been generated */
  hasDeedPlan: boolean
  /** Whether a submission package has been assembled */
  hasSubmissionPackage: boolean
}

export interface StepStatusInfo {
  id: string
  label: string
  status: StepStatus
  completionPct: number // 0-100
  entryMessage?: string
}

export interface WorkflowStatusResult {
  currentStep: number
  maxUnlocked: number
  steps: StepStatusInfo[]
  overallPct: number // 0-100
  canAdvance: boolean
  blockers: string[]
}

/* ── Step Definitions ───────────────────────────────────────────────────── */

const CADASTRAL_STEPS: WorkflowStepDef[] = [
  {
    id: 'setup',
    index: 1,
    label: 'Setup',
    description: 'Enter project details, LR number, client info, and UTM zone.',
    color: 'gray',
    routeSuffix: null,
    entryConditions: [
      {
        id: 'always',
        label: 'Always unlocked',
        check: () => true,
        severity: 'critical',
        message: '',
      },
    ],
    completionCriteria: [
      { id: 'has_name', label: 'Project name set', check: (p) => !!p.name, weight: 0.33 },
      { id: 'has_survey_type', label: 'Survey type selected', check: (p) => !!p.surveyType, weight: 0.34 },
      { id: 'has_location', label: 'Location specified', check: (p) => !!p.location, weight: 0.33 },
    ],
  },
  {
    id: 'field-collection',
    index: 2,
    label: 'Field Collection',
    description: 'Record traverse observations and beacon coordinates.',
    color: 'blue',
    routeSuffix: 'fieldbook',
    entryConditions: [
      {
        id: 'setup_complete',
        label: 'Setup must be complete',
        check: (p) => isStepComplete(CADASTRAL_STEPS[0], p),
        severity: 'critical',
        message: 'Complete the Setup step first (name, survey type, and location are required).',
      },
    ],
    completionCriteria: [
      {
        id: 'has_3_points',
        label: 'At least 3 survey points or fieldbook entries',
        check: (p) => p.pointCount >= 3 || p.fieldbookEntryCount >= 3,
        weight: 1.0,
      },
    ],
  },
  {
    id: 'computation',
    index: 3,
    label: 'Computation',
    description: 'Run Bowditch traverse adjustment and area calculation.',
    color: 'amber',
    routeSuffix: null,
    entryConditions: [
      {
        id: 'field_complete',
        label: 'Field Collection must be complete',
        check: (p) => isStepComplete(CADASTRAL_STEPS[1], p),
        severity: 'critical',
        message: 'Add at least 3 survey points or fieldbook entries to complete Field Collection.',
      },
    ],
    completionCriteria: [
      {
        id: 'has_computation',
        label: 'Traverse/leveling computed with results',
        check: (p) => p.hasComputationResults,
        weight: 1.0,
      },
    ],
  },
  {
    id: 'quality-review',
    index: 4,
    label: 'Quality Review',
    description: 'Check traverse diagram, closure, and boundary plan.',
    color: 'orange',
    routeSuffix: null,
    entryConditions: [
      {
        id: 'computation_complete',
        label: 'Computation must be complete',
        check: (p) => isStepComplete(CADASTRAL_STEPS[2], p),
        severity: 'critical',
        message: 'Run traverse/leveling computation before reviewing quality.',
      },
    ],
    completionCriteria: [
      {
        id: 'tolerance_pass_or_ack',
        label: 'Tolerance check passes or acknowledged',
        check: (p) => p.toleranceCheckPassed === true || p.toleranceAcknowledged,
        weight: 1.0,
      },
    ],
  },
  {
    id: 'map-deed-plan',
    index: 5,
    label: 'Map & Deed Plan',
    description: 'Generate deed plan and boundary map.',
    color: 'purple',
    routeSuffix: 'generate-plan',
    entryConditions: [
      {
        id: 'review_complete',
        label: 'Quality Review must be complete',
        check: (p) => isStepComplete(CADASTRAL_STEPS[3], p),
        severity: 'critical',
        message: 'Complete quality review (pass tolerance or acknowledge) before generating plans.',
      },
    ],
    completionCriteria: [
      {
        id: 'has_deed_plan',
        label: 'Deed plan generated',
        check: (p) => p.hasDeedPlan,
        weight: 1.0,
      },
    ],
  },
  {
    id: 'submission',
    index: 6,
    label: 'Submission',
    description: 'Generate and download all required documents.',
    color: 'green',
    routeSuffix: 'submission',
    entryConditions: [
      {
        id: 'deed_plan_complete',
        label: 'Map & Deed Plan must be complete',
        check: (p) => isStepComplete(CADASTRAL_STEPS[4], p),
        severity: 'critical',
        message: 'Generate a deed plan before assembling the submission package.',
      },
    ],
    completionCriteria: [
      {
        id: 'has_submission_package',
        label: 'Submission package assembled',
        check: (p) => p.hasSubmissionPackage,
        weight: 1.0,
      },
    ],
  },
]

/* ── Step colour mappings ───────────────────────────────────────────────── */

export const STEP_COLOR_MAP: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  gray:   { bg: 'bg-gray-500/15',   text: 'text-gray-400',   border: 'border-gray-500/30',   bar: 'bg-gray-400'   },
  blue:   { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30',   bar: 'bg-blue-400'   },
  amber:  { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30',  bar: 'bg-amber-400'  },
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', bar: 'bg-orange-400' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', bar: 'bg-purple-400' },
  green:  { bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/30',  bar: 'bg-green-400'  },
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function isStepComplete(stepDef: WorkflowStepDef, project: ProjectWorkflowData): boolean {
  return stepDef.completionCriteria.every((c) => c.check(project))
}

function getStepCompletionPct(stepDef: WorkflowStepDef, project: ProjectWorkflowData): number {
  const totalWeight = stepDef.completionCriteria.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return 0
  const achieved = stepDef.completionCriteria
    .filter((c) => c.check(project))
    .reduce((s, c) => s + c.weight, 0)
  return Math.round((achieved / totalWeight) * 100)
}

/** Return the step definitions for a given survey type. */
export function getWorkflowSteps(_surveyType?: SurveyType | string | null): WorkflowStepDef[] {
  // All survey types share the same 6-step canonical workflow for now.
  return CADASTRAL_STEPS
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Compute the full workflow status for a project.
 * Works both client-side and server-side (pure function, no DB access).
 */
export function getWorkflowStatus(project: ProjectWorkflowData): WorkflowStatusResult {
  const steps = getWorkflowSteps(project.surveyType)

  // Determine maxUnlocked: walk from step 1 and unlock while entry conditions pass
  let computedMaxUnlocked = 1
  for (const step of steps) {
    const allEntryMet = step.entryConditions.every((c) => c.check(project))
    if (!allEntryMet) break
    // This step's entry is unlocked. But is it complete? If not, we can't unlock the NEXT one.
    computedMaxUnlocked = Math.max(computedMaxUnlocked, step.index)
    if (!isStepComplete(step, project)) break
    // Step complete → next step will also be checked
  }

  const effectiveMax = Math.max(project.maxUnlocked, computedMaxUnlocked)

  // Build per-step info
  const stepInfos: StepStatusInfo[] = steps.map((stepDef) => {
    const complete = isStepComplete(stepDef, project)
    const unlocked = stepDef.index <= effectiveMax
    let status: StepStatus = 'locked'
    if (complete) status = 'complete'
    else if (unlocked) status = 'active'

    const entryMessage = stepDef.entryConditions
      .filter((c) => !c.check(project) && c.severity === 'critical')
      .map((c) => c.message)
      .join(' ') || undefined

    return {
      id: stepDef.id,
      label: stepDef.label,
      status,
      completionPct: complete ? 100 : getStepCompletionPct(stepDef, project),
      entryMessage,
    }
  })

  // Overall %
  const totalPct = stepInfos.reduce((s, si) => s + si.completionPct, 0)
  const overallPct = Math.round(totalPct / stepInfos.length)

  // Can advance?
  const currentStepDef = steps.find((s) => s.index === project.currentStep)
  const nextStepDef = steps.find((s) => s.index === project.currentStep + 1)
  const canAdvance =
    !!currentStepDef &&
    isStepComplete(currentStepDef, project) &&
    !!nextStepDef

  // Blockers
  const blockers: string[] = []
  if (currentStepDef && !isStepComplete(currentStepDef, project)) {
    currentStepDef.completionCriteria
      .filter((c) => !c.check(project))
      .forEach((c) => blockers.push(c.label))
  }
  if (nextStepDef) {
    nextStepDef.entryConditions
      .filter((c) => !c.check(project) && c.severity === 'critical')
      .forEach((c) => blockers.push(c.message))
  }

  return {
    currentStep: project.currentStep,
    maxUnlocked: effectiveMax,
    steps: stepInfos,
    overallPct,
    canAdvance,
    blockers,
  }
}

/**
 * Check whether a specific step is complete for a project.
 */
export function checkStepCompletion(
  project: ProjectWorkflowData,
  stepId: string
): { complete: boolean; criteria: Array<{ id: string; label: string; passed: boolean }> } {
  const steps = getWorkflowSteps(project.surveyType)
  const stepDef = steps.find((s) => s.id === stepId)
  if (!stepDef) return { complete: false, criteria: [] }

  const criteria = stepDef.completionCriteria.map((c) => ({
    id: c.id,
    label: c.label,
    passed: c.check(project),
  }))

  return {
    complete: criteria.every((c) => c.passed),
    criteria,
  }
}

/**
 * Get entry conditions for a step (with pass/fail evaluation).
 */
export function getStepEntryConditions(
  project: ProjectWorkflowData,
  stepId: string
): Array<EntryCondition & { passed: boolean }> {
  const steps = getWorkflowSteps(project.surveyType)
  const stepDef = steps.find((s) => s.id === stepId)
  if (!stepDef) return []

  return stepDef.entryConditions.map((c) => ({
    ...c,
    passed: c.check(project),
  }))
}

/**
 * Determine the next action for a step (human-readable hint + route).
 */
export function getNextAction(
  project: ProjectWorkflowData,
  stepId: string
): { label: string; route: string } | null {
  const steps = getWorkflowSteps(project.surveyType)
  const idx = steps.findIndex((s) => s.id === stepId)
  if (idx === -1) return null
  const stepDef = steps[idx]

  // If step is complete, the next action is to go to the next step
  if (isStepComplete(stepDef, project) && idx < steps.length - 1) {
    const next = steps[idx + 1]
    return {
      label: `Go to ${next.label}`,
      route: next.routeSuffix ? `/project/${project.id}/${next.routeSuffix}` : `/project/${project.id}?step=${next.index}`,
    }
  }

  // Otherwise find the first unmet criterion and suggest an action
  const unmet = stepDef.completionCriteria.find((c) => !c.check(project))
  if (!unmet) return null

  const actionMap: Record<string, { label: string; route: string }> = {
    has_name:              { label: 'Set project name',        route: `/project/${project.id}/settings` },
    has_survey_type:       { label: 'Select survey type',      route: `/project/${project.id}/settings` },
    has_location:          { label: 'Set location',            route: `/project/${project.id}/settings` },
    has_3_points:          { label: 'Add survey points',       route: `/project/${project.id}?step=2` },
    has_computation:       { label: 'Run computation',         route: `/project/${project.id}?step=3` },
    tolerance_pass_or_ack: { label: 'Review quality',          route: `/project/${project.id}?step=4` },
    has_deed_plan:         { label: 'Generate deed plan',      route: `/project/${project.id}/generate-plan` },
    has_submission_package:{ label: 'Assemble submission',     route: `/project/${project.id}/submission` },
  }

  return actionMap[unmet.id] ?? { label: unmet.label, route: `/project/${project.id}` }
}

/**
 * Advance the workflow to the next step if conditions are met.
 * Returns the new currentStep or null if blocked.
 */
export function advanceWorkflow(project: ProjectWorkflowData): number | null {
  const status = getWorkflowStatus(project)
  if (!status.canAdvance) return null
  return project.currentStep + 1
}
