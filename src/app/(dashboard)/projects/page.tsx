'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  surveyType: string;
  surveyOrder: number;
  status: string;
  county: string | null;
  lrNumber: string | null;
  surveyorName: string;
  surveyorLicense: string;
  createdAt: string;
  _count?: { surveys: number; documents: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState('');

  useEffect(() => {
    // For demo, show placeholder
    setLoading(false);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Projects</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage your survey projects and associated data
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary" style={{ textDecoration: 'none' }}>
          + New Project
        </Link>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input
          className="input-field"
          placeholder="Surveyor License Number"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          style={{ maxWidth: '300px' }}
        />
        <button className="btn-primary">Search</button>
      </div>

      {/* Projects table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Type</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Order</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>County</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>LR No.</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading projects...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No projects yet. Create your first project to get started.
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/projects/${p.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                      {p.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{p.surveyType}</td>
                  <td style={{ padding: '12px 16px' }}>{p.surveyOrder}{'\u207F'}{p.surveyOrder === 1 ? 'st' : p.surveyOrder === 2 ? 'nd' : p.surveyOrder === 3 ? 'rd' : 'th'}</td>
                  <td style={{ padding: '12px 16px' }}><span className={`badge badge-${p.status === 'ACTIVE' ? 'success' : p.status === 'COMPLETED' ? 'info' : 'warning'}`}>{p.status}</span></td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{p.county || '-'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{p.lrNumber || '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <Link href={`/projects/${p.id}`} className="btn-secondary" style={{ textDecoration: 'none', fontSize: '12px', padding: '4px 10px' }}>Open</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
