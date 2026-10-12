import { z } from 'zod'
import type { AdjustedStation } from '@/lib/engine/planGeometry'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'

/** Display coordinates do not invent an observation or adjustment history. */
export type ProjectMapStation = Pick<AdjustedStation, 'pointName' | 'adjustedEasting' | 'adjustedNorthing'> & Partial<Pick<AdjustedStation, 'originalEasting' | 'originalNorthing'>>
export type ProjectMapGeometryKind = 'ordered_boundary' | 'points'

const coordinate = z.union([
  z.number().finite(),
  z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).transform(Number).pipe(z.number().finite()),
])
const stationSchema = z.object({
  pointName: z.string().trim().min(1),
  originalEasting: coordinate, originalNorthing: coordinate,
  adjustedEasting: coordinate, adjustedNorthing: coordinate,
})
const metadata = z.string().nullable().optional()
const projectSchema = z.object({ data: z.object({
  name: metadata, lr_number: metadata, surveyor_name: metadata,
  surveyor_license: metadata, client_name: metadata, county: metadata,
  boundary_data: z.object({ adjustedStations: z.unknown().optional() }).nullable().optional(),
}) })
const referenceSchema = z.object({ referenceSystem: z.object({ prs: z.object({
  horizontalCrs: z.string().min(1), units: z.literal('metres'),
  zone: z.number().int().min(1).max(60).optional(), hemisphere: z.enum(['N', 'S']).optional(),
  coordinatePrecision: z.number().int().min(0).max(6), distanceMode: z.enum(['grid', 'ground']),
}) }).nullable() })
const pointsSchema = z.object({ data: z.array(z.object({
  point_name: z.string().trim().min(1), easting: coordinate, northing: coordinate,
  horizontal_crs: z.string().nullable(),
})) })

async function read(url: string, signal: AbortSignal | undefined, request: typeof fetch): Promise<unknown> {
  const response = await request(url, { signal, cache: 'no-store', credentials: 'same-origin' })
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(body)
    throw new Error(message.success ? message.data.error : response.status === 401 ? 'Sign in to open this project map.' : `Project map request failed (${response.status}).`)
  }
  return body
}

/** Owner-gated APIs are the authority; the legacy table proxy cannot read PRS. */
export async function loadProjectMapData(projectId: string, signal?: AbortSignal, request: typeof fetch = fetch) {
  const base = `/api/project/${encodeURIComponent(projectId)}`
  const [projectBody, referenceBody] = await Promise.all([
    read(base, signal, request), read(`${base}/reference-system`, signal, request),
  ])
  const parsedProject = projectSchema.safeParse(projectBody)
  if (!parsedProject.success) throw new Error('Saved project map data is incomplete or invalid. Review the project before mapping.')
  const project = parsedProject.data.data
  const parsedReference = referenceSchema.safeParse(referenceBody)
  if (!parsedReference.success) throw new Error('The saved project reference is incomplete or invalid. Review Project Settings before mapping.')
  const declaration = parsedReference.data.referenceSystem
  if (!declaration) throw new Error('Declare the project reference system in Project Settings before mapping survey coordinates.')
  const reference = declaration.prs
  const authority = assertProjectedCrs(reference.horizontalCrs)
  if (reference.zone !== authority.zone || reference.hemisphere !== authority.hemisphere) {
    throw new Error('The saved zone or hemisphere contradicts the project coordinate reference system.')
  }
  const epsg = authority.code
  const checkCoordinate = (easting: number, northing: number) => {
    const result = validateCoordinateRange(easting, northing, epsg)
    if (!result.valid) throw new Error(`Invalid map coordinate: ${result.errors.join('; ')}`)
  }
  const raw = project.boundary_data?.adjustedStations
  let stations: ProjectMapStation[]
  let geometryKind: ProjectMapGeometryKind
  if (raw != null && (!Array.isArray(raw) || raw.length > 0)) {
    const parsed = z.array(stationSchema).min(3).safeParse(raw)
    if (!parsed.success) throw new Error('Saved boundary coordinates are incomplete or invalid. Recompute the boundary from its field observations; no coordinates have been substituted.')
    stations = parsed.data
    geometryKind = 'ordered_boundary'
    for (const station of parsed.data) {
      checkCoordinate(station.originalEasting, station.originalNorthing)
      checkCoordinate(station.adjustedEasting, station.adjustedNorthing)
    }
  } else {
    const parsed = pointsSchema.safeParse(await read(`${base}/points`, signal, request))
    if (!parsed.success) throw new Error('Field point coordinates or source grids are incomplete or invalid. Review the Field Book before mapping.')
    if (!parsed.data.data.length) throw new Error('No survey coordinates found. Add points in Field Book or import coordinates with their source reference system.')
    stations = parsed.data.data.map(point => {
      if (point.horizontal_crs !== epsg) throw new Error(`Point ${point.point_name} has a missing or different source grid. Review or transform it through the import workflow before mapping.`)
      checkCoordinate(point.easting, point.northing)
      return { pointName: point.point_name, adjustedEasting: point.easting, adjustedNorthing: point.northing }
    })
    geometryKind = 'points'
  }
  return { stations, geometryKind, epsg, coordinatePrecision: reference.coordinatePrecision, projectInfo: {
    name: project.name ?? '', lrNumber: project.lr_number ?? '',
    surveyorName: project.surveyor_name ?? '', surveyorLicense: project.surveyor_license ?? '',
    clientName: project.client_name ?? '', county: project.county ?? '', epsg,
  } }
}
