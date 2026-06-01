/**
 * Zod schemas for all API route validation.
 * Kenya bounding box (Arc 1960 / UTM Zone 37S, SRID 21037).
 * CRITICAL INVARIANT: Levelling closure tolerance is 10√K mm (RDM 1.1, Table 5.1).
 */
import { z } from 'zod'

const KENYA_EASTING = { min: 166000, max: 1066000 }
const KENYA_NORTHING = { min: 9140000, max: 10200000 }
const UTM_ZONES = ['36S', '37S', '36N', '37N', '35S', '35N']

export const SurveyTypeEnum = z.enum([
  'cadastral_subdivision', 'cadastral_amalgamation', 'cadastral_resurvey', 'cadastral_mutation',
  'engineering_road', 'engineering_bridge', 'engineering_dam', 'engineering_pipeline',
  'engineering_railway', 'engineering_building', 'engineering_tunnel',
  'topographic', 'geodetic', 'mining', 'hydrographic', 'drone_uav', 'deformation_monitoring',
])

export const ParcelStatusEnum = z.enum([
  'pending', 'field_complete', 'computed', 'plan_generated', 'submitted', 'approved',
])

export const SchemeStatusEnum = z.enum([
  'planning', 'field_in_progress', 'computation', 'plan_generation', 'review', 'submitted', 'approved',
])

// ─── Project Schemas ─────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').max(200).trim(),
  location: z.string().max(200).trim().optional().default(''),
  survey_type: SurveyTypeEnum,
  country: z.string().max(100).trim().optional(),
  datum: z.string().max(50).trim().optional(),
  utm_zone: z.coerce.number().int().min(1).max(60).optional(),
  hemisphere: z.enum(['N', 'S']).optional().default('S'),
  client_name: z.string().max(200).trim().optional(),
  surveyor_name: z.string().max(200).trim().optional(),
  project_type: z.enum(['small', 'scheme']).optional().default('small'),
  scheme_number: z.string().max(50).trim().optional(),
  county: z.string().max(100).trim().optional(),
  sub_county: z.string().max(100).trim().optional(),
  ward: z.string().max(100).trim().optional(),
  planned_parcels: z.coerce.number().int().positive().max(10000).optional(),
  adjudication_section: z.string().max(100).trim().optional(),
})

// ─── Block Schemas ───────────────────────────────────────────────────────────

export const CreateBlockSchema = z.object({
  project_id: z.string().uuid(),
  block_number: z.string().min(1).max(20).trim(),
  block_name: z.string().max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
})

export const UpdateBlockSchema = z.object({
  block_number: z.string().min(1).max(20).trim().optional(),
  block_name: z.string().max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
})

// ─── Parcel Schemas ──────────────────────────────────────────────────────────

export const CreateParcelSchema = z.object({
  block_id: z.string().uuid(),
  parcel_number: z.string().min(1).max(20).trim(),
  lr_number_proposed: z.string().max(50).trim().optional(),
  area_ha: z.number().positive().max(10000).optional(),
  notes: z.string().max(1000).trim().optional(),
})

export const UpdateParcelSchema = z.object({
  parcel_number: z.string().min(1).max(20).trim().optional(),
  lr_number_proposed: z.string().max(50).trim().optional(),
  lr_number_confirmed: z.string().max(50).trim().optional(),
  area_ha: z.number().positive().max(10000).optional(),
  status: ParcelStatusEnum.optional(),
  assigned_surveyor: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).trim().optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
})

// ─── Traverse Schemas ────────────────────────────────────────────────────────

export const TraverseObservationSchema = z.object({
  station: z.string().min(1).max(50).trim(),
  target: z.string().min(1).max(50).trim(),
  hcl_deg: z.number().min(0).max(360).optional().default(0),
  hcl_min: z.number().min(0).max(59).optional().default(0),
  hcl_sec: z.number().min(0).max(59.999).optional().default(0),
  hcr_deg: z.number().min(0).max(360).optional().default(0),
  hcr_min: z.number().min(0).max(59).optional().default(0),
  hcr_sec: z.number().min(0).max(59.999).optional().default(0),
  slope_dist: z.number().positive().max(100000).optional(),
  va_deg: z.number().min(-90).max(90).optional().default(0),
  va_min: z.number().min(0).max(59).optional().default(0),
  va_sec: z.number().min(0).max(59.999).optional().default(0),
  ih: z.number().min(0).max(100).optional().default(1.5),
  th: z.number().min(0).max(100).optional().default(1.5),
})

export const ComputeTraverseSchema = z.object({
  parcel_id: z.string().uuid(),
  backsight_bearing: z.number().min(0).max(360),
  opening_easting: z.number().min(KENYA_EASTING.min).max(KENYA_EASTING.max),
  opening_northing: z.number().min(KENYA_NORTHING.min).max(KENYA_NORTHING.max),
  opening_rl: z.number().min(-100).max(6000).optional(),
  observations: z.array(TraverseObservationSchema).min(2, 'At least 2 observations required'),
})

// ─── Coordinate Schemas ──────────────────────────────────────────────────────

export const CoordinateSchema = z.object({
  point_id: z.string().max(50),
  easting: z.number().min(KENYA_EASTING.min).max(KENYA_EASTING.max),
  northing: z.number().min(KENYA_NORTHING.min).max(KENYA_NORTHING.max),
  elevation: z.number().min(-100).max(6000).optional(),
  srid: z.literal(21037).default(21037),
})

export const CoordinateArraySchema = z.array(CoordinateSchema).min(1)

// ─── Levelling Schemas ───────────────────────────────────────────────────────

export const LevellingObservationSchema = z.object({
  benchmark_id: z.string().max(50),
  rl: z.number().min(-100).max(6000),
  distance_km: z.number().positive().max(100),
})

// ─── Auth Schemas ────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email().max(200).trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  full_name: z.string().min(2).max(200).trim(),
  isk_number: z.string().max(50).trim().optional(),
})

export const LoginSchema = z.object({
  email: z.string().email().max(200).trim().toLowerCase(),
  password: z.string().min(1).max(128),
})

// ─── Import Schemas ──────────────────────────────────────────────────────────

export const CsvImportSchema = z.object({
  block_id: z.string().uuid(),
  data: z.string().min(1, 'CSV data cannot be empty').max(5000000),
  format: z.enum(['easting_northing', 'latitude_longitude', 'point_name_e_n_z']).optional().default('easting_northing'),
})

// ─── Assignment Schema ───────────────────────────────────────────────────────

export const AssignSurveyorSchema = z.object({
  parcel_ids: z.array(z.string().uuid()).min(1).max(500),
  surveyor_id: z.string().uuid(),
})
