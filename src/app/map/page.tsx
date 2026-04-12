'use client'

import dynamic from 'next/dynamic'

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => (
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#E8841A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading map...</p>
      </div>
    </div>
  ),
})

export default function GlobalMapPage() {
  return <MapClient />
}
