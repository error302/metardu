export function validateLevelingClosure(
  sumBS: number,
  sumFS: number,
  firstRL: number,
  lastRL: number,
  distanceKm: number,
  type: 'ordinary' | 'precise' = 'ordinary'
): {
  passed: boolean
  arithmeticCheck: boolean
  closingError: number
  allowableMisclosure: number
  warning?: string
} {
  // Arithmetic check: ΣBS - ΣFS = Last RL - First RL
  const arithmeticCheck = Math.abs((sumBS - sumFS) - (lastRL - firstRL)) < 0.001
  
  // RDM 1.1 (2025) Table 5.1 — Levelling closure tolerance: 10√K mm for ordinary, 5√K mm for precise
  const factor = type === 'ordinary' ? 10 : 5
  const allowableMisclosure = factor * Math.sqrt(distanceKm) / 1000 // convert to metres
  
  const closingError = lastRL - firstRL
  
  return {
    passed: arithmeticCheck && Math.abs(closingError) <= allowableMisclosure,
    arithmeticCheck,
    closingError,
    allowableMisclosure,
    warning: !arithmeticCheck 
      ? 'Arithmetic check FAILED — verify all readings before proceeding'
      : undefined
  }
}
