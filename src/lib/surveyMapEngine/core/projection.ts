/**
 * core/projection — authority facade (plan §3.1, Phase 1).
 *
 * The single import point for engine projection math. Every function takes an
 * explicit CRS argument: no default parameters, no guessed datums (plan F4 /
 * §3.3.2). `@/lib/spatial/projectCrs` remains the sole computational authority
 * (plan §3.3.3); `registerProjections()` wires the proj4 definitions that
 * OpenLayers-facing code needs.
 */
export {
  CrsError,
  fromDisplay,
  toDisplay,
  assertSurveyCrs,
  assertProjectedCrs,
  isRegistered,
  resolveEpsg,
  surveyDistance,
  surveyBearing,
  surveyArea,
  surveyPerimeter,
} from '@/lib/spatial/projectCrs';
export type { CrsInfo } from '@/lib/spatial/projectCrs';

export {
  registerProjections,
  to3857,
  arrayTo3857,
  toProjectCrs,
  SRID_21036,
  SRID_21037,
} from '@/lib/map/projection';

export type { CrsRef } from './types';
