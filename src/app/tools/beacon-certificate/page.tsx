import BeaconCertificateBuilder from '@/components/BeaconCertificateBuilder'

export default function BeaconCertificatePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Beacon Certificate</h1>
      <p className="text-sm text-[var(--text-muted)] mb-1">
        Produce a signed beacon description sheet for every beacon set or found during a survey
      </p>
      <p className="text-xs text-[var(--text-muted)] font-mono mb-8">
        Survey Regulations 1994, Reg. 20 &nbsp;|&nbsp; Survey Act Cap 299, s.22 &nbsp;|&nbsp; Cadastral Survey Standards Manual
      </p>
      <BeaconCertificateBuilder />
    </div>
  )
}
