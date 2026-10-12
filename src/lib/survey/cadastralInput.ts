import type { FieldToFinishInput } from './field-to-finish'

type Data = Record<string, any>
export function parseCadastralBearing(value: unknown): number {
  const text = String(value ?? '').trim()
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
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error('Supply finite easting and northing for the starting control station.')
  return Number(value)
}

/** The entry table contains instrument stations and outgoing grid bearings/distances. */
export function prepareCadastralInput(project: Data, entries: Data[], points: Data[]): FieldToFinishInput {
  if (entries.length < 3) throw new Error('At least three field observations are required; coordinates alone cannot establish traverse closure.')
  const records = entries.map(entry => ({...entry.raw_data, station:entry.station ?? entry.raw_data?.station,bearing:entry.raw_data?.bearing ?? entry.bearing,distance:entry.raw_data?.distance ?? entry.distance}))
  const firstName = String(records[0].station ?? '').trim()
  if (!firstName) throw new Error('Name the instrument station for every observation.')
  const boundary = project.boundary_data ?? {}
  const control = boundary.startControl ?? points.find(point => (point.name || point.point_name) === firstName)
    ?? (boundary.startE != null && boundary.startN != null ? {name:firstName,easting:boundary.startE,northing:boundary.startN} : undefined)
  if (!control || (control.name || control.point_name) !== firstName) throw new Error(`Supply starting control coordinates for ${firstName}.`)
  const startStation = {name:firstName,easting:coordinate(control.easting),northing:coordinate(control.northing)}
  const names = records.map(row=>String(row.station ?? '').trim())
  if (names.some(name=>!name) || new Set(names).size !== names.length) throw new Error('Instrument stations must be named and unique in the closed traverse.')
  const observations = records.map((row,index)=>{
    const next = names[(index+1)%names.length]
    const target = String(row.target ?? row.toStation ?? row.to_station ?? next).trim()
    if (target !== next) throw new Error(`Observation ${index+1} does not connect to the next instrument station (${next}).`)
    const distance = Number(row.distance)
    if (row.distance == null || String(row.distance).trim()==='' || !Number.isFinite(distance) || distance <= 0) throw new Error(`Observation ${index+1} needs a positive finite distance.`)
    if (row.distanceType !== 'grid') throw new Error('Reduce slope observations to grid distances before using this cadastral grid-traverse workflow.')
    return {fromStation:names[index],toStation:target,bearing:parseCadastralBearing(row.bearing),slopeDistance:distance,distanceType:'grid' as const}
  })
  return {observations,startStation,mode:'closed',surveyType:'cadastral',adjustmentMethod:'bowditch',
    utmZone:project.utm_zone,lrNumber:project.plot_parcel_number || project.lr_number || undefined,
    surveyorName:project.surveyor_name || undefined,surveyorLicense:project.surveyor_license || undefined}
}
