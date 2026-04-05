'use client'

import Link from 'next/link'

export default function EnterprisePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24">
      <h1 className="text-3xl font-bold mb-4">Enterprise Products</h1>
      <p className="text-[var(--text-muted)] mb-12">
        Advanced survey technology for specialized operations.
        Join the waitlist to be notified when these products launch.
      </p>

      {[
        {
          name: 'MineTwin 3D',
          description: 'Real-time 3D digital twin for mining surveys. Volume tracking, deformation monitoring, and safety reporting in one surface model.'
        },
        {
          name: 'MineScan Safety',
          description: 'AI-powered mine safety scanning. Void detection, crown pillar stability assessment, and automated hazard flagging.'
        },
        {
          name: 'USV Orchestrator',
          description: 'Unmanned surface vessel control and data acquisition for hydrographic surveys. Mission planning, real-time sounder integration, and automated sounding reduction.'
        }
      ].map(product => (
        <div key={product.name} className="border border-[var(--border-color)] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">{product.name}</h2>
          <p className="text-[var(--text-muted)] mb-4">{product.description}</p>
          
          <a
            href="mailto:enterprise@metardu.com"
            className="inline-block bg-orange-500 text-white px-4 py-2 rounded font-medium hover:bg-orange-600"
          >
            Join Waitlist
          </a>
        </div>
      ))}
    </main>
  )
}
