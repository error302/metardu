import type { Solution, SolutionV1, SolutionKV, SolutionWorkStep, SolutionCheck } from '@/lib/solution/schema'

/**
 * GeoNova Engine Solution Builder
 *
 * Blueprint-standard output:
 * Given → To Find → Solution (formula → substitution → computation) → Check → Result
 *
 * This module is intentionally "thin": it does not perform survey math.
 * It structures explanation objects around results computed by the engine.
 */

export type { Solution, SolutionV1, SolutionKV, SolutionWorkStep, SolutionCheck }

export function createSolutionV1(input: {
  title?: string
  given: SolutionKV[]
  toFind: string[]
  solution: SolutionWorkStep[]
  check?: SolutionCheck[]
  result: SolutionKV[]
}): SolutionV1 {
  return {
    version: 1,
    title: input.title,
    given: input.given,
    toFind: input.toFind,
    solution: input.solution,
    check: input.check,
    result: input.result,
  }
}

export function isSolutionV1(value: unknown): value is SolutionV1 {
  if (!value || typeof value !== 'object') return false
  const v = value as any
  return v.version === 1 && Array.isArray(v.given) && Array.isArray(v.toFind) && Array.isArray(v.solution) && Array.isArray(v.result)
}

