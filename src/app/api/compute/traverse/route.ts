import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  bowditchAdjustment, 
  transitAdjustment,
  forwardTraverse, 
  TRAVERSE_PRECISION_STANDARDS,
  evaluateTraverseClosure,
  angularClosureTolerance,
  type SurveyTypeKey,
  type ForwardTraverseInput,
  type TraverseInput,
} from '@/lib/engine/traverse';
import { coordinateArea } from '@/lib/engine/area';
import { apiSuccess, apiError } from '@/lib/api/response';

const traverseSchema = z.object({
  task: z.enum(['forward', 'adjust']),
  method: z.enum(['bowditch', 'transit']).default('bowditch'),
  surveyType: z.string().default('cadastral'),
  startPoint: z.object({
    name: z.string(),
    easting: z.number(),
    northing: z.number(),
  }),
  legs: z.array(
    z.object({
      station: z.string(),
      bearing: z.number().min(0).max(360),
      distance: z.number().positive(),
    })
  ),
  closingPoint: z
    .object({
      easting: z.number(),
      northing: z.number(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = traverseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      apiError('Invalid traverse request.', { issues: parsed.error.issues }),
      { status: 400 }
    );
  }

  const { task, method, surveyType, startPoint, legs, closingPoint } = parsed.data;

  const points = legs.map((l) => ({ name: l.station, easting: 0, northing: 0 }));
  const distances = legs.map((l) => l.distance);
  const bearings = legs.map((l) => l.bearing);

  if (task === 'forward') {
    const result = forwardTraverse({
      start: startPoint,
      stations: legs.map((l) => l.station),
      distances,
      bearings,
    } as ForwardTraverseInput);

    return NextResponse.json(
      apiSuccess({
        task: 'traverse_forward',
        legs: result.legs,
        totalDistance: result.totalDistance,
        endPoint: result.end,
      })
    );
  }

  const traverseInput = {
    points: [startPoint, ...points],
    distances,
    bearings,
    closingPoint,
  } as TraverseInput;

  const adjusted = method === 'transit'
    ? transitAdjustment(traverseInput)
    : bowditchAdjustment(traverseInput);

  const validSurveyTypes = Object.keys(TRAVERSE_PRECISION_STANDARDS) as string[];
  const validatedSurveyType = validSurveyTypes.includes(surveyType) 
    ? surveyType as SurveyTypeKey 
    : 'cadastral';

  const closure = evaluateTraverseClosure(
    adjusted.linearError,
    adjusted.totalDistance,
    validatedSurveyType
  );

  const coordinates = adjusted.legs.map(leg => ({
    easting: leg.adjEasting,
    northing: leg.adjNorthing
  }));

  const areaResult = coordinateArea(coordinates);

  const errorMm = adjusted.linearError * 1000;
  const ratioStr = `1:${Math.round(closure.ratio)}`;

  return NextResponse.json(
    apiSuccess({
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
      angularToleranceSeconds: angularClosureTolerance(legs.length + 1),
      message: closure.passes
        ? `${adjusted.precisionGrade.charAt(0).toUpperCase() + adjusted.precisionGrade.slice(1)} closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm) - PASSES QA`
        : `Insufficient precision: ${ratioStr} (error ${errorMm.toFixed(1)}mm) - BELOW ${surveyType} MINIMUM 1:${closure.minimum}`,
    })
  );
}

export async function GET() {
  return NextResponse.json(
    apiSuccess({
      endpoint: '/api/compute/traverse',
      description: 'Run traverse computations: forward traverse and adjustment (Bowditch or Transit)',
      tasks: ['forward', 'adjust'],
      methods: ['bowditch', 'transit'],
      surveyTypes: Object.keys(TRAVERSE_PRECISION_STANDARDS),
      precisionStandards: TRAVERSE_PRECISION_STANDARDS,
    })
  );
}