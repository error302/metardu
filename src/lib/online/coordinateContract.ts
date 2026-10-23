import { z } from 'zod'
import type { CrsInfo } from '@/lib/spatial/projectCrs'

export type OnlineRequest = Record<string, unknown>
export type OnlineErrorCode = 'INVALID_COORDINATE' | 'CRS_REQUIRED' | 'CRS_AMBIGUOUS' | 'CRS_REJECTED' | 'OPERATION_UNAVAILABLE' | 'TRANSFORM_FAILED'
export class OnlineTransformError extends Error {
  constructor(readonly code: OnlineErrorCode, message: string) { super(message); this.name = 'OnlineTransformError' }
}
export interface OnlineReference extends Omit<CrsInfo, 'notes' | 'displayOnly'> {
  id: string
  type: 'projected' | 'geographic'
  axisConvention: 'easting,northing' | 'longitude,latitude'
}
export interface OnlineOperation {
  engine: 'proj4'
  authority: 'METARDU shared CRS authority'
  kind: 'identity' | 'projection' | 'configured-datum-transform'
  sourceDefinition: string
  targetDefinition: string
  accuracyMetres: null
  accuracyStatus: 'not-established'
  applicabilityStatus: 'not-verified'
  horizontalOnly: true
  verticalTreatment: 'preserved-untransformed'
  notes: string[]
}
export interface NamedCoordinates {
  latitude?: number; longitude?: number; easting?: number; northing?: number
  zone?: number; hemisphere?: 'N' | 'S'; elevation?: number | null
}
export interface OnlineReferences {
  fromCRS: string; toCRS: string; source: OnlineReference; target: OnlineReference
  operation: OnlineOperation; notes: string[]
}
export type TransformResult = ({ success: true; result: NamedCoordinates } & OnlineReferences)
  | { success: false; code: OnlineErrorCode; error: string }
export function onlineFailure(error: unknown): Extract<TransformResult, { success: false }> {
  return error instanceof OnlineTransformError ? { success: false, code: error.code, error: error.message }
    : { success: false, code: 'TRANSFORM_FAILED', error: 'The configured transform could not be completed; no substitute coordinate was produced.' }
}

// Semantic fields are admitted by the shared service; wrong envelope shapes
// remain HTTP400, while reference/measurement admission is HTTP422.
export const transformRequestSchema = z.object({}).passthrough()
export const transformBatchSchema = z.object({ points: z.array(z.unknown()).min(1).max(1000) }).passthrough()
export const ONLINE_BATCH_MAX_POINTS = 1000
export const UNAVAILABLE_DATUM_GUIDANCE = 'Adindan, Cape, ED50, PSAD56 and Hartebeesthoek require explicit reviewed CRS configuration; bare datum labels do not select an operation.'
