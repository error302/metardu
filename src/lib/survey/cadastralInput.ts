import type { FieldToFinishInput } from './field-to-finish'

type Data = Record<string, unknown>

function record(value: unknown, label: string): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Data
}

function finiteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) throw new Error(message)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(message)
  return parsed
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string') throw new Error(`${label} must be text.`)
  return value.trim() || undefined
}

function stationName(value: unknown): string {
  const name = optionalText(value, 'Instrument station name')
  if (!name) throw new Error('Name the instrument station for every observation.')
  return name
}

export function parseCadastralBearing(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Supply a bearing in decimal degrees or DMS text.')
  const text = String(value).trim()
  let bearing: number
  if (/^\d+(?:\.\d+)?$/.test(text)) bearing = Number(text)
  else {
    const match = text.match(/^(\d+)\s*°\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)\s*["″]?$/)
    if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) throw new Error('Enter a valid bearing in decimal degrees or degrees°minutes\'seconds".')
    bearing = Number(match[1]) + Number(match[2])/60 + Number(match[3])/3600
  }
  if (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360) throw new Error('Bearing must be between 0° and less than 360°.')
  return bearing
}

function coordinate(value: unknown): number {
  return finiteNumber(value, 'Supply finite easting and northing for the starting control station.')
}

/** The entry table contains instrument stations and outgoing grid bearings/distances. */
export function prepareCadastralInput(projectInput: unknown, entries: readonly unknown[], points: readonly unknown[]): FieldToFinishInput {
  if (entries.length < 3) throw new Error('At least three field observations are required; coordinates alone cannot establish traverse closure.')
  const project = record(projectInput, 'Project')
  const records: Data[] = entries.map((value, index) => {
    const entry = record(value, `Observation ${index + 1}`)
    const raw = record(entry.raw_data ?? {}, `Observation ${index + 1} raw data`)
    return { ...raw, station: entry.station ?? raw.station, bearing: raw.bearing ?? entry.bearing, distance: raw.distance ?? entry.distance }
  })
  const names = records.map(row => stationName(row.station))
  if (new Set(names).size !== names.length) throw new Error('Instrument stations must be named and unique in the closed traverse.')
  const firstName = names[0]
  const boundary = record(project.boundary_data ?? {}, 'Boundary data')
  const controlValue = boundary.startControl ?? points.find(value => {
    const point = record(value, 'Control point')
    return (point.name || point.point_name) === firstName
  }) ?? (boundary.startE != null && boundary.startN != null ? { name: firstName, easting: boundary.startE, northing: boundary.startN } : undefined)
  if (!controlValue) throw new Error(`Supply starting control coordinates for ${firstName}.`)
  const control = record(controlValue, 'Starting control')
  if (stationName(control.name || control.point_name) !== firstName) throw new Error(`Supply starting control coordinates for ${firstName}.`)
  const startStation = { name: firstName, easting: coordinate(control.easting), northing: coordinate(control.northing) }
  const observations = records.map((row, index) => {
    const next = names[(index + 1) % names.length]
    const target = stationName(row.target ?? row.toStation ?? row.to_station ?? next)
    if (target !== next) throw new Error(`Observation ${index + 1} does not connect to the next instrument station (${next}).`)
    const invalidDistance = `Observation ${index + 1} needs a positive finite distance.`
    const distance = finiteNumber(row.distance, invalidDistance)
    if (distance <= 0) throw new Error(invalidDistance)
    if (row.distanceType !== 'grid') throw new Error('Reduce slope observations to grid distances before using this cadastral grid-traverse workflow.')
    return { fromStation: names[index], toStation: target, bearing: parseCadastralBearing(row.bearing), slopeDistance: distance, distanceType: 'grid' as const }
  })
  let utmZone: number | undefined
  if (project.utm_zone != null) {
    utmZone = finiteNumber(project.utm_zone, 'UTM zone metadata must be an integer from 1 to 60, or omitted.')
    if (!Number.isInteger(utmZone) || utmZone < 1 || utmZone > 60) throw new Error('UTM zone metadata must be an integer from 1 to 60, or omitted.')
  }
  return {
    observations, startStation, mode: 'closed', surveyType: 'cadastral', adjustmentMethod: 'bowditch', utmZone,
    lrNumber: optionalText(project.plot_parcel_number, 'Parcel number') || optionalText(project.parcel_number, 'Parcel number') || optionalText(project.lr_number, 'LR number'),
    surveyorName: optionalText(project.surveyor_name, 'Surveyor name'),
    surveyorLicense: optionalText(project.surveyor_license, 'Surveyor license'),
  }
}
