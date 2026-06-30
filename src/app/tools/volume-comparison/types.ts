import type { SpotHeight } from '@/lib/engine/contours';
import type { SurfacePoint } from '@/lib/engine/volume';

export interface BBox {
  minE: number; maxE: number; minN: number; maxN: number;
}

export interface GridCell {
  easting: number;
  northing: number;
  diff: number;
  type: 'cut' | 'fill' | 'none';
}

export type TabId = 'surveyA' | 'surveyB' | 'analysis' | 'export';
export type Method = 'tin' | 'idw';
export type SurveyId = 'A' | 'B';

// Re-export for convenience
export type { SpotHeight, SurfacePoint };
