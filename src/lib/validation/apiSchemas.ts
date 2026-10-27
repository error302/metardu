/**
 * Zod schemas for all API route validation.
 * Kenya bounding box (Arc 1960 / UTM Zone 37S, SRID 21037).
 * CRITICAL INVARIANT: Levelling closure tolerance is 10√K mm (RDM 1.1, Table 5.1).
 */
import { z } from 'zod'
import { parcelStatusSchema as ParcelStatusEnum, schemeStatusSchema as SchemeStatusEnum } from './scheme'
import { EngineeringPayloadSchema } from './engineeringPayload'

export { ParcelStatusEnum, SchemeStatusEnum }

const KENYA_EASTING = { min: 166000, max: 1066000 }
const KENYA_NORTHING = { min: 9140000, max: 10200000 }
export const SurveyTypeEnum = z.enum([
  'cadastral_subdivision', 'cadastral_amalgamation', 'cadastral_resurvey', 'cadastral_mutation',
  'engineering_road', 'engineering_bridge', 'engineering_dam', 'engineering_pipeline',
  'engineering_railway', 'engineering_building', 'engineering_tunnel',
  'topographic', 'geodetic', 'mining', 'hydrographic', 'drone_uav', 'deformation_monitoring',
])


// ─── Project Schemas ─────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').max(200).trim(),
  location: z.string().max(200).trim().prefault(''),
  survey_type: SurveyTypeEnum,
  country: z.string().max(100).trim().optional(),
  datum: z.string().max(50).trim().optional(),
  utm_zone: z.coerce.number().int().min(1).max(60).optional(),
  hemisphere: z.enum(['N', 'S']).prefault('S'),
  client_name: z.string().max(200).trim().optional(),
  surveyor_name: z.string().max(200).trim().optional(),
  project_type: z.enum(['small', 'scheme']).prefault('small'),
  scheme_number: z.string().max(50).trim().optional(),
  county: z.string().max(100).trim().optional(),
  sub_county: z.string().max(100).trim().optional(),
  ward: z.string().max(100).trim().optional(),
  planned_parcels: z.coerce.number().int().positive().max(10000).optional(),
  adjudication_section: z.string().max(100).trim().optional(),
})

// ─── Block Schemas ───────────────────────────────────────────────────────────

export { CreateBlockSchema, UpdateBlockSchema } from './blockInputs'

// ─── Parcel Schemas ──────────────────────────────────────────────────────────

export { CreateParcelSchema, UpdateParcelSchema } from './parcelInputs'

// ─── Traverse Schemas ────────────────────────────────────────────────────────

export const TraverseObservationSchema = z.object({
  station: z.string().min(1).max(50).trim(),
  target: z.string().min(1).max(50).trim(),
  hcl_deg: z.number().min(0).max(360).prefault(0),
  hcl_min: z.number().min(0).max(59).prefault(0),
  hcl_sec: z.number().min(0).max(59.999).prefault(0),
  hcr_deg: z.number().min(0).max(360).prefault(0),
  hcr_min: z.number().min(0).max(59).prefault(0),
  hcr_sec: z.number().min(0).max(59.999).prefault(0),
  slope_dist: z.number().positive().max(100000).optional(),
  va_deg: z.number().min(-90).max(90).prefault(0),
  va_min: z.number().min(0).max(59).prefault(0),
  va_sec: z.number().min(0).max(59.999).prefault(0),
  ih: z.number().min(0).max(100).prefault(1.5),
  th: z.number().min(0).max(100).prefault(1.5),
})

export const ComputeTraverseSchema = z.object({
  parcel_id: z.string().guid(),
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
  srid: z.literal(21037).prefault(21037),
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
  // AUDIT FIX (M-04, 2026-08-30): unified to the 8-character minimum enforced
  // by the register and reset-password routes — this shared schema previously
  // accepted 6.
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  full_name: z.string().min(2).max(200).trim(),
  isk_number: z.string().max(50).trim().optional(),
})

export const LoginSchema = z.object({
  email: z.string().email().max(200).trim().toLowerCase(),
  password: z.string().min(1).max(128),
})

// ─── Import Schemas ──────────────────────────────────────────────────────────

export const CsvImportSchema = z.object({
  block_id: z.string().guid(),
  data: z.string().min(1, 'CSV data cannot be empty').max(5000000),
  format: z.enum(['easting_northing', 'latitude_longitude', 'point_name_e_n_z']).prefault('easting_northing'),
})

// ─── Assignment Schema ───────────────────────────────────────────────────────

export const AssignSurveyorSchema = z.object({
  project_id: z.string().guid(),
  block_id: z.string().guid(),
  assigned_to: z.string().guid().nullable().optional(),
})

// ─── Project Update Schema ──────────────────────────────────────────────────

export const UpdateProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').max(200).trim().optional(),
  location: z.string().max(200).trim().optional(),
  survey_type: SurveyTypeEnum.optional(),
  country: z.string().max(100).trim().optional(),
  datum: z.string().max(50).trim().optional(),
  utm_zone: z.coerce.number().int().min(1).max(60).optional(),
  hemisphere: z.enum(['N', 'S']).optional(),
  client_name: z.string().max(200).trim().optional(),
  surveyor_name: z.string().max(200).trim().optional(),
  project_type: z.enum(['small', 'scheme']).optional(),
  scheme_number: z.string().max(50).trim().optional(),
  county: z.string().max(100).trim().optional(),
  sub_county: z.string().max(100).trim().optional(),
  ward: z.string().max(100).trim().optional(),
  planned_parcels: z.coerce.number().int().positive().max(10000).optional(),
  adjudication_section: z.string().max(100).trim().optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
})

// ─── Scheme Schemas ──────────────────────────────────────────────────────────

export const CreateSchemeSchema = z.object({
  name: z.string().min(3, 'Scheme name must be at least 3 characters').max(200).trim(),
  type: z.enum(['subdivision', 'amalgamation', 'resurvey', 'mutation', 'adjudication']),
  project_id: z.string().guid(),
  scheme_number: z.string().max(50).trim().optional(),
  county: z.string().max(100).trim().optional(),
  sub_county: z.string().max(100).trim().optional(),
  ward: z.string().max(100).trim().optional(),
  description: z.string().max(1000).trim().optional(),
})

export const UpdateSchemeStatusSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  new_status: z.enum(['planning', 'in_progress', 'review', 'approved']),
  reason: z.string().max(500).trim().optional(),
})

// ─── Traverse Observation (field-book style) ─────────────────────────────────

export const CreateTraverseObservationSchema = z.object({
  parcel_id: z.number().int().positive(),
  opening_station: z.string().min(1),
  closing_station: z.string().optional(),
  opening_easting: z.number().min(KENYA_EASTING.min).max(KENYA_EASTING.max),
  opening_northing: z.number().min(KENYA_NORTHING.min).max(KENYA_NORTHING.max),
  opening_rl: z.number().min(-100).max(6000).optional(),
  closing_easting: z.number().min(KENYA_EASTING.min).max(KENYA_EASTING.max).optional(),
  closing_northing: z.number().min(KENYA_NORTHING.min).max(KENYA_NORTHING.max).optional(),
  backsight_bearing_deg: z.number().min(0).max(360).optional(),
  backsight_bearing_min: z.number().min(0).max(59).optional(),
  backsight_bearing_sec: z.number().min(0).max(59.999).optional(),
  observations: z.array(z.object({
    station: z.string().min(1),
    bs: z.string().min(1),
    fs: z.string().min(1),
    hcl_deg: z.number().min(0).max(360).prefault(0),
    hcl_min: z.number().min(0).max(59).prefault(0),
    hcl_sec: z.number().min(0).max(59.999).prefault(0),
    hcr_deg: z.number().min(0).max(360).prefault(0),
    hcr_min: z.number().min(0).max(59).prefault(0),
    hcr_sec: z.number().min(0).max(59.999).prefault(0),
    slope_dist: z.number().positive().max(100000).optional(),
    va_deg: z.number().min(-90).max(90).prefault(0),
    va_min: z.number().min(0).max(59).prefault(0),
    va_sec: z.number().min(0).max(59.999).prefault(0),
    ih: z.number().min(0).max(100).prefault(0),
    th: z.number().min(0).max(100).prefault(0),
    remarks: z.string().max(200).trim().optional(),
  })).min(1, 'At least one observation is required'),
})

// ─── Leveling Observation Schema ────────────────────────────────────────────

export const CreateLevelingObservationSchema = z.object({
  project_id: z.string().guid(),
  station: z.string().min(1).max(50).trim(),
  bs: z.number().min(-100).max(6000).optional(),
  is_: z.number().min(-100).max(6000).optional(),
  fs: z.number().min(-100).max(6000).optional(),
  rl: z.number().min(-100).max(6000).optional(),
  distance: z.number().positive().max(100).optional(),
  remarks: z.string().max(200).trim().optional(),
})

// ─── Compute Request Schema ─────────────────────────────────────────────────

export const ComputeRequestSchema = z.object({
  task: z.enum([
    'volume', 'tin', 'contours', 'raster_analysis',
    'export_dxf', 'export_geojson',
  ]),
  payload: z.unknown().optional(),
})

// ─── Geo Transform Schema ───────────────────────────────────────────────────

export const GeoTransformPointSchema = z.object({
  id: z.string().max(50),
  x: z.number(),
  y: z.number(),
  z: z.number().finite().nullable().optional(),
})

export const GeoTransformSchema = z.object({
  fromCRS: z.string().min(1, 'fromCRS is required'),
  toCRS: z.string().min(1, 'toCRS is required'),
  points: z.array(GeoTransformPointSchema).min(1, 'At least one point required').max(5000, 'Maximum 5000 points per request'),
  projectId: z.string().optional(),
})

// ─── Submit Deed Plan Schema ────────────────────────────────────────────────

export const SubmitDeedPlanSchema = z.object({
  parcel_id: z.string().min(1, 'parcel_id is required'),
  survey_number: z.string().max(50).trim().optional(),
  drawing_number: z.string().max(50).trim().optional(),
  locality: z.string().max(200).trim().optional(),
  scale: z.enum(['500', '1000', '2500', '5000']).optional(),
  datum: z.enum(['ARC1960', 'WGS84']).optional(),
})

// ─── Update Profile Schema ──────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  firm_name: z.string().max(200).trim().optional(),
  isk_number: z.string().max(50).trim().optional(),
  phone: z.string().max(30).trim().optional(),
  license_number: z.string().max(50).trim().optional(),
})

// ─── Search Benchmarks Schema ───────────────────────────────────────────────

export const SearchBenchmarksSchema = z.object({
  country: z.string().max(100).trim().optional(),
  region: z.string().max(100).trim().optional(),
  type: z.enum(['BM', 'CP', 'TRIG', 'TIDAL', 'ALL']).optional(),
  q: z.string().trim().max(100).optional(),
  types: z.array(z.enum(['BM','CP','TRIG','TIDAL'])).min(1).max(4).optional(),
  radiusKm: z.number().finite().min(0).max(500).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  limit: z.number().int().min(1).max(200).prefault(100),
  offset: z.number().int().min(0).max(1000000).prefault(0),
}).strict().superRefine((value,ctx)=>{
  if((value.latitude===undefined)!==(value.longitude===undefined))ctx.addIssue({code:'custom',message:'Both navigation coordinates are required'})
  if(value.radiusKm!==undefined&&value.latitude===undefined)ctx.addIssue({code:'custom',message:'A radius requires a navigation location'})
})

export const NearbyBenchmarksSchema = z.object({
  lat: z.coerce.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude'),
  lon: z.coerce.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude'),
  radius: z.coerce.number().positive().max(500).prefault(10),
  limit: z.coerce.number().int().positive().max(100).prefault(10),
})

// ─── Engineering Alignment Schemas ──────────────────────────────────────────

export const CreateAlignmentSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  project_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  road_name: z.string().min(1, 'road_name is required').max(200).trim(),
  start_chainage: z.number().finite().prefault(0),
  datum: z.string().max(50).trim().optional(),
  coordinate_system: z.string().max(50).trim().optional(),
  design_speed: z.number().finite().min(20).max(200).nullable().optional(),
  road_class: z.string().trim().min(1).max(20).nullable().optional(),
  terrain_type: z.string().max(50).trim().optional(),
  standard: z.string().max(50).trim().optional(),
  cross_section_template: z.record(z.string(), z.unknown()).prefault({}),
  road_reserve_width: z.number().positive().max(100).optional(),
  vertical_station_interval_m: z.number().finite().positive().nullable().optional(),
})

export const SaveIPsSchema = z.object({
  alignment_id: z.string().min(1, 'alignment_id is required'),
  project_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  ips: z.array(z.object({
    id: z.string().guid().optional(),
    source_id: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().min(1).max(255),
    easting: z.number().finite(),
    northing: z.number().finite(),
    radius: z.number().finite().nonnegative(),
    has_transition: z.boolean().optional(),
    transition_length_in: z.number().finite().nonnegative().nullable().optional(),
    transition_length_out: z.number().finite().nonnegative().nullable().optional(),
  }).strict()).max(200),
}).strict()

export const UpdateIPInputsSchema = z.object({
  id: z.string().guid(),
  radius: z.number().finite().nonnegative().optional(),
  has_transition: z.boolean().optional(),
  transition_length_in: z.number().finite().nonnegative().nullable().optional(),
  transition_length_out: z.number().finite().nonnegative().nullable().optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'id'), 'Supply a design input to update; computed quantities are server-owned.')

export const SaveVIPsSchema = z.object({
  alignment_id: z.string().min(1, 'alignment_id is required'),
  project_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  replace: z.boolean().prefault(false),
  vips: z.array(z.object({
    source_id: z.string().trim().min(1).max(200).optional(),
    chainage: z.number().finite(),
    reduced_level: z.number().finite(),
    k_value: z.number().finite().positive().nullable().optional(),
    curve_length: z.number().finite().positive().nullable().optional(),
    gradient_in: z.number().finite().nullable().optional(),
    gradient_out: z.number().finite().nullable().optional(),
  }).strict()).max(200),
})

export const SaveStationsSchema = z.object({
  alignment_id: z.string().min(1, 'alignment_id is required'),
  project_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  replace: z.boolean().prefault(false),
  stations: z.array(z.object({
    chainage: z.number().finite(),
    ground_level: z.number().finite(),
    design_level: z.number().finite().nullable().optional(),
    design_level_source: z.enum(['manual', 'vertical-alignment']).optional(),
    ground_profile: z.array(z.object({ offset: z.number().finite(), level: z.number().finite() }).strict()).min(2).max(10000).nullable().optional(),
  }).strict()).max(500),
})

export const SaveEarthworksSchema = z.object({
  alignment_id: z.string().guid(),
  client_run_id: z.string().guid(),
  expected_input_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const SaveEngineeringDataSchema = z.object({
  projectId: z.string().guid('A valid projectId is required').transform(value => value.toLowerCase()),
  subtype: z.string().trim().min(1, 'subtype is required').max(50),
  data: EngineeringPayloadSchema,
}).strict()

// ─── Submission Schemas ─────────────────────────────────────────────────────

export const GenerateSubmissionSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  documentId: z.string().min(1, 'documentId is required'),
})

export const GenerateCLAFormSchema = z.object({
  formNumber: z.number().int().min(1).max(12),
  formData: z.record(z.string(), z.unknown()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'formData must not be empty' }
  ),
  projectId: z.string().optional(),
})

export const BatchDeedPlanSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
})

// ─── GNSS Process Schema ────────────────────────────────────────────────────

export const ProcessGNSSSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  files: z.array(z.unknown()).min(2, 'Need at least 2 RINEX files to compute baselines'),
  stationLabels: z.array(z.string().max(50)).optional(),
})

// ─── EDM Correction Schema ──────────────────────────────────────────────────

export const EDMCorrectionSchema = z.object({
  temperature: z.number().min(-50).max(60, 'Temperature must be between -50 and 60 °C'),
  pressure: z.number().min(500).max(1100, 'Pressure must be between 500 and 1100 hPa'),
  humidity: z.number().min(0).max(100).prefault(50),
  elevation: z.number().min(-500).max(6000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  distance: z.number().positive().max(100000).optional(),
  instrumentAccuracy: z.number().positive().max(50).prefault(3),
})

// ─── CLA Forms Schema ────────────────────────────────────────────────────────

export const CLAFormGenerateSchema = z.object({
  formType: z.string().min(1, 'formType is required').max(50),
  data: z.record(z.string(), z.unknown()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'data must not be empty' }
  ),
})

// ─── Deed Plan Generation Schema ─────────────────────────────────────────────

const DeedPlanPointSchema = z.object({
  pointName: z.string().min(1).max(50),
  easting: z.number(),
  northing: z.number(),
  elevation: z.number().optional(),
})

export const DeedPlanInputSchema = z.object({
  points: z.array(DeedPlanPointSchema).min(3, 'At least 3 points required for a deed plan').max(500),
  titleData: z.object({
    lrNumber: z.string().max(50).optional(),
    parcelNumber: z.string().max(50).optional(),
    county: z.string().max(100).optional(),
    locality: z.string().max(200).optional(),
    surveyDate: z.string().max(20).optional(),
    scale: z.string().max(20).optional(),
  }).passthrough().optional(),
  boundaryData: z.record(z.string(), z.unknown()).optional(),
  areaData: z.record(z.string(), z.unknown()).optional(),
  surveyorInfo: z.object({
    name: z.string().max(200).optional(),
    iskNumber: z.string().max(50).optional(),
    firmName: z.string().max(200).optional(),
  }).passthrough().optional(),
}).passthrough()

// ─── Survey COGO Schema ──────────────────────────────────────────────────────

const cogoPoint = z.object({
  easting: z.number(),
  northing: z.number(),
  elevation: z.number().optional(),
})

export const CogoOperationSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('inverse'),
    from: cogoPoint,
    to: cogoPoint,
  }),
  z.object({
    operation: z.literal('forward'),
    from: cogoPoint,
    bearing: z.number().min(0).max(360),
    distance: z.number().positive().max(100000),
  }),
  z.object({
    operation: z.literal('lineLineIntersection'),
    point1: cogoPoint,
    bearing1: z.number().min(0).max(360),
    point2: cogoPoint,
    bearing2: z.number().min(0).max(360),
  }),
  z.object({
    operation: z.literal('lineCircleIntersection'),
    linePoint: cogoPoint,
    bearing: z.number().min(0).max(360),
    circleCenter: cogoPoint,
    radius: z.number().positive().max(100000),
  }),
  z.object({
    operation: z.literal('circleCircleIntersection'),
    center1: cogoPoint,
    radius1: z.number().positive().max(100000),
    center2: cogoPoint,
    radius2: z.number().positive().max(100000),
  }),
])

// ─── Survey Area Schema ──────────────────────────────────────────────────────

export const AreaOperationSchema = z.union([
  z.object({
    operation: z.literal('shoelace'),
    points: z.array(cogoPoint).min(3, 'At least 3 points required').max(5000),
  }),
  z.object({
    operation: z.literal('dmd'),
    bearings: z.array(z.number().min(0).max(360)).min(2).max(5000),
    distances: z.array(z.number().positive().max(100000)).min(2).max(5000),
  }).refine((d) => d.bearings.length === d.distances.length, {
    message: 'bearings and distances arrays must have the same length',
  }),
  z.object({
    operation: z.literal('convert'),
    value: z.number().positive().max(1e12),
    from: z.enum(['m2', 'ha', 'ft2', 'acre', 'km2']),
    to: z.enum(['m2', 'ha', 'ft2', 'acre', 'km2']),
  }),
])

// ─── Survey Traverse Computation Schema ──────────────────────────────────────

const RawObservationSchema = z.object({
  fromStation: z.string().min(1).max(50),
  toStation: z.string().min(1).max(50),
  rawSlopeDistance: z.number().positive().max(100000).optional(),
  rawHorizontalAngle: z.number().min(0).max(360).optional(),
  trueBearing: z.number().min(0).max(360).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  rawVerticalAngle: z.number().min(-90).max(90).optional(),
  zenithAngle: z.number().min(0).max(180).optional(),
  heightOfInstrument: z.number().min(0).max(100).optional(),
  heightOfTarget: z.number().min(0).max(100).optional(),
  temperature: z.number().min(-50).max(60).optional(),
  pressure: z.number().min(500).max(1100).optional(),
  humidity: z.number().min(0).max(100).optional(),
  edmConstant: z.number().min(-1).max(1).optional(),
  ppmSetting: z.number().min(0).max(1000).optional(),
  observationDate: z.string().optional(),
}).passthrough()

const TraverseStationSchema = z.object({
  name: z.string().min(1).max(50),
  easting: z.number().optional(),
  northing: z.number().optional(),
  elevation: z.number().optional(),
  isFixed: z.boolean().optional(),
}).passthrough()

export const TraverseComputeSchema = z.object({
  observations: z.array(RawObservationSchema).min(1, 'At least one observation required').max(5000),
  stations: z.array(TraverseStationSchema).min(1, 'At least one station required').max(2000),
  method: z.enum(['bowditch', 'least_squares']).prefault('bowditch'),
  order: z.number().int().min(1).max(5).prefault(3),
  config: z.record(z.string(), z.unknown()).prefault({}),
})

// ─── Survey Corrections Schema ───────────────────────────────────────────────

export const CorrectionsSchema = z.object({
  observation: RawObservationSchema.optional(),
  observations: z.array(RawObservationSchema).max(5000).optional(),
  config: z.record(z.string(), z.unknown()).prefault({}),
  report: z.boolean().prefault(false),
}).refine(
  (d) => d.observation || (d.observations && d.observations.length > 0),
  { message: 'Provide observation or observations' }
)

// ─── USV Mission Schema ──────────────────────────────────────────────────────

const WaypointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().min(-100).max(10000).optional(),
  speed: z.number().min(0).max(50).optional(),
  action: z.string().max(50).optional(),
}).passthrough()

export const USVMissionSchema = z.object({
  mission_name: z.string().min(1, 'mission_name is required').max(200),
  waypoints: z.array(WaypointSchema).min(1, 'At least one waypoint required').max(500),
  vehicle_id: z.string().max(100).optional(),
  start_time: z.string().datetime().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

// ─── Mining Volume Schema ────────────────────────────────────────────────────

const MiningSectionSchema = z.object({
  chainage: z.number(),
  area: z.number().positive(),
  cutArea: z.number().optional(),
  fillArea: z.number().optional(),
}).passthrough()

const GridPointSchema = z.object({
  easting: z.number(),
  northing: z.number(),
  elevation: z.number(),
}).passthrough()

export const MiningVolumeSchema = z.object({
  method: z.enum(['end-area', 'grid']),
  sections: z.array(MiningSectionSchema).max(10000).optional(),
  gridPoints: z.array(GridPointSchema).max(100000).optional(),
  materialDensity: z.number().positive().max(20).prefault(1.8),
  materialType: z.string().max(100).optional(),
  designElevation: z.number().optional(),
  gridSpacing: z.number().positive().max(1000).optional(),
}).refine(
  (d) => {
    if (d.method === 'end-area') return !!d.sections && d.sections.length > 0
    if (d.method === 'grid') return !!d.gridPoints && d.gridPoints.length > 0
    return false
  },
  { message: 'sections required for end-area method; gridPoints required for grid method' }
)

// ─── Statutory Workbook Schema ───────────────────────────────────────────────

export const StatutoryWorkbookSchema = z.object({
  projectName: z.string().max(200).optional(),
  lrNumber: z.string().max(50).optional(),
  parcelNumber: z.string().max(50).optional(),
  county: z.string().max(100).optional(),
  locality: z.string().max(200).optional(),
  surveyType: z.enum(['cadastral', 'engineering', 'topographic', 'mining', 'hydrographic']).optional(),
  surveyDate: z.string().max(20).optional(),
  surveyorName: z.string().max(200).optional(),
  iskNumber: z.string().max(50).optional(),
  firmName: z.string().max(200).optional(),
  referenceNumber: z.string().max(100).optional(),
}).passthrough()

// ─── Automator Report Schema ─────────────────────────────────────────────────

export const AutomatorReportSchema = z.object({
  project_data: z.record(z.string(), z.unknown()).refine(
    (v) => Object.keys(v).length > 0,
    { message: 'project_data must not be empty' }
  ),
  sections: z.array(z.string().max(100)).max(50).prefault(['summary', 'results']),
  style: z.enum(['technical', 'executive', 'narrative', 'tabular']).prefault('technical'),
}).passthrough()

// ─── Field Sync Schema ───────────────────────────────────────────────────────

const SyncObservationSchema = z.object({
  fromStationId: z.string().min(1).max(100),
  toStationId: z.string().min(1).max(100),
  rawHorizontalAngle: z.number().min(0).max(360).optional(),
  rawVerticalAngle: z.number().min(-90).max(90).optional(),
  rawSlopeDistance: z.number().positive().max(100000).optional(),
  edmConstant: z.number().min(-1).max(1).optional(),
  ppmSetting: z.number().min(0).max(1000).optional(),
  temperature: z.number().min(-50).max(60).optional(),
  pressure: z.number().min(500).max(1100).optional(),
  humidity: z.number().min(0).max(100).optional(),
  instrumentHeight: z.number().min(0).max(100).optional(),
  targetHeight: z.number().min(0).max(100).optional(),
  observationDate: z.string().optional(),
}).passthrough()

export const FieldSyncSchema = z.object({
  surveyId: z.string().min(1, 'surveyId is required').max(200),
  observations: z.array(SyncObservationSchema).min(1, 'At least one observation required').max(10000),
  surveyorId: z.string().min(1).max(200).optional(),
  surveyorName: z.string().max(200).optional(),
}).passthrough()

// ─── Subscription Action Schema ──────────────────────────────────────────────

export const SubscriptionActionSchema = z.object({
  planId: z.string().min(1, 'planId is required').max(100),
  action: z.enum(['subscribe', 'cancel', 'upgrade']),
})
