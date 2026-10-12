// METARDU Drainage Design Module
// Source: RDM 1.3 Section 6 (Drainage)
// Source: KeNHA Drainage Design Manual
// Source: BS EN 752:2008

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface PipeInput {
  diameter: number        // mm
  manningN: number
  slope: number           // m/m (e.g., 0.005 for 0.5%)
  flowDepth?: number      // mm (if not full bore)
}

export interface PipeCapacity {
  fullBoreCapacity: number   // m³/s
  fullBoreVelocity: number   // m/s
}

export interface CatchmentInput {
  area: number            // hectares
  runoffCoefficient: number // 0-1
  rainfallIntensity: number // mm/hr
}

export interface CatchmentResult {
  peakFlow: number        // m³/s
  catchmentArea: number
  effectiveArea: number
}

export interface ChannelInput {
  bedWidth: number        // m
  sideSlope: number       // H:V (e.g., 1.5)
  manningN: number
  slope: number           // m/m
  flowDepth: number       // m
}

export interface ChannelCapacity {
  flowArea: number
  wettedPerimeter: number
  hydraulicRadius: number
  velocity: number
  discharge: number
  topWidth: number
}

// ─── MANNING'S N VALUES ───────────────────────────────────────────────────────

export const MANNING_N: Record<string, number> = {
  'Concrete pipe': 0.013,
  'HDPE': 0.011,
  'uPVC': 0.011,
  'VCP': 0.013,
  'Corrugated steel': 0.024,
  'Concrete channel': 0.015,
  'Earth channel': 0.025,
  'Grass channel': 0.035,
  'Stone lining': 0.025,
  'Masonry': 0.017,
}

// ─── RUNOFF COEFFICIENTS ──────────────────────────────────────────────────────

export const RUNOFF_COEFFICIENTS: Record<string, { min: number; max: number; typical: number }> = {
  'Asphalt/Concrete': { min: 0.85, max: 0.95, typical: 0.90 },
  'Paved': { min: 0.75, max: 0.85, typical: 0.80 },
  'Gravel': { min: 0.35, max: 0.70, typical: 0.50 },
  'Bare earth': { min: 0.20, max: 0.40, typical: 0.30 },
  'Grass/Park': { min: 0.10, max: 0.25, typical: 0.15 },
  'Forest': { min: 0.05, max: 0.15, typical: 0.10 },
  'Commercial': { min: 0.70, max: 0.95, typical: 0.85 },
  'Residential': { min: 0.40, max: 0.70, typical: 0.55 },
  'Industrial': { min: 0.50, max: 0.80, typical: 0.65 },
  'Agriculture': { min: 0.15, max: 0.45, typical: 0.25 },
}

// ─── STANDARD PIPE SIZES (mm) ────────────────────────────────────────────────

export const STANDARD_PIPE_SIZES = [100, 150, 200, 225, 300, 375, 450, 525, 600, 675, 750, 900, 1050, 1200, 1350, 1500]

// ─── PIPE HYDRAULICS ─────────────────────────────────────────────────────────

export function manningPipeCapacity(input: PipeInput): PipeCapacity {
  const { diameter, manningN, slope } = input
  if (!Number.isFinite(diameter) || diameter <= 0) throw new RangeError('Pipe internal diameter must be finite and positive.')
  if (!Number.isFinite(manningN) || manningN <= 0) throw new RangeError('Manning roughness must be finite and positive.')
  if (!Number.isFinite(slope) || slope <= 0) throw new RangeError('Pipe slope must be finite and positive in the flow direction.')
  const D = diameter / 1000 // mm to m

  // Full bore calculations
  const area = Math.PI * D * D / 4
  const hydraulicRadius = D / 4

  const velocity = (1 / manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.pow(slope, 0.5)
  const capacity = velocity * area

  if (!Number.isFinite(velocity) || !Number.isFinite(capacity)) throw new RangeError('Pipe calculation exceeded the supported numeric range.')

  return {
    // Keep calculation precision here. Callers use capacity for threshold
    // checks and pipe sizing; rounding before those decisions can turn a
    // marginal exceedance into a false pass. Round only when formatting UI.
    fullBoreCapacity: capacity,
    fullBoreVelocity: velocity,
  }
}

export function minPipeSlope(diameterMm: number, manningN: number, minVelocity: number): number {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new RangeError('Pipe diameter must be finite and positive.')
  if (!Number.isFinite(manningN) || manningN <= 0) throw new RangeError('Manning roughness must be finite and positive.')
  if (!Number.isFinite(minVelocity) || minVelocity <= 0) throw new RangeError('Target velocity must be finite and positive.')
  const D = diameterMm / 1000
  const R = D / 4
  return Math.pow(minVelocity * manningN / Math.pow(R, 2 / 3), 2)
}

// ─── CATCHMENT / RATIONAL METHOD ─────────────────────────────────────────────

export function rationalMethodCatchment(input: CatchmentInput): CatchmentResult {
  const { area, runoffCoefficient, rainfallIntensity } = input
  if (!Number.isFinite(area) || area <= 0) throw new RangeError('Catchment area must be finite and positive.')
  if (!Number.isFinite(runoffCoefficient) || runoffCoefficient <= 0 || runoffCoefficient > 1) throw new RangeError('Runoff coefficient must be greater than zero and no more than one.')
  if (!Number.isFinite(rainfallIntensity) || rainfallIntensity <= 0) throw new RangeError('Rainfall intensity must be finite and positive.')

  // Q = (C × I × A) / 360
  // Converts mm/hr × ha to m³/s: divide by 3.6 × 100
  const peakFlow = (runoffCoefficient * rainfallIntensity * area) / 360

  if (!Number.isFinite(peakFlow)) throw new RangeError('Catchment flow exceeded the supported numeric range.')

  return {
    peakFlow: Math.round(peakFlow * 10000) / 10000,
    catchmentArea: area,
    effectiveArea: Math.round(runoffCoefficient * area * 100) / 100,
  }
}

// ─── PIPE SIZING ──────────────────────────────────────────────────────────────

export function sizePipe(
  peakFlow: number,
  manningN: number,
  slope: number
): { diameter: number; velocity: number; capacity: number } | null {
  if (!Number.isFinite(peakFlow) || peakFlow <= 0 || !Number.isFinite(manningN) || manningN <= 0 || !Number.isFinite(slope) || slope <= 0) return null

  for (const diameter of STANDARD_PIPE_SIZES) {
    const result = manningPipeCapacity({ diameter, manningN, slope })
    if (result.fullBoreCapacity >= peakFlow) {
      return {
        diameter,
        velocity: result.fullBoreVelocity,
        capacity: result.fullBoreCapacity,
      }
    }
  }

  return null // no standard size sufficient
}

// ─── CHANNEL HYDRAULICS (TRAPEZOIDAL) ────────────────────────────────────────

export function manningChannelCapacity(input: ChannelInput): ChannelCapacity {
  const { bedWidth, sideSlope, manningN, slope, flowDepth } = input
  if (!Number.isFinite(bedWidth) || bedWidth <= 0) throw new RangeError('Channel bed width must be finite and positive.')
  if (!Number.isFinite(sideSlope) || sideSlope < 0) throw new RangeError('Channel side slope must be finite and non-negative.')
  if (!Number.isFinite(manningN) || manningN <= 0) throw new RangeError('Manning roughness must be finite and positive.')
  if (!Number.isFinite(slope) || slope <= 0) throw new RangeError('Channel bed slope must be finite and positive in the flow direction.')
  if (!Number.isFinite(flowDepth) || flowDepth <= 0) throw new RangeError('Channel flow depth must be finite and positive.')

  const y = flowDepth
  const z = sideSlope

  // Trapezoidal channel geometry
  const flowArea = (bedWidth + z * y) * y
  const wettedPerimeter = bedWidth + 2 * y * Math.sqrt(1 + z * z)
  const hydraulicRadius = flowArea / wettedPerimeter
  const topWidth = bedWidth + 2 * z * y

  const velocity = (1 / manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.pow(slope, 0.5)
  const discharge = velocity * flowArea

  return {
    flowArea: Math.round(flowArea * 10000) / 10000,
    wettedPerimeter: Math.round(wettedPerimeter * 10000) / 10000,
    hydraulicRadius: Math.round(hydraulicRadius * 10000) / 10000,
    velocity: Math.round(velocity * 1000) / 1000,
    discharge: Math.round(discharge * 10000) / 10000,
    topWidth: Math.round(topWidth * 100) / 100,
  }
}

// ─── HYDRAULIC GRADIENT CHECK ────────────────────────────────────────────────

export function checkPipeGradient(
  pipeDiameterMm: number,
  manningN: number,
  peakFlow: number
): { requiredGradient: number; velocityAtGradient: number; isAdequate: boolean } {
  if (peakFlow <= 0) return { requiredGradient: 0, velocityAtGradient: 0, isAdequate: false }

  const D = pipeDiameterMm / 1000
  const R = D / 4
  const A = Math.PI * D * D / 4

  // Rearranged Manning's for slope: V = Q/A, S = (V*n/R^(2/3))^2
  const V = peakFlow / A
  const S = Math.pow(V * manningN / Math.pow(R, 2 / 3), 2)

  return {
    requiredGradient: Math.round(S * 100000) / 100000,
    velocityAtGradient: Math.round(V * 1000) / 1000,
    isAdequate: V >= 0.6 && V <= 3.0,
  }
}
