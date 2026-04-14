'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BoltIcon, XIcon, ChevronRightIcon } from '@/components/map/PremiumIcons'

const TOOLS = [
  {
    category: 'Calculations',
    items: [
      { label: 'Distance & Bearing', href: '/tools/distance' },
      { label: 'Bearing', href: '/tools/bearing' },
      { label: 'Area', href: '/tools/area' },
      { label: 'Grade', href: '/tools/grade' },
    ]
  },
  {
    category: 'Traverse & Adjustment',
    items: [
      { label: 'Traverse', href: '/tools/traverse' },
      { label: 'Coordinates', href: '/tools/coordinates' },
      { label: 'COGO', href: '/tools/cogo' },
      { label: 'GNSS', href: '/tools/gnss' },
    ]
  },
  {
    category: 'Levelling',
    items: [
      { label: 'Leveling', href: '/tools/leveling' },
      { label: 'Two Peg Test', href: '/tools/two-peg-test' },
    ]
  },
  {
    category: 'Curves & Roads',
    items: [
      { label: 'Curves', href: '/tools/curves' },
      { label: 'Chainage', href: '/tools/chainage' },
      { label: 'Tacheometry', href: '/tools/tacheometry' },
    ]
  },
  {
    category: 'Earthworks',
    items: [
      { label: 'Cross Sections', href: '/tools/cross-sections' },
      { label: 'Setting Out', href: '/tools/setting-out' },
    ]
  },
  {
    category: 'Engineering',
    items: [
      { label: 'Superelevation', href: '/tools/superelevation' },
      { label: 'Sight Distance', href: '/tools/sight-distance' },
      { label: 'Pipe Gradient', href: '/tools/pipe-gradient' },
      { label: 'Borrow Pit Volume', href: '/tools/borrow-pit-volume' },
      { label: 'Stockpile Volume', href: '/tools/stockpile-volume' },
    ]
  },
  {
    category: 'Utilities',
    items: [
      { label: 'Datum Converter', href: '/online' },
    ]
  }
]

export function QuickCompute() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── FAB Button ────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2.5
                   bg-gradient-to-r from-[#FFB84D] to-[#E8841A] text-white
                   px-5 py-3 rounded-2xl font-semibold text-sm
                   shadow-[0_0_20px_rgba(232,132,26,0.3)]
                   hover:shadow-[0_0_30px_rgba(232,132,26,0.45)]
                   transition-all duration-300 hover:scale-[1.02]
                   active:scale-[0.98]"
      >
        <BoltIcon className="w-4 h-4" active />
        <span>Quick Compute</span>
      </button>

      {/* ── Slide-in Panel ────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 flex transition-all duration-300 ease-out ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="flex-1 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />

        {/* Panel */}
        <div
          className={`w-80 bg-[#0d0d14]/98 backdrop-blur-xl border-l border-white/[0.06]
                      overflow-y-auto custom-scrollbar-quick
                      transition-transform duration-300 ease-out
                      ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Panel header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-[#0d0d14]/95 backdrop-blur-xl border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E8841A]/10 flex items-center justify-center">
                <BoltIcon className="w-4 h-4" active />
              </div>
              <h2 className="font-semibold text-white text-base tracking-wide">Quick Compute</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Tools list */}
          <div className="p-4 space-y-6">
            {TOOLS.map(group => (
              <div key={group.category}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2 px-1">
                  {group.category}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between group px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                    >
                      <span className="font-medium">{item.label}</span>
                      <ChevronRightIcon className="w-3.5 h-3.5 text-gray-600 group-hover:text-[#E8841A] group-hover:translate-x-0.5 transition-all duration-200" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar-quick::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar-quick::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-quick::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 3px;
        }
      `}</style>
    </>
  )
}
