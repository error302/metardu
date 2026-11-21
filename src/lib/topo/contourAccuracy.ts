/**
 * Contour-interval accuracy guidance.
 *
 * Rule: an interpolated contour line can never be more accurate than the
 * surface it was derived from, so the chosen contour interval is checked
 * against the DECLARED source vertical accuracy. The surveyor declares the
 * source RMSE — METARDU never invents or defaults an accuracy.
 *
 * Cited guidance (not a legal limit):
 *  - ASPRS Positional Accuracy Standards for Digital Geospatial Data,
 *    Edition 2, Version 2 (2024), Table B.6: the NMAS 1947 equivalence
 *    tabulated there works out to CI ≈ 3.29 × RMSEv.
 *  - The same document (B.5) carries the legacy ASPRS 1990 Class 1 rule
 *    CI = 3 × RMSEv.
 * Both are guidance for professionals; the project specification governs.
 */

export const ASPRS_NMAS_EQUIVALENT_FACTOR = 3.29
export const ASPRS_1990_CLASS1_FACTOR = 3

export const CONTOUR_INTERVAL_BASIS =
  'Interval guidance: NMAS-equivalent contour interval ≈ 3.29 × RMSEv ' +
  '(ASPRS Positional Accuracy Standards for Digital Geospatial Data, Ed. 2 v2 2024, Table B.6); ' +
  'ASPRS 1990 Class 1 uses CI = 3 × RMSEv. Guidance only — the project specification governs.'

export interface ContourIntervalGuidance {
  /** Declared source vertical RMSE in metres, or null when not declared/parsable. */
  rmseM: number | null
  /** True when a declared RMSE could not be parsed as a positive number. */
  rmseInvalid: boolean
  /** NMAS-equivalent guideline interval, 3.29 × RMSEv (metres), or null. */
  nmasEquivalentCiM: number | null
  /** Legacy ASPRS 1990 Class 1 interval, 3 × RMSEv (metres), or null. */
  asprs1990Class1CiM: number | null
  /** True when the chosen interval is FINER than the declared source accuracy supports. */
  finerThanSource: boolean
  /** Printed accuracy-basis statement, or null when no RMSE was declared. */
  basis: string | null
  /** Human warning for the settings panel, or null when nothing is warnable. */
  warning: string | null
}

function parseMetres(text: string): { value: number | null; invalid: boolean } {
  const trimmed = text.trim().replace(',', '.')
  if (!trimmed) return { value: null, invalid: false }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return { value: null, invalid: true }
  return { value, invalid: false }
}

export function contourIntervalGuidance(input: {
  contourIntervalM: number
  sourceVerticalRmseText: string
}): ContourIntervalGuidance {
  const { value: rmseM, invalid: rmseInvalid } = parseMetres(input.sourceVerticalRmseText)
  const interval = input.contourIntervalM

  if (rmseM === null) {
    return {
      rmseM: null,
      rmseInvalid,
      nmasEquivalentCiM: null,
      asprs1990Class1CiM: null,
      finerThanSource: false,
      basis: null,
      warning: rmseInvalid
        ? 'Source vertical RMSE must be a positive number of metres, or left empty if not assessed.'
        : null,
    }
  }

  const nmasEquivalentCiM = ASPRS_NMAS_EQUIVALENT_FACTOR * rmseM
  const asprs1990Class1CiM = ASPRS_1990_CLASS1_FACTOR * rmseM
  // A FINER (smaller) interval than the guideline implies vertical precision
  // the source does not support. A coarser interval is conservative and safe.
  const finerThanSource = Number.isFinite(interval) && interval > 0 && interval < nmasEquivalentCiM

  const warning = finerThanSource
    ? `Chosen interval ${interval} m is finer than the ${nmasEquivalentCiM.toFixed(3)} m guideline ` +
      `for the declared source vertical RMSE ${rmseM} m (3.29 × RMSEv, ASPRS Ed. 2 Table B.6). ` +
      'Contours at this interval imply vertical precision the source data does not support. ' +
      'This is guidance, not a legal limit — the accuracy basis is printed with the deliverable.'
    : null

  return {
    rmseM,
    rmseInvalid: false,
    nmasEquivalentCiM,
    asprs1990Class1CiM,
    finerThanSource,
    basis: CONTOUR_INTERVAL_BASIS,
    warning,
  }
}

/** Short line for DXF/PDF/CSV provenance blocks. Empty text when undeclared. */
export function contourAccuracyBasisLine(sourceVerticalRmseText: string, contourIntervalM: number): string {
  const guidance = contourIntervalGuidance({ contourIntervalM, sourceVerticalRmseText })
  if (guidance.rmseM === null) return ''
  const finer = guidance.finerThanSource
    ? `; NOTE: chosen interval is finer than the ${guidance.nmasEquivalentCiM?.toFixed(3)} m guideline`
    : ''
  return `METARDU source vertical RMSE (declared): ${guidance.rmseM} m; interval guidance 3.29 x RMSEv = ` +
    `${guidance.nmasEquivalentCiM?.toFixed(3)} m (ASPRS Ed. 2 Table B.6)${finer}`
}
