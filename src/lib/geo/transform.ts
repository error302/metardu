import { assertSurveyCrs, CrsError, registerCrs, transformPoint } from '@/lib/spatial/projectCrs'

// Explicit compatibility names only. Bare datum names never select a UTM zone.
const ALIASES: Record<string, string> = {
  WGS84: 'EPSG:4326',
  'Arc1960-UTM36S': 'EPSG:21036', 'Arc1960-UTM37S': 'EPSG:21037',
  'WGS84-UTM36S': 'EPSG:32736', 'WGS84-UTM37S': 'EPSG:32737',
  'WGS84-UTM37N': 'EPSG:32637', 'WGS84-UTM36N': 'EPSG:32636',
}
// Preserve old explicit parameters under local names without inventing EPSG identities.
const LEGACY_ARC: Record<string, { zone: number; hemisphere: 'N' | 'S' }> = {
  'Arc1960-UTM37N': { zone: 37, hemisphere: 'N' },
  'Arc1960-UTM36N': { zone: 36, hemisphere: 'N' },
  'Arc1960-UTM35S': { zone: 35, hemisphere: 'S' },
}
const LEGACY_NOTE = 'Legacy Arc 1960 compatibility parameters (-160, -6, -302 m); verify their regional applicability and control before survey use. This local definition is not an independently verified operation.'

export type CoordSystem = string
export interface TransformInput {
  points: Array<{ id: string; x: number; y: number; z?: number | null }>
  fromCRS: CoordSystem
  toCRS: CoordSystem
}
export interface TransformOutput {
  points: Array<{ id: string; x: number; y: number; z?: number | null; warning?: string }>
  fromCRS: CoordSystem
  toCRS: CoordSystem
  fromUnits: 'metres' | 'degrees'
  toUnits: 'metres' | 'degrees'
  fromDatum: string
  toDatum: string
  horizontalOnly: true
  verticalTreatment: 'preserved-untransformed'
  notes: string[]
}

function resolveTransformCrs(code: string) {
  const legacyName = typeof code === 'string' && code.startsWith('METARDU:LEGACY:') ? code.slice('METARDU:LEGACY:'.length) : code
  if (Object.hasOwn(LEGACY_ARC, legacyName)) {
    const { zone, hemisphere } = LEGACY_ARC[legacyName]
    const localCode = `METARDU:LEGACY:${legacyName}`
    registerCrs({ code: localCode, name: `${legacyName} (legacy parameters)`, datum: 'Arc 1960', units: 'metres', projected: true, zone, hemisphere, notes: LEGACY_NOTE },
      `+proj=utm +zone=${zone}${hemisphere === 'S' ? ' +south' : ''} +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs`)
    return assertSurveyCrs(localCode)
  }
  return assertSurveyCrs(Object.hasOwn(ALIASES, code) ? ALIASES[code] : code)
}

/** Shared-authority horizontal transformation; never synthesize failed points or heights. */
export function transformCoordinates(input: TransformInput): TransformOutput {
  const from = resolveTransformCrs(input.fromCRS), to = resolveTransformCrs(input.toCRS)
  if (!Array.isArray(input.points) || input.points.length === 0 || input.points.length > 10000) {
    throw new CrsError('CRS_INVALID', 'Provide between one and 10,000 coordinate points.')
  }
  const ids = new Set<string>()
  for (const point of input.points) {
    if (!point || typeof point.id !== 'string' || !point.id.trim() || ids.has(point.id)) {
      throw new CrsError('CRS_INVALID', 'Each coordinate point requires a unique, non-empty ID.')
    }
    ids.add(point.id)
    if (![point.x, point.y].every(Number.isFinite) || (point.z != null && !Number.isFinite(point.z))) {
      throw new CrsError('CRS_INVALID', `Point ${point.id} requires finite coordinates; an unknown height may be omitted or null.`)
    }
    if (!from.projected && (Math.abs(point.x) > 180 || Math.abs(point.y) > 90)) {
      throw new CrsError('CRS_INVALID', `Point ${point.id} has geographic coordinates outside longitude/latitude bounds.`)
    }
  }
  const points = input.points.map(point => {
    let x: number, y: number
    try {
      [x, y] = from.code === to.code ? [point.x, point.y] : transformPoint(point.x, point.y, from.code, to.code)
    } catch {
      throw new CrsError('CRS_INVALID', `Horizontal transformation failed for point ${point.id}; no substitute coordinate was produced.`)
    }
    if (![x, y].every(Number.isFinite) || (!to.projected && (Math.abs(x) > 180 || Math.abs(y) > 90))) {
      throw new CrsError('CRS_INVALID', `Horizontal transformation returned an invalid coordinate for point ${point.id}.`)
    }
    return { id: point.id, x, y, ...(point.z !== undefined ? { z: point.z } : {}) }
  })
  return { points, fromCRS: from.code, toCRS: to.code, fromUnits: from.units, toUnits: to.units,
    fromDatum: from.datum, toDatum: to.datum,
    horizontalOnly: true, verticalTreatment: 'preserved-untransformed', notes: [...new Set([from.notes, to.notes].filter((note): note is string => Boolean(note)))] }
}

export function getSupportedCRS(): CoordSystem[] {
  return [...Object.keys(ALIASES), ...Object.keys(LEGACY_ARC)]
}
