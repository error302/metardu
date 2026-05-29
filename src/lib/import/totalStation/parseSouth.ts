/**
 * South Total Station (.dat/.dc) Parser
 * Supports NTS and Galaxy series coordinate export format
 * Also supports traverse observation format (SS records)
 *
 * Coordinate format:
 *   1,BM1,984321.456,1234567.890,1542.345,"BM1",0
 *   Columns: pointNumber, pointName, easting, northing, elevation, code, pointType
 *
 * Observation format:
 *   SS,1,BM1,T1,82.1530,10,0,234.567,89.4530,1.500,1.500,,
 *   Columns: SS, obs#, station, target, HCL(DMS), targetHt, dummy, slopeDist, VA(DMS), IH, TH, ...
 *
 * Header line:
 *   South,N,Coordinate System
 */

export interface SouthCoordinatePoint {
  pointNumber: number
  pointName: string
  easting: number
  northing: number
  elevation: number
  code: string
  pointType: number
}

export interface SouthObservation {
  observationNumber: number
  station: string
  target: string
  hclDeg: number
  hclMin: number
  hclSec: number
  targetHeight: number
  slopeDistance: number
  vaDeg: number
  vaMin: number
  vaSec: number
  instrumentHeight: number
}

export interface SouthParseResult {
  type: 'coordinates' | 'observations' | 'mixed'
  coordinates: SouthCoordinatePoint[]
  observations: SouthObservation[]
  errors: string[]
  warnings: string[]
}

/**
 * Parse a DMS angle string (e.g. "82.1530" → 82°15'30")
 * South uses the format DDD.MMSS where MM is 2 digits and SS is 2 digits.
 */
function parseDMS(dmsStr: string): { deg: number; min: number; sec: number } {
  const cleaned = dmsStr.trim()
  const dotIndex = cleaned.indexOf('.')
  if (dotIndex === -1) {
    return { deg: parseInt(cleaned, 10) || 0, min: 0, sec: 0 }
  }

  const degStr = cleaned.substring(0, dotIndex)
  const fracStr = cleaned.substring(dotIndex + 1)

  const deg = parseInt(degStr, 10) || 0

  // South format: the fractional part is MMSS (always 4 digits total)
  let min: number
  let sec: number

  if (fracStr.length >= 4) {
    min = parseInt(fracStr.substring(0, 2), 10) || 0
    sec = parseInt(fracStr.substring(2, 4), 10) || 0
  } else if (fracStr.length === 3) {
    min = parseInt(fracStr.substring(0, 1), 10) || 0
    sec = parseInt(fracStr.substring(1, 3), 10) || 0
  } else if (fracStr.length === 2) {
    min = parseInt(fracStr, 10) || 0
    sec = 0
  } else {
    min = 0
    sec = 0
  }

  return { deg, min, sec }
}

/**
 * Strip surrounding quotes from a string value.
 */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/**
 * Check if a line looks like a South coordinate record.
 * Expected: starts with an integer (point number) followed by commas and numeric coordinates.
 */
function isCoordinateLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('South') || trimmed.startsWith('SS')) return false
  const parts = trimmed.split(',')
  if (parts.length < 5) return false
  // First field should be an integer point number
  if (!/^\s*\d+\s*$/.test(parts[0])) return false
  // Fields 2-4 (index 2,3,4) should be numeric (easting, northing, elevation)
  const easting = parseFloat(parts[2])
  const northing = parseFloat(parts[3])
  if (isNaN(easting) || isNaN(northing)) return false
  return true
}

/**
 * Check if a line is a South SS observation record.
 */
function isObservationLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.toUpperCase().startsWith('SS,')
}

/**
 * Parse a single coordinate line into a SouthCoordinatePoint.
 */
function parseCoordinateLine(
  line: string,
  lineNumber: number
): { point?: SouthCoordinatePoint; error?: string } {
  const parts = line.split(',')

  const pointNumber = parseInt(parts[0]?.trim(), 10)
  const pointName = unquote(parts[1] ?? '')
  const easting = parseFloat(parts[2]?.trim())
  const northing = parseFloat(parts[3]?.trim())
  const elevation = parseFloat(parts[4]?.trim())
  const code = unquote(parts[5] ?? '')
  const pointType = parseInt(parts[6]?.trim(), 10) || 0

  if (isNaN(pointNumber)) {
    return { error: `Line ${lineNumber}: invalid point number "${parts[0]?.trim()}"` }
  }
  if (isNaN(easting)) {
    return { error: `Line ${lineNumber}: invalid easting value "${parts[2]?.trim()}"` }
  }
  if (isNaN(northing)) {
    return { error: `Line ${lineNumber}: invalid northing value "${parts[3]?.trim()}"` }
  }

  return {
    point: {
      pointNumber,
      pointName,
      easting,
      northing,
      elevation: isNaN(elevation) ? 0 : elevation,
      code,
      pointType,
    },
  }
}

/**
 * Parse a single SS observation line into a SouthObservation.
 */
function parseObservationLine(
  line: string,
  lineNumber: number
): { obs?: SouthObservation; error?: string } {
  const parts = line.split(',')

  // SS,obs#,station,target,HCL,targetHt,dummy,slopeDist,VA,IH,TH,...
  if (parts.length < 10) {
    return { error: `Line ${lineNumber}: SS record has too few fields (${parts.length}), expected at least 10` }
  }

  const observationNumber = parseInt(parts[1]?.trim(), 10)
  const station = unquote(parts[2] ?? '')
  const target = unquote(parts[3] ?? '')

  const hcl = parseDMS(parts[4] ?? '0.0000')
  const targetHeight = parseFloat(parts[5]?.trim()) || 0
  // parts[6] is dummy field, skip
  const slopeDistance = parseFloat(parts[7]?.trim()) || 0
  const va = parseDMS(parts[8] ?? '90.0000')
  const instrumentHeight = parseFloat(parts[9]?.trim()) || 0

  if (isNaN(observationNumber)) {
    return { error: `Line ${lineNumber}: invalid observation number "${parts[1]?.trim()}"` }
  }
  if (!station) {
    return { error: `Line ${lineNumber}: missing station name` }
  }
  if (!target) {
    return { error: `Line ${lineNumber}: missing target name` }
  }

  return {
    obs: {
      observationNumber,
      station,
      target,
      hclDeg: hcl.deg,
      hclMin: hcl.min,
      hclSec: hcl.sec,
      targetHeight,
      slopeDistance,
      vaDeg: va.deg,
      vaMin: va.min,
      vaSec: va.sec,
      instrumentHeight,
    },
  }
}

/**
 * Parse South total station data file content.
 *
 * Handles both coordinate-only files, observation-only files, and mixed files
 * that contain both coordinate rows and SS observation rows.
 *
 * @param content - The raw file content as a string
 * @returns Structured parse result with coordinates, observations, and diagnostics
 */
export function parseSouthData(content: string): SouthParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const coordinates: SouthCoordinatePoint[] = []
  const observations: SouthObservation[] = []

  if (!content || !content.trim()) {
    errors.push('Empty file content')
    return { type: 'coordinates', coordinates: [], observations: [], errors, warnings }
  }

  const lines = content.split('\n')
  let hasCoordinates = false
  let hasObservations = false
  // Track which line each coordinate point came from (for duplicate detection)
  const coordLineNumbers = new Map<number, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNumber = i + 1

    // Skip empty lines
    if (!trimmed) continue

    // Skip South header lines (e.g. "South,N,Coordinate System")
    if (trimmed.toLowerCase().startsWith('south,')) continue

    // Detect observation lines (SS prefix)
    if (isObservationLine(trimmed)) {
      hasObservations = true
      const result = parseObservationLine(trimmed, lineNumber)
      if (result.error) {
        errors.push(result.error)
      } else if (result.obs) {
        observations.push(result.obs)
      }
      continue
    }

    // Detect coordinate lines
    if (isCoordinateLine(trimmed)) {
      hasCoordinates = true
      const result = parseCoordinateLine(trimmed, lineNumber)
      if (result.error) {
        errors.push(result.error)
      } else if (result.point) {
        coordinates.push(result.point)
        // Track only the first occurrence for duplicate warnings
        if (!coordLineNumbers.has(result.point.pointNumber)) {
          coordLineNumbers.set(result.point.pointNumber, lineNumber)
        }
      }
      continue
    }

    // Unrecognized non-empty line — add a warning
    warnings.push(
      `Line ${lineNumber}: unrecognized content "${trimmed.length > 60 ? trimmed.slice(0, 60) + '...' : trimmed}"`
    )
  }

  let type: SouthParseResult['type'] = 'coordinates'
  if (hasCoordinates && hasObservations) {
    type = 'mixed'
  } else if (hasObservations) {
    type = 'observations'
  }

  // Add summary warnings
  if (coordinates.length === 0 && observations.length === 0) {
    warnings.push('No valid coordinate or observation records found. Verify the file is a South .dat/.dc export.')
  } else if (hasCoordinates && coordinates.length > 0) {
    // Check for duplicate point numbers
    const seen = new Set<number>()
    for (const pt of coordinates) {
      if (seen.has(pt.pointNumber)) {
        warnings.push(`Duplicate point number ${pt.pointNumber} detected (first seen at line ${coordLineNumbers.get(pt.pointNumber)})`)
      } else {
        seen.add(pt.pointNumber)
      }
    }
  }

  return { type, coordinates, observations, errors, warnings }
}
