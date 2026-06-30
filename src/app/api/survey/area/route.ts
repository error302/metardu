/**
 * Area Computation API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeAreaByShoelace, computeAreaByDMD, convertArea, type AreaResult } from '@/lib/survey/area/computation';
import type { Point } from '@/lib/survey/cogo/engine';
import { AreaOperationSchema } from '@/lib/validation/apiSchemas';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = AreaOperationSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const body = parsed.data
    switch (body.operation) {
      case 'shoelace': {
        const result = computeAreaByShoelace(body.points as Point[])
        return NextResponse.json(result)
      }
      case 'dmd': {
        const result = computeAreaByDMD(body.bearings, body.distances)
        return NextResponse.json(result)
      }
      case 'convert': {
        const result = convertArea(body.value, body.from as Parameters<typeof convertArea>[1], body.to as Parameters<typeof convertArea>[2])
        return NextResponse.json({ value: result, from: body.from, to: body.to })
      }
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${(body as { operation?: string }).operation}. Use: shoelace, dmd, convert` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Area API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Computation failed' },
      { status: 500 }
    );
  }
}
