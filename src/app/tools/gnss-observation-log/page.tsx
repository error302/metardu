import GNSSLogBuilder from '@/components/gnss/GNSSLogBuilder'

export default function GNSSObservationLogPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">GNSS Observation Log</h1>
      <p className="text-sm text-[var(--text-muted)] mb-1">
        Record GNSS field sessions and produce a formal observation log for project records and DoLS submission
      </p>
      <p className="text-xs text-[var(--text-muted)] font-mono mb-8">
        Survey Act Cap 299 &nbsp;|&nbsp; Survey Regulations 1994, Reg. 21 &nbsp;|&nbsp;
        ISK GNSS Best Practice Guidelines 2019 &nbsp;|&nbsp; ISO 17123-8
      </p>
      <GNSSLogBuilder />
    </div>
  )
}
