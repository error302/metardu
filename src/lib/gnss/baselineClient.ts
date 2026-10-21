import { RelativeBaselineResultSchema } from './baselineResult'

export interface RINEXBaselineFiles {
  base: Pick<File, 'name' | 'size' | 'text'>
  rover: Pick<File, 'name' | 'size' | 'text'>
  navigation: Pick<File, 'name' | 'size' | 'text'>
}

export interface RINEXBaselineOptions {
  mode: 'static' | 'kinematic'
  frequency: 'l1' | 'l1+l2' | 'l1+l2+l5'
  elevationMask: number
  ambiguityResolution: 'off' | 'continuous' | 'instantaneous' | 'fix-and-hold'
}

export interface RINEXBasePosition {
  latitude: number
  longitude: number
  ellipsoidalHeight: number
}

export interface RINEXBaselineResult {
  rover_latitude: number
  rover_longitude: number
  rover_height: number
  sigma_north: number
  sigma_east: number
  sigma_up: number
  quality: string
  sat_count: number
  ratio: number
  raw_output?: string
}

export interface RINEXBaselineResponse {
  baseline: RINEXBaselineResult
  meta: {
    processedBy: string
    mode: string
    frequency: string
    elevationMask: number
    ambiguityResolution: string
    basePosition: RINEXBasePosition
    processedAt: string
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Submit plain-text RINEX files to the authenticated RTKLIB baseline worker. */
export async function processRINEXBaseline(
  files: RINEXBaselineFiles,
  options: RINEXBaselineOptions,
  basePosition: RINEXBasePosition,
  fetcher: Fetcher = fetch,
): Promise<RINEXBaselineResponse> {
  const maxFileBytes = 25 * 1024 * 1024
  if ([files.base, files.rover, files.navigation].some(file => file.size > maxFileBytes)) {
    throw new Error('Each RINEX file must be 25 MiB or smaller.')
  }
  const [baseRinex, roverRinex, navRinex] = await Promise.all([
    files.base.text(),
    files.rover.text(),
    files.navigation.text(),
  ])
  if ([baseRinex, roverRinex, navRinex].some(content => content.trim().length < 100)) {
    throw new Error('Each base, rover, and navigation RINEX file must contain at least 100 characters.')
  }

  const response = await fetcher('/api/gnss/baseline-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRinex, roverRinex, navRinex, basePosition, options }),
  })
  let payload: (Partial<RINEXBaselineResponse> & { error?: string }) | null
  try {
    payload = await response.json() as Partial<RINEXBaselineResponse> & { error?: string }
  } catch {
    throw new Error(`GNSS baseline processing returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `GNSS baseline processing failed (HTTP ${response.status}).`)
  if (!payload?.baseline || !payload.meta?.basePosition) throw new Error('GNSS baseline processing did not return a complete result.')

  const measurements = RelativeBaselineResultSchema.safeParse(payload.baseline)
  if (!measurements.success) {
    throw new Error('GNSS baseline processing returned invalid measurements or a non-relative solution.')
  }
  const { latitude, longitude, ellipsoidalHeight } = payload.meta.basePosition
  if (![latitude, longitude, ellipsoidalHeight].every(Number.isFinite)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('GNSS baseline processing returned invalid reference coordinates.')
  }
  const meta = payload.meta
  if (latitude !== basePosition.latitude || longitude !== basePosition.longitude || ellipsoidalHeight !== basePosition.ellipsoidalHeight
    || meta.mode !== options.mode || meta.frequency !== options.frequency
    || meta.elevationMask !== options.elevationMask || meta.ambiguityResolution !== options.ambiguityResolution) {
    throw new Error('GNSS baseline response metadata does not match the submitted control and settings.')
  }
  if (meta.processedBy !== 'RTKLIB (rnx2rtkp)' || typeof meta.processedAt !== 'string' || !Number.isFinite(Date.parse(meta.processedAt))) {
    throw new Error('GNSS baseline processing returned invalid processing metadata.')
  }
  return { baseline: measurements.data, meta }
}
