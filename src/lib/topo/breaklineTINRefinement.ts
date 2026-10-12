import type { SurfacePoint } from '@/lib/survey/surfaceTIN'
import { buildBreaklineTIN, type Breakline, type BreaklineTINResult } from './breaklineTIN'

export interface RefinedBreaklineTINResult extends BreaklineTINResult {
  /** Compatibility fields: complete triangulation never creates temporary gaps. */
  gapRegions: number
  gapAreaFilled: number
  valid: boolean
}

/** Compatibility entry point; delegates to the same validated constrained mesh.
 * The former approximate fan filling could overlap triangles and omit vertices.
 */
export function buildBreaklineTINWithGaps(points: SurfacePoint[], breaklines: Breakline[] = []): RefinedBreaklineTINResult {
  return { ...buildBreaklineTIN(points, breaklines), gapRegions: 0, gapAreaFilled: 0, valid: true }
}
