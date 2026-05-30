import GNSSLogBuilder from '@/components/gnss/GNSSLogBuilder'
import { PageHeader } from '@/components/shared/PageHeader'

export default function GNSSObservationLogPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="GNSS Observation Log" subtitle="Record GNSS field sessions and produce a formal observation log for project records and DoLS submission" reference="Survey Act Cap 299  |  Survey Regulations 1994, Reg. 21  |  ISK GNSS Best Practice Guidelines 2019  |  ISO 17123-8" />
      <GNSSLogBuilder />
    </div>
  )
}
