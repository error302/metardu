/**
 * core/extent — wraps `@/lib/validation/mapExtent` (plan §3.1, Phase 1).
 *
 * Single source of truth for the shared geographic bounding box (WGS84
 * decimal degrees). The zod schema remains the authority; this module is the
 * engine-facing entry point so map surfaces never re-declare extent shapes.
 */
import { mapExtentSchema } from '@/lib/validation/mapExtent';

export { mapExtentSchema } from '@/lib/validation/mapExtent';
export type { MapExtent } from '@/lib/validation/mapExtent';

/** True when `value` is a structurally valid shared MapExtent. */
export function isValidMapExtent(value: unknown): boolean {
  return mapExtentSchema.safeParse(value).success;
}
