import { 
  bowditchAdjustment, 
  transitAdjustment,
  forwardTraverse, 
  ForwardTraverseInput, 
  TraverseInput,
  TRAVERSE_PRECISION_STANDARDS,
  evaluateTraverseClosure,
  type SurveyTypeKey
} from '@/lib/engine/traverse';
import { coordinateArea } from '@/lib/engine/area';
import { NamedPoint2D } from '@/lib/engine/types';
import { FieldBookRow } from '@/types/fieldbook';

export type TraverseAdjustmentMethod = 'bowditch' | 'transit';

export interface TraverseComputeInput {
  rows: FieldBookRow[];
  startPoint: NamedPoint2D;
  closingPoint?: NamedPoint2D;
  surveyType?: SurveyTypeKey;
  method?: TraverseAdjustmentMethod;
}

export interface TraverseComputationResult {
  adjustedStations: ReturnType<typeof bowditchAdjustment>;
  linearMisclosure: number;
  angularMisclosure: number;
  precisionRatio: number;
  precisionMinimum: number;
  passesQA: boolean;
  method: TraverseAdjustmentMethod;
  surveyType: SurveyTypeKey;
  adjustedAreaM2: number;
}

function parseBearingDMS(bearingStr: string): number {
  if (!bearingStr) return 0;
  const match = bearingStr.match(/(\d+)[°](\d+)['"]?/);
  if (!match) return Number(bearingStr) || 0;
  const deg = Number(match[1]);
  const min = Number(match[2]);
  return deg + min / 60;
}

function parseTraverseRows(rows: FieldBookRow[]): {
  stations: string[];
  distances: number[];
  bearings: number[];
  points: NamedPoint2D[];
} {
  const stations: string[] = [];
  const distances: number[] = [];
  const bearings: number[] = [];
  const points: NamedPoint2D[] = [];

  for (const row of rows) {
    if (row.station && row.distance && row.bearing) {
      const station = String(row.station);
      const distance = Number(row.distance);
      const bearing = parseBearingDMS(String(row.bearing));

      if (station && distance > 0 && bearing >= 0) {
        stations.push(station);
        distances.push(distance);
        bearings.push(bearing);
        points.push({ name: station, easting: 0, northing: 0 });
      }
    }
  }

  return { stations, distances, bearings, points };
}

export function runTraverseComputation(input: TraverseComputeInput): TraverseComputationResult {
  const { stations, distances, bearings, points } = parseTraverseRows(input.rows);

  if (points.length === 0) {
    throw new Error('No valid traverse legs found in field book');
  }

  const traverseInput: TraverseInput = {
    points: [input.startPoint, ...points],
    distances,
    bearings,
    closingPoint: input.closingPoint,
  };

  const surveyType = input.surveyType || 'cadastral';
  const method = input.method || 'bowditch';

  const adjusted = method === 'transit'
    ? transitAdjustment(traverseInput)
    : bowditchAdjustment(traverseInput);

  const closure = evaluateTraverseClosure(
    adjusted.linearError,
    adjusted.totalDistance,
    surveyType
  );

  const coordinates = adjusted.legs.map(leg => ({
    easting: leg.adjEasting,
    northing: leg.adjNorthing
  }));

  const areaResult = coordinateArea(coordinates);

  // FIXED: Previous version hardcoded angularMisclosure to 0.
  // Angular misclosure = Σobserved angles − theoretical sum
  // For a closed traverse (polygon): theoretical = (2n − 4) × 90° where n = number of stations
  // For a link traverse: theoretical = forward azimuth − back azimuth ± n×180°
  // Source: Basak, Chapter 10; Ghilani & Wolf, Chapter 12
  const n = bearings.length + 1  // number of stations
  const theoreticalSum = (2 * n - 4) * 90  // degrees, for closed polygon
  const observedSum = bearings.reduce((s, b) => s + b, 0)
  // Note: for a link traverse this formula differs; we use polygon formula as default
  const angularMisclosureSec = input.closingPoint
    ? (observedSum - theoreticalSum) * 3600  // convert degrees to seconds
    : 0  // cannot compute for open traverse without known azimuths

  return {
    adjustedStations: adjusted,
    linearMisclosure: adjusted.linearError,
    angularMisclosure: angularMisclosureSec,
    precisionRatio: closure.ratio,
    precisionMinimum: closure.minimum,
    passesQA: closure.passes,
    method: method,
    surveyType: surveyType,
    adjustedAreaM2: areaResult.areaSqm
  };
}

export function runForwardTraverse(input: TraverseComputeInput): ReturnType<typeof forwardTraverse> {
  const { stations, distances, bearings, points } = parseTraverseRows(input.rows);

  const forwardInput: ForwardTraverseInput = {
    start: input.startPoint,
    stations,
    distances,
    bearings,
  };

  return forwardTraverse(forwardInput);
}

export function runBowditchAdjustment(input: TraverseComputeInput): ReturnType<typeof bowditchAdjustment> {
  const { stations, distances, bearings, points } = parseTraverseRows(input.rows);

  if (points.length === 0) {
    throw new Error('No valid traverse legs found in field book');
  }

  const traverseInput: TraverseInput = {
    points: [input.startPoint, ...points],
    distances,
    bearings,
    closingPoint: input.closingPoint,
  };

  return bowditchAdjustment(traverseInput);
}

export function getTraversePrecisionStatus(result: ReturnType<typeof bowditchAdjustment>): {
  status: 'excellent' | 'good' | 'acceptable' | 'poor';
  message: string;
  ratio: string;
} {
  const ratio = result.precisionRatio;
  // FIXED: Previous version `1/${Math.round(1/ratio)}` displayed "1/0" because
  // ratio is already a large number (e.g. 5000 for 1:5000), so 1/ratio ≈ 0.
  // Correct format: "1:5000" using the ratio directly.
  const ratioStr = `1:${Math.round(ratio)}`;

  const grade = result.precisionGrade;
  const errorMm = result.linearError * 1000;

  let message = '';
  switch (grade) {
    case 'excellent':
      message = `Excellent closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm)`;
      break;
    case 'good':
      message = `Good closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm)`;
      break;
    case 'acceptable':
      message = `Acceptable closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm)`;
      break;
    case 'poor':
      message = `Poor closure: ${ratioStr} (error ${errorMm.toFixed(1)}mm) - needs re-observation`;
      break;
  }

  return { status: grade, message, ratio: ratioStr };
}