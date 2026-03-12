// ─── SHARED TYPES ─────────────────────────────────────────────────────────────

export interface Point2D {
  easting: number;
  northing: number;
}

export interface Point3D extends Point2D {
  elevation: number;
}

export interface NamedPoint2D extends Point2D {
  name: string;
}

export interface NamedPoint3D extends Point3D {
  name: string;
}

export interface DMS {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere?: string;
}

export interface LatLon {
  latitude: number;   // decimal degrees, negative = south
  longitude: number;  // decimal degrees, negative = west
}

export interface UTMCoord {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: "N" | "S";
}

// ─── RESULT WRAPPERS ──────────────────────────────────────────────────────────
// Every calculation returns a typed result so callers never get raw numbers
// and can always inspect what was computed.

export type SurveyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function ok<T>(value: T): SurveyResult<T> {
  return { ok: true, value };
}

export function err<T>(error: string): SurveyResult<T> {
  return { ok: false, error };
}
