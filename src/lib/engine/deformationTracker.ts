/**
 * @module deformationTracker
 *
 * Deformation & Monitoring Survey Engine
 *
 * Tracks structural displacement over time (epochs):
 * 1. Establish Epoch 0 (baseline) coordinates for monitoring points
 * 2. Import subsequent epoch measurements
 * 3. Compute 3D displacement vectors (ΔX, ΔY, ΔZ)
 * 4. Calculate total displacement and velocity
 * 5. Flag points exceeding safety thresholds
 *
 * Applications:
 * - Mining zone deformation
 * - Structural foundation monitoring
 * - Landslide-prone embankment tracking
 * - Dam and retaining wall monitoring
 *
 * Reference: "Engineering Surveying" by Schofield & Breach (Chapter 14)
 */

export interface MonitoringStation {
  id: string
  stationName: string
  baseX: number  // Epoch 0 baseline (Easting)
  baseY: number  // Epoch 0 baseline (Northing)
  baseZ: number  // Epoch 0 baseline (Elevation)
  description?: string
}

export interface EpochReading {
  id: string
  stationId: string
  epochNumber: number
  observedAt: string  // ISO date
  currentX: number
  currentY: number
  currentZ: number
  deltaX: number  // current - baseline
  deltaY: number
  deltaZ: number
  totalDisplacement: number  // 3D displacement
  horizontalDisplacement: number
  velocityMmPerWeek: number  // rate of change
  status: 'stable' | 'warning' | 'critical'
}

export interface DeformationReport {
  stations: MonitoringStation[]
  readings: EpochReading[]
  flaggedStations: EpochReading[]
  maxDisplacement: number
  maxVelocity: number
  epochCount: number
  monitoringPeriod: {
    start: string
    end: string
    durationDays: number
  }
}

// Safety thresholds (configurable)
export const DEFAULT_THRESHOLDS = {
  warningDisplacement: 5.0,    // mm — flag as warning
  criticalDisplacement: 10.0,  // mm — flag as critical
  warningVelocity: 1.0,        // mm/week
  criticalVelocity: 2.0,       // mm/week
}

/**
 * Compute displacement for a single epoch reading.
 */
export function computeDisplacement(
  station: MonitoringStation,
  currentX: number,
  currentY: number,
  currentZ: number,
  epochNumber: number,
  observedAt: string,
  previousReading?: EpochReading,
): EpochReading {
  const deltaX = currentX - station.baseX
  const deltaY = currentY - station.baseY
  const deltaZ = currentZ - station.baseZ

  const horizontalDisplacement = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
  const totalDisplacement = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ)

  // Convert to mm
  const totalDispMm = totalDisplacement * 1000

  // Compute velocity (mm per week)
  let velocityMmPerWeek = 0
  if (previousReading) {
    const prevDate = new Date(previousReading.observedAt)
    const currDate = new Date(observedAt)
    const daysDiff = (currDate.getTime() - prevDate.getTime()) / 86400000
    if (daysDiff > 0) {
      const prevDispMm = previousReading.totalDisplacement * 1000
      const dispDiff = totalDispMm - prevDispMm
      velocityMmPerWeek = (dispDiff / daysDiff) * 7
    }
  }

  // Determine status
  let status: 'stable' | 'warning' | 'critical' = 'stable'
  if (totalDispMm >= DEFAULT_THRESHOLDS.criticalDisplacement ||
      velocityMmPerWeek >= DEFAULT_THRESHOLDS.criticalVelocity) {
    status = 'critical'
  } else if (totalDispMm >= DEFAULT_THRESHOLDS.warningDisplacement ||
             velocityMmPerWeek >= DEFAULT_THRESHOLDS.warningVelocity) {
    status = 'warning'
  }

  return {
    id: crypto.randomUUID(),
    stationId: station.id,
    epochNumber,
    observedAt,
    currentX,
    currentY,
    currentZ,
    deltaX,
    deltaY,
    deltaZ,
    totalDisplacement,
    horizontalDisplacement,
    velocityMmPerWeek,
    status,
  }
}

/**
 * Generate a full deformation report from multiple epochs.
 */
export function generateDeformationReport(
  stations: MonitoringStation[],
  readings: EpochReading[],
): DeformationReport {
  const flaggedStations = readings.filter(
    r => r.status === 'warning' || r.status === 'critical'
  )

  const maxDisplacement = Math.max(0, ...readings.map(r => r.totalDisplacement * 1000))
  const maxVelocity = Math.max(0, ...readings.map(r => r.velocityMmPerWeek))

  const epochNumbers = [...new Set(readings.map(r => r.epochNumber))].sort((a, b) => a - b)
  const dates = readings.map(r => new Date(r.observedAt)).sort((a, b) => a.getTime() - b.getTime())

  return {
    stations,
    readings: readings.sort((a, b) => {
      if (a.stationId !== b.stationId) return a.stationId.localeCompare(b.stationId)
      return a.epochNumber - b.epochNumber
    }),
    flaggedStations,
    maxDisplacement,
    maxVelocity,
    epochCount: epochNumbers.length,
    monitoringPeriod: {
      start: dates[0]?.toISOString() || new Date().toISOString(),
      end: dates[dates.length - 1]?.toISOString() || new Date().toISOString(),
      durationDays: dates.length > 1
        ? (dates[dates.length - 1].getTime() - dates[0].getTime()) / 86400000
        : 0,
    },
  }
}

/**
 * Generate a deformation alert for a critical station.
 */
export function generateAlert(reading: EpochReading, station: MonitoringStation): {
  severity: 'warning' | 'critical'
  stationName: string
  message: string
  timestamp: string
} {
  const dispMm = (reading.totalDisplacement * 1000).toFixed(2)
  const velMm = reading.velocityMmPerWeek.toFixed(2)

  return {
    severity: reading.status as 'warning' | 'critical',
    stationName: station.stationName,
    message: `Station ${station.stationName} has ${reading.status === 'critical' ? 'CRITICAL' : 'WARNING'} displacement: ${dispMm}mm total, ${velMm}mm/week velocity`,
    timestamp: reading.observedAt,
  }
}
