import { assertProjectedCrs } from '@/lib/spatial/projectCrs'

/**
 * Resolve the grid used by survey calculations without conflating it with the
 * map's display projection. Linked projects must use their persisted CRS. An
 * unlinked map may use a projected grid only after the user explicitly picks
 * one in the projection control.
 */
export function resolveMapSurveyCrs(input: {
  projectId: string | null
  declaredProjectCrs: string | null
  selectedUnlinkedSurveyCrs: string
}): string | null {
  if (input.projectId) {
    if (!input.declaredProjectCrs) return null
    return assertProjectedCrs(input.declaredProjectCrs).code
  }

  if (!input.selectedUnlinkedSurveyCrs || input.selectedUnlinkedSurveyCrs === 'EPSG:3857') return null
  return assertProjectedCrs(input.selectedUnlinkedSurveyCrs).code
}
