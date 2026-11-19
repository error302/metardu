'use client'

/**
 * FieldbookAttachments — sketch/photo evidence for the active observation page.
 *
 * Images are downscaled before storage so a book remains portable offline and
 * can be saved with the rest of its JSON. Attachments are field evidence, not
 * survey control, and they are never deleted from the book; an attachment that
 * should not be relied on can be described in its note.
 */

import { useRef, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import type { FieldbookAttachment, FieldbookType } from '@/app/fieldbook/types'

type Props = {
  page: FieldbookType
  attachments: FieldbookAttachment[]
  onChange: (next: FieldbookAttachment[]) => void
  capturedBy: string
  compact?: boolean
}

const MAX_EDGE_PX = 1280
const JPEG_QUALITY = 0.8
const MAX_STORED_CHARS = 1_600_000 // ~1.2 MB binary; keeps a saved book manageable

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The image could not be prepared on this device.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}

export function FieldbookAttachments({ page, attachments, onChange, capturedBy, compact = false }: Props) {
  const sketchInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pageAttachments = attachments.filter((item) => item.page === page)

  async function addFiles(files: FileList | null, kind: FieldbookAttachment['kind']) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const added: FieldbookAttachment[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError(`${file.name} is not an image and was not attached.`)
          continue
        }
        let dataUrl: string
        try {
          dataUrl = await downscale(file)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : `${file.name} could not be attached.`)
          continue
        }
        if (dataUrl.length > MAX_STORED_CHARS) {
          setError(`${file.name} is still too large after compression and was not attached. Use a smaller image.`)
          continue
        }
        added.push({
          id: crypto.randomUUID(),
          page,
          kind,
          name: file.name || `${kind}-${new Date().toISOString()}`,
          note: note.trim(),
          dataUrl,
          capturedAt: new Date().toISOString(),
          capturedBy,
        })
      }
      if (added.length) {
        onChange([...attachments, ...added])
        setNote('')
      }
    } finally {
      setBusy(false)
      if (sketchInput.current) sketchInput.current.value = ''
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  return (
    <section className="card p-3" aria-label={`${page} page attachments`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          Sketches and photos <span className="font-normal text-[var(--text-muted)]">({pageAttachments.length})</span>
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">Field evidence · not survey control</span>
      </div>

      <label className="mt-2 block text-xs font-medium text-[var(--text-secondary)]">
        Attachment note (optional, applied to images added now)
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. north wall, station TP2"
          className="mt-1 block min-h-11 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-base md:text-sm"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => sketchInput.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" /> Add sketch
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
        >
          <Camera className="h-4 w-4" aria-hidden="true" /> Add photo
        </button>
        <input
          ref={sketchInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="fieldbook-sketch-input"
          onChange={(event) => void addFiles(event.target.files, 'sketch')}
        />
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          data-testid="fieldbook-photo-input"
          onChange={(event) => void addFiles(event.target.files, 'photo')}
        />
      </div>

      {busy && <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">Compressing attachments…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}

      {pageAttachments.length > 0 && (
        <ul className={`mt-3 grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
          {pageAttachments.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, no optimisation endpoint */}
              <img
                src={item.dataUrl}
                alt={`${item.kind} ${item.name}${item.note ? ` — ${item.note}` : ''}`}
                className="h-24 w-full object-cover"
              />
              <div className="p-1.5">
                <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]" title={item.note || item.name}>
                  {item.note || item.name}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {item.kind} · {new Date(item.capturedAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
