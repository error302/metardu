export default function SurveyMapPage() {
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Map View</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Interactive map with survey layers and coordinate grid
      </p>
      <div className="card" style={{
        height: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: '16px',
      }}>
        OpenLayers Map Component — Requires browser environment
        <br />
        <span style={{ fontSize: '13px', marginTop: '8px', display: 'block' }}>
          Install ol package: npm install ol
        </span>
      </div>
    </div>
  );
}
