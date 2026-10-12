'use client';

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  InstrumentListing, ListingType, InstrumentCategory, Currency, Condition,
  CATEGORIES, CONDITIONS, BRANDS, COUNTRIES, CURRENCIES, fmtPrice,
} from '@/lib/marketplace/instruments'
import {
  fetchListings, createListing, sendInquiry, fetchInquiries
} from '@/lib/marketplace/apiClient'
import { compressImage, isImageFile, MAX_IMAGES, base64Bytes } from '@/lib/marketplace/imageUtils'
import { useSubscription } from '@/lib/subscription/subscriptionContext'
import { getPlanPrice } from '@/lib/subscription/catalog'

interface MarketplaceInquiry {
  id: string
  buyerName?: string
  buyerContact?: string
  contactEmail?: string
  contactPhone?: string
  sentAt?: string
  createdAt?: string
  message: string
}

function isMarketplaceInquiry(value: unknown): value is MarketplaceInquiry {
  if (!value || typeof value !== 'object') return false
  const inquiry = value as Record<string, unknown>
  return typeof inquiry.id === 'string' && typeof inquiry.message === 'string' &&
    ['buyerName', 'buyerContact', 'contactEmail', 'contactPhone', 'sentAt', 'createdAt']
      .every(key => inquiry[key] === undefined || typeof inquiry[key] === 'string')
}

// ── tiny helpers ─────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7)  return `${d} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function condBadge(c: Condition) {
  const m: Record<Condition, string> = {
    new:       'bg-green-900/40 text-green-300 border-green-700/40',
    excellent: 'bg-blue-900/40  text-blue-300  border-blue-700/40',
    good:      'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)]',
    fair:      'bg-amber-900/30 text-amber-400 border-amber-700/30',
    for_parts: 'bg-red-900/30   text-red-400   border-red-700/30',
  }
  return m[c]
}

function typeBadge(t: ListingType) {
  if (t === 'sale')   return 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]'
  if (t === 'rent')   return 'bg-purple-900/40 text-purple-300 border-purple-700/40'
  return 'bg-amber-900/30 text-amber-400 border-amber-700/30'
}

function typeLabel(t: ListingType) {
  if (t === 'sale') return 'For sale'
  if (t === 'rent') return 'For rent'
  if (t === 'trade') return 'For trade'
  return 'Wanted'
}

// ── Image picker component ────────────────────────────────────────────────────

function ImagePicker({
  images,
  onChange,
}: {
  images: string[]
  onChange: (imgs: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const processFiles = async (files: FileList | File[]) => {
    const eligible = Array.from(files).filter(isImageFile).slice(0, MAX_IMAGES - images.length)
    if (eligible.length === 0) return
    setUploading(true)
    const compressed: string[] = []
    for (const file of eligible) {
      try {
        const b64 = await compressImage(file)
        compressed.push(b64)
      } catch { /* skip bad file */ }
    }
    onChange([...images, ...compressed].slice(0, MAX_IMAGES))
    setUploading(false)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files)
  }

  const remove = (i: number) => onChange(images.filter((_, idx) => idx !== i))

  const totalKB = Math.round(images.reduce((s, b) => s + base64Bytes(b), 0) / 1024)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs text-[var(--text-muted)]">
          Photos ({images.length}/{MAX_IMAGES})
        </label>
        {images.length > 0 && (
          <span className="text-[10px] text-[var(--text-muted)]">{totalKB} KB stored</span>
        )}
      </div>

      {/* Existing images grid */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {images.map((src, i) => (
            <div key={`${src}-${i}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border-color)] group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Listing preview ${i + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              <button
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => remove(i)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="Remove photo"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">Cover</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {images.length < MAX_IMAGES && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Add photos"
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]'
              : 'border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[var(--text-muted)]">Compressing…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <p className="text-sm text-[var(--text-secondary)] font-medium">
                {images.length === 0 ? 'Add photos' : 'Add more photos'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Drag & drop or click · JPEG, PNG, HEIC · Max {MAX_IMAGES} photos
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) processFiles(e.target.files) }}
      />
    </div>
  )
}

// ── Image gallery (in detail panel) ─────────────────────────────────────────

function ImageGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  // Close the lightbox on Escape (document-level, works regardless of focus)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  if (images.length === 0) {
    return (
      <div className="h-52 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] flex items-center justify-center">
        <svg className="w-10 h-10 text-[var(--border-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </div>
    )
  }

  return (
    <>
      {/* Main image */}
      <div
        className="relative h-56 rounded-xl overflow-hidden border border-[var(--border-color)] cursor-zoom-in bg-[var(--bg-secondary)]"
        role="button"
        tabIndex={0}
        aria-label="Open image in full screen"
        onClick={() => setLightbox(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox(true) } }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active]} alt="Listing preview" className="w-full h-full object-contain" loading="lazy" decoding="async" />
        {images.length > 1 && (
          <>
            <button
              aria-label="Previous image"
              onClick={e => { e.stopPropagation(); setActive(a => (a - 1 + images.length) % images.length) }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
            </button>
            <button
              aria-label="Next image"
              onClick={e => { e.stopPropagation(); setActive(a => (a + 1) % images.length) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((_, i) => (
                <button key={`${_}-${i}`} aria-label={`Show image ${i + 1}`} onClick={e => { e.stopPropagation(); setActive(i) }}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === active ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          </>
        )}
        <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
          {active + 1}/{images.length}
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2">
          {images.map((src, i) => (
            <button key={`${src}-${i}`} onClick={() => setActive(i)}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${
                i === active ? 'border-[var(--accent)]' : 'border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Listing image">
          <button type="button" aria-label="Close lightbox" tabIndex={-1} className="absolute inset-0 cursor-pointer border-0 p-0" onClick={() => setLightbox(false)} />
          <button aria-label="Close lightbox" onClick={() => setLightbox(false)} className="absolute top-4 right-4 text-white/60 hover:text-white p-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          {images.length > 1 && (
            <>
              <button aria-label="Previous image" onClick={e => { e.stopPropagation(); setActive(a => (a - 1 + images.length) % images.length) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
              </button>
              <button aria-label="Next image" onClick={e => { e.stopPropagation(); setActive(a => (a + 1) % images.length) }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[active]} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" loading="lazy" decoding="async" />
        </div>
      )}
    </>
  )
}

// ── Post listing modal ────────────────────────────────────────────────────────

// ── Upgrade prompt ────────────────────────────────────────────────────────────

function UpgradeToPost({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Posting requires Pro</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
          Posting listings on the equipment marketplace is a <strong className="text-[var(--text-primary)]">Pro feature</strong>. 
          Upgrade to list instruments for sale or rent. A subscription does not verify identity, ownership, or calibration.
        </p>

        {/* What Pro gets you */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-4 mb-6 text-left space-y-2">
          {[
            'Post unlimited sale and rental listings',
            'Post wanted ads and receive inquiries',
            'Unlimited survey projects',
            'Full PDF + DXF reports',
            'GPS stakeout mode',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <svg className="w-4 h-4 text-[var(--accent)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {item}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <a href="/pricing" className="btn btn-primary flex-1">
            View Pro pricing
          </a>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3">Pro is KSh {getPlanPrice('pro', 'KES').toLocaleString('en-KE')}/month in Kenya. Check the available method and final amount before payment.</p>
      </div>
    </div>
  )
}

const BLANK: Omit<InstrumentListing, 'id' | 'postedAt' | 'sold' | 'verified'> = {
  type: 'sale', category: 'total_station', title: '', brand: '', model: '',
  condition: 'good', year: undefined, description: '', price: 0,
  currency: 'KES', rentPeriod: undefined, location: '', country: 'Kenya',
  sellerName: '', sellerContact: '', images: [],
}

function PostModal({ onSave, onClose }: { onSave: (l: InstrumentListing) => void; onClose: () => void }) {
  const [form, setForm] = useState<typeof BLANK>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('metardu_marketplace_draft')
        if (saved) return JSON.parse(saved) as typeof BLANK
      } catch {}
    }
    return { ...BLANK }
  })
  const [err, setErr] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createListing>[0]) => createListing(data),
    onSuccess: (res) => {
      if (res) {
        localStorage.removeItem('metardu_marketplace_draft')
        onSave(res)
      } else {
        setErr('Failed to save listing')
      }
    },
    onError: (e: Error) => {
      setErr(e.message || 'Failed to save. Try removing some photos.')
    }
  })

  const f = <V,>(k: keyof typeof form, v: V) => setForm(p => {
    const next = { ...p, [k]: v }
    localStorage.setItem('metardu_marketplace_draft', JSON.stringify(next))
    return next
  })

  const submit = async () => {
    if (!form.title.trim())         { setErr('Give the listing a title'); return }
    if (!form.brand.trim())         { setErr('Brand is required'); return }
    if (!form.model.trim())         { setErr('Model is required'); return }
    if (!form.description.trim())   { setErr('Add a description'); return }
    if (!form.price || Number(form.price) <= 0) { setErr('Set a price'); return }
    if (!form.location.trim())      { setErr('Location is required'); return }
    if (!form.sellerName.trim())    { setErr('Your name is required'); return }
    if (!form.sellerContact?.trim()) { setErr('Contact details required so buyers can reach you'); return }
    setErr('')

    createMutation.mutate({ ...form, price: Number(form.price) })
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="font-semibold text-[var(--text-primary)]">Post a listing</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl p-1">×</button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {err && <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">{err}</p>}

          {/* Listing type */}
          <div>
            <div className="block text-xs text-[var(--text-muted)] mb-2">Listing type *</div>
            <div className="flex gap-2">
              {(['sale','rent','wanted'] as ListingType[]).map((t) => (
                <button key={t} onClick={() => f('type', t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === t ? typeBadge(t) : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border-color)]'
                  }`}>
                  {t === 'sale' ? 'Selling' : t === 'rent' ? 'For rent' : 'Wanted'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="listing-category" className="block text-xs text-[var(--text-muted)] mb-1">Category *</label>
              <select id="listing-category" value={form.category} onChange={e => f('category', e.target.value as InstrumentCategory)} className="input w-full">
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="listing-condition" className="block text-xs text-[var(--text-muted)] mb-1">Condition *</label>
              <select id="listing-condition" value={form.condition} onChange={e => f('condition', e.target.value as Condition)} className="input w-full">
                {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="listing-brand" className="block text-xs text-[var(--text-muted)] mb-1">Brand *</label>
              <input id="listing-brand" value={form.brand} onChange={e => f('brand', e.target.value)} list="brand-list"
                placeholder="Leica, Trimble…" className="input w-full" />
              <datalist id="brand-list">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <label htmlFor="listing-model" className="block text-xs text-[var(--text-muted)] mb-1">Model *</label>
              <input id="listing-model" value={form.model} onChange={e => f('model', e.target.value)}
                placeholder="TS16, S9, DNA03…" className="input w-full" />
            </div>
            <div>
              <label htmlFor="listing-year" className="block text-xs text-[var(--text-muted)] mb-1">Year of manufacture</label>
              <input id="listing-year" type="number" min={1990} max={new Date().getFullYear()}
                value={form.year || ''} onChange={e => f('year', Number(e.target.value) || undefined)}
                placeholder="e.g. 2019" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">
                {form.type === 'wanted' ? 'Max budget' : 'Price'} *
              </label>
              <div className="flex gap-2">
                <input type="number" min={0} value={form.price || ''}
                  onChange={e => f('price', e.target.value)}
 placeholder="Amount" className="input flex-1" />
                <select value={form.currency} onChange={e => f('currency', e.target.value as Currency)} className="input w-20">
                  {CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>
              </div>
            </div>
          </div>

          {form.type === 'rent' && (
            <div>
              <label htmlFor="listing-rent-period" className="block text-xs text-[var(--text-muted)] mb-1">Rent period</label>
              <select id="listing-rent-period" value={form.rentPeriod || 'day'} onChange={e => f('rentPeriod', e.target.value)} className="input w-full">
                <option value="day">Per day</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="listing-title" className="block text-xs text-[var(--text-muted)] mb-1">Listing title *</label>
            <input id="listing-title" value={form.title} onChange={e => f('title', e.target.value)}
              placeholder="e.g. Leica TS16 Total Station — 2019, with tribrach and case"
              className="input w-full" />
          </div>

          <div>
            <label htmlFor="listing-description" className="block text-xs text-[var(--text-muted)] mb-1">Description *</label>
            <textarea id="listing-description" value={form.description} onChange={e => f('description', e.target.value)} rows={4}
              placeholder="Describe the instrument: accessories included (case, tribrach, cables, charger), reason for selling, calibration status, any faults, original box, etc."
              className="input w-full resize-none" />
          </div>

          {/* ── Image upload ── */}
          <ImagePicker
            images={form.images}
            onChange={imgs => f('images', imgs)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="listing-location" className="block text-xs text-[var(--text-muted)] mb-1">Location (town) *</label>
              <input id="listing-location" value={form.location} onChange={e => f('location', e.target.value)}
                placeholder="Nairobi, Kampala…" className="input w-full" />
            </div>
            <div>
              <label htmlFor="listing-country" className="block text-xs text-[var(--text-muted)] mb-1">Country *</label>
              <select id="listing-country" value={form.country} onChange={e => f('country', e.target.value)} className="input w-full">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="listing-seller-name" className="block text-xs text-[var(--text-muted)] mb-1">Your name *</label>
              <input id="listing-seller-name" value={form.sellerName} onChange={e => f('sellerName', e.target.value)}
                placeholder="Your name or company" className="input w-full" />
            </div>
            <div>
              <label htmlFor="listing-seller-contact" className="block text-xs text-[var(--text-muted)] mb-1">Contact (phone / email) *</label>
              <input id="listing-seller-contact" value={form.sellerContact} onChange={e => f('sellerContact', e.target.value)}
                placeholder="+254712345678" className="input w-full" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5 pt-2 border-t border-[var(--border-color)]">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={createMutation.isPending} className="btn btn-primary flex-1">
            {createMutation.isPending ? 'Saving…' : form.type === 'wanted' ? 'Post wanted ad' : 'Post listing'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Listing detail drawer ─────────────────────────────────────────────────────

function ListingDetail({ listing, onClose }: {
  listing: InstrumentListing; onClose: () => void; onRefresh: () => void
}) {
  const { data: inquiries = [], refetch } = useQuery({
    queryKey: ['inquiries', listing.id],
    queryFn: () => fetchInquiries(listing.id)
  })
  const [showForm, setShowForm] = useState(false)
  const [sent, setSent] = useState(false)
  const [iqErr, setIqErr] = useState('')
  const [form, setForm] = useState({ buyerName: '', buyerContact: '', message: '' })
  const fq = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const inquiryMutation = useMutation({
    mutationFn: async (data: { message: string, contactEmail?: string, contactPhone?: string }) => {
      const ok = await sendInquiry(listing.id, data)
      if (!ok) throw new Error('Failed to send inquiry')
      return ok
    },
    onSuccess: () => {
      setSent(true)
      refetch()
    },
    onError: (e: Error) => setIqErr(e.message)
  })

  // Close the detail drawer on Escape (document-level, works regardless of focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const catLabel  = CATEGORIES.find((c) => c.id === listing.category)?.label  ?? listing.category
  const condLabel = CONDITIONS.find((c) => c.id === listing.condition)?.label ?? listing.condition

  const submit = () => {
    if (!form.buyerName)      { setIqErr('Your name is required');    return }
    if (!form.buyerContact)   { setIqErr('Your contact is required'); return }
    if (!form.message.trim()) { setIqErr('Write a message to the seller'); return }

    const isEmail = form.buyerContact.includes('@')
    inquiryMutation.mutate({
      message: `${form.buyerName} says: ${form.message}`,
      contactEmail: isEmail ? form.buyerContact : undefined,
      contactPhone: !isEmail ? form.buyerContact : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <button type="button" aria-label="Close dialog" tabIndex={-1} className="flex-1 cursor-pointer border-0 p-0" onClick={onClose} />
      <div
        className="w-full max-w-md bg-[var(--bg-card)] border-l border-[var(--border-color)] h-full overflow-y-auto shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={listing.title}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--text-primary)] leading-snug text-sm truncate">{listing.title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{catLabel} · {listing.location}, {listing.country}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 ml-3 flex-shrink-0">×</button>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Photo gallery ── */}
          <ImageGallery images={listing.images} />

          {/* Price + badges */}
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-[var(--accent)]">
              {fmtPrice(listing.price, listing.currency, listing.type === 'rent' ? listing.rentPeriod : undefined)}
            </span>
            <div className="flex gap-2 flex-wrap justify-end">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${typeBadge(listing.type)}`}>{typeLabel(listing.type)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${condBadge(listing.condition)}`}>{condLabel}</span>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {([
              ['Brand',    listing.brand],
              ['Model',    listing.model],
              ['Category', catLabel],
              ['Year',     listing.year ? String(listing.year) : '—'],
              ['Location', `${listing.location}, ${listing.country}`],
              ['Posted',   relTime(listing.postedAt)],
            ] as [string,string][]).map(([k, v]) => (
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
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {listing.type === 'wanted' ? 'Posted by' : 'Seller'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[var(--text-primary)]">{listing.sellerName}</p>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Contact is shared after you send an inquiry through METARDU.</p>
            <p className="text-xs text-[var(--text-muted)] mt-3">Listings are supplied by posters. Confirm identity, ownership, and calibration records before a transaction.</p>
          </div>

          {/* Contact form */}
          {!sent && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary w-full">
              {listing.type === 'wanted' ? 'I have this instrument' : 'Contact seller'}
            </button>
          )}
          {sent && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-center">
              <p className="text-green-400 font-semibold text-sm">Message sent</p>
              <p className="text-xs text-green-500 mt-1">
                The {listing.type === 'wanted' ? 'buyer' : 'seller'} will contact you at the details you provided.
              </p>
            </div>
          )}
          {showForm && !sent && (
            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {listing.type === 'wanted' ? 'Offer your instrument' : 'Send message to seller'}
              </h3>
              {iqErr && <p className="text-xs text-red-400">{iqErr}</p>}
              <div>
                <label htmlFor="inquiry-name" className="block text-xs text-[var(--text-muted)] mb-1">Your name *</label>
                <input id="inquiry-name" value={form.buyerName} onChange={e => fq('buyerName', e.target.value)}
                  placeholder="Your full name" className="input w-full text-sm py-1.5" />
              </div>
              <div>
                <label htmlFor="inquiry-contact" className="block text-xs text-[var(--text-muted)] mb-1">Your contact *</label>
                <input id="inquiry-contact" value={form.buyerContact} onChange={e => fq('buyerContact', e.target.value)}
                  placeholder="+254712345678 or email" className="input w-full text-sm py-1.5" />
              </div>
              <div>
                <label htmlFor="inquiry-message" className="block text-xs text-[var(--text-muted)] mb-1">Message *</label>
                <textarea id="inquiry-message" value={form.message} onChange={e => fq('message', e.target.value)} rows={3}
                  placeholder={listing.type === 'wanted'
                    ? 'Describe your instrument — brand, model, condition, year, asking price…'
                    : 'Ask questions, propose a price, arrange to inspect the instrument…'}
                  className="input w-full resize-none text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1 text-sm py-2">Cancel</button>
                <button onClick={submit} disabled={inquiryMutation.isPending} className="btn btn-primary flex-1 text-sm py-2">
                  {inquiryMutation.isPending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {/* Inquiries received */}
          {inquiries.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Messages received ({inquiries.length})
              </p>
              <div className="space-y-2">
                {inquiries.filter(isMarketplaceInquiry).map((iq) => (
                  <div key={iq.id} className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-3 text-sm">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-medium text-[var(--text-primary)]">{iq.buyerName || iq.contactEmail || iq.contactPhone || 'Buyer'}</span>
                      <span className="text-xs text-[var(--text-muted)]">{relTime(iq.sentAt || iq.createdAt || new Date().toISOString())}</span>
                    </div>
                    <p className="text-xs text-[var(--accent)] mb-1">{iq.buyerContact || iq.contactPhone || iq.contactEmail}</p>
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

// ── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing, onClick }: { listing: InstrumentListing; onClick: () => void }) {
  const catLabel  = CATEGORIES.find((c) => c.id === listing.category)?.label  ?? listing.category
  const condLabel = CONDITIONS.find((c) => c.id === listing.condition)?.label ?? listing.condition
  const cover     = listing.images[0]

  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors cursor-pointer group">

      {/* Cover photo or placeholder */}
      <div className="h-44 bg-[var(--bg-secondary)] overflow-hidden relative flex-shrink-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-[var(--border-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}
        {/* Photo count badge */}
        {listing.images.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5M16.5 3.75h.008v.008h-.008V3.75z" /></svg>
            {listing.images.length}
          </div>
        )}
        {/* Type badge overlay */}
        <div className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border font-medium ${typeBadge(listing.type)}`}>
          {typeLabel(listing.type)}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <h3 className="font-semibold text-[var(--text-primary)] leading-snug group-hover:text-[var(--accent)] transition-colors text-sm flex-1">
            {listing.title}
          </h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${condBadge(listing.condition)}`}>
            {condLabel}
          </span>
        </div>

        <p className="text-xs text-[var(--text-muted)] mb-3">
          {catLabel} · {listing.location}, {listing.country}
        </p>

        {listing.description && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-3 leading-relaxed">
            {listing.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
          <span className="text-base font-bold text-[var(--accent)]">
            {fmtPrice(listing.price, listing.currency, listing.type === 'rent' ? listing.rentPeriod : undefined)}
          </span>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <p className="text-xs text-[var(--text-muted)]">{listing.sellerName}</p>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">{relTime(listing.postedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { plan, isAdmin, isTrialing, loading: subLoading } = useSubscription()
  const isPro = isAdmin || plan === 'pro' || plan === 'team' || plan === 'firm' || plan === 'enterprise' || isTrialing

  const [search, setSearch]           = useState('')
  const [filterType, setFilterType]   = useState<'' | ListingType>('')
  const [filterCat, setFilterCat]     = useState<'' | InstrumentCategory>('')
  const [filterCountry, setFilterCountry] = useState('')
  const [showPost, setShowPost]       = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [active, setActive]           = useState<InstrumentListing | null>(null)

  const queryClient = useQueryClient()

  // Fetch all to derive counts
  const { data: allListings = [] } = useQuery({
    queryKey: ['listings-all'],
    queryFn: () => fetchListings()
  })

  const { data: listings = [], isPending: listingsPending, isError: listingsError, refetch: refetchListings } = useQuery({
    queryKey: ['listings', filterType, filterCat, filterCountry, search],
    queryFn: () => fetchListings({
      type: filterType || undefined,
      category: filterCat || undefined,
      country: filterCountry || undefined,
      q: search || undefined
    })
  })

  const reload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['listings'] })
    queryClient.invalidateQueries({ queryKey: ['listings-all'] })
  }, [queryClient])

  const counts = {
    sale:   allListings.filter((l: InstrumentListing) => l.type === 'sale').length,
    rent:   allListings.filter((l: InstrumentListing) => l.type === 'rent').length,
    wanted: allListings.filter((l: InstrumentListing) => l.type === 'wanted').length,
    trade:  allListings.filter((l: InstrumentListing) => l.type === 'trade').length,
  }
  const hasFilters = Boolean(filterType || filterCat || filterCountry || search.trim())

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8 border-b border-[var(--border-color)] pb-7">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Survey equipment / peer listings</p>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Equipment marketplace</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                Find instruments for sale or rent, or post what your crew needs. Listings come from their posters; confirm identity, ownership, condition, and calibration before arranging a transaction.
              </p>
            </div>
            <button
              onClick={() => isPro ? setShowPost(true) : setShowUpgrade(true)}
              className="btn btn-primary flex-shrink-0 flex items-center justify-center gap-2 self-start"
            >
              {!isPro && !subLoading && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
              Post a listing <span aria-hidden>↗</span>
            </button>
          </div>
        </div>

        {/* Type tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {([
            { key: '',       label: 'All',        count: allListings.length },
            { key: 'sale',   label: 'For sale',   count: counts.sale },
            { key: 'rent',   label: 'For rent',   count: counts.rent },
            { key: 'wanted', label: 'Wanted',     count: counts.wanted },
            ...(counts.trade > 0 ? [{ key: 'trade' as const, label: 'For trade', count: counts.trade }] : []),
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => setFilterType(key)}
              aria-pressed={filterType === key}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                filterType === key
                  ? 'bg-[var(--accent)] text-black border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
              }`}>
              {label}{count > 0 && <span className="ml-1.5 text-xs opacity-70">({count})</span>}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search by brand, model, location…"
            placeholder="Search instruments, brands, models, or towns"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:border-[var(--accent)]" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value as InstrumentCategory)}
            aria-label="Filter by category"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg px-3 py-2 text-sm">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
            aria-label="Filter by country"
            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg px-3 py-2 text-sm">
            <option value="">All countries</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Loading, error, and empty states describe different outcomes. */}
        {listingsPending && (
          <div aria-label="Loading listings" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <div className="h-44 animate-pulse bg-[var(--bg-tertiary)]" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                </div>
              </div>
            ))}
          </div>
        )}
        {listingsError && (
          <div role="alert" className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Listings could not be loaded</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">We could not retrieve listings right now. Please try again in a moment.</p>
            <button onClick={() => void refetchListings()} className="btn btn-secondary mt-5">Try again</button>
          </div>
        )}
        {!listingsPending && !listingsError && listings.length === 0 && (
          <div className="text-center py-24 border border-dashed border-[var(--border-color)] rounded-2xl">
            <div className="w-14 h-14 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              {hasFilters ? 'No matching listings' : 'No listings yet'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
              {hasFilters
                ? 'Try another listing type, category, country, or search term.'
                : 'Be the first to list a survey instrument. Sell, rent out, or post a wanted ad.'}
            </p>
            {hasFilters ? (
              <button onClick={() => { setFilterType(''); setFilterCat(''); setFilterCountry(''); setSearch('') }} className="btn btn-secondary">Clear filters</button>
            ) : (
              <button onClick={() => isPro ? setShowPost(true) : setShowUpgrade(true)} className="btn btn-primary">Post a listing</button>
            )}
          </div>
        )}

        {/* Grid */}
        {!listingsPending && !listingsError && listings.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} onClick={() => setActive(l)} />
            ))}
          </div>
        )}
      </div>

      {showUpgrade && <UpgradeToPost onClose={() => setShowUpgrade(false)} />}

      {showPost && (
        <PostModal
          onSave={l => { reload(); setShowPost(false); setActive(l) }}
          onClose={() => setShowPost(false)}
        />
      )}

      {active && (
        <ListingDetail
          listing={listings.find((l) => l.id === active.id) ?? active}
          onClose={() => setActive(null)}
          onRefresh={reload}
        />
      )}
    </div>
  )
}
