/**
 * Slope Reduction Module
 * 
 * Converts slope distances to horizontal distances.
 * This is the most basic distance correction — every survey
 * computation pipeline starts here.
 * 
 * Two methods:
 * 1. Using vertical angle (zenith distance)
 * 2. Using height difference between endpoints
 * 
 * Reference:
 * - Schofield, W. (2001) "Engineering Surveying" 5th edition
 */

// ─── Types ───────────────────────────────────────────────────────

export interface SlopeReductionByAngle {
  /** Slope distance in meters */
  slopeDistance: number;
  /** Vertical angle (zenith distance) in decimal degrees
   *  90° = horizontal, >90° = upward, <90° = downward */
  verticalAngle: number;
}

export interface SlopeReductionByHeight {
  /** Slope distance in meters */
  slopeDistance: number;
  /** Height difference between endpoints (meters)
   *  Positive = target higher than instrument */
  heightDifference: number;
}

export interface SlopeReductionResult {
  /** Slope distance (meters) */
  slopeDistance: number;
  /** Horizontal distance (meters) */
  horizontalDistance: number;
  /** Vertical component (meters) */
  verticalComponent: number;
  /** Reduction amount (meters) */
  reduction: number;
  /** Method used */
  method: 'vertical_angle' | 'height_difference';
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Reduce slope distance to horizontal using vertical angle.
 * 
 * HD = SD × sin(VA)
 * VD = SD × cos(VA)
 * 
 * Where VA is the zenith distance (90° = horizontal).
 * 
 * @param input - Slope distance and vertical angle
 * @returns Reduction result
 */
export function reduceSlopeByAngle(input: SlopeReductionByAngle): SlopeReductionResult {
  const { slopeDistance, verticalAngle } = input;
  
  if (slopeDistance <= 0) {
    throw new Error(`Slope distance must be positive, got ${slopeDistance}`);
  }

  // Pure horizontal sightline (0° elevation angle or 90° zenith angle)
  if (verticalAngle === 0 || verticalAngle === 90) {
    return {
      slopeDistance,
      horizontalDistance: slopeDistance,
      verticalComponent: 0,
      reduction: 0,
      method: 'vertical_angle',
    };
  }

  // Handle zenith angle (0 < VA < 180)
  // or elevation angle (-90 < VA < 90)
  let vaZenith = verticalAngle;
  if (verticalAngle > -90 && verticalAngle < 90 && Math.abs(verticalAngle - 90) > 45) {
    // Elevation angle (e.g. +2.5° or -1.8°): zenith = 90° - elevation
    vaZenith = 90 - verticalAngle;
  }

  if (vaZenith <= 0 || vaZenith >= 180) {
    throw new Error(`Vertical angle must be 0-180°, got ${verticalAngle}`);
  }
  
  const vaRad = vaZenith * Math.PI / 180;
  
  const horizontalDistance = slopeDistance * Math.sin(vaRad);
  const verticalComponent = slopeDistance * Math.cos(vaRad);
  const reduction = slopeDistance - horizontalDistance;
  
  return {
    slopeDistance,
    horizontalDistance,
    verticalComponent,
    reduction,
    method: 'vertical_angle',
  };
}

/**
 * Reduce slope distance to horizontal using height difference.
 * 
 * HD = √(SD² - ΔH²)
 * 
 * @param input - Slope distance and height difference
 * @returns Reduction result
 */
export function reduceSlopeByHeight(input: SlopeReductionByHeight): SlopeReductionResult {
  const { slopeDistance, heightDifference } = input;
  
  if (slopeDistance <= 0) {
    throw new Error(`Slope distance must be positive, got ${slopeDistance}`);
  }
  
  const hdSquared = slopeDistance * slopeDistance - heightDifference * heightDifference;
  
  if (hdSquared < 0) {
    throw new Error(
      `Height difference (${heightDifference}m) exceeds slope distance (${slopeDistance}m) — check values`
    );
  }
  
  const horizontalDistance = Math.sqrt(hdSquared);
  const reduction = slopeDistance - horizontalDistance;
  
  return {
    slopeDistance,
    horizontalDistance,
    verticalComponent: heightDifference,
    reduction,
    method: 'height_difference',
  };
}

/**
 * Quick slope reduction — returns just the horizontal distance.
 * Uses vertical angle method.
 */
export function quickSlopeReduction(
  slopeDistance: number,
  verticalAngle: number
): number {
  return reduceSlopeByAngle({ slopeDistance, verticalAngle }).horizontalDistance;
}
