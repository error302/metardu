import { PageHeader } from '@/components/shared/PageHeader'
import SettingOutCalculator from '@/components/setting-out/SettingOutCalculator'

export default function SettingOutPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Setting Out"
        subtitle="Generate setting out angles, distances and stake out sheets | Source: Ghilani &amp; Wolf Ch.23 | RDM 1.1 Table 5.2"
      />
      <SettingOutCalculator />
    </div>
  )
}
