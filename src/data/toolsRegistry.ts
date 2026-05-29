// DEPRECATED: This file is no longer imported by any component.
// The canonical tool list is maintained in:
//   - src/app/tools/page.tsx (Tools Hub page)
//   - src/components/layout/QuickCompute.tsx (Quick Compute sidebar)
// Consider removing this file in a future cleanup.

export interface ToolItem {
  label: string
  href: string
  description?: string
  badge?: string
}

export interface ToolCategory {
  id: string
  label: string
  items: ToolItem[]
}

// ── Tool Categories ──────────────────────────────────────────────

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'documents',
    label: 'Documents & Certificates',
    items: [
      { label: 'Beacon Certificate', href: '/tools/beacon-certificate', description: 'Signed beacon description sheet | Reg. 20 Survey Regulations 1994', badge: 'NEW' },
      { label: 'Billable Documents', href: '/tools/billable-documents', description: 'Subdivision, road reserve, valuation, title search, and setback certificates', badge: 'NEW' },
      { label: 'GNSS Observation Log', href: '/tools/gnss-observation-log', description: 'Occupation schedule & baseline report | ISO 17123-8', badge: 'NEW' },
      { label: 'Statutory Workbook', href: '/tools/statutory-workbook', description: '9-sheet field abstract and computation workbook', badge: 'NEW' },
      { label: 'Survey Report', href: '/tools/survey-report-builder', description: 'RDM 1.1 Table 5.4 topographic survey report' },
      { label: 'Mobilisation Report', href: '/tools/mobilisation-report', description: 'RDM 1.1 Table 5.3 field mobilisation sheet' },
      { label: 'Detail Tolerances', href: '/tools/detail-tolerances', description: 'RDM 1.1 Table 5.2 detailed survey tolerances (printable)' },
    ],
  },
  {
    id: 'field-layout',
    label: 'Field Layout',
    items: [
      { label: 'Setting Out', href: '/tools/setting-out', description: 'Stakeout from known coords | RDM 1.1' },
      { label: 'Missing Line', href: '/tools/missing-line', description: 'Distance & bearing between two points' },
      { label: 'Control Marks Register', href: '/tools/control-marks-register', description: 'RDM 1.1 s5.6.3 mark register' },
      { label: 'Pile / Column Grid', href: '/tools/pile-grid', description: 'Foundation grid coordinates & staking | Basak §8.5', badge: 'NEW' },
    ],
  },
  {
    id: 'leveling',
    label: 'Leveling',
    items: [
      { label: 'Leveling', href: '/tools/leveling', description: 'Quick differential levelling | 10√K closure' },
      { label: 'Level Book', href: '/tools/level-book', description: 'HPC / Rise & Fall field book | 10√K closure' },
      { label: 'Two Peg Test', href: '/tools/two-peg-test', description: 'Instrument collimation error check' },
      { label: 'Height of Object', href: '/tools/height-of-object', description: 'Trigonometric height measurement' },
    ],
  },
  {
    id: 'calculations',
    label: 'Calculations',
    items: [
      { label: 'Distance & Bearing', href: '/tools/distance', description: 'WCB & distance from coordinates' },
      { label: 'Bearing', href: '/tools/bearing', description: 'Forward & back bearing computation' },
      { label: 'Area', href: '/tools/area', description: 'Area from coordinate list' },
      { label: 'Gradient', href: '/tools/grade', description: 'Gradient & slope percentage' },
    ],
  },
  {
    id: 'traverse',
    label: 'Traverse & Adjustment',
    items: [
      { label: 'Traverse', href: '/tools/traverse', description: 'Bowditch/Transit closed traverse | RDM 1.1 grading' },
      { label: 'Traverse Field Book', href: '/tools/traverse-field-book', description: 'Field observations with angular closure' },
      { label: 'Coordinates', href: '/tools/coordinates', description: 'Survey Regulations 1994 | Kenya UTM Zones 36S/37S' },
      { label: 'COGO Calculator', href: '/tools/cogo', description: 'Coordinate geometry computations' },
      { label: 'GNSS', href: '/tools/gnss', description: 'GNSS observation & baseline processing' },
    ],
  },
  {
    id: 'road-design',
    label: 'Road Design',
    items: [
      { label: 'Road Design', href: '/tools/road-design', description: 'Full road design workflow | RDM 1.1 (2025)' },
      { label: 'Earthworks', href: '/tools/earthworks', description: 'Cut/fill volumes | Prismoidal formula | RDM 1.1' },
      { label: 'Horizontal Curves', href: '/tools/curves', description: 'Horizontal/vertical curve elements | RDM 1.1' },
      { label: 'Tacheometry', href: '/tools/tacheometry', description: 'Stadia/EDM distance & elevation | RDM 1.1 Section 5.6' },
      { label: 'Superelevation', href: '/tools/superelevation', description: 'e = V²/127R calculator per KRDM' },
      { label: 'Sight Distance', href: '/tools/sight-distance', description: 'SSD & OSD calculator per KRDM/KeRRA' },
      { label: 'Chainage', href: '/tools/chainage', description: 'Chainage calculator for road projects' },
    ],
  },
  {
    id: 'earthworks',
    label: 'Earthworks & Volumes',
    items: [
      { label: 'Cross Sections', href: '/tools/cross-sections', description: 'Road cross-section generation and analysis' },
      { label: 'Borrow Pit Volume', href: '/tools/borrow-pit-volume', description: 'Grid method borrow pit volume computation' },
      { label: 'Stockpile Volume', href: '/tools/stockpile-volume', description: 'Stockpile volume from survey points' },
    ],
  },
  {
    id: 'specialized',
    label: 'Specialized Surveys',
    items: [
      { label: 'Mining Survey', href: '/tools/mining', description: 'Mining survey computation & volume' },
      { label: 'Hydrographic', href: '/tools/hydrographic', description: 'Bathymetric/hydrographic processing' },
      { label: 'Drone / UAV', href: '/tools/drone', description: 'UAV survey & GCP processing' },
      { label: 'Topo Drawing Composer', href: '/tools/topo-drawing', description: 'Feature codes & DXF topographic drawings', badge: 'NEW' },
      { label: 'Slope & Area Analysis', href: '/tools/slope-analysis', description: 'DTM slope classification, cut/fill, area', badge: 'NEW' },
      { label: 'GNSS Baseline', href: '/tools/gnss-baseline', description: 'GNSS baseline file processing | RINEX, Topcon, Trimble' },
      { label: 'Survey Plan Viewer', href: '/tools/survey-plan-demo', description: 'Interactive survey plan viewer' },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    items: [
      { label: 'Machine Control Export', href: '/tools/machine-control', description: 'Export for machine guidance systems' },
      { label: 'Progress Monitor', href: '/tools/progress-monitor', description: 'Construction progress tracking & reports', badge: 'NEW' },
      { label: 'Pipe Gradient', href: '/tools/pipe-gradient', description: "Manning's equation pipe gradient check with drainage standards" },
    ],
  },
  {
    id: 'data-export',
    label: 'Data Export',
    items: [
      { label: 'Civil Engineering Export', href: '/tools/civil-export', description: 'Export for Civil 3D, 12d, QGIS, ArcGIS, CloudCompare' },
      { label: 'GIS Export', href: '/tools/gis-export', description: 'GeoJSON, KML, LandXML, CSV with UTM to WGS84 conversion' },
      { label: 'GCP Export', href: '/tools/gcp-export', description: 'Ground control points for Pix4D, DroneDeploy, Metashape, ODM' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    items: [
      { label: 'Beacon Reference', href: '/tools/beacon-reference', description: 'Kenya Survey Regulations 1994 beacon symbols & descriptions' },
      { label: 'Kenya Survey Standards', href: '/tools/survey-regulations', description: 'Permitted errors, datums, UTM zones, accuracy classes' },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    items: [
      { label: 'Datum Converter', href: '/online', description: 'Coordinate datum conversion utility' },
    ],
  },
]

// ── Report Types (project-specific deliverables — NOT general tools) ──

export interface ReportType {
  name: string
  href: string
  description: string
  color: string
}

export const REPORT_TYPES: ReportType[] = [
  { name: 'Statutory Workbook', href: '/tools/statutory-workbook', description: 'Field abstract, coordinate schedule, and statutory survey workbook', color: 'text-blue-500 bg-blue-500/10' },
  { name: 'Deed Plan', href: '/deed-plan', description: 'Legal document showing property boundaries and beacons', color: 'text-orange-500 bg-orange-500/10' },
  { name: 'Field Book', href: '/fieldbook', description: 'Raw field observations and measurements', color: 'text-amber-500 bg-amber-500/10' },
]

// ── Helpers ──────────────────────────────────────────────────────

/** Get a flat list of all tools */
export function getAllTools(): ToolItem[] {
  return TOOL_CATEGORIES.flatMap(c => c.items)
}

/** Find a tool by its href */
export function getToolByHref(href: string): ToolItem | undefined {
  return getAllTools().find(t => t.href === href)
}

/** Build a lookup map: href → icon name (used by Tools page) */
export function getToolIconMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cat of TOOL_CATEGORIES) {
    for (const item of cat.items) {
      map[item.href] = item.label // icon resolution is done by the consumer
    }
  }
  return map
}
