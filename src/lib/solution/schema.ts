export type SolutionSchemaVersion = 1

export type SolutionKV = {
  label: string
  value: string
}

export type SolutionWorkStep = {
  /** Optional label like "Step 1" or "Bearing" */
  title?: string
  formula: string
  substitution?: string
  computation?: string
  result?: string
}

export type SolutionCheck = {
  label: string
  value: string
  ok?: boolean
}

/**
 * Blueprint-standard solution schema (v1)
 * Given → To Find → Solution (formula → substitution → computation) → Check → Result
 */
export type SolutionV1 = {
  version: 1
  title?: string
  given: SolutionKV[]
  toFind: string[]
  solution: SolutionWorkStep[]
  check?: SolutionCheck[]
  result: SolutionKV[]
}

export type Solution = SolutionV1

