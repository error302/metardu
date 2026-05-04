import Link from 'next/link'

export default function ToolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-2">Quick Tools</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">No project required — enter values and get instant results</p>
      
      <div className="space-y-8">
        {/* FIELD LAYOUT */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Field Layout</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolLink href="/tools/setting-out" title="Setting Out" description="Stakeout from known coords | RDM 1.1" />
            <ToolLink href="/tools/missing-line" title="Missing Line" description="Distance & bearing between two points" />
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
            <ToolLink href="/tools/grade" title="Grade" description="Gradient & slope percentage" />
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
            <ToolLink href="/tools/mining" title="⛏ Mining Survey" description="Volume computation & DXF export" />
            <ToolLink href="/tools/hydrographic" title="🌊 Hydrographic" description="Water survey & depth reduction" />
            <ToolLink href="/tools/drone" title="🚁 Drone/UAV" description="UAV survey & GCP processing" />
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolLink({ href, title, description }: { href: string; title: string; description?: string }) {
  return (
    <Link href={href} className="card p-4 hover:border-[var(--accent)] transition-colors block">
      <p className="font-semibold text-sm">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>}
    </Link>
  );
}
