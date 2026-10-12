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
  let payload: Partial<RINEXBaselineResponse> & { error?: string }
  try {
    payload = await response.json() as Partial<RINEXBaselineResponse> & { error?: string }
  } catch {
    throw new Error(`GNSS baseline processing returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok) throw new Error(payload.error || `GNSS baseline processing failed (HTTP ${response.status}).`)
  if (!payload.baseline || !payload.meta?.basePosition) throw new Error('GNSS baseline processing did not return a complete result.')

  const { baseline } = payload
  if (![baseline.rover_latitude, baseline.rover_longitude, baseline.rover_height,
    baseline.sigma_north, baseline.sigma_east, baseline.sigma_up, baseline.sat_count].every(Number.isFinite)) {
    throw new Error('GNSS baseline processing returned incomplete or invalid measurements.')
  }
  if (Math.abs(baseline.rover_latitude) > 90 || Math.abs(baseline.rover_longitude) > 180
    || baseline.sigma_north < 0 || baseline.sigma_east < 0 || baseline.sigma_up < 0
    || !Number.isInteger(baseline.sat_count) || baseline.sat_count < 1
    || !Number.isFinite(baseline.ratio) || baseline.ratio < 0
    || !['FIX', 'FLOAT'].includes(baseline.quality)) {
    throw new Error('GNSS baseline processing returned an invalid or non-relative solution.')
  }
  const { latitude, longitude, ellipsoidalHeight } = payload.meta.basePosition
  if (![latitude, longitude, ellipsoidalHeight].every(Number.isFinite)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('GNSS baseline processing returned invalid reference coordinates.')
  }
  return payload as RINEXBaselineResponse
}
