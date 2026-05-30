import { PageHeader } from '@/components/shared/PageHeader'
import PileGridPanel from '@/components/engineering/PileGridPanel'

export default function PileGridPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Pile / Column Grid Setting Out"
        subtitle="Generate pile or column grid coordinates for foundation setting out. Compute bearings and distances from an instrument station for accurate staking. Referenced from Basak §8.5, Ghilani &amp; Wolf §24.1, Kenya Building Code 2019 Part 4."
      />
      <PileGridPanel />
    </div>
  )
}
