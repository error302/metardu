/**
 * METARDU Project CRS Authority — the single source of truth for
 * coordinate reference systems, transformations, and survey measurement.
 *
 * BLUEPRINT §20.1 (Sprint A / P0 "Survey integrity"):
 *   "EPSG:3857 may draw the picture. The project reference system
 *    performs the surveying mathematics."
 *
 * This module is ISOMORPHIC (server + client): it depends only on proj4 —
 * never on OpenLayers — so API import sessions, exporters, background
 * workers, and the map all share ONE mathematical path.
 *
 * ENFORCEMENT, NOT ASPIRATION:
 *   assertSurveyCrs() is called by every measurement function below.
 *   EPSG:3857 and unregistered codes physically cannot enter survey math.
 *   A lint rule can ban them statically; this file bans them at runtime.
 *
 * ZERO SILENT PROFESSIONAL DEFAULTS:
 *   - createProjectReferenceSystem() requires an explicit horizontalCrs.
 *   - resolveEpsg() throws on unknown codes (with a registerCrs hint).
 *   - surveyDistance() refuses geographic CRS instead of guessing units.
 *   The only defaults are visible, documented formatting conventions
 *   (grid distance mode, 3-decimal coordinate display).
 *
 * DO NOT ADD transforms elsewhere (blueprint rule #2: do not duplicate
 * survey mathematics). Map layers should transform project data through
 * this module; importers must call validateCrsForProject() before commit.
 *
 * Golden tests: src/lib/spatial/__tests__/projectCrs.test.ts
 */

import proj4 from 'proj4'
import { shoelaceArea } from '@/lib/engine/area'
import {
  EPSG_21036_DEF,
  EPSG_21037_DEF,
} from '@/lib/map/projectionConstants'

// ─── Errors ─────────────────────────────────────────────────────────────────

export type CrsErrorCode =
  | 'CRS_UNREGISTERED'
  | 'CRS_DISPLAY_ONLY_FOR_SURVEY'
  | 'CRS_NOT_PROJECTED'
  | 'CRS_INVALID'
  | 'PRS_INCOMPLETE'
  | 'GEODESIC_NON_CONVERGENT'

export class CrsError extends Error {
  readonly code: CrsErrorCode
  constructor(code: CrsErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'CrsError'
    this.code = code
  }
}

// ─── CRS metadata ───────────────────────────────────────────────────────────

export interface CrsInfo {
  /** Canonical code, e.g. 'EPSG:21037'. */
  code: string
  /** Human name, e.g. 'Arc 1960 / UTM zone 37S'. */
  name: string
  /** Datum name, e.g. 'Arc 1960', 'WGS 84'. */
  datum: string
  units: 'metres' | 'degrees'
  /** True for projected CRS, false for geographic. */
  projected: boolean
  /** UTM zone when applicable. */
  zone?: number
  hemisphere?: 'N' | 'S'
  /** Display-only CRS — may never be used for survey mathematics. */
  displayOnly?: boolean
  /** Professional caveats surfaced in the UI. */
  notes?: string
}

interface RegisteredCrs {
  info: CrsInfo
  /** proj4 definition string. */
  def: string
  /** Set once registered with proj4. */
  proj4Registered: boolean
}

/** Display CRS for basemaps and map canvases — never for survey math. */
export const DISPLAY_CRS = 'EPSG:3857'

/** Geographic WGS84 — import/export lingua franca, not a project CRS for plane math. */
export const WGS84_CRS = 'EPSG:4326'

// ─── proj4 definition strings ───────────────────────────────────────────────

const DEF_4326 = '+proj=longlat +datum=WGS84 +no_defs'
const DEF_3857 =
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +no_defs'

function utmWgs84Def(zone: number, south: boolean): string {
  // Zone is validated by the registry builder (1..60).
  return `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`
}

// ─── Registry ───────────────────────────────────────────────────────────────

const registry = new Map<string, RegisteredCrs>()

function addCrs(info: CrsInfo, def: string): void {
  registry.set(info.code, { info, def, proj4Registered: false })
}

function utmInfoFromCode(code: string): CrsInfo | null {
  // WGS84 UTM families: EPSG:326NN (north) / EPSG:327NN (south), NN 01..60.
  const match = /^EPSG:32([67])(\d{2})$/.exec(code)
  if (!match) return null
  const south = match[1] === '7'
  const zone = parseInt(match[2], 10)
  if (zone < 1 || zone > 60) return null
  return {
    code,
    name: `WGS 84 / UTM zone ${zone}${south ? 'S' : 'N'}`,
    datum: 'WGS 84',
    units: 'metres',
    projected: true,
    zone,
    hemisphere: south ? 'S' : 'N',
  }
}

// Built-ins registered eagerly: everything used by the platform today.
addCrs(
  { code: WGS84_CRS, name: 'WGS 84 (geographic 2D)', datum: 'WGS 84', units: 'degrees', projected: false },
  DEF_4326,
)
addCrs(
  {
    code: DISPLAY_CRS,
    name: 'WGS 84 / Pseudo-Mercator (Web Mercator)',
    datum: 'WGS 84 (sphere)',
    units: 'metres',
    projected: true,
    displayOnly: true,
    notes: 'DISPLAY ONLY. Distances and areas in EPSG:3857 are distorted by 1/cos(latitude) — up to 40% at high latitudes. Never use for survey mathematics.',
  },
  DEF_3857,
)
addCrs(
  {
    code: 'EPSG:21036',
    name: 'Arc 1960 / UTM zone 36S',
    datum: 'Arc 1960',
    units: 'metres',
    projected: true,
    zone: 36,
    hemisphere: 'S',
    notes: 'Kenya national cadastral CRS (western Kenya). Uses the EPSG-registered Arc 1960 → WGS84 transformation EPSG:1122 (3-parameter geocentric translation, 35 m).',
  },
  EPSG_21036_DEF,
)
addCrs(
  {
    code: 'EPSG:21037',
    name: 'Arc 1960 / UTM zone 37S',
    datum: 'Arc 1960',
    units: 'metres',
    projected: true,
    zone: 37,
    hemisphere: 'S',
    notes: 'Kenya national cadastral CRS (eastern Kenya). Uses the EPSG-registered Arc 1960 → WGS84 transformation EPSG:1122 (3-parameter geocentric translation, 35 m).',
  },
  EPSG_21037_DEF,
)

/**
 * Register a custom/project CRS (e.g. a national grid, a local site system,
 * or Arc 1960 zones for other jurisdictions — verify the national
 * transformation parameters before registering them as authoritative).
 */
export function registerCrs(info: CrsInfo, def: string): void {
  if (!info.code || !def) {
    throw new CrsError('CRS_INVALID', 'registerCrs requires a code and a proj4 definition string')
  }
  const existing = registry.get(info.code)
  if (existing && existing.def !== def) {
    throw new CrsError(
      'CRS_INVALID',
      `${info.code} is already registered with a different definition. Re-registering a CRS with new parameters would silently change every computation that used it.`,
    )
  }
  addCrs(info, def)
}

function lookup(code: string): RegisteredCrs {
  const canonical = canonicalCode(code)
  let entry = registry.get(canonical)
  if (!entry) {
    // Lazily materialise the WGS84 UTM families (all 120 zones).
    const generated = utmInfoFromCode(canonical)
    if (generated && generated.zone !== undefined) {
      addCrs(generated, utmWgs84Def(generated.zone, generated.hemisphere === 'S'))
      entry = registry.get(canonical)
    }
  }
  if (!entry) {
    throw new CrsError(
      'CRS_UNREGISTERED',
      `${canonical} is not registered. If this is a valid CRS for your jurisdiction, register it explicitly with registerCrs() — METARDU never guesses a datum.`,
    )
  }
  return entry
}

function canonicalCode(code: string): string {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new CrsError('CRS_INVALID', `CRS code must be a non-empty string (received: ${String(code)})`)
  }
  const trimmed = code.trim()
  return /^epsg:/i.test(trimmed) || /^\d+$/.test(trimmed)
    ? `EPSG:${trimmed.replace(/^epsg:/i, '')}`
    : trimmed
}

/** Register a CRS definition with proj4 (idempotent). */
function ensureProj4Registered(entry: RegisteredCrs): void {
  if (!entry.proj4Registered) {
    proj4.defs(entry.info.code, entry.def)
    entry.proj4Registered = true
  }
}

/**
 * Companion geographic CRS for a projected CRS (same ellipsoid, no towgs84).
 *
 * Critical detail: the Arc 1960 → WGS84 transformation (EPSG:1122) is a
 * geocentric translation. Inverting a projection THROUGH a datum
 * transformation contaminates local distances with a datum-shift artefact.
 * Point scale factors must be computed against the projection's own
 * ellipsoid — this companion gives an exact inverse with no datum shift.
 */
const geoCompanions = new Map<string, { proj: string; geo: string }>()

function companionPair(entry: RegisteredCrs): { proj: string; geo: string } {
  const code = entry.info.code
  let pair = geoCompanions.get(code)
  if (!pair) {
    const ell = ellipsoidFor(entry.def)
    const geo = `__geo__${code}`
    const proj = `__base__${code}`
    // Datum-shift parameters affect only datum TRANSFORMATIONS, never the
    // projection math itself — strip them so the inverse is a pure
    // projection inverse on the CRS's own ellipsoid.
    let baseDef = entry.def
      .replace(/\s*\+towgs84=[^\s]+/g, '')
      .replace(/\s*\+nadgrids=[^\s]+/g, '')
      .replace(/\s*\+datum=[^\s]+/g, '')
    if (!/\+ellps=/.test(baseDef) && !/\+a=/.test(baseDef)) {
      baseDef += ` +a=${ell.a} +rf=${ell.rf}`
    }
    baseDef = baseDef.replace(/\s+/g, ' ').trim() + ' +no_defs'
    proj4.defs(proj, baseDef)
    proj4.defs(geo, `+proj=longlat +a=${ell.a} +rf=${ell.rf} +no_defs`)
    pair = { proj, geo }
    geoCompanions.set(code, pair)
  }
  return pair
}

// ─── Ellipsoid (for geodesic and elevation-factor computations) ─────────────

export interface Ellipsoid {
  /** Semi-major axis (metres). */
  a: number
  /** Inverse flattening. */
  rf: number
}

const KNOWN_ELLIPSOIDS: Record<string, Ellipsoid> = {
  WGS84: { a: 6378137.0, rf: 298.257223563 },
  GRS80: { a: 6378137.0, rf: 298.257222101 },
  clrk80: { a: 6378249.145, rf: 293.465 },
}

function ellipsoidFor(def: string): Ellipsoid {
  const datum = /(?:\+datum=)([a-z0-9]+)/i.exec(def)?.[1]
  if (datum && KNOWN_ELLIPSOIDS[datum]) return KNOWN_ELLIPSOIDS[datum]
  const ellps = /(?:\+ellps=)([a-z0-9]+)/i.exec(def)?.[1]
  if (ellps && KNOWN_ELLIPSOIDS[ellps]) return KNOWN_ELLIPSOIDS[ellps]
  const a = /(?:\+a=)([0-9.]+)/.exec(def)?.[1]
  const rf = /(?:\+rf=)([0-9.]+)/.exec(def)?.[1]
  if (a && rf) return { a: parseFloat(a), rf: parseFloat(rf) }
  throw new CrsError('CRS_INVALID', `Cannot determine ellipsoid from proj4 definition: ${def}`)
}

export interface DatumEllipsoid extends Ellipsoid {
  /** Registry-style display name (e.g. 'Clarke 1880 (RGS)'). */
  name: string
}

const ELLIPSOID_NAMES: Record<keyof typeof KNOWN_ELLIPSOIDS, string> = {
  WGS84: 'WGS 84',
  GRS80: 'GRS 80',
  clrk80: 'Clarke 1880 (RGS)',
}

/**
 * Ellipsoid for a declared datum — the single source exporters and report
 * generators use for CRS metadata labels. Returns null for datums METARDU
 * does not know; callers must then report the datum as UNVERIFIED rather
 * than substituting one.
 */
export function ellipsoidForDatum(datum: string): DatumEllipsoid | null {
  const key = String(datum ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase()
  if (key === 'arc1960' || key === 'clrk80' || key === 'clarke1880rgs') {
    return { name: ELLIPSOID_NAMES.clrk80, ...KNOWN_ELLIPSOIDS.clrk80 }
  }
  if (key === 'wgs84' || key === 'wgs1984') {
    return { name: ELLIPSOID_NAMES.WGS84, ...KNOWN_ELLIPSOIDS.WGS84 }
  }
  if (key === 'grs80') {
    return { name: ELLIPSOID_NAMES.GRS80, ...KNOWN_ELLIPSOIDS.GRS80 }
  }
  return null
}

// ─── Resolution and description ──────────────────────────────────────────────

/** Resolve a CRS code to registered metadata, registering lazily where safe. */
export function resolveEpsg(code: string): CrsInfo {
  const entry = lookup(code)
  ensureProj4Registered(entry)
  return { ...entry.info }
}

/** Copy an explicitly registered definition into another compute realm; never infer parameters. */
export function getRegisteredCrsDefinition(code: string): {info:CrsInfo;def:string} {
  const entry=lookup(code)
  return {info:{...entry.info},def:entry.def}
}

/** Metadata for display (never throws for unregistered codes). */
export function describeCrs(code: string): CrsInfo | null {
  try {
    return resolveEpsg(code)
  } catch {
    return null
  }
}

/** All currently registered CRS (for pickers). Display-only codes included. */
export function listSupportedCrs(): CrsInfo[] {
  // Materialise the common WGS84 UTM zones so pickers list them.
  for (let z = 1; z <= 60; z++) {
    try {
      resolveEpsg(`EPSG:326${String(z).padStart(2, '0')}`)
      resolveEpsg(`EPSG:327${String(z).padStart(2, '0')}`)
    } catch {
      /* unreachable — generated family */
    }
  }
  return Array.from(registry.values()).map((e) => ({ ...e.info }))
}

export function isRegistered(code: string): boolean {
  try {
    lookup(code)
    return true
  } catch {
    return false
  }
}

// ─── Guards ─────────────────────────────────────────────────────────────────

/**
 * The professional-mathematics gate. Throws for:
 *  - EPSG:3857 and any displayOnly CRS (Web Mercator is a picture, not a survey)
 *  - unregistered codes (METARDU never guesses a datum)
 */
export function assertSurveyCrs(code: string): CrsInfo {
  const info = resolveEpsg(code)
  if (info.displayOnly) {
    throw new CrsError(
      'CRS_DISPLAY_ONLY_FOR_SURVEY',
      `${info.code} (${info.name}) is a display projection and must never be used for survey distances, areas, or coordinates. ${info.notes ?? ''}`,
    )
  }
  return info
}

/** Measurement gate: plane survey math requires a projected CRS. */
export function assertProjectedCrs(code: string): CrsInfo {
  const info = assertSurveyCrs(code)
  if (!info.projected) {
    throw new CrsError(
      'CRS_NOT_PROJECTED',
      `${info.code} is geographic. Plane survey mathematics is undefined in degrees — set a projected project CRS (e.g. the national UTM zone), or use geodesicDistanceWgs84() explicitly for ellipsoidal checks.`,
    )
  }
  return info
}

// ─── Project Reference System ───────────────────────────────────────────────

export interface ProjectReferenceSystem {
  /** Authoritative horizontal CRS for ALL project mathematics. */
  horizontalCrs: string
  /** Resolved name, e.g. 'Arc 1960 / UTM zone 37S'. */
  horizontalName: string
  datum: string
  units: 'metres'
  zone?: number
  hemisphere?: 'N' | 'S'
  /** Vertical datum description, e.g. 'Kenya orthometric (mean sea level)'. */
  verticalDatum?: string
  verticalReference?: 'orthometric' | 'ellipsoidal' | 'trig' | 'local'
  /** Whether schedules/plans state grid or ground distances. Visible default: 'grid'. */
  distanceMode: 'grid' | 'ground'
  /**
   * Combined scale factor (k × elevation factor) when the project uses a
   * single adopted factor. Absent → compute per point from coordinates + heights.
   */
  combinedScaleFactor?: number
  /** Coordinate display precision (decimals). Visible default: 3. */
  coordinatePrecision: number
  angularUnit: 'degrees'
  /** Transformation/version notes for provenance on deliverables. */
  notes?: string
}

export type ProjectReferenceSystemInput = Partial<ProjectReferenceSystem> &
  Pick<ProjectReferenceSystem, 'horizontalCrs'>

/**
 * Create the project reference system — the authoritative context for every
 * computation, import, export, plan, and schedule in a project.
 *
 * There is NO default CRS: omitting horizontalCrs throws. A project without
 * an explicit reference system must never compute anything (blueprint §2.4).
 */
export function createProjectReferenceSystem(
  input: ProjectReferenceSystemInput,
): ProjectReferenceSystem {
  if (!input.horizontalCrs) {
    throw new CrsError(
      'PRS_INCOMPLETE',
      'A project must declare its horizontal CRS before any survey work. METARDU never assumes a datum, zone, or projection silently (blueprint §2.4).',
    )
  }
  const info = assertProjectedCrs(input.horizontalCrs)
  return {
    horizontalCrs: info.code,
    horizontalName: info.name,
    datum: info.datum,
    units: 'metres',
    zone: info.zone,
    hemisphere: info.hemisphere,
    verticalDatum: input.verticalDatum,
    verticalReference: input.verticalReference,
    distanceMode: input.distanceMode ?? 'grid',
    combinedScaleFactor: input.combinedScaleFactor,
    coordinatePrecision: input.coordinatePrecision ?? 3,
    angularUnit: 'degrees',
    notes: input.notes,
  }
}

/** Title-block / report text for the reference system (deliverable metadata, P0). */
export function describeProjectReferenceSystem(prs: ProjectReferenceSystem): string[] {
  const lines = [
    `${prs.horizontalName} (${prs.horizontalCrs})`,
    `Datum: ${prs.datum}`,
    prs.verticalDatum
      ? `Vertical datum: ${prs.verticalDatum} (${prs.verticalReference ?? 'unspecified reference'})`
      : 'Vertical datum: NOT SPECIFIED',
    `Distances: ${prs.distanceMode}${prs.combinedScaleFactor ? ` (adopted combined factor ${prs.combinedScaleFactor.toFixed(6)})` : ''}`,
    `Units: metres; coordinates shown to ${prs.coordinatePrecision} decimals`,
  ]
  if (prs.notes) lines.push(prs.notes)
  return lines
}

// ─── Transformation ─────────────────────────────────────────────────────────

/** Transform a single 2D point between any two registered CRS. */
export function transformPoint(
  x: number,
  y: number,
  from: string,
  to: string,
): [number, number] {
  const fromEntry = lookup(from)
  const toEntry = lookup(to)
  ensureProj4Registered(fromEntry)
  ensureProj4Registered(toEntry)
  const [tx, ty] = proj4(fromEntry.info.code, toEntry.info.code, [x, y])
  return [tx, ty]
}

export type Position2D = [number, number]

/** GeoJSON geometry (2D positions; any z is preserved untouched). */
export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString' | 'MultiPoint'; coordinates: number[][] }
  | { type: 'Polygon' | 'MultiLineString'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

function transformPositions(positions: number[][], from: string, to: string): number[][] {
  return positions.map((pos) => {
    const [tx, ty] = transformPoint(pos[0], pos[1], from, to)
    return pos.length > 2 ? [tx, ty, pos[2]] : [tx, ty]
  })
}

/** Transform a GeoJSON geometry between CRS (returns a new geometry). */
export function transformGeometry<T extends GeoJsonGeometry>(geometry: T, from: string, to: string): T {
  if (canonicalCode(from) === canonicalCode(to)) {
    return JSON.parse(JSON.stringify(geometry)) as T
  }
  const g = geometry as GeoJsonGeometry
  switch (g.type) {
    case 'Point':
      return { ...g, coordinates: transformPositions([g.coordinates], from, to)[0] } as T
    case 'LineString':
    case 'MultiPoint':
      return { ...g, coordinates: transformPositions(g.coordinates, from, to) } as T
    case 'Polygon':
    case 'MultiLineString':
      return { ...g, coordinates: g.coordinates.map((r) => transformPositions(r, from, to)) } as T
    case 'MultiPolygon':
      return {
        ...g,
        coordinates: g.coordinates.map((poly) => poly.map((r) => transformPositions(r, from, to))),
      } as T
    default:
      throw new CrsError('CRS_INVALID', `Unsupported GeoJSON geometry type: ${(g as { type: string }).type}`)
  }
}

/** Project CRS → Web Mercator for map display. */
export function toDisplay(x: number, y: number, from: string): [number, number] {
  return transformPoint(x, y, from, DISPLAY_CRS)
}

/** Web Mercator → project CRS (e.g. converting a click into survey coordinates). */
export function fromDisplay(x: number, y: number, to: string): [number, number] {
  return transformPoint(x, y, DISPLAY_CRS, to)
}

// ─── Survey measurement (project CRS plane mathematics — guarded) ────────────

/** Plane distance in the project CRS (metres). Symmetric, exact. */
export function surveyDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  crs: string,
): number {
  assertProjectedCrs(crs)
  return Math.hypot(bx - ax, by - ay)
}

/** Whole-circle grid bearing in degrees, normalised to [0, 360). */
export function surveyBearing(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  crs: string,
): number {
  assertProjectedCrs(crs)
  const dE = bx - ax
  const dN = by - ay
  if (dE === 0 && dN === 0) {
    throw new CrsError('CRS_INVALID', 'Bearing is undefined between coincident points')
  }
  const brg = (Math.atan2(dE, dN) * 180) / Math.PI
  return brg < 0 ? brg + 360 : brg
}

/** Shoelace area in the project CRS (m²) — reuses the canonical engine. */
export function surveyArea(ring: Position2D[], crs: string): number {
  assertProjectedCrs(crs)
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring
  if (pts.length < 3) return 0
  return shoelaceArea(pts.map(([e, n]) => ({ easting: e, northing: n })))
}

/** Perimeter in the project CRS (metres). */
export function surveyPerimeter(ring: Position2D[], crs: string): number {
  assertProjectedCrs(crs)
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring
  if (pts.length < 2) return 0
  let perimeter = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    perimeter += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
  }
  return perimeter
}

// ─── Point scale factor (exact, numerical — no series approximation) ────────

/**
 * Exact point scale factor at a project-CRS coordinate, computed by local
 * numerical differentiation on the projection's own ellipsoid (companion
 * geographic CRS — no datum-shift contamination).
 *
 * At a UTM central meridian this returns 0.999600000 (golden-tested to ±1e-7),
 * which the 2nd-order series in geodesy/scaleFactor.ts approximates.
 */
export function pointScaleFactor(x: number, y: number, crs: string): number {
  const entry = lookup(crs)
  assertProjectedCrs(crs)
  ensureProj4Registered(entry)
  const { proj, geo } = companionPair(entry)
  const d = 100 // metres — local differential (large enough for double
  // precision at 10⁷-metre coordinates, small enough to stay local)
  const inv = (px: number, py: number): [number, number] =>
    proj4(proj, geo, [px, py]) as [number, number] // [lon, lat]
  const south = inv(x, y - d / 2)
  const north = inv(x, y + d / 2)
  const west = inv(x - d / 2, y)
  const east = inv(x + d / 2, y)
  const ell = ellipsoidFor(entry.def)
  const kMeridian = d / vincentyDistance(south[0], south[1], north[0], north[1], ell)
  const kParallel = d / vincentyDistance(west[0], west[1], east[0], east[1], ell)
  return (kMeridian + kParallel) / 2
}

/** Latitude of a project-CRS point on its own datum (for radii of curvature). */
function latitudeOf(x: number, y: number, entry: RegisteredCrs): number {
  ensureProj4Registered(entry)
  const { proj, geo } = companionPair(entry)
  const [, lat] = proj4(proj, geo, [x, y]) as [number, number]
  return lat
}

/**
 * Elevation factor = R / (R + H), with R = √(ρν) — geometric mean of the
 * meridional and prime-vertical radii of curvature at the point's latitude
 * on the CRS's own ellipsoid. H is the ELLIPSOIDAL height (GNSS); for
 * orthometric heights add the geoid undulation first.
 */
export function elevationFactor(
  x: number,
  y: number,
  crs: string,
  ellipsoidalHeight: number,
): number {
  const entry = lookup(crs)
  assertProjectedCrs(crs)
  const ell = ellipsoidFor(entry.def)
  const f = 1 / ell.rf
  const e2 = 2 * f - f * f
  const latRad = (latitudeOf(x, y, entry) * Math.PI) / 180
  const sinLat = Math.sin(latRad)
  const oneMinusE2Sin2 = 1 - e2 * sinLat * sinLat
  const rho = (ell.a * (1 - e2)) / Math.pow(oneMinusE2Sin2, 1.5)
  const nu = ell.a / Math.sqrt(oneMinusE2Sin2)
  const Rm = Math.sqrt(rho * nu)
  return Rm / (Rm + ellipsoidalHeight)
}

/** Combined scale factor C = k × E. Grid distance = ground distance × C. */
export function combinedScaleFactor(
  x: number,
  y: number,
  crs: string,
  ellipsoidalHeight: number,
): number {
  return pointScaleFactor(x, y, crs) * elevationFactor(x, y, crs, ellipsoidalHeight)
}

/** Convert a grid distance to a ground distance: ground = grid / C. */
export function groundDistance(
  gridDistance: number,
  x: number,
  y: number,
  crs: string,
  ellipsoidalHeight: number,
): number {
  const C = combinedScaleFactor(x, y, crs, ellipsoidalHeight)
  if (C === 0) throw new CrsError('CRS_INVALID', 'Combined scale factor degenerated to zero')
  return gridDistance / C
}

/** Convert a ground distance to a grid distance: grid = ground × C. */
export function gridDistance(
  ground: number,
  x: number,
  y: number,
  crs: string,
  ellipsoidalHeight: number,
): number {
  return ground * combinedScaleFactor(x, y, crs, ellipsoidalHeight)
}

// ─── Geodesic distance (WGS84 / CRS ellipsoid — independent check path) ──────

/**
 * Vincenty inverse geodesic distance (sub-mm at survey scales).
 * On the WGS84 equator, 1° of longitude = 111,319.4908 m exactly
 * (golden-tested) — this function is the independent cross-check path
 * for projected-CRS distances.
 */
export function geodesicDistanceWgs84(lon1: number, lat1: number, lon2: number, lat2: number): number {
  return vincentyDistance(lon1, lat1, lon2, lat2, KNOWN_ELLIPSOIDS.WGS84)
}

function vincentyDistance(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  ell: Ellipsoid,
): number {
  const a = ell.a
  const f = 1 / ell.rf
  const b = a * (1 - f)
  const toRad = Math.PI / 180
  const L = (lon2 - lon1) * toRad
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * toRad))
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * toRad))
  const sinU1 = Math.sin(U1)
  const cosU1 = Math.cos(U1)
  const sinU2 = Math.sin(U2)
  const cosU2 = Math.cos(U2)

  let lambda = L
  let sinSigma = 0
  let cosSigma = 0
  let sigma = 0
  let sinAlpha = 0
  let cos2SigmaM = 0
  let cosSqAlpha = 0

  for (let iter = 0; iter < 1000; iter++) {
    const sinLambda = Math.sin(lambda)
    const cosLambda = Math.cos(lambda)
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda),
    )
    if (sinSigma === 0) return 0 // coincident points
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSqAlpha = 1 - sinAlpha * sinAlpha
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
    const lambdaPrev = lambda
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
    if (Math.abs(lambda - lambdaPrev) < 1e-14) break
    if (iter === 999) {
      throw new CrsError('GEODESIC_NON_CONVERGENT', `Vincenty inverse did not converge for (${lon1}, ${lat1}) → (${lon2}, ${lat2}) — near-antipodal points`)
    }
  }

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))
  return b * A * (sigma - deltaSigma)
}

// ─── UTM suggestion (pure mathematics — worldwide, no fast-path hijacks) ─────

export interface UtmSuggestion {
  code: string
  zone: number
  hemisphere: 'N' | 'S'
}

/**
 * Suggest the WGS84 UTM zone for a location. Pure mathematics with the
 * standard Norway/Svalbard exceptions (consistent with geodesy/utmZones.ts).
 * This NEVER auto-configures a project — it only pre-fills a picker the
 * surveyor must confirm (national cadastral datums like Arc 1960 differ).
 */
export function suggestUtmCrs(latitude: number, longitude: number): UtmSuggestion {
  let zone = Math.floor((longitude + 180) / 6) + 1
  // Norway exception (31V/32V overlap)
  if (latitude >= 56 && latitude < 64 && longitude >= 3 && longitude < 12) zone = 32
  // Svalbard exceptions
  if (latitude >= 72 && latitude < 84) {
    if (longitude >= 0 && longitude < 9) zone = 31
    else if (longitude >= 9 && longitude < 21) zone = 33
    else if (longitude >= 21 && longitude < 33) zone = 35
    else if (longitude >= 33 && longitude < 42) zone = 37
  }
  zone = Math.min(60, Math.max(1, zone))
  const hemisphere: 'N' | 'S' = latitude >= 0 ? 'N' : 'S'
  const nn = String(zone).padStart(2, '0')
  return { code: `EPSG:32${hemisphere === 'S' ? 7 : 6}${nn}`, zone, hemisphere }
}

// ─── Coordinate formatting service (schedules, plans, inspectors) ────────────

export interface FormatOptions {
  /** Thousands grouping (276,443.215). Default true. */
  grouping?: boolean
}

/** Format a coordinate value to fixed decimals — "276,443.215". */
export function formatCoordinate(
  value: number,
  precision = 3,
  { grouping = true }: FormatOptions = {},
): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = Math.abs(value).toFixed(precision)
  const grouped = grouping
    ? fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : fixed
  return value < 0 ? `-${grouped}` : grouped
}

/** Format an easting/northing pair for schedules and inspectors. */
export function formatPoint(
  easting: number,
  northing: number,
  precision = 3,
): string {
  return `E ${formatCoordinate(easting, precision)}   N ${formatCoordinate(northing, precision)}`
}

/**
 * Decompose a decimal angle to D°MM'SS.S" text, rounding to whole seconds of
 * the requested precision FIRST (so 89.9999999° at 1 dp prints 90°00'00.0",
 * never 89°59'60.0").
 */
function dmsBody(
  decimal: number,
  secondsPrecision: number,
  padDegrees: number,
  wrapAt360 = false,
): string {
  const scale = 10 ** secondsPrecision
  const totalSeconds = Math.round(Math.abs(decimal) * 3600 * scale) / scale
  const d0 = Math.floor(totalSeconds / 3600)
  const rem = totalSeconds - d0 * 3600
  const m0 = Math.floor(rem / 60)
  const s0 = rem - m0 * 60
  let d = d0
  let m = m0
  let secText = s0.toFixed(secondsPrecision)
  if (parseFloat(secText) >= 60) {
    // rounding carried the seconds over — carry into minutes
    m += 1
    secText = (0).toFixed(secondsPrecision)
  }
  if (m >= 60) {
    m -= 60
    d += 1
  }
  if (wrapAt360 && d >= 360) d -= 360
  const [intSec, decSec] = secText.split('.')
  const secs =
    decSec === undefined
      ? intSec.padStart(2, '0')
      : `${intSec.padStart(2, '0')}.${decSec}`
  return `${String(d).padStart(padDegrees, '0')}°${String(m).padStart(2, '0')}'${secs}`
}

/** Whole-circle bearing → D°MM'SS.S" (grid bearing convention). */
export function formatBearingDms(bearing: number, secondsPrecision = 1): string {
  const normalised = ((bearing % 360) + 360) % 360
  return `${dmsBody(normalised, secondsPrecision, 1, true)}"`
}

/** Whole-circle bearing → quadrant form, e.g. 135° → "S 45°00'00.0\" E". */
export function formatBearingQuadrant(bearing: number, secondsPrecision = 1): string {
  const brg = ((bearing % 360) + 360) % 360
  const body = dmsBody(
    brg < 90 ? brg : brg < 180 ? 180 - brg : brg < 270 ? brg - 180 : 360 - brg,
    secondsPrecision,
    2,
  )
  if (brg < 90) return `N ${body}" E`
  if (brg < 180) return `S ${body}" E`
  if (brg < 270) return `S ${body}" W`
  return `N ${body}" W`
}

/** Latitude/longitude → D°MM'SS.S\" with hemisphere letter. */
export function formatLatLonDms(value: number, axis: 'lat' | 'lon', secondsPrecision = 1): string {
  const hemi =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${dmsBody(value, secondsPrecision, 1)}"${hemi}`
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface CoordinateValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function parseUtmFromDef(def: string): { zone: number; south: boolean } | null {
  const zone = /(?:\+zone=)(\d{1,2})/.exec(def)?.[1]
  if (!zone || !/\+proj=utm/.test(def)) return null
  return { zone: parseInt(zone, 10), south: /\+south/.test(def) }
}

/**
 * Range-validate a coordinate pair against its CRS BEFORE it enters project
 * data (import sessions, manual entry, instrument imports).
 *
 * Catches the classic blunders: wrong zone, wrong hemisphere, swapped
 * easting/northing, degrees loaded as metres.
 */
export function validateCoordinateRange(
  x: number,
  y: number,
  crs: string,
): CoordinateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  assertSurveyCrs(crs)
  const entry = lookup(crs)

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { valid: false, errors: ['Coordinate is not a finite number'], warnings }
  }

  if (canonicalCode(crs) === WGS84_CRS) {
    // Geographic: x = longitude, y = latitude.
    if (Math.abs(y) > 90) errors.push(`Latitude ${y} is outside ±90°`)
    if (Math.abs(x) > 180) errors.push(`Longitude ${x} is outside ±180°`)
    if (errors.length === 0 && Math.abs(y) > 84) {
      warnings.push('Latitude beyond ±84° — outside the UTM domain; verify the source CRS')
    }
    return { valid: errors.length === 0, errors, warnings }
  }

  const utm = parseUtmFromDef(entry.def)
  if (!utm) {
    // Non-UTM projected CRS: no reliable a-priori range; accept finite values.
    return { valid: true, errors, warnings }
  }

  const [easting, northing] = [x, y]
  if (easting < 1_000 || easting > 1_000_000) {
    // Sub-kilometre eastings are never valid UTM: the classic
    // degrees-loaded-as-metres blunder lands here.
    errors.push(`Easting ${easting} is outside the UTM easting domain (1,000–1,000,000 m)`)
  } else if (easting < 160_000 || easting > 840_000) {
    warnings.push(
      `Easting ${easting.toFixed(1)} lies outside the nominal UTM strip (160,000–840,000 m) — this is usually a wrong-zone coordinate. Expected zone ${utm.zone}${utm.south ? 'S' : 'N'}.`,
    )
  }
  if (utm.south) {
    if (northing < 0 || northing > 10_000_000) {
      errors.push(
        `Northing ${northing} is outside the southern-zone domain (0–10,000,000 m). Values above 10,000,000 are northern-hemisphere coordinates — wrong hemisphere CRS.`,
      )
    } else if (northing < 110_000) {
      warnings.push('Northing below 110,000 m is polar (Antarctic) — verify the source CRS')
    }
  } else {
    if (northing < 0 || northing > 10_000_000) {
      errors.push(`Northing ${northing} is outside the northern-zone domain (0–10,000,000 m)`)
    }
  }
  return { valid: errors.length === 0, errors, warnings }
}

export interface CrsCompatibilityResult {
  level: 'ok' | 'warning' | 'error'
  message: string
}

/**
 * Import gate (blueprint §22 step 5): the CRS of incoming data versus the
 * project CRS. 'ok' = same CRS; 'warning' = different but transformable —
 * the import MUST show this to the surveyor and record the transformation;
 * 'error' = professionally inadmissible.
 */
export function validateCrsForProject(
  importedCrs: string,
  projectCrs: string,
): CrsCompatibilityResult {
  const imported = canonicalCode(importedCrs)
  const project = canonicalCode(projectCrs)
  const importedInfo = describeCrs(imported)
  if (!importedInfo) {
    return {
      level: 'error',
      message: `${imported} is not a registered CRS. Register it explicitly before import — METARDU never guesses a datum.`,
    }
  }
  if (importedInfo.displayOnly) {
    return {
      level: 'error',
      message: `${imported} (Web Mercator) is display-only and must never be imported as survey data. Re-export the source in its true CRS.`,
    }
  }
  if (imported === project) {
    return { level: 'ok', message: `Source CRS matches the project CRS (${project}).` }
  }
  return {
    level: 'warning',
    message: `Source CRS ${importedInfo.name} differs from the project CRS (${project}). METARDU will transform coordinates on import — this transformation must be recorded on every affected observation batch, and the surveyor must confirm the datum parameters are appropriate for this jurisdiction.`,
  }
}
