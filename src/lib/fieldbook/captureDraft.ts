import { z } from 'zod'
import { declaredCaptureBearing } from '@/lib/engine/captureBearing'

export type CaptureBookType = 'leveling' | 'traverse' | 'control'
export type CaptureBearingEncoding = 'uninterpreted' | 'decimal_degrees' | 'packed_dms' | 'separated_dms'
export interface BookCaptureSource {
  batchId: string; observationId: string; projectId: string; clientId: string; inputHash: string
  capturedBy: string | null; raw: Record<string, unknown>; projectReference: Record<string, unknown> | null
}
export interface CaptureDraftReview { actorId: string; reviewedAt: string; requestHash: string; bearingEncoding: CaptureBearingEncoding }
const boundedText = z.string().max(10000)
export const sourceImportSchema = z.object({
  version: z.literal(1), authority: z.literal('raw_capture_draft'), fieldVerified: z.literal(false),
  reviewedBy: z.string().uuid(), reviewedAt: z.string().datetime({ offset: true }), requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  bearingEncoding: z.enum(['uninterpreted', 'decimal_degrees', 'packed_dms', 'separated_dms']),
  sources: z.array(z.object({ rowId: boundedText, batchId: z.string().uuid(), observationId: z.string().uuid(),
    projectId: z.string().uuid(), clientId: boundedText, inputHash: z.string().regex(/^[a-f0-9]{64}$/), capturedBy: z.string().uuid().nullable(),
    raw: z.record(z.unknown()), projectReference: z.record(z.unknown()).nullable(), initialRow: z.record(boundedText),
  })).min(1).max(500),
})
export type SourceImport = z.infer<typeof sourceImportSchema>
export const captureBookRequestSchema = z.object({ projectId: z.string().uuid(), bookId: z.string().uuid(), name: z.string().trim().min(1).max(255),
  type: z.enum(['leveling', 'traverse', 'control']), bearingEncoding: z.enum(['uninterpreted', 'decimal_degrees', 'packed_dms', 'separated_dms']),
  acknowledgement: z.literal('create-draft-from-raw-v1'),
  sources: z.array(z.object({ batchId: z.string().uuid(), inputHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(500),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.sources.map(source => source.batchId)).size !== input.sources.length) ctx.addIssue({ code: 'custom', message: 'Select each source only once.' })
})
export type CaptureBookRequest = z.infer<typeof captureBookRequestSchema>

export function createCaptureDraftData(type: CaptureBookType, sources: BookCaptureSource[], review: CaptureDraftReview): Record<string, unknown> {
  if (!sources.length || sources.length > 500 || new Set(sources.map(item => item.batchId)).size !== sources.length
    || sources.some(item => item.projectId !== sources[0].projectId)) throw new Error('Choose distinct compatible captures from one project.')
  const rows = sources.map(source => {
    const raw = source.raw
    const form = raw.rawForm && typeof raw.rawForm === 'object' && !Array.isArray(raw.rawForm) ? raw.rawForm as Record<string, unknown> : {}
    const text = (key: string, ...fallback: string[]): string => {
      if (Object.hasOwn(form, key)) {
        if (typeof form[key] !== 'string') throw new Error('The retained form contains an unreadable original value.')
        return form[key]
      }
      for (const name of fallback) {
        const value = raw[name]
        if (typeof value === 'string') return value
        if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      }
      return ''
    }
    const compatible = type === 'leveling' ? raw.surveyType === 'leveling' || raw.surveyMode === 'leveling'
      : type === 'traverse' ? raw.surveyType === 'traverse' || raw.surveyMode === 'traverse'
        : raw.surveyMode === 'control' && (Object.hasOwn(form, 'slopeDistance') || raw.slopeDistance != null)
    if (!compatible) throw new Error(type === 'control' ? 'This source is not a polar control shot. GNSS coordinates require the coordinate/control workflow.' : 'The selected capture mode is not compatible with this book.')
    const base = { id: `capture-${source.batchId}`, remarks: text('remarks', 'notes') }
    if (type === 'leveling') return { ...base, station: text('station', 'station', 'pointName'),
      bs: text('bs', 'backsightReading'), is: text('is', 'intermediateReading'), fs: text('fs', 'foresightReading') }
    let bearing = ''
    if (review.bearingEncoding !== 'uninterpreted') {
      const original = text('bearing', 'bearing')
      if (original.trim()) bearing = String(declaredCaptureBearing(original, review.bearingEncoding))
      else if (['bearingDeg', 'bearingMin', 'bearingSec'].every(key => typeof raw[key] === 'number' && Number.isFinite(raw[key]))) {
        bearing = String(declaredCaptureBearing(`${String(raw.bearingDeg)} ${String(raw.bearingMin)} ${String(raw.bearingSec)}`, 'separated_dms'))
      }
    }
    if (type === 'traverse') return { ...base, station: text('station', 'station', 'pointName'), bearing,
      slopeDist: text('slopeDist', 'slopeDistance'), hclDeg: text('hclDeg'), hclMin: text('hclMin'), hclSec: text('hclSec'),
      hcrDeg: text('hcrDeg'), hcrMin: text('hcrMin'), hcrSec: text('hcrSec'),
      vaDeg: text('vaDeg', 'verticalAngle'), vaMin: text('vaMin'), vaSec: text('vaSec'),
      ih: text('ih', 'instrumentHeight'), th: text('th', 'targetHeight', 'rodHeight') }
    return { ...base, pointId: text('pointId', 'pointId', 'pointName', 'station'), bearing,
      slopeDistance: text('slopeDistance', 'slopeDistance'), verticalAngle: text('verticalAngle', 'verticalAngle'),
      instrumentHeight: text('instrumentHeight', 'instrumentHeight'), targetHeight: text('targetHeight', 'targetHeight', 'rodHeight') }
  })
  const sourceImport = sourceImportSchema.parse({ version: 1, authority: 'raw_capture_draft', fieldVerified: false,
    reviewedBy: review.actorId, reviewedAt: review.reviewedAt, requestHash: review.requestHash, bearingEncoding: review.bearingEncoding,
    sources: sources.map((source, index) => ({ ...source, rowId: rows[index].id, initialRow: rows[index] })),
  })
  const data = type === 'leveling' ? { method: 'rise_and_fall', openingRL: '', closingRL: '', distanceKm: '', rows }
    : type === 'traverse' ? { mode: 'open', startStation: '', startE: '', startN: '', closeE: '', closeN: '', rows }
      : { activeSetupId: 'capture-setup', setups: [{ id: 'capture-setup', station: { name: '', e: '', n: '', z: '' }, rows }] }
  return JSON.parse(JSON.stringify({ ...data, sourceImport })) as Record<string, unknown>
}
