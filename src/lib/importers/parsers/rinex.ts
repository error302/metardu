/**
 * METARDU — RINEX Parser (v2 / v3 / v4)
 * Phase C1: RINEX Observation File Parser for GNSS data
 *
 * Parses RINEX 2.x (GPS/GLONASS), 3.x (multi-GNSS), and 4.x observation files.
 * Extracts header metadata AND observation epoch records (pseudorange, carrier phase,
 * SNR, doppler) for all satellite systems.
 *
 * References:
 *   - RINEX 2.11: IGS RINEX Working Group
 *   - RINEX 3.04: IGS RINEX Working Group, 2018
 *   - RINEX 4.00: IGS RINEX Working Group, 2023
 */

import { registerParser } from '../registry'
import { ParseResult, ParsedPoint } from '@/types/importer'

// ─── Header Types ────────────────────────────────────────────────────────────

export interface RinexHeader {
  version: string
  fileType: string
  markerName: string
  markerNumber?: string
  observer?: string
  agency?: string
  receiverType?: string
  receiverSn?: string
  antennaType?: string
  antennaSn?: string
  approxPosECEF?: { x: number; y: number; z: number }
  antennaDelta?: { h: number; e: number; n: number }
  timeOfFirstObs?: string
  // Extended fields for v3/v4
  systems?: string[] // e.g. ['G', 'R', 'E', 'C']
  rinexDate?: string // date of file creation
  interval?: number // observation interval in seconds
}

// ─── Observation Types ───────────────────────────────────────────────────────

export interface RinexObservation {
  epoch: Date
  satellite: string    // e.g. 'G01', 'R12', 'E05'
  system: 'GPS' | 'GLONASS' | 'GALILEO' | 'SBAS' | 'QZSS' | 'BDS' | 'IRNSS' | 'unknown'
  pseudorangeL1?: number   // metres
  pseudorangeL2?: number
  carrierPhaseL1?: number  // cycles
  carrierPhaseL2?: number
  snrL1?: number          // dB-Hz (signal-to-noise ratio)
  snrL2?: number
  dopplerL1?: number      // Hz
  lossOfLockL1?: number   // 0=ok, 1=cycle slip
  lossOfLockL2?: number
}

// ─── Parse Result ────────────────────────────────────────────────────────────

export interface RinexParseResult extends ParseResult {
  format: 'rinex'
  header: RinexHeader
  observations: RinexObservation[]
  version: string
  systems: string[]
  epochCount: number
  errors: string[]
}

// ─── Satellite System Map ───────────────────────────────────────────────────

const SYSTEM_MAP: Record<string, string> = {
  G: 'GPS',
  R: 'GLONASS',
  E: 'GALILEO',
  S: 'SBAS',
  J: 'QZSS',
  C: 'BDS',
  I: 'IRNSS',
}

function identifySystem(satId: string): RinexObservation['system'] {
  const sysChar = satId.charAt(0).toUpperCase()
  return (SYSTEM_MAP[sysChar] || 'unknown') as RinexObservation['system']
}

// ─── Header Parsing ──────────────────────────────────────────────────────────

export function parseRinexHeader(content: string): RinexHeader {
  const lines = content.split('\n')
  const header: any = {}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    // Pad line to at least 80 chars so column extraction works
    const padded = line.padEnd(80, ' ')

    const label = padded.substring(60).trim()

    if (label === 'RINEX VERSION / TYPE') {
      header.version = padded.substring(0, 9).trim()
      // RINEX 2/3: file type character (O/N/M/G/R/E) appears after version number
      // Use regex to find the first valid file type char after the version
      let ftMatch = padded.substring(0, 40).match(/\d+\.\d+\s+([ONMGRE])/)
      if (ftMatch) {
        header.fileType = ftMatch[1]
      }
    } else if (label === 'MARKER NAME') {
      header.markerName = padded.substring(0, 60).trim()
    } else if (label === 'MARKER NUMBER') {
      header.markerNumber = padded.substring(0, 20).trim()
    } else if (label === 'OBSERVER / AGENCY') {
      header.observer = padded.substring(0, 20).trim()
      header.agency = padded.substring(20, 60).trim()
    } else if (label === 'REC # / TYPE / VERS') {
      header.receiverSn = padded.substring(0, 20).trim()
      // Extract receiver type as the second whitespace-delimited field group
      const recContent = padded.substring(0, 60).trim()
      const recParts = recContent.split(/\s{2,}/)
      if (recParts.length >= 2) {
        header.receiverType = recParts[1].trim()
      } else {
        header.receiverType = padded.substring(20, 40).trim()
      }
    } else if (label === 'ANT # / TYPE') {
      header.antennaSn = padded.substring(0, 20).trim()
      const antContent = padded.substring(0, 60).trim()
      const antParts = antContent.split(/\s{2,}/)
      if (antParts.length >= 2) {
        header.antennaType = antParts[1].trim()
      } else {
        header.antennaType = padded.substring(20, 40).trim()
      }
    } else if (label === 'APPROX POSITION XYZ') {
      const x = parseFloat(padded.substring(0, 14))
      const y = parseFloat(padded.substring(14, 28))
      const z = parseFloat(padded.substring(28, 42))
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        header.approxPosECEF = { x, y, z }
      }
    } else if (label === 'ANTENNA: DELTA H/E/N') {
      const h = parseFloat(padded.substring(0, 14))
      const e = parseFloat(padded.substring(14, 28))
      const n = parseFloat(padded.substring(28, 42))
      if (isFinite(h) && isFinite(e) && isFinite(n)) {
        header.antennaDelta = { h, e, n }
      }
    } else if (label === 'TIME OF FIRST OBS') {
      header.timeOfFirstObs = padded.substring(0, 43).trim()
    } else if (label === 'INTERVAL') {
      header.interval = parseFloat(padded.substring(0, 10))
    } else if (label === 'SYS / # / OBS TYPES' || label === '# / TYPES OF OBSERV') {
      // RINEX 3: "G  4 C1C L1C S1C C2C" or RINEX 2: "     4    C1    P1    L1    L2"
      // Systems tracking
      if (!header.systems) header.systems = []
      const sysChar = padded.substring(0, 1).trim()
      if (sysChar && SYSTEM_MAP[sysChar]) {
        header.systems.push(sysChar)
      }
    } else if (label === 'END OF HEADER') {
      break
    }
  }

  return header as RinexHeader
}

// ─── RINEX Version Detection ────────────────────────────────────────────

function detectRinexVersion(content: string): number {
  const firstLine = content.split('\n')[0]
  if (!firstLine) return 2
  const match = firstLine.match(/^\s*(\d+\.?\d*)/)
  if (match) {
    return parseFloat(match[1])
  }
  return 2
}

// ─── Observation Parsing Helpers ─────────────────────────────────────────────

/**
 * Parse a RINEX 2.x epoch header line.
 * Format: " YY MM DD HH MM SS.sss  #sat  flag  ...  sat1 sat2 ..."
 */
function parseRinex2Epoch(line: string): { epoch: Date; satCount: number; sats: string[] } | null {
  // RINEX 2 epoch format: " YY MM DD HH MM SS.sss  flag  #sat  sat1 sat2 ..."
  // Supports both column-based (80-char) and space-separated formats.
  let year: number, month: number, day: number, hour: number, minute: number, second: number
  let satCount: number
  const sats: string[] = []

  // Try column-based parsing first (for full 80-char records)
  if (line.length >= 32) {
    year = parseInt(line.substring(0, 3).trim())
    month = parseInt(line.substring(3, 6).trim())
    day = parseInt(line.substring(6, 9).trim())
    hour = parseInt(line.substring(9, 12).trim())
    minute = parseInt(line.substring(12, 15).trim())
    second = parseFloat(line.substring(15, 26).trim())
    satCount = parseInt(line.substring(29, 32).trim())
  } else {
    // Fallback: space-separated tokens
    const parts = line.trim().split(/\s+/)
    if (parts.length < 7) return null
    year = parseInt(parts[0])
    month = parseInt(parts[1])
    day = parseInt(parts[2])
    hour = parseInt(parts[3])
    minute = parseInt(parts[4])
    second = parseFloat(parts[5])
    // parts[6] = epoch flag, parts[7] = sat count
    satCount = parts.length > 7 ? parseInt(parts[7]) : 0
  }

  if (!isFinite(year) || !isFinite(month) || !isFinite(day)) return null

  // RINEX 2 uses 2-digit year (80-99 = 1980-1999, 0-79 = 2000-2079)
  const fullYear = year >= 80 ? 1900 + year : 2000 + year

  const epoch = new Date(Date.UTC(fullYear, month - 1, day, hour, minute, isFinite(second) ? second : 0))

  if (!isFinite(satCount)) satCount = 0

  // Satellite PRNs: try column-based first (3-char fields from pos 32), then token-based fallback
  if (satCount > 0 && line.length >= 32) {
    const columnSats: string[] = []
    for (let i = 0; i < satCount && 32 + i * 3 + 2 < line.length; i++) {
      const prn = line.substring(32 + i * 3, 32 + i * 3 + 3).trim()
      if (prn.length > 0 && /^\d+$/.test(prn)) {
        columnSats.push('G' + prn.padStart(2, '0'))
      } else if (prn.length > 0) {
        columnSats.push(prn)
      }
    }
    if (columnSats.length === satCount) {
      return { epoch, satCount, sats: columnSats }
    }
  }

  // Fallback: parse remaining tokens as satellite PRNs
  if (satCount > 0) {
    const parts = line.trim().split(/\s+/)
    // Tokens after the first 8 (YY MM DD HH MM SS flag #sat) are satellite PRNs
    const satTokens = parts.slice(8)
    for (let i = 0; i < Math.min(satCount, satTokens.length); i++) {
      const prn = satTokens[i]
      if (/^\d+$/.test(prn)) {
        sats.push('G' + prn.padStart(2, '0'))
      } else {
        sats.push(prn)
      }
    }
  }

  return { epoch, satCount, sats }
}

/**
 * Parse a RINEX 3.x epoch header line.
 * Format: "> 2024 01 15 08 30  0.0000000  0  4 G07G12G19G24"
 */
function parseRinex3Epoch(line: string): { epoch: Date; satCount: number; sats: string[] } | null {
  // Skip the ">" marker
  const rest = line.substring(1).trim()

  const parts = rest.split(/\s+/)
  if (parts.length < 7) return null

  const year = parseInt(parts[0])
  const month = parseInt(parts[1])
  const day = parseInt(parts[2])
  const hour = parseInt(parts[3])
  const minute = parseInt(parts[4])
  const second = parseFloat(parts[5])
  const epochFlag = parseInt(parts[6])

  if (!isFinite(year) || !isFinite(month) || !isFinite(day)) return null
  if (epochFlag !== 0) return null // skip event/header records

  const epoch = new Date(Date.UTC(year, month - 1, day, hour, minute, isFinite(second) ? second : 0))

  const satCount = parts.length > 7 ? parseInt(parts[7]) : 0
  const sats: string[] = []

  // Remaining parts are satellite IDs (3-char in v3: G07, R12, E05)
  if (isFinite(satCount) && satCount > 0) {
    for (let i = 0; i < satCount && i + 8 < parts.length; i++) {
      const satId = parts[8 + i].trim()
      if (satId.length >= 2) {
        // Normalize: G7 -> G07
        const sys = satId.charAt(0).toUpperCase()
        const num = parseInt(satId.substring(1))
        if (isFinite(num)) {
          sats.push(sys + String(num).padStart(2, '0'))
        } else {
          sats.push(satId)
        }
      }
    }
  }

  return { epoch, satCount: isFinite(satCount) ? satCount : 0, sats }
}

/**
 * Parse a RINEX 4.x epoch header line.
 * Format: "> 2024 01 15 08 30  0.0000000  0  4 G007G012G019G024"
 * Similar to v3 but with 4-character satellite IDs.
 */
function parseRinex4Epoch(line: string): { epoch: Date; satCount: number; sats: string[] } | null {
  // Same basic structure as v3, but satellite IDs are 4 chars (G001, R001, E001, C001)
  const result = parseRinex3Epoch(line)
  if (!result) return null

  // Normalize 4-char IDs: G007 -> G07 (internal normalization)
  const sats = result.sats.map(function(satId) {
    const sys = satId.charAt(0).toUpperCase()
    const num = parseInt(satId.substring(1))
    if (isFinite(num)) {
      return sys + String(num).padStart(2, '0')
    }
    return satId
  })

  return { epoch: result.epoch, satCount: result.satCount, sats: sats }
}

/**
 * Parse a RINEX 2 observation line.
 * Format: "PRN L1 L2 ... P1 P2 ... S1 S2 ..."
 * Values are 14 characters wide each.
 */
function parseRinex2ObsLine(
  line: string,
  epoch: Date,
  satId: string
): RinexObservation | null {
  const prn = line.substring(0, 3).trim()
  if (!prn || prn.length === 0) return null

  const fullSatId = /^\d+$/.test(prn) ? 'G' + prn.padStart(2, '0') : prn
  const obs: RinexObservation = {
    epoch: epoch,
    satellite: fullSatId,
    system: identifySystem(fullSatId),
  }

  // RINEX 2 observation fields are 14 chars each starting at position 3
  // Typical order: L1 L2 C1 C2 P1 P2 D1 D2 S1 S2 (varies by #/TYPES OF OBSERV)
  // We extract what we can: L1 (carrier phase), C1/P1 (pseudorange), S1/S2 (SNR)
  const fieldWidth = 14
  const maxFields = Math.floor((line.length - 3) / fieldWidth)

  for (let i = 0; i < maxFields; i++) {
    const start = 3 + i * fieldWidth
    const valStr = line.substring(start, start + fieldWidth).trim()
    if (!valStr || valStr === '              ') continue

    const val = parseFloat(valStr)
    if (!isFinite(val)) continue

    // Try to identify what field this is based on position and value magnitude.
    // Pseudorange values are typically > 1e6 (metres)
    // Carrier phase values can be very large (cycles * wavelength) or include negative
    // SNR is typically 10-60 (dB-Hz)
    // We'll just store sequentially and let consumers interpret based on header.
    // For simplicity, we assign by common convention:
    if (i === 0 && Math.abs(val) > 100) {
      obs.carrierPhaseL1 = val
    } else if (i === 1 && Math.abs(val) > 100) {
      obs.carrierPhaseL2 = val
    } else if (i === 2 && Math.abs(val) > 1e4) {
      obs.pseudorangeL1 = val
    } else if (i === 3 && Math.abs(val) > 1e4) {
      obs.pseudorangeL2 = val
    } else if (i === 4 && Math.abs(val) > 1e4) {
      obs.pseudorangeL1 = val // alternative P1 position
    } else if (i === 5 && Math.abs(val) > 1e4) {
      obs.pseudorangeL2 = val // alternative P2 position
    } else if (val >= 1 && val <= 60 && i >= 6) {
      // Likely SNR
      if (!obs.snrL1) {
        obs.snrL1 = val
      } else {
        obs.snrL2 = val
      }
    }
  }

  return obs
}

/**
 * Parse a RINEX 3 observation line.
 * Format: "G07  12345678.012  -9876543.210  23456789.012  ..."
 * Satellite ID is 3 chars, then observation values (14 chars each).
 */
function parseRinex3ObsLine(line: string, epoch: Date): RinexObservation | null {
  const satId = line.substring(0, 3).trim()
  if (!satId || satId.length < 2) return null

  // Normalize satellite ID
  const sys = satId.charAt(0).toUpperCase()
  const num = parseInt(satId.substring(1))
  const fullSatId = isFinite(num) ? sys + String(num).padStart(2, '0') : satId

  const obs: RinexObservation = {
    epoch: epoch,
    satellite: fullSatId,
    system: identifySystem(fullSatId),
  }

  // Observation values are 14 chars each starting at position 3
  const fieldWidth = 14
  const maxFields = Math.floor((line.length - 3) / fieldWidth)

  for (let i = 0; i < maxFields; i++) {
    const start = 3 + i * fieldWidth
    const valStr = line.substring(start, start + fieldWidth).trim()
    if (!valStr || valStr.length === 0) continue

    const val = parseFloat(valStr)
    if (!isFinite(val)) continue

    // Assign by position (depends on SYS / # / OBS TYPES header)
    // Common order: C1C L1C S1C C2W L2W S2W (code, phase, snr for each freq)
    // We use heuristic assignment based on magnitude:
    if (Math.abs(val) > 1e4) {
      // Likely pseudorange
      if (!obs.pseudorangeL1) {
        obs.pseudorangeL1 = val
      } else if (!obs.pseudorangeL2) {
        obs.pseudorangeL2 = val
      }
    } else if (Math.abs(val) > 100) {
      // Likely carrier phase
      if (!obs.carrierPhaseL1) {
        obs.carrierPhaseL1 = val
      } else if (!obs.carrierPhaseL2) {
        obs.carrierPhaseL2 = val
      }
    } else if (val >= 1 && val <= 60) {
      // Likely SNR
      if (!obs.snrL1) {
        obs.snrL1 = val
      } else if (!obs.snrL2) {
        obs.snrL2 = val
      }
    }
  }

  return obs
}

/**
 * Parse a RINEX 4 observation line.
 * Format: "G007  12345678.012  -9876543.210  ..."
 * Satellite ID is 4 chars, then observation values (16 chars each in v4).
 */
function parseRinex4ObsLine(line: string, epoch: Date): RinexObservation | null {
  const satId = line.substring(0, 4).trim()
  if (!satId || satId.length < 3) return null

  // Normalize 4-char to 3-char: G007 -> G07
  const sys = satId.charAt(0).toUpperCase()
  const num = parseInt(satId.substring(1))
  const fullSatId = isFinite(num) ? sys + String(num).padStart(2, '0') : satId

  const obs: RinexObservation = {
    epoch: epoch,
    satellite: fullSatId,
    system: identifySystem(fullSatId),
  }

  // RINEX 4 uses 16-character fields (extended precision)
  const fieldWidth = 16
  const maxFields = Math.floor((line.length - 4) / fieldWidth)

  for (let i = 0; i < maxFields; i++) {
    const start = 4 + i * fieldWidth
    const valStr = line.substring(start, start + fieldWidth).trim()
    if (!valStr || valStr.length === 0) continue

    const val = parseFloat(valStr)
    if (!isFinite(val)) continue

    if (Math.abs(val) > 1e4) {
      if (!obs.pseudorangeL1) {
        obs.pseudorangeL1 = val
      } else if (!obs.pseudorangeL2) {
        obs.pseudorangeL2 = val
      }
    } else if (Math.abs(val) > 100) {
      if (!obs.carrierPhaseL1) {
        obs.carrierPhaseL1 = val
      } else if (!obs.carrierPhaseL2) {
        obs.carrierPhaseL2 = val
      }
    } else if (val >= 1 && val <= 60) {
      if (!obs.snrL1) {
        obs.snrL1 = val
      } else if (!obs.snrL2) {
        obs.snrL2 = val
      }
    }
  }

  return obs
}

// ─── Main Observation Block Parsing ──────────────────────────────────────────

/**
 * Parse observation blocks from RINEX data.
 * Handles v2 (column-formatted epochs), v3 (> marker epochs), and v4.
 */
function parseObservationBlocks(
  content: string,
  version: number
): { observations: RinexObservation[]; epochCount: number; errors: string[] } {
  const lines = content.split('\n')
  const observations: RinexObservation[] = []
  const errors: string[] = []
  let epochCount = 0

  // Find END OF HEADER to start observation parsing
  let startIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].substring(60).trim() === 'END OF HEADER') {
      startIdx = i + 1
      break
    }
  }

  let i = startIdx
  while (i < lines.length) {
    const line = lines[i]

    if (version >= 3) {
      // RINEX 3/4: epoch lines start with ">"
      if (!line.startsWith('>')) {
        i++
        continue
      }

      const epochInfo = version >= 4
        ? parseRinex4Epoch(line)
        : parseRinex3Epoch(line)

      if (!epochInfo) {
        i++
        continue
      }

      epochCount++
      i++

      // Read observation lines for this epoch
      // Use satCount (numeric) not sats.length since inline satellite IDs may be absent
      const satCount = epochInfo.satCount
      for (let s = 0; s < satCount && i < lines.length; s++) {
        const obsLine = lines[i]
        if (obsLine.trim().length === 0 || obsLine.startsWith('>')) break

        if (version >= 4) {
          const obs = parseRinex4ObsLine(obsLine, epochInfo.epoch)
          if (obs) observations.push(obs)
        } else {
          const obs = parseRinex3ObsLine(obsLine, epochInfo.epoch)
          if (obs) observations.push(obs)
        }
        i++
      }
    } else {
      // RINEX 2: epoch lines have epoch flag at position 28-29
      const trimmed = line.trim()
      if (trimmed.length < 28) {
        i++
        continue
      }

      // Check if this looks like an epoch header line
      // RINEX 2 epoch format: YY MM DD HH MM SS.sss  flag  #sat  sat1 sat2...
      // After trimming, it should start with a digit pair (year)
      if (!/^\d{2}\s/.test(trimmed)) {
        i++
        continue
      }

      // Check if position 26-27 looks like a space + flag (typical epoch line)
      // Also verify it looks like a date (first char is digit or space)
      if (!/^\s*\d{2}/.test(trimmed)) {
        i++
        continue
      }

      const epochInfo = parseRinex2Epoch(trimmed)
      if (!epochInfo) {
        i++
        continue
      }

      epochCount++
      i++

      // Read observation lines for this epoch
      for (let s = 0; s < epochInfo.satCount && i < lines.length; s++) {
        const obsLine = lines[i]
        if (obsLine.trim().length < 3) break

        const obs = parseRinex2ObsLine(obsLine, epochInfo.epoch, epochInfo.sats[s] || '')
        if (obs) observations.push(obs)
        i++
      }

      // Skip any continuation lines (if sats > expected, skip remaining)
      // RINEX 2 also has event/skip records which we skip
    }
  }

  return { observations, epochCount, errors }
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseRinex(content: string): RinexParseResult {
  const header = parseRinexHeader(content)
  const version = detectRinexVersion(content)
  const points: ParsedPoint[] = []
  const parseErrors: string[] = []

  // Parse observation blocks
  const obsResult = parseObservationBlocks(content, version)

  // Collect unique satellite systems
  const systemsSet = new Set<string>()
  for (const obs of obsResult.observations) {
    const sysChar = obs.satellite.charAt(0).toUpperCase()
    if (SYSTEM_MAP[sysChar]) systemsSet.add(sysChar)
  }
  const systems = Array.from(systemsSet)

  // If we have an approximate position, export as a point
  if (header.approxPosECEF) {
    points.push({
      point_no: header.markerName || 'UNKNOWN',
      feature_code: 'GNSS_STATIC',
      instrument_height: header.antennaDelta ? header.antennaDelta.h : 0,
      raw: {
        ecef_x: header.approxPosECEF.x,
        ecef_y: header.approxPosECEF.y,
        ecef_z: header.approxPosECEF.z,
        receiver: header.receiverType,
        antenna: header.antennaType,
        epoch_count: obsResult.epochCount,
        observation_count: obsResult.observations.length,
        systems: systems,
        version: String(version),
      }
    })
  }

  return {
    format: 'rinex',
    header,
    points,
    warnings: [],
    observations: obsResult.observations,
    version: String(version),
    systems,
    epochCount: obsResult.epochCount,
    errors: [...parseErrors, ...obsResult.errors],
  }
}

// ─── Parser Registration ─────────────────────────────────────────────────────

registerParser({
  format: 'rinex',
  label: 'RINEX Observation File (v2/v3/v4)',
  extensions: ['rnx', 'obs', 'O', 'o', '21O', '22O', '23O'],
  detect: function(content) {
    return content.includes('RINEX VERSION / TYPE') && content.includes('END OF HEADER')
  },
  parse: function(content): ParseResult {
    return parseRinex(content)
  }
})
