import LevelBook from '@/components/LevelBook'

export default function LevelBookPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Level Book</h1>
      <p className="text-sm text-[var(--text-muted)] mb-1">
        Differential levelling reduction — Height of Plane of Collimation (HPC) / Rise &amp; Fall
      </p>
      <p className="text-xs text-[var(--text-muted)] font-mono mb-8">
        RDM 1.1 (2025) Table 5.1 &nbsp;|&nbsp; Survey Act Cap 299 &nbsp;|&nbsp; Survey Regulations 1994
      </p>
      <LevelBook />
    </div>
  )
}
