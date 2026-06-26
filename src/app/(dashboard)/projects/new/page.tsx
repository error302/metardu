'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SURVEY_TYPES = ['CADASTRAL', 'TOPOGRAPHIC', 'ENGINEERING', 'CONTROL', 'HYDROGRAPHIC', 'MINING'];
const PROJECTIONS = ['UTM36S', 'UTM37S', 'CASSINI_SOLDNER'];
const ORDERS = [1, 2, 3, 4];
const COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Malindi',
  'Kitale', 'Thika', 'Nyeri', 'Kakamega', 'Lamu', 'Garissa',
];

export default function NewProjectPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    surveyType: 'CADASTRAL',
    surveyOrder: 3,
    county: '',
    subCounty: '',
    lrNumber: '',
    projection: 'UTM37S',
    surveyorName: '',
    surveyorLicense: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>New Project</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Create a new survey project with Kenya-standard parameters
      </p>

      <form onSubmit={handleSubmit}>
        {/* Project Details */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Project Details</h2>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Project Name *</label>
              <input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Kiambu Plot Survey" />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
              <textarea className="input-field" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the survey project" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Survey Type</label>
                <select className="input-field" value={form.surveyType} onChange={(e) => setForm({ ...form, surveyType: e.target.value })}>
                  {SURVEY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Accuracy Order</label>
                <select className="input-field" value={form.surveyOrder} onChange={(e) => setForm({ ...form, surveyOrder: parseInt(e.target.value) })}>
                  {ORDERS.map(o => (
                    <option key={o} value={o}>
                      {o}{o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'} Order (1:{o === 1 ? '100,000' : o === 2 ? '20,000' : o === 3 ? '10,000' : '5,000'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Location</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>County</label>
              <select className="input-field" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })}>
                <option value="">Select county</option>
                {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Sub-County</label>
              <input className="input-field" value={form.subCounty} onChange={(e) => setForm({ ...form, subCounty: e.target.value })} placeholder="e.g., Westlands" />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>LR Number</label>
              <input className="input-field" value={form.lrNumber} onChange={(e) => setForm({ ...form, lrNumber: e.target.value })} placeholder="e.g., Nairobi/Block 22/123" />
            </div>
          </div>
        </div>

        {/* Surveyor & Datum */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Surveyor & Datum</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Surveyor Name *</label>
              <input className="input-field" required value={form.surveyorName} onChange={(e) => setForm({ ...form, surveyorName: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>License Number *</label>
              <input className="input-field" required value={form.surveyorLicense} onChange={(e) => setForm({ ...form, surveyorLicense: e.target.value })} placeholder="Kenya surveyor license" />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Projection</label>
              <select className="input-field" value={form.projection} onChange={(e) => setForm({ ...form, projection: e.target.value })}>
                {PROJECTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Datum</label>
              <input className="input-field" value="Arc 1960" disabled />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
