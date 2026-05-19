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
  DraftingCompass,
  Drone,
  FileBadge,
  FileChartColumn,
  FileCog,
  FileSpreadsheet,
  FileStack,
  GitBranch,
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
  '/tools/chainage': Milestone,
  '/tools/tacheometry': ScanLine,
  '/tools/mining': Pickaxe,
  '/tools/hydrographic': Ship,
  '/tools/drone': Drone,
  '/tools/topo-drawing': SquareDashedMousePointer,
  '/tools/slope-analysis': ChartArea,
  '/tools/machine-control': PlaneTakeoff,
  '/tools/progress-monitor': ChartColumnIncreasing,
}

export default function ToolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-2">Quick Tools</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">No project required — enter values and get instant results</p>
      
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
    <Link href={href} className="card p-4 hover:border-[var(--accent)] transition-colors block relative">
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
