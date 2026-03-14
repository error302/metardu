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
  
  // Allowable misclosure per Basak
  // Ordinary: ±12√K mm, Precise: ±6√K mm
  const factor = type === 'ordinary' ? 12 : 6
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
