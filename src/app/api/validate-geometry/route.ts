import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Source: RDM 1.3 Kenya August 2023
const GRADIENTS: Record<string, { desirable: number; absolute: number; minimum: number }> = {
  flat:        { desirable: 3, absolute: 5, minimum: 0.5 },
  rolling:     { desirable: 4, absolute: 6, minimum: 0.5 },
  mountainous: { desirable: 6, absolute: 8, minimum: 0.5 },
  escarpment:  { desirable: 6, absolute: 8, minimum: 0.5 },
  urban:       { desirable: 5, absolute: 7, minimum: 0.5 },
}

const MIN_RADII: Record<number, number> = {
  120: 665, 110: 530, 100: 415, 90: 320, 85: 270,
  80: 240, 70: 170, 65: 140, 60: 120, 50: 80, 40: 45, 30: 24,
}

const SSD: Record<number, number> = {
  120: 285, 110: 245, 100: 205, 90: 170, 80: 140,
  70: 110, 60: 85, 50: 70, 40: 50, 30: 35,
}

const K_CREST: Record<number, number> = {
  120: 140, 110: 110, 100: 85, 90: 65, 80: 50,
  70: 35, 60: 25, 50: 15, 40: 9, 30: 5,
}

const schema = z.object({
  radius: z.number(),
  designSpeed: z.number().optional().default(80),
  terrain: z.string().optional().default('flat'),
  gradient: z.number().optional().default(0),
  ssd: z.number().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ status: 'ERROR', flags: ['Invalid request body'], details: {} }, { status: 400 })
  }

  const { radius, designSpeed, terrain, gradient, ssd } = parsed.data

  const flags: string[] = []
  let status = 'GREEN'
  const g = GRADIENTS[terrain.toLowerCase()] ?? GRADIENTS['flat']

  if (gradient < g.minimum) {
    status = 'YELLOW'
    flags.push(`Gradient ${gradient}% below minimum ${g.minimum}% — drainage risk (RDM 1.3)`)
  } else if (gradient > g.absolute) {
    status = 'RED'
    flags.push(
      `DEPARTURE FROM STANDARD: Gradient ${gradient}% exceeds absolute maximum ${g.absolute}% for ${terrain} terrain. Written approval from Chief Engineer required — RDM 1.3 §1.6.2`
    )
  } else if (gradient > g.desirable) {
    status = 'YELLOW'
    flags.push(
      `Gradient ${gradient}% exceeds desirable ${g.desirable}% (absolute max ${g.absolute}%) — RDM 1.3`
    )
  }

  const minR = MIN_RADII[designSpeed] ?? 9999
  if (radius < minR) {
    status = 'RED'
    flags.push(
      `DEPARTURE FROM STANDARD: Radius ${radius}m below minimum ${minR}m at ${designSpeed}km/h — RDM 1.3 §1.6.2`
    )
  }

  const reqSSD = SSD[designSpeed] ?? 0
  if (ssd !== undefined && ssd < reqSSD) {
    status = 'RED'
    flags.push(
      `DEPARTURE FROM STANDARD: SSD ${ssd}m insufficient — minimum ${reqSSD}m at ${designSpeed}km/h — RDM 1.3`
    )
  }

  return NextResponse.json({
    status,
    flags,
    details: {
      max_gradient_desirable: g.desirable,
      max_gradient_absolute: g.absolute,
      min_gradient: g.minimum,
      min_radius: minR,
      required_ssd: reqSSD,
      k_crest: K_CREST[designSpeed] ?? 'N/A',
    },
  })
}
