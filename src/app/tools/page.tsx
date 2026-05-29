import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  BookOpenText,
  ChartArea,
  ChartColumnIncreasing,
  ChartNoAxesCombined,
  ClipboardCheck,
  Compass,
  Construction,
  Download,
  DraftingCompass,
  Drone,
  Eye,
  FileBadge,
  FileChartColumn,
  FileCog,
  FileSpreadsheet,
  FileStack,
  GitBranch,
  Globe,
  Grid3X3,
  LandPlot,
  MapPinned,
  Milestone,
  Mountain,
  NotebookPen,
  Pickaxe,
  PlaneTakeoff,
  RadioTower,
  Ruler,
  RulerDimensionLine,
  Satellite,
  ScanLine,
  Ship,
  Spline,
  SquareDashedMousePointer,
  TrendingUp,
  Waypoints,
} from 'lucide-react'

const TOOL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  '/tools/beacon-certificate': FileBadge,
  '/tools/billable-documents': FileStack,
  '/tools/gnss-observation-log': Satellite,
  '/tools/statutory-workbook': FileSpreadsheet,
  '/tools/survey-report-builder': FileChartColumn,
  '/tools/mobilisation-report': ClipboardCheck,
  '/tools/level-book': NotebookPen,
  '/tools/setting-out': MapPinned,
  '/tools/missing-line': GitBranch,
  '/tools/control-marks-register': RadioTower,
  '/tools/pile-grid': Grid3X3,
  '/tools/leveling': ChartNoAxesCombined,
  '/tools/two-peg-test': Ruler,
  '/tools/height-of-object': RulerDimensionLine,
  '/tools/distance': RulerDimensionLine,
  '/tools/bearing': Compass,
  '/tools/area': LandPlot,
  '/tools/grade': TrendingUp,
  '/tools/traverse': Waypoints,
  '/tools/traverse-field-book': BookOpenText,
  '/tools/coordinates': DraftingCompass,
  '/tools/cogo': DraftingCompass,
  '/tools/gnss': Satellite,
  '/tools/road-design': Construction,
  '/tools/earthworks': Mountain,
  '/tools/curves': Spline,
  '/tools/tacheometry': ScanLine,
  '/tools/mining': Pickaxe,
  '/tools/hydrographic': Ship,
  '/tools/drone': Drone,
  '/tools/topo-drawing': SquareDashedMousePointer,
  '/tools/slope-analysis': ChartArea,
  '/tools/machine-control': PlaneTakeoff,
  '/tools/progress-monitor': ChartColumnIncreasing,
  '/tools/beacon-reference': RadioTower,
  '/tools/survey-regulations': BookOpenText,
  '/tools/us-survey-reference': Globe,
  '/tools/detail-tolerances': Ruler,
  '/tools/superelevation': TrendingUp,
  '/tools/sight-distance': Eye,
  '/tools/pipe-gradient': Construction,
  '/tools/chainage': Milestone,
  '/tools/cross-sections': ChartNoAxesCombined,
  '/tools/borrow-pit-volume': Mountain,
  '/tools/stockpile-volume': Mountain,
  '/tools/civil-export': Download,
  '/tools/gis-export': Download,
  '/tools/gcp-export': Download,
  '/tools/survey-plan-demo': MapPinned,
  '/tools/gnss-baseline': Satellite,
}

export default function ToolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-16">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Quick Tools</h1>
          <p className="text-sm text-[var(--text-muted)]">No project required — enter values and get instant results</p>
        </div>
      </div>
      
      <div className="space-y-8">

        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Documents &amp; Certificates
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink
              href="/tools/beacon-certificate"
              title="Beacon Certificate"
              description="Signed beacon description sheet | Reg. 20 Survey Regulations 1994"
              badge="NEW"
            />
            <ToolLink
              href="/tools/billable-documents"
              title="Billable Documents"
              description="Subdivision, road reserve, valuation, title search, and setback certificates"
              badge="NEW"
            />
            <ToolLink
              href="/tools/gnss-observation-log"
              title="GNSS Observation Log"
              description="Occupation schedule & baseline report | ISO 17123-8"
              badge="NEW"
            />
            <ToolLink
              href="/tools/statutory-workbook"
              title="Statutory Workbook"
              description="9-sheet field abstract and computation workbook"
              badge="NEW"
            />
            <ToolLink
              href="/tools/detail-tolerances"
              title="Detail Tolerances"
              description="RDM 1.1 Table 5.2 detailed survey tolerances (printable)"
            />
            <ToolLink
              href="/tools/survey-report-builder"
              title="Survey Report"
              description="RDM 1.1 Table 5.4 topographic survey report"
            />
            <ToolLink
              href="/tools/mobilisation-report"
              title="Mobilisation Report"
              description="RDM 1.1 Table 5.3 field mobilisation sheet"
            />
          </div>
        </section>

        {/* FIELD LAYOUT */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Field Layout</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/setting-out" title="Setting Out" description="Stakeout from known coords | RDM 1.1" />
            <ToolLink href="/tools/missing-line" title="Missing Line" description="Distance & bearing between two points" />
            <ToolLink href="/tools/control-marks-register" title="Control Marks Register" description="RDM 1.1 s5.6.3 mark register" />
            <ToolLink href="/tools/pile-grid" title="Pile / Column Grid" description="Foundation grid coordinates &amp; staking | Basak §8.5" badge="NEW" />
          </div>
        </section>

        {/* LEVELING */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Leveling</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/leveling" title="Leveling" description="Quick differential levelling | 10√K closure" />
            <ToolLink href="/tools/level-book" title="Level Book" description="HPC / Rise & Fall field book | 10√K closure" />
            <ToolLink href="/tools/two-peg-test" title="Two Peg Test" description="Instrument collimation error check" />
            <ToolLink href="/tools/height-of-object" title="Height of Object" description="Trigonometric height measurement" />
          </div>
        </section>

        {/* CALCULATIONS */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Calculations</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/distance" title="Distance & Bearing" description="WCB & distance from coordinates" />
            <ToolLink href="/tools/bearing" title="Bearing" description="Forward & back bearing computation" />
            <ToolLink href="/tools/area" title="Area" description="Area from coordinate list" />
            <ToolLink href="/tools/grade" title="Gradient" description="Gradient & slope percentage" />
          </div>
        </section>

        {/* TRAVERSE & ADJUSTMENT */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Traverse & Adjustment</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/traverse" title="Traverse" description="Bowditch/Transit closed traverse | RDM 1.1 grading" />
            <ToolLink href="/tools/traverse-field-book" title="Traverse Field Book" description="Field observations with angular closure" />
            <ToolLink href="/tools/coordinates" title="Coordinates" description="Survey Regulations 1994 | Kenya UTM Zones 36S/37S" />
            <ToolLink href="/tools/cogo" title="COGO Calculator" description="Coordinate geometry computations" />
            <ToolLink href="/tools/gnss" title="GNSS" description="GNSS observation & baseline processing" />
          </div>
        </section>

        {/* ROAD DESIGN */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Road Design</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/road-design" title="Road Design" description="Full road design workflow | RDM 1.1 (2025)" />
            <ToolLink href="/tools/earthworks" title="Earthworks" description="Cut/fill volumes | Prismoidal formula | RDM 1.1" />
            <ToolLink href="/tools/curves" title="Horizontal Curves" description="Horizontal/vertical curve elements | RDM 1.1" />
            <ToolLink href="/tools/tacheometry" title="Tacheometry" description="Stadia/EDM distance & elevation | RDM 1.1 Section 5.6" />
            <ToolLink href="/tools/superelevation" title="Superelevation" description="e = V squared / 127R calculator per KRDM" />
            <ToolLink href="/tools/sight-distance" title="Sight Distance" description="SSD &amp; OSD calculator per KRDM/KeRRA" />
            <ToolLink href="/tools/pipe-gradient" title="Pipe Gradient" description="Manning's equation pipe gradient check with drainage standards" />
            <ToolLink href="/tools/chainage" title="Chainage" description="Chainage calculator for road projects" />
          </div>
        </section>

        {/* EARTHWORKS & VOLUMES */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Earthworks &amp; Volumes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/cross-sections" title="Cross Sections" description="Road cross-section generation and analysis" />
            <ToolLink href="/tools/borrow-pit-volume" title="Borrow Pit Volume" description="Grid method borrow pit volume computation" />
            <ToolLink href="/tools/stockpile-volume" title="Stockpile Volume" description="Stockpile volume from survey points" />
          </div>
        </section>

        {/* SPECIALIZED SURVEYS */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Specialized Surveys</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/mining" title="Mining Survey" description="Volume computation & DXF export" />
            <ToolLink href="/tools/hydrographic" title="Hydrographic" description="Water survey & depth reduction" />
            <ToolLink href="/tools/drone" title="Drone/UAV" description="UAV survey & GCP processing" />
            <ToolLink href="/tools/topo-drawing" title="Topo Drawing Composer" description="Feature codes &amp; DXF topographic drawings" badge="NEW" />
            <ToolLink href="/tools/slope-analysis" title="Slope &amp; Area Analysis" description="DTM slope classification, cut/fill, area" badge="NEW" />
            <ToolLink href="/tools/gnss-baseline" title="GNSS Baseline" description="GNSS baseline file processing | RINEX, Topcon, Trimble" />
            <ToolLink href="/tools/survey-plan-demo" title="Survey Plan Viewer" description="CAD-style boundary identification plan renderer" />
          </div>
        </section>

        {/* ENGINEERING */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Engineering</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/machine-control" title="Machine Control Export" description="Trimble, Leica, Topcon export formats" badge="NEW" />
            <ToolLink href="/tools/progress-monitor" title="Progress Monitor" description="Construction progress tracking &amp; reports" badge="NEW" />
          </div>
        </section>

        {/* DATA EXPORT */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Data Export</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/civil-export" title="Civil Engineering Export" description="Export for Civil 3D, 12d, QGIS, ArcGIS, CloudCompare" />
            <ToolLink href="/tools/gis-export" title="GIS Export" description="GeoJSON, KML, LandXML, CSV with UTM to WGS84 conversion" />
            <ToolLink href="/tools/gcp-export" title="GCP Export" description="Ground control points for Pix4D, DroneDeploy, Metashape, ODM" />
          </div>
        </section>

        {/* REFERENCE */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Reference</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/beacon-reference" title="Beacon Reference" description="Kenya Survey Regulations 1994 beacon symbols &amp; descriptions" />
            <ToolLink href="/tools/survey-regulations" title="Kenya Survey Standards" description="Permitted errors, datums, UTM zones, accuracy classes" />
            <ToolLink href="/tools/us-survey-reference" title="US Survey Standards" description="BLM Manual, FWS Land Survey Handbook, DOJ Title Standards" />
          </div>
        </section>

      </div>
    </div>
  )
}

function ToolLink({
  href,
  title,
  description,
  badge,
}: {
  href: string
  title: string
  description?: string
  badge?: string
}) {
  const Icon = TOOL_ICONS[href] ?? FileCog

  return (
    <Link href={href} className="card-interactive p-4 hover:border-[var(--accent)] transition-colors block relative rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      {badge && (
        <span className="absolute top-2 right-2 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--accent)] text-black leading-none">
          {badge}
        </span>
      )}
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--accent)]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold text-sm pr-8">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>}
    </Link>
  )
}
