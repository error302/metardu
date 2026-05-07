import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'

const traverseSchema = z.object({
  task: z.enum(['forward', 'adjust']),
  method: z.enum(['bowditch', 'transit']).default('bowditch'),
  surveyType: z.string().default('cadastral'),
  startPoint: z.object({
    name: z.string(),
    easting: z.number(),
    northing: z.number(),
  }),
  legs: z.array(z.object({
    station: z.string(),
    bearing: z.number().min(0).max(360),
    distance: z.number().positive(),
  })),
  closingPoint: z.object({
    easting: z.number(),
    northing: z.number(),
  }).optional(),
})

export const POST = apiHandler(
  { auth: true, schema: traverseSchema, rateLimit: { max: 50, windowMs: 60000 } },
  async (req, ctx) => {
    const { task, method, surveyType, startPoint, legs, closingPoint } = ctx.body as any

    const { forwardTraverse, bowditchAdjustment, transitAdjustment, evaluateTraverseClosure, TRAVERSE_PRECISION_STANDARDS } = await import('@/lib/engine/traverse')
    const { coordinateArea } = await import('@/lib/engine/area')

    const distances = legs.map((l: any) => l.distance)
    const bearings = legs.map((l: any) => l.bearing)

    if (task === 'forward') {
      const result = forwardTraverse({
        start: startPoint,
        stations: legs.map((l: any) => l.station),
        distances,
        bearings,
      } as any)

      return NextResponse.json({
        task: 'traverse_forward',
        legs: result.legs,
        totalDistance: result.totalDistance,
        endPoint: result.end,
      })
    }

    const points = legs.map((l: any) => ({ name: l.station, easting: 0, northing: 0 }))
    const traverseInput = {
      points: [startPoint, ...points],
      distances,
      bearings,
      closingPoint,
    }

    const adjusted = method === 'transit'
      ? transitAdjustment(traverseInput as any)
      : bowditchAdjustment(traverseInput as any)

    const validSurveyTypes = Object.keys(TRAVERSE_PRECISION_STANDARDS) as string[]
    const validatedSurveyType = validSurveyTypes.includes(surveyType) ? surveyType : 'cadastral'

    const closure = evaluateTraverseClosure(
      adjusted.linearError,
      adjusted.totalDistance,
      validatedSurveyType as any
    )

    const coordinates = adjusted.legs.map((leg: any) => ({
      easting: leg.adjEasting,
      northing: leg.adjNorthing,
    }))

    const areaResult = coordinateArea(coordinates)

    const errorMm = adjusted.linearError * 1000
    const ratioStr = `1:${Math.round(closure.ratio)}`

    return NextResponse.json({
      task: 'traverse_adjust',
      method,
      surveyType: validatedSurveyType,
      legs: adjusted.legs,
      closingErrorE: adjusted.closingErrorE,
      closingErrorN: adjusted.closingErrorN,
      linearError: adjusted.linearError,
      linearErrorMm: errorMm,
      precisionRatio: closure.ratio,
      precisionRatioStr: ratioStr,
      precisionMinimum: closure.minimum,
      passesQA: closure.passes,
      precisionGrade: adjusted.precisionGrade,
      totalDistance: adjusted.totalDistance,
      isClosed: closure.passes,
      adjustedAreaM2: areaResult.areaSqm,
      adjustedAreaHa: areaResult.areaHa,
      message: closure.passes
        ? `${adjusted.precisionGrade.charAt(0).toUpperCase() + adjusted.precisionGrade.slice(1)} closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm) - PASSES QA`
        : `Insufficient precision: ${ratioStr} (error ${errorMm.toFixed(1)}mm) - BELOW ${surveyType} MINIMUM 1:${closure.minimum}`,
    })
  }
)

export const GET = apiHandler({ auth: true }, async () => {
  return NextResponse.json({
    endpoint: '/api/compute/traverse',
    description: 'Run traverse computations: forward traverse and adjustment (Bowditch or Transit)',
    tasks: ['forward', 'adjust'],
    methods: ['bowditch', 'transit'],
  })
})