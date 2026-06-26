/**
 * COGO API Route
 * 
 * Coordinate geometry computations: inverse, forward, intersections.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  computeBearingAndDistance,
  computePoint,
  lineLineIntersection,
  lineCircleIntersection,
  circleCircleIntersection,
  type Point,
} from '@/lib/survey/cogo/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation } = body;
    
    switch (operation) {
      case 'inverse': {
        const { from, to } = body as { from: Point; to: Point };
        const result = computeBearingAndDistance(from, to);
        return NextResponse.json(result);
      }
      
      case 'forward': {
        const { from, bearing, distance } = body as { from: Point; bearing: number; distance: number };
        const result = computePoint(from, bearing, distance);
        return NextResponse.json(result);
      }
      
      case 'lineLineIntersection': {
        const { point1, bearing1, point2, bearing2 } = body as {
          point1: Point; bearing1: number; point2: Point; bearing2: number;
        };
        const result = lineLineIntersection(point1, bearing1, point2, bearing2);
        return NextResponse.json(result);
      }
      
      case 'lineCircleIntersection': {
        const { linePoint, bearing, circleCenter, radius } = body as {
          linePoint: Point; bearing: number; circleCenter: Point; radius: number;
        };
        const result = lineCircleIntersection(linePoint, bearing, circleCenter, radius);
        return NextResponse.json(result);
      }
      
      case 'circleCircleIntersection': {
        const { center1, radius1, center2, radius2 } = body as {
          center1: Point; radius1: number; center2: Point; radius2: number;
        };
        const result = circleCircleIntersection(center1, radius1, center2, radius2);
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}. Use: inverse, forward, lineLineIntersection, lineCircleIntersection, circleCircleIntersection` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('COGO API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Computation failed' },
      { status: 500 }
    );
  }
}
