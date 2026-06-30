// Shared types for the GCP residual validation tool.
//
// Extracted from src/app/tools/gcp-validation/page.tsx so that the
// helpers, the state hook and the per-tab components can be split into
// their own files without re-declaring these types.

export interface KnownGCP {
  id: number;
  name: string;
  easting: string;
  northing: string;
  elevation: string;
}

export interface ResidualRow {
  id: number;
  name: string;
  softwareE: number;
  softwareN: number;
  softwareZ: number;
  errorX?: number;
  errorY?: number;
  errorZ?: number;
  errorXY?: number;
  errorTotal?: number;
  reprojectionError?: number;
  source: 'agisoft' | 'pix4d';
}

export interface ValidationResult {
  name: string;
  knownE: number;
  knownN: number;
  knownZ: number;
  softwareE: number;
  softwareN: number;
  softwareZ: number;
  deltaE: number;
  deltaN: number;
  deltaZ: number;
  horizontalError: number;
  error3D: number;
  hPass: boolean;
  vPass: boolean;
  overallPass: boolean;
}

export interface ValidationSummary {
  points: ValidationResult[];
  hRMSE: number;
  vRMSE: number;
  maxHorizontal: number;
  maxVertical: number;
  max3D: number;
  hPass: boolean;
  vPass: boolean;
  pass: boolean;
  passCount: number;
  failCount: number;
  totalGCPs: number;
  matchedGCPs: number;
  unmatchedNames: string[];
}

export interface AccuracyClass {
  name: string;
  horizontal: number;
  vertical: number;
  scale: string;
}

export type ResidualFormat = 'agisoft' | 'pix4d' | 'auto';
export type TabId = 'gcp' | 'residuals' | 'results' | 'report';
