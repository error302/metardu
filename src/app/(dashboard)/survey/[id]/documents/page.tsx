export default function SurveyDocumentsPage() {
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Documents</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Generate survey documents from computed data
      </p>
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
        Run traverse computation first, then generate documents from the results.
      </div>
    </div>
  );
}
