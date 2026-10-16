'use client'

import { useState } from 'react'
import { z } from 'zod'
import { apiPatch, ApiError } from '@/lib/api/client'
import type { DashboardData } from '@/lib/admin/dashboardContract'

export default function FeedbackInbox({ items, onUpdated }: { items: DashboardData['operations']['feedback']; onUpdated: () => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('in_progress')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const save = async () => {
    const item = items.find(row => row.id === selected)
    if (!item) return
    setBusy(true); setError(''); setMessage('')
    try {
      await apiPatch('/api/admin/feedback', z.object({ id: z.string(), status: z.string() }), { id: item.id, expectedStatus: item.status, status, note })
      setSelected(null); setNote(''); setMessage('Feedback updated. Your note is recorded in the audit trail.')
      await onUpdated()
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update feedback. Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-eyebrow">Customer voice</p><h2>Feedback inbox</h2></div><span className="admin-caption">Latest 30 · unresolved first</span></div>
    <p className="admin-caption mb-5">Review reports submitted through METARDU. Notes are internal; updating a status does not send an email.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-note" role="status">{message}</p>}
    {!items.length && <div className="admin-empty"><h3>No feedback received yet.</h3><p>Reports from the site’s feedback button will appear here.</p></div>}
    <div className="divide-y divide-[var(--border-color)]">{items.map(item => <article key={item.id} className="py-5 first:pt-0">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="admin-eyebrow">{item.type} / {item.status.replace('_', ' ')}</p><p className="admin-caption mt-1">{item.email || 'No contact address provided'} · {new Date(item.createdAt).toLocaleDateString('en-KE')}</p></div><button className="btn btn-secondary text-sm" disabled={busy} onClick={() => { setSelected(item.id); setStatus(item.status === 'resolved' ? 'open' : 'in_progress'); setNote(''); setError('') }}>Review</button></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>
      {item.resolutionNote && <p className="admin-note mt-3">Internal note: {item.resolutionNote}</p>}
      {selected === item.id && <div className="mt-4 space-y-3 rounded-lg bg-[var(--bg-primary)] p-4"><label className="block text-sm">Status<select className="input mt-2" value={status} onChange={e => setStatus(e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label><label className="block text-sm">Internal review note<textarea className="input mt-2" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><div className="flex gap-2"><button className="btn btn-primary" disabled={busy || note.trim().length < 3} onClick={save}>{busy ? 'Saving…' : 'Save review'}</button><button className="btn btn-secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></div>}
    </article>)}</div>
  </section>
}
