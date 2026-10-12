/**
 * @module nlimsExporter
 *
 * METARDU structured cadastral draft exporter.
 *
 * Produces a METARDU JSON draft for surveyor review. This module does not
 * implement an independently verified NLIMS/Ardhisasa submission schema.
 *
 * Draft checks and formatting:
 * 1. Area reconciliation against a configured local tolerance
 * 2. Beacon identifier check against a local pattern
 * 3. Coordinate formatting using an explicitly declared project CRS
 * 4. Fields for manual surveyor review
 * 5. SHA-256 digest to detect changes to the draft
 *
 * Official portal schema and acceptance requirements are not verified here.
 */

import type { SurveyPoint } from '@/lib/map/turfHelpers'

// ---------------------------------------------------------------------------
// Types — METARDU cadastral draft shape
// ---------------------------------------------------------------------------

export interface NLIMSSubmissionPayload {
  /** Explicitly identifies this as a METARDU draft, not an official registry payload. */
  draftMetadata: {
    format: 'METARDU_CADASTRAL_DRAFT_V1'
    projectId: string
    projectName: string
    coordinateReference: string
    distanceMode: 'grid' | 'ground'
    geometrySource: 'saved_field_observation_adjustment'
    officialRegistryFormatVerified: false
    registryTransmission: 'not_sent'
  }
  /** Draft metadata; this does not identify a registry submission. */
  submissionId: string
  submissionDate: string
  submissionType: 'mutation' | 'subdivision' | 'amalgamation' | 'new_registration' | 'boundary_adjustment'
  registry: string
  county: string
  subCounty: string

  /** Surveyor information */
  surveyor: {
    name: string
    licenseNumber: string
    firm?: string
    iskMembershipNumber?: string
  }

  /** Parent parcel (for mutations/subdivisions) */
  parentParcel?: {
    parcelNumber: string
    titleDeedNumber: string
    registryMapSheet: string
    areaHectares: number
    coordinates: NLIMSParcelCoordinate[]
  }

  /** Resulting parcels (new parcels created by the survey) */
  resultingParcels: NLIMSSubmissionParcel[]

  /** Area reconciliation */
  areaReconciliation: {
    parentAreaHectares: number | null
    sumOfPartsHectares: number
    differenceHectares: number
    isWithinTolerance: boolean
    toleranceHectares: number
  }

  /** Beacon schedule */
  beacons: NLIMSBeacon[]

  /** Encumbrances */
  encumbrances: NLIMSEncumbrance[]

  /** Integrity */
  integrity: {
    hash: string
    algorithm: 'SHA-256'
    computedAt: string
  }
}

export interface NLIMSSubmissionParcel {
  parcelNumber: string
  parcelType: 'new' | 'existing' | 'modified'
  areaHectares: number
  areaSqM: number
  perimeterM: number
  coordinates: NLIMSParcelCoordinate[]
  landUse?: string
  ownerName?: string
  ownerType?: 'INDIVIDUAL' | 'COMPANY' | 'GOVERNMENT' | 'TRUST'
}

export interface NLIMSParcelCoordinate {
  cornerNumber: number
  easting: number
  northing: number
  utmZone: number
  // These fields describe coordinates in the draft; they do not verify
  // the declared CRS or the field coordinate realization.
  datum: string
  projection: string
  hemisphere: 'N' | 'S'
}

export interface NLIMSBeacon {
  beaconNumber: string
  beaconType: 'concrete' | 'iron_pin' | 'stone' | 'pipe' | 'reference_object'
  easting: number
  northing: number
  description?: string
  isAdopted: boolean
  isDisturbed: boolean
}

export interface NLIMSEncumbrance {
  type: 'CHARGE' | 'CAUTION' | 'RESTRICTION' | 'EASEMENT'
  description: string
  registeredDate?: string
  registeredBy?: string
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning'

export interface NLIMSValidationError {
  field: string
  severity: ValidationSeverity
  message: string
  code: string
}

export interface NLIMSValidationResult {
  isValid: boolean
  errors: NLIMSValidationError[]
  warnings: NLIMSValidationError[]
}

// ---------------------------------------------------------------------------
// Input Types (what the caller provides)
// ---------------------------------------------------------------------------

export interface ParcelInput {
  parcelNumber: string
  vertices: SurveyPoint[]
  landUse?: string
  ownerName?: string
  ownerType?: 'INDIVIDUAL' | 'COMPANY' | 'GOVERNMENT' | 'TRUST'
}

export interface BeaconInput {
  beaconNumber: string
  beaconType: 'concrete' | 'iron_pin' | 'stone' | 'pipe' | 'reference_object'
  coordinate: SurveyPoint
  description?: string
  isAdopted?: boolean
  isDisturbed?: boolean
}

export interface NLIMSExportParams {
  draftMetadata: NLIMSSubmissionPayload['draftMetadata']
  submissionType: 'mutation' | 'subdivision' | 'amalgamation' | 'new_registration' | 'boundary_adjustment'
  registry: string
  county: string
  subCounty: string
  surveyor: {
    name: string
    licenseNumber: string
    firm?: string
    iskMembershipNumber?: string
  }
  resultingParcels: ParcelInput[]
  beacons: BeaconInput[]
  parentParcel?: {
    parcelNumber: string
    titleDeedNumber: string
    registryMapSheet: string
    areaHectares: number
    vertices: SurveyPoint[]
  }
  encumbrances?: NLIMSEncumbrance[]
  /** Configured local tolerance for area reconciliation (hectares). */
  areaToleranceHectares?: number
  /**
   * Coordinate Reference System the parcel coordinates are written in —
   * REQUIRED. There is no default: a draft must not silently claim
   * Arc 1960 / UTM 37S.
   * Pass the project's declared CRS from project metadata, e.g.:
   *   - Central/southern Kenya (Nairobi): 37S / Arc 1960 (EPSG:21037)
   *   - Western Kenya (Kisumu, Eldoret, Kakamega): UTM Zone 36S
   *   - Northern Kenya (Turkana, Marsabit): UTM Zone 36N or 37N
   *   - Coastal region north of Mombasa: UTM Zone 37S
   *
   * The explicit declaration avoids an invented default but does not
   * independently verify that the CRS matches the survey observations.
   */
  crs: {
    utmZone: number       // 1-60
    hemisphere: 'N' | 'S'
    datum: string         // e.g. 'Arc_1960', 'WGS 84'
    projection?: string   // default 'UTM' (NLIMS format constant)
  }
}

// ---------------------------------------------------------------------------
// CRS declaration (REQUIRED — no positional defaults; see resolveCRS)
// ---------------------------------------------------------------------------

const DEFAULT_PROJECTION = 'UTM' as const

/**
 * Resolve the declared CRS. An undeclared CRS throws rather than silently
 * applying a default coordinate label.
 */
function resolveCRS(params: NLIMSExportParams) {
  const crs = params.crs
  if (!crs || !crs.utmZone || !crs.hemisphere || !crs.datum) {
    throw new Error(
      'Cadastral draft export requires an explicit CRS declaration (crs.utmZone, crs.hemisphere, crs.datum).',
    )
  }
  if (!Number.isInteger(crs.utmZone) || crs.utmZone < 1 || crs.utmZone > 60) {
    throw new Error(`NLIMS CRS utmZone must be an integer 1-60 (received: ${String(crs.utmZone)}).`)
  }
  return {
    utmZone: crs.utmZone,
    hemisphere: crs.hemisphere,
    datum: crs.datum,
    projection: crs.projection ?? DEFAULT_PROJECTION,
  }
}

/**
 * Local beacon identifier pattern used to show a formatting warning only.
 * It is not a verified Survey of Kenya nomenclature rule.
 * - KP/XX/YY: Kenya Pattern (sheet/beacon)
 * - MB/XXX: Mutation Beacon
 * - BBB/XXX: Standard numbered beacon
 * - IRP/XXX: Iron Pin
 * - RMB/XXX: Reference Mark Beacon
 */
const BEACON_PATTERN = /^(KP|MB|IRP|RMB)\/?\d+\/?\d+$/i

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the NLIMS export parameters before generating the payload.
 */
export function validateNLIMSExport(params: NLIMSExportParams): NLIMSValidationResult {
  const errors: NLIMSValidationError[] = []
  const warnings: NLIMSValidationError[] = []

  // Surveyor validation
  if (!params.surveyor.name?.trim()) {
    errors.push({
      field: 'surveyor.name',
      severity: 'error',
      message: 'Surveyor name is required',
      code: 'MISSING_SURVEYOR_NAME',
    })
  }

  if (!params.surveyor.licenseNumber?.trim()) {
    errors.push({
      field: 'surveyor.licenseNumber',
      severity: 'error',
      message: 'Surveyor license number is required',
      code: 'MISSING_LICENSE',
    })
  } else if (!/^ISK\/LS\/\d{4}\/\d{3,4}$/i.test(params.surveyor.licenseNumber)) {
    warnings.push({
      field: 'surveyor.licenseNumber',
      severity: 'warning',
      message: 'License number does not match ISK/LS/YYYY/NNN format',
      code: 'LICENSE_FORMAT',
    })
  }

  if (params.beacons.length === 0) {
    warnings.push({
      field: 'beacons',
      severity: 'warning',
      message: 'No beacon or monument observations are included in this draft.',
      code: 'BEACON_DATA_NOT_INCLUDED',
    })
  }

  // Registry validation
  if (!params.registry?.trim()) {
    errors.push({
      field: 'registry',
      severity: 'error',
      message: 'Registry is required',
      code: 'MISSING_REGISTRY',
    })
  }

  if (!params.county?.trim()) {
    errors.push({
      field: 'county',
      severity: 'error',
      message: 'County is required',
      code: 'MISSING_COUNTY',
    })
  }

  // Keep the draft CRS explicit; this does not independently verify it.
  const crs = params.crs
  if (!crs || !crs.utmZone || !crs.hemisphere || !crs.datum) {
    errors.push({
      field: 'crs',
      severity: 'error',
      message:
        'CRS must be declared (crs.utmZone, crs.hemisphere, crs.datum) — NLIMS coordinates may not be silently labelled Arc 1960 / UTM 37S',
      code: 'MISSING_CRS',
    })
  } else if (!Number.isInteger(crs.utmZone) || crs.utmZone < 1 || crs.utmZone > 60) {
    errors.push({
      field: 'crs.utmZone',
      severity: 'error',
      message: `UTM zone must be an integer 1-60 (received: ${String(crs.utmZone)})`,
      code: 'INVALID_UTM_ZONE',
    })
  } else if (crs.hemisphere !== 'N' && crs.hemisphere !== 'S') {
    errors.push({
      field: 'crs.hemisphere',
      severity: 'error',
      message: `Hemisphere must be N or S (received: ${String(crs.hemisphere)})`,
      code: 'INVALID_HEMISPHERE',
    })
  }

  // Parcels validation
  if (params.resultingParcels.length === 0) {
    errors.push({
      field: 'resultingParcels',
      severity: 'error',
      message: 'At least one resulting parcel is required',
      code: 'NO_PARCELS',
    })
  }

  for (let i = 0; i < params.resultingParcels.length; i++) {
    const parcel = params.resultingParcels[i]
    if (parcel.vertices.length < 3) {
      errors.push({
        field: `resultingParcels[${i}].vertices`,
        severity: 'error',
        message: `Parcel ${parcel.parcelNumber || i + 1} has insufficient vertices (minimum 3 required)`,
        code: 'INSUFFICIENT_VERTICES',
      })
    }
    if (!parcel.parcelNumber?.trim()) {
      errors.push({
        field: `resultingParcels[${i}].parcelNumber`,
        severity: 'error',
        message: `Parcel ${i + 1} is missing a parcel number`,
        code: 'MISSING_PARCEL_NUMBER',
      })
    }
  }

  // Beacon validation
  for (let i = 0; i < params.beacons.length; i++) {
    const beacon = params.beacons[i]
    if (!beacon.beaconNumber?.trim()) {
      errors.push({
        field: `beacons[${i}].beaconNumber`,
        severity: 'error',
        message: `Beacon ${i + 1} is missing a beacon number`,
        code: 'MISSING_BEACON_NUMBER',
      })
    } else if (!BEACON_PATTERN.test(beacon.beaconNumber)) {
      warnings.push({
        field: `beacons[${i}].beaconNumber`,
        severity: 'warning',
        message: `Beacon "${beacon.beaconNumber}" does not match this draft's configured identifier pattern. Confirm the required format for the project.`,
        code: 'BEACON_NOMENCLATURE',
      })
    }
  }

  // Area reconciliation validation (only for subdivisions/mutations)
  if ((params.submissionType === 'subdivision' || params.submissionType === 'mutation') && params.parentParcel) {
    const sumOfParts = params.resultingParcels.reduce((sum, p) => {
      return sum + calculateAreaHectares(p.vertices)
    }, 0)

    const parentArea = params.parentParcel.areaHectares
    const diff = Math.abs(parentArea - sumOfParts)
    const tolerance = params.areaToleranceHectares ?? 0.001

    if (diff > tolerance) {
      errors.push({
        field: 'areaReconciliation',
        severity: 'error',
        message: `Area mismatch: parent (${parentArea.toFixed(4)} ha) vs sum of parts (${sumOfParts.toFixed(4)} ha). Difference: ${diff.toFixed(4)} ha exceeds tolerance (${tolerance} ha).`,
        code: 'AREA_MISMATCH',
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Geometry Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate polygon area in m² using the Shoelace formula.
 * Coordinates must be in a projected CRS (EPSG:21037).
 */
export function calculateAreaSqM(vertices: SurveyPoint[]): number {
  if (vertices.length < 3) return 0

  let sum = 0
  const n = vertices.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    sum += vertices[i].easting * vertices[j].northing
    sum -= vertices[j].easting * vertices[i].northing
  }

  return Math.abs(sum / 2)
}

/**
 * Calculate polygon perimeter in meters.
 */
export function calculatePerimeterM(vertices: SurveyPoint[]): number {
  if (vertices.length < 2) return 0

  let perim = 0
  const n = vertices.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dE = vertices[j].easting - vertices[i].easting
    const dN = vertices[j].northing - vertices[i].northing
    perim += Math.sqrt(dE * dE + dN * dN)
  }

  return perim
}

/**
 * Convert m² to hectares.
 */
export function sqMToHectares(sqM: number): number {
  return sqM / 10000
}

/**
 * Calculate area in hectares.
 */
export function calculateAreaHectares(vertices: SurveyPoint[]): number {
  return sqMToHectares(calculateAreaSqM(vertices))
}

// ---------------------------------------------------------------------------
// Integrity Hash
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 integrity hash of the complete draft payload.
 *
 * This ensures the payload hasn't been tampered with after the surveyor
 * signs off on it. Uses the Web Crypto API (available in browsers and
 * Node.js 18+).
 */
export async function computeIntegrityHash(payload: Omit<NLIMSSubmissionPayload, 'integrity'>): Promise<string> {
  // Sort every object recursively. A top-level replacer array would omit
  // nested coordinate, parcel and surveyor properties from the digest.
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      )
    }
    return value
  }
  const sorted = JSON.stringify(canonicalize(payload))
  const encoder = new TextEncoder()
  const data = encoder.encode(sorted)

  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 is unavailable; refusing to generate a draft integrity hash.')
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Main Export Function
// ---------------------------------------------------------------------------

/**
 * Generate a METARDU cadastral draft from saved project survey data.
 *
 * @param params - Export parameters (parcels, beacons, surveyor info, etc.)
 * @returns The submission payload with integrity hash, or throws on validation error.
 * @throws Error if validation fails (use validateNLIMSExport() first to get detailed errors).
 */
export async function exportToNLIMS(params: NLIMSExportParams): Promise<{
  payload: NLIMSSubmissionPayload
  validation: NLIMSValidationResult
}> {
  // Validate first
  const validation = validateNLIMSExport(params)
  if (!validation.isValid) {
    throw new Error(
      `NLIMS export validation failed: ${validation.errors.map(e => e.message).join('; ')}`
    )
  }

  // Resolve CRS from the saved project declaration; never invent a default.
  const crs = resolveCRS(params)

  // Build resulting parcels
  const resultingParcels: NLIMSSubmissionParcel[] = params.resultingParcels.map(parcel => {
    const areaSqM = calculateAreaSqM(parcel.vertices)
    const perimeterM = calculatePerimeterM(parcel.vertices)

    return {
      parcelNumber: parcel.parcelNumber,
      parcelType: 'new' as const,
      areaHectares: parseFloat(sqMToHectares(areaSqM).toFixed(4)),
      areaSqM: parseFloat(areaSqM.toFixed(3)),
      perimeterM: parseFloat(perimeterM.toFixed(3)),
      coordinates: parcel.vertices.map((v, idx) => ({
        cornerNumber: idx + 1,
        easting: parseFloat(v.easting.toFixed(3)),
        northing: parseFloat(v.northing.toFixed(3)),
        utmZone: crs.utmZone,
        datum: crs.datum,
        projection: crs.projection,
        hemisphere: crs.hemisphere,
      })),
      landUse: parcel.landUse,
      ownerName: parcel.ownerName,
      ownerType: parcel.ownerType,
    }
  })

  // Build parent parcel (if applicable)
  const parentParcel = params.parentParcel
    ? {
        parcelNumber: params.parentParcel.parcelNumber,
        titleDeedNumber: params.parentParcel.titleDeedNumber,
        registryMapSheet: params.parentParcel.registryMapSheet,
        areaHectares: params.parentParcel.areaHectares,
        coordinates: params.parentParcel.vertices.map((v, idx) => ({
          cornerNumber: idx + 1,
          easting: parseFloat(v.easting.toFixed(3)),
          northing: parseFloat(v.northing.toFixed(3)),
          utmZone: crs.utmZone,
          datum: crs.datum,
          projection: crs.projection,
          hemisphere: crs.hemisphere,
        })),
      }
    : undefined

  // Build beacons
  const beacons: NLIMSBeacon[] = params.beacons.map(b => ({
    beaconNumber: b.beaconNumber,
    beaconType: b.beaconType,
    easting: parseFloat(b.coordinate.easting.toFixed(3)),
    northing: parseFloat(b.coordinate.northing.toFixed(3)),
    description: b.description,
    isAdopted: b.isAdopted ?? false,
    isDisturbed: b.isDisturbed ?? false,
  }))

  // Area reconciliation
  const sumOfPartsHectares = resultingParcels.reduce((sum, p) => sum + p.areaHectares, 0)
  const parentAreaHectares = params.parentParcel?.areaHectares ?? null
  const toleranceHectares = params.areaToleranceHectares ?? 0.001
  const differenceHectares = parentAreaHectares != null
    ? Math.abs(parentAreaHectares - sumOfPartsHectares)
    : 0

  const areaReconciliation = {
    parentAreaHectares,
    sumOfPartsHectares: parseFloat(sumOfPartsHectares.toFixed(4)),
    differenceHectares: parseFloat(differenceHectares.toFixed(4)),
    isWithinTolerance: differenceHectares <= toleranceHectares,
    toleranceHectares,
  }

  // Build payload (without integrity hash first)
  const submissionId = `METARDU-DRAFT-${Date.now()}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`
  const submissionDate = new Date().toISOString()

  const payloadWithoutHash: Omit<NLIMSSubmissionPayload, 'integrity'> = {
    draftMetadata: params.draftMetadata,
    submissionId,
    submissionDate,
    submissionType: params.submissionType,
    registry: params.registry,
    county: params.county,
    subCounty: params.subCounty,
    surveyor: params.surveyor,
    parentParcel,
    resultingParcels,
    areaReconciliation,
    beacons,
    encumbrances: params.encumbrances ?? [],
  }

  // Compute integrity hash
  const hash = await computeIntegrityHash(payloadWithoutHash)

  const payload: NLIMSSubmissionPayload = {
    ...payloadWithoutHash,
    integrity: {
      hash,
      algorithm: 'SHA-256',
      computedAt: submissionDate,
    },
  }

  return { payload, validation }
}

/**
 * Download the JSON draft with an explicit METARDU filename.
 */
export function downloadNLIMSPayload(payload: NLIMSSubmissionPayload, filename?: string): void {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `METARDU-cadastral-draft-${payload.submissionId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
