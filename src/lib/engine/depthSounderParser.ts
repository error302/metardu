/**
 * @module depthSounderParser
 *
 * Hydrographic Depth Sounder NMEA Parser
 *
 * Parses NMEA 0183 depth-related sentences from echo sounders:
 * - $SDDPT — Depth Below Transducer
 * - $SDDBT — Depth Below Transducer (feet/meters/fathoms)
 * - $SDMTW — Water Temperature
 *
 * Also handles tide correction for bathymetric surveys.
 *
 * Applications:
 * - Port surveys (Mombasa, Lamu)
 * - Dam surveys (Masinga, Thiba)
 * - Riverbed mapping
 * - Reservoir capacity surveys
 *
 * Reference: NMEA 0183 Standard v4.10
 */

export interface DepthReading {
  timestamp: Date
  latitude: number
  longitude: number
  depthBelowTransducer: number  // meters
  depthToBottom: number         // meters (corrected for transducer offset)
  waterTemperature?: number     // Celsius
  tideCorrection?: number       // meters
  reducedDepth?: number         // meters (depth - tide)
  quality: 'valid' | 'invalid' | 'no_fix'
}

export interface TideStation {
  name: string
  latitude: number
  longitude: number
  /** Tide readings as { time: ISO string, height: meters } */
  readings: Array<{ time: string; height: number }>
}

/**
 * Parse $SDDPT sentence.
 * Format: $SDDPT,<depth>,<offset>,<max_range>*<checksum>
 * Example: $SDDPT,12.5,-1.2,50.0*1A
 *
 * - depth: water depth relative to transducer (meters)
 * - offset: transducer offset from water surface (negative = below surface)
 * - max_range: maximum range of the sounder
 */
export function parseSDDPT(sentence: string): { depth: number; offset: number; maxRange: number } | null {
  // Remove $ and checksum
  const clean = sentence.replace(/^\$/, '').replace(/\*.*$/, '')
  const parts = clean.split(',')

  if (parts[0] !== 'SDDPT' && parts[0] !== 'GPDPT' && parts[0] !== 'GLDPT') return null

  const depth = parseFloat(parts[1])
  const offset = parseFloat(parts[2])
  const maxRange = parseFloat(parts[3])

  if (isNaN(depth)) return null

  return {
    depth,
    offset: isNaN(offset) ? 0 : offset,
    maxRange: isNaN(maxRange) ? 0 : maxRange,
  }
}

/**
 * Parse $SDDBT sentence.
 * Format: $SDDBT,<depth_feet>,f,<depth_meters>,M,<depth_fathoms>,F*<checksum>
 * Example: $SDDBT,41.0,f,12.5,M,6.8,F*1A
 */
export function parseSDDBT(sentence: string): { depthMeters: number; depthFeet: number; depthFathoms: number } | null {
  const clean = sentence.replace(/^\$/, '').replace(/\*.*$/, '')
  const parts = clean.split(',')

  if (parts[0] !== 'SDDBT' && parts[0] !== 'GPDBT') return null

  const depthFeet = parseFloat(parts[1])
  const depthMeters = parseFloat(parts[3])
  const depthFathoms = parseFloat(parts[5])

  // Prefer meters, fallback to feet conversion
  const finalDepth = !isNaN(depthMeters) ? depthMeters :
                     !isNaN(depthFeet) ? depthFeet * 0.3048 :
                     !isNaN(depthFathoms) ? depthFathoms * 1.8288 : NaN

  if (isNaN(finalDepth)) return null

  return {
    depthMeters: finalDepth,
    depthFeet: !isNaN(depthFeet) ? depthFeet : finalDepth / 0.3048,
    depthFathoms: !isNaN(depthFathoms) ? depthFathoms : finalDepth / 1.8288,
  }
}

/**
 * Parse $SDMTW sentence (water temperature).
 * Format: $SDMTW,<temperature>,C*<checksum>
 */
export function parseSDMTW(sentence: string): number | null {
  const clean = sentence.replace(/^\$/, '').replace(/\*.*$/, '')
  const parts = clean.split(',')

  if (parts[0] !== 'SDMTW') return null

  const temp = parseFloat(parts[1])
  return isNaN(temp) ? null : temp
}

/**
 * Apply tide correction to a depth reading.
 *
 * reduced_depth = depth_to_bottom - tide_height
 *
 * If tide is positive (high tide), the reduced depth is shallower.
 * If tide is negative (low tide), the reduced depth is deeper.
 */
export function applyTideCorrection(
  depthToBottom: number,
  tideHeight: number,
): number {
  return depthToBottom - tideHeight
}

/**
 * Interpolate tide height at a specific time from a tide station's readings.
 * Uses linear interpolation between known tide readings.
 */
export function interpolateTide(
  tideStation: TideStation,
  targetTime: Date,
): number {
  const targetMs = targetTime.getTime()

  // Find bracketing readings
  let prev: { time: string; height: number } | null = null
  let next: { time: string; height: number } | null = null

  for (const reading of tideStation.readings) {
    const readingMs = new Date(reading.time).getTime()
    if (readingMs <= targetMs) {
      prev = reading
    }
    if (readingMs > targetMs && !next) {
      next = reading
      break
    }
  }

  if (!prev && !next) return 0
  if (!prev) return next!.height
  if (!next) return prev.height

  // Linear interpolation
  const prevMs = new Date(prev.time).getTime()
  const nextMs = new Date(next.time).getTime()
  const fraction = (targetMs - prevMs) / (nextMs - prevMs)

  return prev.height + fraction * (next.height - prev.height)
}

/**
 * Create a complete depth reading from NMEA sentences and GPS position.
 */
export function createDepthReading(
  latitude: number,
  longitude: number,
  depthSentence: string,
  temperatureSentence?: string,
  tideStation?: TideStation,
  transducerOffset: number = 0,
): DepthReading {
  // Parse depth
  const dpt = parseSDDPT(depthSentence)
  const dbt = !dpt ? parseSDDBT(depthSentence) : null

  const rawDepth = dpt?.depth ?? dbt?.depthMeters ?? 0
  const offset = dpt?.offset ?? transducerOffset

  // Depth to bottom = transducer depth + raw depth
  const depthToBottom = rawDepth + Math.abs(offset)

  // Parse temperature
  const tempRaw = temperatureSentence ? parseSDMTW(temperatureSentence) : undefined
  const temperature = tempRaw ?? undefined

  // Apply tide correction
  let tideCorrection: number | undefined
  let reducedDepth: number | undefined

  if (tideStation) {
    tideCorrection = interpolateTide(tideStation, new Date())
    reducedDepth = applyTideCorrection(depthToBottom, tideCorrection)
  }

  return {
    timestamp: new Date(),
    latitude,
    longitude,
    depthBelowTransducer: rawDepth,
    depthToBottom,
    waterTemperature: temperature,
    tideCorrection,
    reducedDepth,
    quality: rawDepth > 0 ? 'valid' : 'invalid',
  }
}

/**
 * Generate a bathymetric survey track from multiple depth readings.
 */
export function generateBathymetricTrack(
  readings: DepthReading[],
): {
  points: Array<{ lat: number; lng: number; depth: number; time: string }>
  totalDistance: number
  averageDepth: number
  maxDepth: number
  minDepth: number
} {
  const points = readings.map(r => ({
    lat: r.latitude,
    lng: r.longitude,
    depth: r.reducedDepth ?? r.depthToBottom,
    time: r.timestamp.toISOString(),
  }))

  // Compute total distance (haversine)
  let totalDistance = 0
  for (let i = 1; i < readings.length; i++) {
    const R = 6371000 // Earth radius in meters
    const lat1 = readings[i - 1].latitude * Math.PI / 180
    const lat2 = readings[i].latitude * Math.PI / 180
    const dLat = (readings[i].latitude - readings[i - 1].latitude) * Math.PI / 180
    const dLng = (readings[i].longitude - readings[i - 1].longitude) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const depths = points.map(p => p.depth).filter(d => d > 0)

  return {
    points,
    totalDistance,
    averageDepth: depths.length > 0 ? depths.reduce((s, d) => s + d, 0) / depths.length : 0,
    maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
    minDepth: depths.length > 0 ? Math.min(...depths) : 0,
  }
}
