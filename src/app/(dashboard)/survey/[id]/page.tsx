'use client';

import Link from 'next/link';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/observations', label: 'Observations' },
  { href: '/compute', label: 'Compute' },
  { href: '/map', label: 'Map' },
  { href: '/documents', label: 'Documents' },
];

export default function SurveyDetailPage() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          <Link href="/projects" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Projects</Link>
          {' / '}
          <span>Survey</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Survey Overview</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Traverse survey with all P0 corrections enabled
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`/survey/demo${tab.href}`}
            className="btn-secondary"
            style={{ textDecoration: 'none', fontSize: '13px', padding: '6px 12px' }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>Survey Details</h3>
          <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Method:</span> Traverse</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Order:</span> 3rd (1:10,000)</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Datum:</span> Arc 1960</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Projection:</span> UTM Zone 37S</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Refraction k:</span> 0.13</div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>Corrections Applied</h3>
          <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div style={{ color: 'var(--success)' }}>✓ Atmospheric (temp/pressure/humidity)</div>
            <div style={{ color: 'var(--success)' }}>✓ Curvature & Refraction</div>
            <div style={{ color: 'var(--success)' }}>✓ Grid Scale Factor</div>
            <div style={{ color: 'var(--success)' }}>✓ Sea Level Reduction</div>
            <div style={{ color: 'var(--success)' }}>✓ Slope Reduction</div>
            <div style={{ color: 'var(--success)' }}>✓ Grid Convergence</div>
          </div>
        </div>
      </div>
    </div>
  );
}
