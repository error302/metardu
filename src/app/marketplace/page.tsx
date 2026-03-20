'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getListings, searchListings, postListing, markSold, deleteListing,
  sendInquiry, getInquiriesFor,
  InstrumentListing, ListingType, InstrumentCategory, Currency, Condition,
  CATEGORIES, CONDITIONS, BRANDS, COUNTRIES, CURRENCIES, fmtPrice,
} from '@/lib/marketplace/instruments'

// ── helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function conditionBadge(c: Condition) {
  const map: Record<Condition, string> = {
    new:       'bg-green-900/40 text-green-300 border-green-700/40',
    excellent: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
    good:      'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)]',
    fair:      'bg-amber-900/30 text-amber-400 border-amber-700/30',
    for_parts: 'bg-red-900/30 text-red-400 border-red-700/30',
  }
  return map[c]
}

function typeBadge(t: ListingType) {
  if (t === 'sale')   return 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20'
  if (t === 'rent')   return 'bg-purple-900/40 text-purple-300 border-purple-700/40'
  return 'bg-amber-900/30 text-amber-400 border-amber-700/30'
}

function typeLabel(t: ListingType) {
  if (t === 'sale') return 'For sale'
  if (t === 'rent') return 'For rent'
  return 'Wanted'
}

const TODAY = new Date().toISOString().split('T')[0]
const BLANK: Omit<InstrumentListing, 'id' | 'postedAt' | 'sold'> = {
  type: 'sale', category: 'total_station', title: '', brand: '', model: '',
  condition: 'good', year: undefined, description: '', price: 0 as any,
  currency: 'KES', rentPeriod: undefined, location: '', country: 'Kenya',
  sellerName: '', sellerContact: '', images: [],
}

// ── Post listing modal ────────────────────────────────────────────────────────

function PostModal({ onSave, onClose }: { onSave: (l: InstrumentListing) => void; onClose: () => void }) {
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK })
  const [err, setErr] = useState('')
  const f = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = () => {
    if (!form.title.trim())         { setErr('Give the listing a title'); return }
    if (!form.brand.trim())         { setErr('Brand is required'); return }
    if (!form.model.trim())         { setErr('Model is required'); return }
    if (!form.description.trim())   { setErr('Add a description'); return }
    if (!form.price || Number(form.price) <= 0) { setErr('Set a price'); return }
    if (!form.location.trim())      { setErr('Location is required'); return }
    if (!form.sellerName.trim())    { setErr('Your name is required'); return }
    if (!form.sellerContact.trim()) { setErr('Contact details required so buyers can reach you'); return }
    setErr('')
    onSave(postListing({ ...form, price: Number(form.price) }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="font-semibold text-[var(--text-primary)]">Post a listing</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl p-1">×</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-4">
          {err && <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">{err}</p>}

          {/* Type tabs */}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">Listing type *</label>
            <div className="flex gap-2">
              {(['sale','rent','wanted'] as ListingType[]).map(t => (
                <button key={t} onClick={() => f('type', t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === t ? typeBadge(t) : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border-color)]'
                  }`}>
                  {t === 'sale' ? 'Selling' : t === 'rent' ? 'Renting out' : 'Looking to buy'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Category *</label>
              <select value={form.category} onChange={e => f('category', e.target.value as InstrumentCategory)} className="input w-full">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Condition *</label>
              <select value={form.condition} onChange={e => f('condition', e.target.value as Condition)} className="input w-full">
                {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Brand *</label>
              <input value={form.brand} onChange={e => f('brand', e.target.value)} list="brand-list"
                placeholder="Leica, Trimble…" className="input w-full" />
              <datalist id="brand-list">{BRANDS.map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Model *</label>
              <input value={form.model} onChange={e => f('model', e.target.value)}
                placeholder="TS16, S9…" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Year of manufacture</label>
              <input type="number" min={1990} max={2025} value={form.year || ''} onChange={e => f('year', Number(e.target.value) || undefined)}
                placeholder="e.g. 2019" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">
                {form.type === 'wanted' ? 'Max budget' : 'Price'} *
              </label>
              <div className="flex gap-2">
                <input type="number" min={0} value={form.price || ''} onChange={e => f('price', e.target.value)}
                  placeholder="Amount" className="input flex-1" />
                <select value={form.currency} onChange={e => f('currency', e.target.value as Currency)} className="input w-20">
                  {CURRENCIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>
              </div>
            </div>
          </div>

          {form.type === 'rent' && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Rent period</label>
              <select value={form.rentPeriod || 'day'} onChange={e => f('rentPeriod', e.target.value)} className="input w-full">
                <option value="day">Per day</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
              </select>
            </div>
          )}

          <div className="col-span-2">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Listing title *</label>
            <input value={form.title} onChange={e => f('title', e.target.value)}
              placeholder="e.g. Leica TS16 Total Station — 2019, excellent condition"
              className="input w-full" />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Description *</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
              placeholder="Describe the instrument: accessories included, reason for selling, any issues, calibration status, original box included, etc."
              className="input w-full resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Location (town) *</label>
              <input value={form.location} onChange={e => f('location', e.target.value)}
                placeholder="Nairobi, Kampala…" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Country *</label>
              <select value={form.country} onChange={e => f('country', e.target.value)} className="input w-full">
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Your name *</label>
              <input value={form.sellerName} onChange={e => f('sellerName', e.target.value)}
                placeholder="Your name or company" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Contact (phone/email) *</label>
              <input value={form.sellerContact} onChange={e => f('sellerContact', e.target.value)}
                placeholder="+254712345678" className="input w-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5 pt-2 border-t border-[var(--border-color)]">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={submit} className="btn btn-primary flex-1">
            {form.type === 'wanted' ? 'Post wanted ad' : 'Post listing'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Listing detail drawer ─────────────────────────────────────────────────────

function ListingDetail({ listing, onClose, onRefresh }: {
  listing: InstrumentListing; onClose: () => void; onRefresh: () => void
}) {
  const [inquiries, setInquiries] = useState(getInquiriesFor(listing.id))
  const [showForm, setShowForm] = useState(false)
  const [sent, setSent] = useState(false)
  const [iqErr, setIqErr] = useState('')
  const [form, setForm] = useState({ buyerName: '', buyerContact: '', message: '' })
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const catLabel = CATEGORIES.find(c => c.id === listing.category)?.label ?? listing.category
  const condLabel = CONDITIONS.find(c => c.id === listing.condition)?.label ?? listing.condition

  const submit = () => {
    if (!form.buyerName)    { setIqErr('Your name is required'); return }
    if (!form.buyerContact) { setIqErr('Your contact is required'); return }
    if (!form.message.trim()) { setIqErr('Write a message to the seller'); return }
    sendInquiry({ listingId: listing.id, ...form })
    setSent(true)
    setInquiries(getInquiriesFor(listing.id))
  }

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="w-full max-w-md bg-[var(--bg-card)] border-l border-[var(--border-color)] h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--text-primary)] leading-snug text-sm">{listing.title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{catLabel} · {listing.location}, {listing.country}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 ml-3">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Price + badges */}
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-[var(--accent)]">
              {fmtPrice(listing.price, listing.currency, listing.type === 'rent' ? listing.rentPeriod : undefined)}
            </span>
            <div className="flex gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${typeBadge(listing.type)}`}>
                {typeLabel(listing.type)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${conditionBadge(listing.condition)}`}>
                {condLabel}
              </span>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Brand', listing.brand],
              ['Model', listing.model],
              ['Category', catLabel],
              ['Year', listing.year ? String(listing.year) : '—'],
              ['Location', `${listing.location}, ${listing.country}`],
              ['Posted', relTime(listing.postedAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{k}</p>
                <p className="text-[var(--text-primary)] mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Description</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {listing.description || 'No description provided.'}
            </p>
          </div>

          {/* Seller */}
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Seller</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{listing.sellerName}</p>
            <p className="text-sm text-[var(--accent)] mt-0.5">{listing.sellerContact}</p>
          </div>

          {/* Contact / inquiry */}
          {!sent && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary w-full">
              {listing.type === 'wanted' ? 'I have this instrument' : 'Contact seller'}
            </button>
          )}
          {sent && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-center">
              <p className="text-green-400 font-semibold text-sm">Message sent</p>
              <p className="text-xs text-green-500 mt-1">The seller will contact you at the details you provided.</p>
            </div>
          )}
          {showForm && !sent && (
            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {listing.type === 'wanted' ? 'Send your offer' : 'Send inquiry'}
              </h3>
              {iqErr && <p className="text-xs text-red-400">{iqErr}</p>}
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Your name *</label>
                <input value={form.buyerName} onChange={e => f('buyerName', e.target.value)}
                  placeholder="Your full name" className="input w-full text-sm py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Your contact *</label>
                <input value={form.buyerContact} onChange={e => f('buyerContact', e.target.value)}
                  placeholder="+254712345678" className="input w-full text-sm py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Message *</label>
                <textarea value={form.message} onChange={e => f('message', e.target.value)} rows={3}
                  placeholder={listing.type === 'wanted'
                    ? 'Describe the instrument you have — condition, year, asking price…'
                    : 'Ask about the instrument, propose a price, arrange to inspect it…'}
                  className="input w-full resize-none text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1 text-sm py-2">Cancel</button>
                <button onClick={submit} className="btn btn-primary flex-1 text-sm py-2">Send message</button>
              </div>
            </div>
          )}

          {/* Inquiries received (seller view) */}
          {inquiries.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Inquiries received ({inquiries.length})
              </p>
              <div className="space-y-2">
                {inquiries.map(iq => (
                  <div key={iq.id} className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-3 text-sm">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-medium text-[var(--text-primary)]">{iq.buyerName}</span>
                      <span className="text-xs text-[var(--text-muted)]">{relTime(iq.sentAt)}</span>
                    </div>
                    <p className="text-xs text-[var(--accent)] mb-1">{iq.buyerContact}</p>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{iq.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Listing card ──────────────────────────────────────────────────────────────

function ListingCard({ listing, onClick }: { listing: InstrumentListing; onClick: () => void }) {
  const catLabel = CATEGORIES.find(c => c.id === listing.category)?.label ?? listing.category
  const condLabel = CONDITIONS.find(c => c.id === listing.condition)?.label ?? listing.condition

  return (
    <div onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 hover:border-[var(--accent)]/30 transition-colors cursor-pointer group">
      {/* Type + condition */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${typeBadge(listing.type)}`}>
          {typeLabel(listing.type)}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${conditionBadge(listing.condition)}`}>
          {condLabel}
        </span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">{relTime(listing.postedAt)}</span>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-[var(--text-primary)] leading-snug group-hover:text-[var(--accent)] transition-colors mb-1">
        {listing.title}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {catLabel} · {listing.location}, {listing.country}
      </p>

      {/* Description preview */}
      {listing.description && (
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-4 leading-relaxed">
          {listing.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
        <span className="text-lg font-bold text-[var(--accent)]">
          {fmtPrice(listing.price, listing.currency, listing.type === 'rent' ? listing.rentPeriod : undefined)}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{listing.sellerName}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [listings, setListings] = useState<InstrumentListing[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'' | 'sale' | 'rent' | 'wanted'>('sale')
  const [filterCat, setFilterCat] = useState<'' | InstrumentCategory>('')
  const [filterCountry, setFilterCountry] = useState('')
  const [showPost, setShowPost] = useState(false)
  const [activeListing, setActiveListing] = useState<InstrumentListing | null>(null)

  const reload = useCallback(() => {
    if (search.trim()) {
      setListings(searchListings(search))
    } else {
      setListings(getListings({
        type: filterType || undefined,
        category: filterCat || undefined,
        country: filterCountry || undefined,
      }))
    }
  }, [search, filterType, filterCat, filterCountry])

  useEffect(() => { reload() }, [reload])

  const counts = {
    sale:   getListings({ type: 'sale' }).length,
    rent:   getListings({ type: 'rent' }).length,
    wanted: getListings({ type: 'wanted' }).length,
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Equipment marketplace</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Buy, sell and rent survey instruments — directly between surveyors.
            </p>
          </div>
          <button onClick={() => setShowPost(true)} className="btn btn-primary flex-shrink-0">
            + Post listing
          </button>
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {([
            { key: '',       label: 'All listings',   count: counts.sale + counts.rent + counts.wanted },
            { key: 'sale',   label: 'For sale',       count: counts.sale },
            { key: 'rent',   label: 'For rent',       count: counts.rent },
            { key: 'wanted', label: 'Wanted',         count: counts.wanted },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => setFilterType(key as any)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                filterType === key
                  ? 'bg-[var(--accent)] text-black border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--accent)]/40'
              }`}>
              {label}
              {count > 0 && <span className="ml-1.5 text-xs opacity-70">({count})</span>}
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search instruments, brands, models…"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:border-[var(--accent)]" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)}
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg px-3 py-2 text-sm">
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg px-3 py-2 text-sm">
            <option value="">All countries</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Empty state */}
        {listings.length === 0 && (
          <div className="text-center py-24 border border-dashed border-[var(--border-color)] rounded-2xl">
            <div className="w-14 h-14 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              {search || filterCat || filterCountry ? 'No matching listings' : 'No listings yet'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
              {search || filterCat || filterCountry
                ? 'Try adjusting your filters'
                : 'Be the first to list a survey instrument for sale, rent, or post a wanted ad.'}
            </p>
            {!search && !filterCat && !filterCountry && (
              <button onClick={() => setShowPost(true)} className="btn btn-primary">Post the first listing</button>
            )}
          </div>
        )}

        {/* Listings grid */}
        {listings.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {listings.map(l => (
              <ListingCard key={l.id} listing={l} onClick={() => setActiveListing(l)} />
            ))}
          </div>
        )}
      </div>

      {showPost && (
        <PostModal
          onSave={l => { reload(); setShowPost(false); setActiveListing(l) }}
          onClose={() => setShowPost(false)}
        />
      )}

      {activeListing && (
        <ListingDetail
          listing={listings.find(l => l.id === activeListing.id) ?? activeListing}
          onClose={() => setActiveListing(null)}
          onRefresh={reload}
        />
      )}
    </div>
  )
}
