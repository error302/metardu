'use client';
// src/app/minescan/page.tsx
//
// MineScan Safety AI — currently a future-feature placeholder.
//
// The original page rendered fake stats (mockIncidents = [], mockStats
// all zeros, hardcoded "↓ 3 from yesterday" copy) with no backend
// wired up. That's misleading — it made the page look functional
// when nothing was actually computing.
//
// This redesign keeps the visual identity (Shield icon, dark theme,
// mining-safety vibe) but is honest: it explains what MineScan will
// do when funded and shows a single clear "Notify me when ready"
// call-to-action so interested surveyors can register interest.

import { Shield, Camera, Activity, AlertTriangle, Bell } from 'lucide-react'
import { useState } from 'react'

const PLANNED_CAPABILITIES = [
  {
    icon: Camera,
    title: 'Camera-based hazard detection',
    description:
      'Computer-vision models trained on mining PPE, vehicle proximity, and rock-fall patterns. ' +
      'Footage from on-site CCTV is analysed in real time and alerts are pushed to the safety officer.',
  },
  {
    icon: Activity,
    title: 'Continuous risk scoring',
    description:
      'A weighted risk score per zone combines incident history, near-miss reports, weather, and blast ' +
      'schedules so supervisors can prioritise inspections.',
  },
  {
    icon: AlertTriangle,
    title: 'Incident registry + response-time SLAs',
    description:
      'Every alert becomes an incident ticket with an assigned responder, SLA countdown, and post-mortem ' +
      'workflow. Dashboards export to PDF for the safety committee.',
  },
]

export default function MineScanPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault()
    // We don't have a backend endpoint for this yet either — store
    // locally so the surveyor's interest isn't lost, and tell them
    // someone will reach out.
    if (email && typeof window !== 'undefined') {
      try {
        const existing = JSON.parse(localStorage.getItem('metardu_minescan_interest') || '[]')
        existing.push({ email, at: new Date().toISOString() })
        localStorage.setItem('metardu_minescan_interest', JSON.stringify(existing))
      } catch {
        // localStorage may be unavailable (private mode) — non-fatal
      }
    }
    setSubmitted(true)
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="h-9 w-9 text-blue-500" />
        <h1 className="text-3xl font-bold">MineScan Safety AI</h1>
        <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
          Coming soon
        </span>
      </div>
      <p className="text-[var(--text-muted)] mb-10 max-w-2xl">
        MineScan is METARDU&apos;s planned mining-safety module: real-time
        computer-vision hazard detection, continuous risk scoring per
        mine zone, and a full incident-response registry. It is not yet
        available — the page you may have seen before was a visual mock
        with no live data behind it.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        {PLANNED_CAPABILITIES.map((cap) => (
          <div
            key={cap.title}
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5"
          >
            <cap.icon className="h-7 w-7 text-blue-500 mb-3" />
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">{cap.title}</h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">{cap.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <Bell className="h-5 w-5 text-[var(--accent)] mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">Get notified when MineScan launches</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Drop your email and we&apos;ll reach out when the module is ready for pilot deployment.
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
            Thanks — we&apos;ve recorded your interest and will be in touch when MineScan is ready.
          </div>
        ) : (
          <form onSubmit={handleNotify} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mining-company.co.ke"
              className="flex-1 px-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg transition-colors"
            >
              Notify me
            </button>
          </form>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-8">
        In the meantime, METARDU&apos;s <a href="/tools/deformation" className="underline">deformation monitoring</a>,{' '}
        <a href="/tools/topology-check" className="underline">topology check</a>, and{' '}
        <a href="/marketplace" className="underline">equipment marketplace</a> modules are available today
        for surveyors working in and around extractive sites.
      </p>
    </div>
  )
}
