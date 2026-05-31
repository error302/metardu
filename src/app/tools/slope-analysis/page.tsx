import { PageHeader } from '@/components/shared/PageHeader'
import SlopeAnalysisPanel from '@/components/engineering/SlopeAnalysisPanel'

export default function SlopeAnalysisPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Slope &amp; Area Analysis"
        subtitle="Analyze DTM surfaces for slope classification, cut/fill volumes, and area computation. Essential for planning, drainage design, and earthworks estimation. Referenced from Ghilani &amp; Wolf §17.4, RDM 1.3 §4, KENHA Design Manual 2017."
      />
      <SlopeAnalysisPanel />
    </div>
  )
}
