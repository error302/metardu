export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { horizontalCurve } from '@/lib/engineering/compute'
import { verticalCurve } from '@/lib/computations/roadDesignEngine'
import { computeSpiralAlignment, stationSpiralAlignment } from '@/lib/survey/curves/spiralAlignment'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

/** Enhanced schema supporting multiple curve types */
const CurveComputeSchema = z.discriminatedUnion('curveType', [
  z.object({
    curveType: z.literal('horizontal'),
    R: z.number().finite().positive(),
    deltaDeg: z.number().finite().positive().lt(180),
    chainageStart: z.number().finite(),
    designSpeed: z.number().positive().optional(),
  }),
  z.object({
    curveType: z.literal('vertical'),
    g1: z.number().finite(), // incoming percent grade
    g2: z.number().finite(), // outgoing percent grade
    vpiChainage: z.number().finite(),
    vpiRL: z.number().finite(),
    curveLength: z.number().finite().positive().optional(),
    kValue: z.number().finite().positive().optional(), // metres per percent
    interval: z.number().finite().positive().default(20), // output sampling only
  }).strict(),
  z.object({
    curveType: z.literal('transition'),
    radius: z.number().finite().positive(),
    intersectionAngleDeg: z.number().finite().gt(-180).lt(180), // positive right, negative left
    spiralLength: z.number().finite().nonnegative(), // explicit zero is the circular limit
    piChainage: z.number().finite(),
    interval: z.number().finite().positive().default(20),
  }).strict(),
])

/** Legacy schema for backward compatibility (no curveType field) */
const LegacyCurveComputeSchema = z.object({
  R: z.number().finite().positive(),
  deltaDeg: z.number().finite().positive().lt(180),
  chainageStart: z.number().finite(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let body: unknown
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Valid JSON is required' }, { status: 400 }) }

    // An explicit calculation kind cannot be silently reinterpreted as legacy
    // horizontal geometry when that kind or its required inputs are invalid.
    const typed = typeof body === 'object' && body !== null && 'curveType' in body
    const parsed = typed ? CurveComputeSchema.safeParse(body) : LegacyCurveComputeSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    const input: z.infer<typeof CurveComputeSchema> | z.infer<typeof LegacyCurveComputeSchema> = parsed.data

    // For horizontal curve (new or legacy), use the existing horizontalCurve function
    if (!('curveType' in input) || input.curveType === 'horizontal') {
      try {
        return NextResponse.json(horizontalCurve(input))
      } catch {
        // This pure calculation has no database/provider dependency. Finite but
        // unrepresentable geometry and row-limit failures are invalid requests.
        return NextResponse.json({ error: 'Curve inputs cannot be represented safely; review radius, angle and PI station.' }, { status: 400 })
      }
    }

    // Geometry-only v2 contracts require explicit references. No radius-to-K
    // conversion, zero starting level or spiral length is inferred.
    if (input.curveType === 'vertical') {
      let geometry: ReturnType<typeof verticalCurve>
      try { geometry = verticalCurve(input) }
      catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Vertical geometry cannot be represented safely.' }, { status: 400 }) }
      return NextResponse.json({ contractVersion: 2, curveType: 'vertical', model: 'symmetric-parabolic', input, geometry,
        units: { chainage: 'm', level: 'm', grade: 'percent', k: 'm/percent' },
        reference: { kind: 'caller-stations-and-levels', verticalDatum: null, status: 'NOT_VERIFIED' },
        assessmentBasis: 'geometry-only', standardCompliance: 'NOT_ASSESSED',
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    if (input.curveType === 'transition') {
      let geometry: ReturnType<typeof computeSpiralAlignment>
      let stations: ReturnType<typeof stationSpiralAlignment>
      try { geometry = computeSpiralAlignment(input); stations = stationSpiralAlignment(geometry, input.interval) }
      catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Transition geometry cannot be represented safely.' }, { status: 400 }) }
      return NextResponse.json({ contractVersion: 2, curveType: 'transition', model: 'symmetric-clothoid-circular-clothoid', input, geometry,
        stations: stations.map(row => ({ chainage: row.chainage, distanceFromTS: row.distanceFromTS,
          x: row.easting, y: row.northing, offset: row.offset, segment: row.segment,
          deflectionFromTsTangentDeg: row.deflectionDeg,
          tangentDeflectionDeg: row.tangentBearingDeg > 180 ? row.tangentBearingDeg - 360 : row.tangentBearingDeg,
        })),
        units: { chainage: 'm', coordinate: 'm', angle: 'degree' },
        reference: { kind: 'local', origin: 'TS', xAxis: 'forward incoming tangent', yAxis: 'right of incoming tangent', horizontalCrs: null, geographicBearing: null },
        assessmentBasis: 'geometry-only', standardCompliance: 'NOT_ASSESSED',
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    return NextResponse.json({ error: 'Unknown curve type' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    logger.error('Curve compute error:', { error })
    return NextResponse.json({ error: 'Computation failed' }, { status: 500 })
  }
}
