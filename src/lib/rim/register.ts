import { z } from 'zod'
import type { RimSection } from './db'

export const rimReportType = 'rim-register'
const label = z.string().trim().max(200)
export const rimSectionFields = z.object({
  section_name: label.default(''), registry: label.default(''), district: label.default(''),
  map_sheet_number: label.default(''), scale: label.default(''), datum: label.default(''),
  projection: label.default(''), total_area: z.number().finite().nonnegative().default(0),
  notes: z.string().max(8000).default(''),
})
export const rimParcelFields = z.object({
  parcel_number: label.min(1), area: z.number().finite().nonnegative(),
  land_use: label.default(''), owner_name: label.default(''),
  beacon_count: z.number().int().nonnegative().default(0),
  northings: z.array(z.number().finite()).max(1000).default([]),
  eastings: z.array(z.number().finite()).max(1000).default([]),
  is_landmark: z.boolean().default(false),
})
export const rimBeaconFields = z.object({
  beacon_number: label.min(1), easting: z.number().finite(), northing: z.number().finite(),
  description: label.default(''), type: label.default(''), survey_status: label.default(''),
})
export const rimRegister = z.object({
  section: rimSectionFields,
  parcels: z.array(rimParcelFields.extend({ id: z.string().uuid() })).max(1000),
  beacons: z.array(rimBeaconFields.extend({ id: z.string().uuid() })).max(1000),
})
export interface RimRegisterRow {
  id: string
  project_id: string
  user_id: string
  status: RimSection['status']
  input_data: unknown
  created_at: Date
  updated_at: Date
}

export function readRimRegister(row: RimRegisterRow) {
  const { section, parcels, beacons } = rimRegister.parse(row.input_data)
  return {
    section: { ...section, id: row.id, project_id: row.project_id, user_id: row.user_id,
      status: row.status, created_at: row.created_at, updated_at: row.updated_at,
      parcels_count: parcels.length, parcel_count: parcels.length, beacon_count: beacons.length },
    parcels: parcels.map(parcel => ({ ...parcel, rim_section_id: row.id })),
    beacons: beacons.map(beacon => ({ ...beacon, rim_section_id: row.id })),
  }
}
