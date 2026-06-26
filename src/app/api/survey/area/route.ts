/**
 * Area Computation API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeAreaByShoelace, computeAreaByDMD, convertArea, type AreaResult } from '@/lib/survey/area/computation';
import type { Point } from '@/lib/survey/cogo/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation } = body;
    
    switch (operation) {
      case 'shoelace': {
        const { points } = body as { points: Point[] };
        const result = computeAreaByShoelace(points);
        return NextResponse.json(result);
      }
      
      case 'dmd': {
        const { bearings, distances } = body as { bearings: number[]; distances: number[] };
        const result = computeAreaByDMD(bearings, distances);
        return NextResponse.json(result);
      }
      
      case 'convert': {
        const { value, from, to } = body as { value: number; from: string; to: string };
        const result = convertArea(value, from as any, to as any);
        return NextResponse.json({ value: result, from, to });
      }
      
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}. Use: shoelace, dmd, convert` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Area API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Computation failed' },
      { status: 500 }
    );
  }
}
