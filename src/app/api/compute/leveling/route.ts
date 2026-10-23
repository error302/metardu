export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'
import type { LevelingInput } from '@/lib/engine/leveling'
import { getLevelingClosureStatus } from '@/lib/compute/levelingRunner'

const levelingSchema = z.object({
  surveyType: z.enum(['engineering', 'mining', 'monitoring']),
  method: z.enum(['rise_and_fall', 'height_of_collimation']),
  openingRL: z.number().finite(),
  closingRL: z.number().finite().optional(),
  distanceKm: z.number().finite().positive().optional(),
  readings: z.array(z.object({
    station: z.string().min(1).max(200).refine(value => value.trim().length > 0, 'Station name is required'),
    bs: z.number().finite().optional(),
    is: z.number().finite().optional(),
    fs: z.number().finite().optional(),
  }).refine(row => row.bs !== undefined || row.is !== undefined || row.fs !== undefined, 'Each row needs a reading')).min(1).max(10000),
}).superRefine((input, ctx) => {
  const first = input.readings[0]
  if (first && (first.bs === undefined || first.is !== undefined || first.fs !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['readings', 0], message: 'Start with a backsight on the opening benchmark' })
  }
})

export const POST = apiHandler(
  { auth: true, schema: levelingSchema, rateLimit: { max: 50, windowMs: 60000 } },
  async (req, ctx) => {
    const { method, openingRL, closingRL, distanceKm, readings } = ctx.body as z.infer<typeof levelingSchema>

    const { riseAndFall, heightOfCollimation } = await import('@/lib/engine/leveling')

    const input: LevelingInput = {
      readings,
      openingRL,
      closingRL,
      method,
      distanceKm,
    }

    const result = method === 'height_of_collimation'
      ? heightOfCollimation(input)
      : riseAndFall(input)

    if (result.readings.some(row => Object.values(row).some(value => typeof value === 'number' && !Number.isFinite(value)))
      || !Number.isFinite(result.misclosure) || !Number.isFinite(result.misclosure * 1000)
      || result.allowableMisclosure !== undefined && !Number.isFinite(result.allowableMisclosure * 1000)) {
      return NextResponse.json({ code: 'NONFINITE_LEVELING_RESULT', error: 'The result is not finite. Review the observation magnitudes.' }, { status: 422 })
    }
    const closure = getLevelingClosureStatus(result)

    return NextResponse.json({
      task: 'leveling',
      method: result.method,
      readings: result.readings,
      misclosure: result.closingRLProvided ? result.misclosure : null,
      misclosureMm: closure.misclosureMm,
      allowableMm: closure.allowableMm,
      distanceKm: distanceKm ?? null,
      arithmeticCheck: result.arithmeticCheck,
      isAcceptable: closure.status === 'unknown' ? null : closure.status === 'acceptable',
      closureStatus: closure.status,
      message: closure.message,
      assessmentBasis: '10√K mm numerical reference; this does not establish adopted project criteria or professional approval',
      fieldVerified: false,
    })
  }
)

export const GET = apiHandler({ auth: true }, async () => {
  return NextResponse.json({
    endpoint: '/api/compute/leveling',
    description: 'Reduce leveling readings. Closure needs a closing benchmark and supplied run length; 10√K mm is a numerical reference, not professional approval.',
    optionalInputs: ['closingRL', 'distanceKm'],
    limits: { maxReadings: 10000, maxStationCharacters: 200 },
    methods: ['rise_and_fall', 'height_of_collimation'],
    surveyTypes: ['engineering', 'mining', 'monitoring'],
  })
})
