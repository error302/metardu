'use client'

import type { EngineeringData, StepStatus } from '@/types/engineering'

/**
 * Shared types and constants used by the engineering page orchestrator,
 * the step components, and the renderStepContent switch.
 *
 * Extracted from src/app/project/[id]/engineering/page.tsx to allow each
 * step component to be split into its own file under ./steps/ without
 * re-declaring these shared types.
 */

export type EngineeringStepId =
  | 'setup'
  | 'horizontal'
  | 'vertical'
  | 'cross_section'
  | 'stations'
  | 'outputs'
  | 'export'
  | 'manholes'
  | 'pipes'
  | 'drainage_outputs'
  | 'long_section'
  | 'cross_section_view'
  | 'road_reserve'
  | 'pavement_design'
  | 'drainage_design'
  | 'as_built'
  | 'road_completion'
  | 'pile_grid'
  | 'slope_analysis'
  | 'progress_monitor'
  | 'topo_drawing'
  | 'machine_control'

export interface EngineeringStep {
  id: EngineeringStepId
  label: string
  description: string
  status: StepStatus
  gated?: boolean
}

export interface EngineeringProject {
  id: string
  name: string
  survey_type: string
  utm_zone: number
  hemisphere: 'N' | 'S'
  datum?: string
  lr_number?: string
  county?: string
  district?: string
  locality?: string
  engineering_data?: EngineeringData | null
}

export const ROAD_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

/** Lightweight loading placeholder used by the dynamic()-loaded engineering panels. */
export function EngineeringPanelSkeleton() {
  return (
    <div className="animate-pulse bg-zinc-800/50 rounded-lg p-8 h-48 flex items-center justify-center text-zinc-500 text-sm">
      Loading panel…
    </div>
  )
}
