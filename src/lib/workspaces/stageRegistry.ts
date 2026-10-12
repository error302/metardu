export type StageId =
  | 'overview'
  | 'control'
  | 'observe'
  | 'compute'
  | 'design'
  | 'verify'
  | 'deliver'

export interface StageToolLink {
  label: string
  href: string
}

export interface StageDefinition {
  id: StageId
  label: string
  path: string
  purpose: string
  scope: string[]
  states?: string[]
  tools: StageToolLink[]
}

export const STAGES: StageDefinition[] = [
  {
    id: 'overview',
    label: 'Overview',
    // Overview IS the project root (blueprint §33: `/projects/[id]`); the six
    // workflow stages are sub-routes. Empty path keeps a single canonical URL
    // and makes /overview a compatibility redirect rather than a second home.
    path: '',
    purpose:
      'Project summary: reference system, workflow position, QA posture, and entry points for every stage.',
    scope: ['Project summary', 'Reference system', 'Stage status', 'Recent activity'],
    tools: [
      { label: 'Survey map', href: '/project/{id}/map' },
      { label: 'Documents', href: '/project/{id}/documents' },
      { label: 'Settings', href: '/project/{id}/settings' },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    path: 'control',
    purpose:
      'Establish the project reference, manage control points and benchmarks, adjust networks, and prevent work against unverified reference data.',
    scope: [
      'Control register',
      'GNSS baselines',
      'Traverses',
      'Least squares',
      'Leveling',
      'Benchmark loops',
      'Error ellipses',
      'Covariance',
      'Monument photos',
      'Witness ties',
      'Control descriptions',
      'Network QA',
    ],
    states: [
      'DRAFT',
      'OBSERVED',
      'COMPUTED',
      'REVIEW_REQUIRED',
      'VERIFIED',
      'SUPERSEDED',
      'DISTURBED',
    ],
    tools: [
      { label: 'Control marks register', href: '/tools/control-marks-register' },
      { label: 'Control point verification', href: '/tools/control-point-verification' },
      { label: 'GNSS baseline', href: '/tools/gnss-baseline' },
      { label: 'Least squares', href: '/tools/lsa' },
      { label: 'Leveling', href: '/tools/leveling' },
      { label: 'Survey map', href: '/project/{id}/map' },
    ],
  },
  {
    id: 'observe',
    label: 'Observe',
    path: 'observe',
    purpose:
      'Capture and manage observation sources with provenance: batches, source files and hashes, operator and instrument metadata, source CRS, quality metadata, and photos.',
    scope: [
      'Observation batches',
      'Source file + hash',
      'Operator / crew',
      'Instrument / serial / HI / HT / prism',
      'Station / backsight',
      'Timestamps',
      'Quality metadata',
      'Source CRS',
      'Notes and photos',
      'Field Book view/editor',
    ],
    tools: [
      { label: 'GNSS observation log', href: '/tools/gnss-observation-log' },
      { label: 'GNSS RINEX', href: '/tools/gnss-rinex' },
      { label: 'Traverse field book', href: '/tools/traverse-field-book' },
      { label: 'Level book', href: '/tools/level-book' },
      { label: 'Field map', href: '/field/map' },
    ],
  },
  {
    id: 'compute',
    label: 'Compute',
    path: 'compute',
    purpose:
      'Run shared computation engines with recorded provenance: every saved computation stores algorithm id/version, input version, parameters, hashes, result, and QA summary.',
    scope: [
      'Traverse',
      'Least squares',
      'Leveling',
      'COGO',
      'Coordinate transformation',
      'Areas and volumes',
      'Curves and intersections',
      'Resection and radiation',
      'Deformation',
      'Uncertainty',
      'Computation records',
    ],
    tools: [
      { label: 'Traverse', href: '/tools/traverse' },
      { label: 'Least squares', href: '/tools/lsa' },
      { label: 'COGO', href: '/tools/cogo' },
      { label: 'Area', href: '/tools/area' },
      { label: 'Volume comparison', href: '/tools/volume-comparison' },
      { label: 'Coordinates', href: '/tools/coordinates' },
    ],
  },
  {
    id: 'design',
    label: 'Design',
    path: 'design',
    purpose:
      'Design, draft, and set out: parcel geometry and subdivision, coded linework and surfaces, alignments and sections, or construction grids — by discipline.',
    scope: [
      'Parcel geometry and subdivision',
      'Beaconing and working diagrams',
      'Survey/deed plan composition',
      'Coded linework and breaklines',
      'TIN/DTM and contours',
      'Alignments, profiles, sections',
      'Set-out',
      'Construction grids and verticality',
    ],
    tools: [
      { label: 'CAD editor', href: '/project/{id}/cad-editor' },
      { label: 'Subdivision generator', href: '/tools/subdivision-generator' },
      { label: 'Road design', href: '/tools/road-design' },
      { label: 'Topo drawing', href: '/tools/topo-drawing' },
      { label: 'Generate plan', href: '/project/{id}/generate-plan' },
    ],
  },
  {
    id: 'verify',
    label: 'Verify',
    path: 'verify',
    purpose:
      'Compare redundant observations, adjusted results against tolerance, design vs as-built, parcel vs parcel, surface vs surface, and current vs stale revision.',
    scope: [
      'Redundant observations',
      'Adjusted results vs tolerance',
      'Design vs as-built',
      'Parcel vs parcel',
      'Surface vs surface',
      'Current vs stale revision',
      'QA records',
    ],
    tools: [
      { label: 'Topology check', href: '/tools/topology-check' },
      { label: 'Detail tolerances', href: '/tools/detail-tolerances' },
      { label: 'As-built deviation', href: '/tools/as-built-deviation' },
      { label: 'Deformation monitoring', href: '/tools/deformation-monitoring' },
      { label: 'Survey map', href: '/project/{id}/map' },
    ],
  },
  {
    id: 'deliver',
    label: 'Deliver',
    path: 'deliver',
    purpose:
      'Structured deliverable builder: reports, plans, schedules, computation sheets, QA reports, observation manifests, revisions, DXF, LandXML, CSV, GeoJSON, PDF, and submission packages.',
    scope: [
      'Reports and plans',
      'Schedules and computation sheets',
      'QA reports',
      'Observation manifests',
      'Revisions',
      'DXF / LandXML / CSV / GeoJSON / PDF',
      'Submission packages',
    ],
    tools: [
      { label: 'Documents', href: '/project/{id}/documents' },
      { label: 'GIS export', href: '/tools/gis-export' },
      { label: 'Survey report builder', href: '/tools/survey-report-builder' },
      { label: 'Submission', href: '/project/{id}/submission' },
    ],
  },
]

const STAGE_BY_ID: Record<StageId, StageDefinition> = STAGES.reduce(
  (acc, stage) => {
    acc[stage.id] = stage
    return acc
  },
  {} as Record<StageId, StageDefinition>,
)

export function getStageDefinition(id: StageId): StageDefinition {
  return STAGE_BY_ID[id]
}

export function stageHref(projectId: string, stage: StageDefinition): string {
  return stage.path ? `/project/${projectId}/${stage.path}` : `/project/${projectId}`
}

export function stageToolHrefs(
  stage: StageDefinition,
  projectId: string,
): StageToolLink[] {
  return stage.tools.map((tool) => ({
    label: tool.label,
    href: tool.href.replace('{id}', projectId),
  }))
}
