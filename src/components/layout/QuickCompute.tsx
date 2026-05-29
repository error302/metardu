'use client';

import { useState } from 'react'
import Link from 'next/link'
import { BoltIcon, XIcon, ChevronRightIcon } from '@/components/map/PremiumIcons'

const TOOLS = [
  {
    category: 'Documents & Certificates',
    items: [
      { label: 'Beacon Certificate', href: '/tools/beacon-certificate' },
      { label: 'Billable Documents', href: '/tools/billable-documents' },
      { label: 'GNSS Observation Log', href: '/tools/gnss-observation-log' },
      { label: 'Statutory Workbook', href: '/tools/statutory-workbook' },
      { label: 'Survey Report', href: '/tools/survey-report-builder' },
      { label: 'Mobilisation Report', href: '/tools/mobilisation-report' },
      { label: 'Detail Tolerances', href: '/tools/detail-tolerances' },
    ]
  },
  {
    category: 'Field Layout',
    items: [
      { label: 'Setting Out', href: '/tools/setting-out' },
      { label: 'Missing Line', href: '/tools/missing-line' },
      { label: 'Control Marks Register', href: '/tools/control-marks-register' },
      { label: 'Pile / Column Grid', href: '/tools/pile-grid' },
    ]
  },
  {
    category: 'Leveling',
    items: [
      { label: 'Leveling', href: '/tools/leveling' },
      { label: 'Level Book', href: '/tools/level-book' },
      { label: 'Two Peg Test', href: '/tools/two-peg-test' },
      { label: 'Height of Object', href: '/tools/height-of-object' },
    ]
  },
  {
    category: 'Calculations',
    items: [
      { label: 'Distance & Bearing', href: '/tools/distance' },
      { label: 'Bearing', href: '/tools/bearing' },
      { label: 'Area', href: '/tools/area' },
      { label: 'Gradient', href: '/tools/grade' },
    ]
  },
  {
    category: 'Traverse & Adjustment',
    items: [
      { label: 'Traverse', href: '/tools/traverse' },
      { label: 'Traverse Field Book', href: '/tools/traverse-field-book' },
      { label: 'Coordinates', href: '/tools/coordinates' },
      { label: 'COGO Calculator', href: '/tools/cogo' },
      { label: 'GNSS', href: '/tools/gnss' },
    ]
  },
  {
    category: 'Road Design',
    items: [
      { label: 'Road Design', href: '/tools/road-design' },
      { label: 'Earthworks', href: '/tools/earthworks' },
      { label: 'Horizontal Curves', href: '/tools/curves' },
      { label: 'Tacheometry', href: '/tools/tacheometry' },
      { label: 'Superelevation', href: '/tools/superelevation' },
      { label: 'Sight Distance', href: '/tools/sight-distance' },
      { label: 'Pipe Gradient', href: '/tools/pipe-gradient' },
    ]
  },
  {
    category: 'Earthworks & Volumes',
    items: [
      { label: 'Cross Sections', href: '/tools/cross-sections' },
      { label: 'Borrow Pit Volume', href: '/tools/borrow-pit-volume' },
      { label: 'Stockpile Volume', href: '/tools/stockpile-volume' },
    ]
  },
  {
    category: 'Specialized Surveys',
    items: [
      { label: 'Mining Survey', href: '/tools/mining' },
      { label: 'Hydrographic', href: '/tools/hydrographic' },
      { label: 'Drone / UAV', href: '/tools/drone' },
      { label: 'Topo Drawing Composer', href: '/tools/topo-drawing' },
      { label: 'Slope & Area Analysis', href: '/tools/slope-analysis' },
      { label: 'GNSS Baseline', href: '/tools/gnss-baseline' },
      { label: 'Survey Plan Viewer', href: '/tools/survey-plan-demo' },
    ]
  },
  {
    category: 'Engineering',
    items: [
      { label: 'Machine Control Export', href: '/tools/machine-control' },
      { label: 'Progress Monitor', href: '/tools/progress-monitor' },
    ]
  },
  {
    category: 'Data Export',
    items: [
      { label: 'Civil Engineering Export', href: '/tools/civil-export' },
      { label: 'GIS Export', href: '/tools/gis-export' },
      { label: 'GCP Export', href: '/tools/gcp-export' },
    ]
  },
  {
    category: 'Reference',
    items: [
      { label: 'Beacon Reference', href: '/tools/beacon-reference' },
      { label: 'Kenya Survey Standards', href: '/tools/survey-regulations' },
      { label: 'US Survey Standards', href: '/tools/us-survey-reference' },
    ]
  },
  {
    category: 'Utilities',
    items: [
      { label: 'Datum Converter', href: '/online' },
    ]
  },
]

export function QuickCompute() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── FAB Button ────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-28 right-4 md:bottom-10 md:right-6 z-40 flex items-center gap-2.5
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
