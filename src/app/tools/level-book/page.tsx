import { PageHeader } from '@/components/shared/PageHeader'
import LevelBook from '@/components/LevelBook'

export default function LevelBookPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Level Book"
        subtitle="Differential levelling reduction — Height of Plane of Collimation (HPC) / Rise & Fall"
        reference="RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299 | Survey Regulations 1994"
      />
      <LevelBook />
    </div>
  )
}
