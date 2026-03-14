export interface TraverseValidationResult {
  passed: boolean
  angularMisclosure?: number
  angularLimit?: number
  warnings: string[]
  errors: string[]
}

export function validateTraverse(
  stationCount: number,
  angularMisclosureMinutes?: number
): TraverseValidationResult {
  const warnings: string[] = []
  const errors: string[] = []
  
  // Angular misclosure limit: ±1' √n
  const limit = Math.sqrt(stationCount)
  
  if (angularMisclosureMinutes !== undefined) {
    if (Math.abs(angularMisclosureMinutes) > limit) {
      errors.push(
        `Angular misclosure ${angularMisclosureMinutes.toFixed(1)}' exceeds limit ±${limit.toFixed(1)}' for ${stationCount} stations`
      )
    }
  }
  
  return {
    passed: errors.length === 0,
    angularLimit: limit,
    warnings,
    errors
  }
}
