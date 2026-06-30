import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-4rem)] bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#D17B47] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[var(--text-muted)]">Loading map...</p>
      </div>
    </div>
  ),
})

export default function GlobalMapPage() {
  return <MapClient />
}
