export interface ParsedSurveyData {
  points: Array<{
    easting: number;
    northing: number;
    rl: number;
    code?: string;
    description?: string;
    station?: string;
    timestamp?: Date;
  }>;
  metadata: {
    source: string;
    format: string;
    crs?: string;
    totalPoints: number;
    droneSpecific?: {
      flightDate?: string;
      gcpCount?: number;
      averageError?: number;
      // LAS/LAZ-specific fields (added 2026-07-05 to fix TS errors in
      // src/lib/importers/parsers/las.ts — the parser was emitting these
      // but the type didn't allow them).
      hasRgb?: boolean;
      hasGpsTime?: boolean;
      pointDataFormat?: number;
      recordLength?: number;
    };
  };
}

export type ParserFunction = (file: File) => Promise<ParsedSurveyData>;

export const DRONE_EXTENSIONS = ['.las', '.laz', '.csv', '.xml'] as const;
