import { DMS, SurveyResult, ok, err } from "./types";

// ─── ANGLE UTILITIES ──────────────────────────────────────────────────────────
// All internal calculations use RADIANS.
// All inputs/outputs exposed to users use DECIMAL DEGREES.
// DMS is a display format only — convert in, convert out.

export const toRadians = (degrees: number): number =>
  degrees * (Math.PI / 180);

export const toDegrees = (radians: number): number =>
  radians * (180 / Math.PI);

/**
 * Normalize any angle (degrees) into the range [0, 360).
 */
export const normalizeBearing = (degrees: number): number => {
  let d = degrees % 360;
  if (d < 0) d += 360;
  return d;
};

/**
 * Convert decimal degrees → DMS object.
 * Works for both latitude and longitude.
 *
 * @example decimalToDMS(-1.5) → { degrees: 1, minutes: 30, seconds: 0.0 }
 */
export function decimalToDMS(decimal: number): DMS {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFull = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  return { degrees, minutes, seconds };
}

/**
 * Convert DMS → decimal degrees.
 * Pass negative degrees OR set hemisphere to 'S'/'W' to get a negative result.
 */
export function dmsToDecimal(dms: DMS): number {
  const { degrees, minutes, seconds, hemisphere } = dms;
  const abs = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const negative =
    degrees < 0 || hemisphere === "S" || hemisphere === "W";
  return negative ? -abs : abs;
}

/**
 * Format a decimal-degree bearing as a DMS string.
 *
 * @example bearingToString(45.5) → "045° 30' 00.000\""
 */
export function bearingToString(decimalDegrees: number): string {
  const normalized = normalizeBearing(decimalDegrees);
  const { degrees, minutes, seconds } = decimalToDMS(normalized);
  return (
    String(degrees).padStart(3, "0") +
    "° " +
    String(minutes).padStart(2, "0") +
    "' " +
    seconds.toFixed(3).padStart(6, "0") +
    '"'
  );
}

/**
 * Parse a DMS string like "045°30'00\"" or "45 30 00" into decimal degrees.
 * Returns an error result if the string cannot be parsed.
 */
export function parseDMSString(input: string): SurveyResult<number> {
  // Strip degree/minute/second symbols, then split on whitespace or delimiters
  const cleaned = input
    .replace(/[°'"]/g, " ")
    .replace(/[NSEW]/gi, "")
    .trim();
  const parts = cleaned.split(/\s+/).map(Number);

  if (parts.some(isNaN) || parts.length < 1 || parts.length > 3) {
    return err(`Cannot parse DMS string: "${input}"`);
  }

  const [d = 0, m = 0, s = 0] = parts;

  if (m < 0 || m >= 60) return err("Minutes must be 0–59");
  if (s < 0 || s >= 60) return err("Seconds must be 0–60");

  // Preserve sign from degrees
  const sign = input.trim().startsWith("-") ? -1 : 1;
  const hemisphere = /[SW]/i.test(input) ? -1 : 1;
  return ok(sign * hemisphere * (Math.abs(d) + m / 60 + s / 3600));
}
