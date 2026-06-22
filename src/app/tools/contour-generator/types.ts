// Shared types for the contour generator tool.
//
// Extracted from src/app/tools/contour-generator/page.tsx so that the
// generator functions, helper utilities and sub-components can be split
// into their own files without re-declaring these types.

import type { SpotHeight } from '@/lib/engine/contours';

export type TabId = 'import' | 'settings' | 'map' | 'export';

export interface ParsedPoint {
  name: string;
  easting: number;
  northing: number;
  elevation: number;
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ColMapping {
  name: number;
  easting: number;
  northing: number;
  elevation: number;
}

export interface Bounds {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
  minZ: number;
  maxZ: number;
}

export interface VolumeResult {
  cut: number;
  fill: number;
  net: number;
}

export interface ImportStats {
  delimiter: string;
  hasHeader: boolean;
}

export type { SpotHeight };
