import { riseAndFall, heightOfCollimation, LevelingInput } from '@/lib/engine/leveling';
import { LevelingResult } from '@/lib/engine/types';
import { FieldBookRow } from '@/types/fieldbook';

export interface LevelingComputeInput {
  rows: FieldBookRow[];
  openingRL: number;
  closingRL?: number;
  /** Surveyed route length in kilometres. If omitted, chainage span is used when available. */
  distanceKm?: number;
  method: 'rise_and_fall' | 'height_of_collimation';
}

function parseFieldBookRows(rows: FieldBookRow[]): LevelingInput['readings'] {
  const numeric = (value: unknown, station: string, col: string): number | undefined => {
    if (value === '' || value === null || value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid non-numeric value "${value}" at station "${station}", column "${col}"`);
    }
    return parsed;
  };

  return rows
    .filter((r) => r.station && (r.bs !== '' && r.bs !== null && r.bs !== undefined || r.is !== '' && r.is !== null && r.is !== undefined || r.fs !== '' && r.fs !== null && r.fs !== undefined))
    .map((r) => {
      const station = String(r.station || '');
      return {
        station,
        bs: numeric(r.bs, station, 'BS'),
        is: numeric(r.is, station, 'IS'),
        fs: numeric(r.fs, station, 'FS'),
      };
    });
}

export function runLevelingComputation(input: LevelingComputeInput): LevelingResult {
  const readings = parseFieldBookRows(input.rows);
  const chainages = input.rows
    .filter((row) => row.chainage !== undefined && row.chainage !== null && String(row.chainage).trim() !== '')
    .map((row) => Number(row.chainage))
    .filter((value) => Number.isFinite(value));
  const inferredDistanceKm = chainages.length >= 2
    ? Math.abs(Math.max(...chainages) - Math.min(...chainages)) / 1000
    : undefined;
  const distanceKm = Number.isFinite(input.distanceKm) && (input.distanceKm as number) > 0
    ? input.distanceKm as number
    : inferredDistanceKm;

  const engineInput: LevelingInput = {
    readings,
    openingRL: input.openingRL,
    closingRL: input.closingRL,
    method: input.method,
    ...(distanceKm !== undefined && distanceKm > 0 ? { distanceKm } : {}),
  };

  if (input.method === 'height_of_collimation') {
    return heightOfCollimation(engineInput);
  }
  return riseAndFall(engineInput);
}

export function getLevelingClosureStatus(result: LevelingResult): {
  status: 'acceptable' | 'excessive' | 'unknown';
  message: string;
  misclosureMm: number;
  allowableMm: number;
} {
  if (!result.closingRLProvided || result.allowableMisclosure === undefined || result.allowableMisclosure === 0) {
    return { status: 'unknown', message: !result.closingRLProvided ? 'No closing benchmark provided' : 'Survey route distance required for allowable misclosure', misclosureMm: 0, allowableMm: 0 };
  }

  const misclosureMm = Math.abs(result.misclosure) * 1000;
  const allowableMm = result.allowableMisclosure * 1000;

  if (result.isAcceptable) {
    return { status: 'acceptable', message: `Closure within tolerance (${misclosureMm.toFixed(1)}mm / ${allowableMm.toFixed(1)}mm)`, misclosureMm, allowableMm };
  }

  return { status: 'excessive', message: `Closure exceeds tolerance (${misclosureMm.toFixed(1)}mm / ${allowableMm.toFixed(1)}mm)`, misclosureMm, allowableMm };
}
