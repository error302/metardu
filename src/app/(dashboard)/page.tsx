import Link from 'next/link';

const STATS = [
  { label: 'Accuracy Orders', value: '1st–4th', desc: 'Full Kenya support' },
  { label: 'P0 Corrections', value: '6/6', desc: 'Atmospheric, C&R, Grid Scale, Sea Level, Slope, Convergence' },
  { label: 'Total Tests', value: '80/80', desc: 'All passing' },
  { label: 'DB Load Reduction', value: 'LRU + Batch', desc: 'Cache-first, batch sync' },
];

const QUICK_ACTIONS = [
  { href: '/projects/new', label: 'New Project', icon: '+' },
  { href: '/corrections', label: 'Run Corrections', icon: '🔧' },
  { href: '/cogo', label: 'COGO Computation', icon: '📐' },
  { href: '/documents', label: 'Generate Document', icon: '📄' },
];

export default function HomePage() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>
          Welcome to <span style={{ color: 'var(--accent)' }}>METARDU</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '15px' }}>
          Professional survey computation engine for Kenya cadastral surveys.
          Built for 2nd-order accuracy with full correction pipeline.
        </p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {STATS.map((stat) => (
          <div key={stat.label} className="card">
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: 'var(--accent)' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {stat.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                minWidth: '200px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <span style={{
                fontSize: '20px',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent-muted)',
                borderRadius: '8px',
                color: 'var(--accent)',
                fontWeight: 700,
              }}>
                {action.icon}
              </span>
              <span style={{ fontWeight: 500, fontSize: '14px' }}>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Correction Pipeline Overview */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          Correction Pipeline (7 Stages)
        </h2>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexWrap: 'wrap',
        }}>
          {[
            { name: 'EDM Constant', impact: 'mm' },
            { name: 'Atmospheric', impact: '~50 ppm' },
            { name: 'Slope', impact: 'critical' },
            { name: 'C&R', impact: '67mm/km' },
            { name: 'Sea Level', impact: '~267 ppm' },
            { name: 'Grid Scale', impact: '~400 ppm' },
            { name: 'Convergence', impact: 'arc-sec' },
          ].map((stage, i) => (
            <div key={stage.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                padding: '6px 12px',
                borderRadius: '4px',
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}>
                {i + 1}. {stage.name}
              </div>
              {i < 6 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Combined effect at Nairobi altitude: <strong style={{ color: 'var(--warning)' }}>~700 ppm</strong> (~70cm per km)
          — all corrections applied automatically with full audit trail.
        </div>
      </div>

      {/* Kenya Reference Data */}
      <div className="card">
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Kenya Reference Data
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Datum:</span> Arc 1960 (Clarke 1880 mod.)
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>UTM Zones:</span> 36S, 37S
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Refraction k:</span> 0.13 (tropical)
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Geoid N:</span> -12m (Nairobi)
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Cadastral min:</span> 1:10,000 (3rd order)
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Our capability:</span> 1:20,000 (2nd order)
          </div>
        </div>
      </div>
    </div>
  );
}
