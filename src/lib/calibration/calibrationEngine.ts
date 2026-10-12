export interface CalibrationRecord {
  id: string
  equipmentId: string
  equipmentName: string
  equipmentType: 'total_station' | 'gnss_receiver' | 'digital_level' | 'tape' | 'prism'
  calibrationType: 'collimation' | 'edm_baseline' | 'tilt_sensor' | 'bubble' | 'optical_plummet' | 'full_service'
  date: string                   // ISO date
  nextDueDate: string            // ISO date
  performedBy: string            // Technician/lab name
  results: CalibrationResults
  certificate?: string           // Certificate number
  status: 'current' | 'due_soon' | 'overdue' | 'expired'
  notes?: string
}

export interface CalibrationResults {
  /** Collimation check: 2C error in seconds */
  twoC_error?: number
  /** EDM baseline comparison: offset in mm */
  edm_offset_mm?: number
  /** EDM scale factor (ppm) */
  edm_scale_ppm?: number
  /** Tilt sensor: residual tilt in seconds */
  tilt_residual?: number
  /** Circular bubble offset in divisions */
  bubble_offset?: number
  /** Overall pass/fail */
  passed: boolean
  /** Tolerance used */
  tolerance?: string
}

export interface CalibrationSummary {
  current: number;
  dueSoon: number;
  overdue: number;
  expired: number;
}

/**
 * Returns count of current, due soon (within 30 days), overdue, and expired instruments
 * @param records Array of CalibrationRecord
 * @returns CalibrationSummary object
 */
export function checkCalibrationStatus(records: CalibrationRecord[]): CalibrationSummary {
  const summary: CalibrationSummary = {
    current: 0,
    dueSoon: 0,
    overdue: 0,
    expired: 0
  };

  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const record of records) {
    const dueDate = new Date(record.nextDueDate);
    const diff = dueDate.getTime() - now.getTime();

    if (diff < 0) {
      if (diff < -thirtyDaysMs) {
        summary.expired++;
      } else {
        summary.overdue++;
      }
    } else if (diff <= thirtyDaysMs) {
      summary.dueSoon++;
    } else {
      summary.current++;
    }
  }

  return summary;
}

/**
 * Compute 2C collimation error from face-left and face-right horizontal circle readings
 * ISO 17123-3 formula: 2C = FL - (FR ± 180°)
 * @param faceLHzDeg Face Left horizontal reading in degrees
 * @param faceRHzDeg Face Right horizontal reading in degrees
 * @returns Object containing the 2C error in seconds and the adjusted reading in degrees
 */
export function computeCollimation(faceLHzDeg: number, faceRHzDeg: number): { twoC: number; adjusted: number } {
  // Normalize angles 0-360
  const fl = (faceLHzDeg % 360 + 360) % 360;
  const fr = (faceRHzDeg % 360 + 360) % 360;
  
  // Find the appropriate ± 180
  const frOpposite = (fr >= 180) ? fr - 180 : fr + 180;
  
  // Difference in degrees
  let diffDeg = fl - frOpposite;
  
  // Normalize difference to -180 to 180 range
  if (diffDeg > 180) diffDeg -= 360;
  if (diffDeg < -180) diffDeg += 360;
  
  const twoCSec = diffDeg * 3600;
  
  // Adjusted FL reading
  const adjusted = (fl - (diffDeg / 2) + 360) % 360;
  
  return {
    twoC: twoCSec,
    adjusted
  };
}

/**
 * Compare measured baseline legs against certified distances
 * ISO 17123-4 baseline comparison
 * @param measured Array of measured distances in meters
 * @param certified Array of certified distances in meters
 * @returns Object containing offsets in mm, mean offset in mm, and scale factor in ppm
 */
export function computeEDMBaseline(measured: number[], certified: number[]): { offsets: number[]; meanOffset: number; scale: number } {
  if (measured.length === 0 || measured.length !== certified.length) {
    throw new Error('Arrays must be of equal, non-zero length');
  }

  const offsets = measured.map((m, i) => (m - certified[i]) * 1000); // mm
  
  const meanOffset = offsets.reduce((sum, o) => sum + o, 0) / offsets.length;
  
  // Scale factor (ppm) = (Sum of measured - Sum of certified) / (Sum of certified) * 1e6
  const sumMeasured = measured.reduce((a,b) => a+b, 0);
  const sumCertified = certified.reduce((a,b) => a+b, 0);
  
  const scale = ((sumMeasured - sumCertified) / sumCertified) * 1e6;

  return {
    offsets,
    meanOffset,
    scale
  };
}
