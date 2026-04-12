export default function ProcessLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-8 w-56 rounded bg-[var(--bg-tertiary)] mb-2" />
      <div className="h-4 w-96 rounded bg-[var(--bg-tertiary)] mb-8" />
      <div className="h-48 rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-tertiary)]" />
    </div>
  )
}
