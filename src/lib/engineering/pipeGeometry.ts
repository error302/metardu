/** Circular concentric pipe: outside crown above the bottom INSIDE the pipe. */
export function outsideCrownRiseM(internalDiameterMm: number, outsideDiameterMm: number): number {
  if (!Number.isFinite(internalDiameterMm) || internalDiameterMm <= 0) throw new RangeError('Actual internal diameter must be finite and positive.')
  if (!Number.isFinite(outsideDiameterMm) || outsideDiameterMm <= 0) throw new RangeError('Actual outside diameter must be finite and positive.')
  if (outsideDiameterMm < internalDiameterMm) throw new RangeError('Outside diameter cannot be less than internal diameter.')
  return (internalDiameterMm / 2 + outsideDiameterMm / 2) / 1000
}
/** Arithmetic roundoff only, separate from observation precision or a contractual tolerance. */
export function coverBelowMinimum(coverM: number, minimumM: number, ...referenceLevels: number[]): boolean {
  if (![coverM, minimumM, ...referenceLevels].every(Number.isFinite)) throw new RangeError('Cover comparison values must be finite.')
  const roundoff = 8 * Number.EPSILON * Math.max(1, Math.abs(minimumM), ...referenceLevels.map(Math.abs))
  return coverM < minimumM - roundoff
}
