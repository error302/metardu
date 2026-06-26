'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description: string | null;
  surveyType: string;
  surveyOrder: number;
  status: string;
  county: string | null;
  lrNumber: string | null;
  surveyorName: string;
  surveyorLicense: string;
  projection: string;
  datum: string;
  surveys: any[];
  documents: any[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/projects?id=${params.id}`)
        .then(res => res.json())
        .then(data => setProject(data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading project...</div>;
  if (!project) return <div style={{ color: 'var(--error)' }}>Project not found</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{project.name}</h1>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span className={`badge badge-${project.status === 'ACTIVE' ? 'success' : 'info'}`}>{project.status}</span>
            <span>{project.surveyType}</span>
            <span>{project.surveyOrder}{'\u207F'}{project.surveyOrder === 1 ? 'st' : project.surveyOrder === 2 ? 'nd' : project.surveyOrder === 3 ? 'rd' : 'th'} Order</span>
            {project.county && <span>{project.county}</span>}
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>Project Info</h3>
          <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>LR Number:</span> {project.lrNumber || '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Datum:</span> {project.datum}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Projection:</span> {project.projection}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Description:</span> {project.description || '-'}</div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>Surveyor</h3>
          <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {project.surveyorName}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>License:</span> {project.surveyorLicense}</div>
          </div>
        </div>
      </div>

      {/* Surveys */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Surveys</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{project.surveys?.length || 0} surveys</span>
        </div>
        {project.surveys?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {project.surveys.map((s: any) => (
              <Link key={s.id} href={`/survey/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px' }}>{s.method} Survey</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {s.surveyType} | Order {s.order} | {s.status}
                    </div>
                  </div>
                  <span className={`badge badge-${s.status === 'COMPLETED' ? 'success' : s.status === 'COMPUTING' ? 'warning' : 'info'}`}>
                    {s.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No surveys yet. Start by adding observations.
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Documents</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{project.documents?.length || 0} documents</span>
        </div>
        {project.documents?.length > 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {project.documents.map((d: any) => (
              <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                {d.title} - {d.documentType} ({d.paperSize})
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No documents generated yet.
          </div>
        )}
      </div>
    </div>
  );
}
