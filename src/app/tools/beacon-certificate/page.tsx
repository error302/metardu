import BeaconCertificateBuilder from '@/components/BeaconCertificateBuilder'
import { PageHeader } from '@/components/shared/PageHeader'

export default function BeaconCertificatePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="Beacon Certificate" subtitle="Produce a signed beacon description sheet for every beacon set or found during a survey" reference="Survey Regulations 1994, Reg. 20  |  Survey Act Cap 299, s.22  |  Cadastral Survey Standards Manual" />
      <BeaconCertificateBuilder />
    </div>
  )
}
