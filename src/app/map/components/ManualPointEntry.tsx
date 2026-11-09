'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { resolveDeclaredStageReference, type StageReference } from '@/lib/workspaces/stageReference'

const inputClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-base'
const coordinateClass = `${inputClass} font-mono tabular-nums`

function responseMessage(payload: unknown, fallback: string): string {
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : fallback
}

export function ManualPointEntry({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [reference, setReference] = useState<StageReference | null>(null)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const [referenceError, setReferenceError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedName, setSavedName] = useState('')
  const pointIdInput = useRef<HTMLInputElement>(null)
  const endpoint = `/api/project/${encodeURIComponent(projectId)}`

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setReference(null)
    setReferenceError('')
    async function loadReference() {
      try {
        const response = await fetch(`${endpoint}/reference-system`, { cache: 'no-store', signal: controller.signal })
        const payload: unknown = await response.json()
        if (!response.ok) throw new Error(responseMessage(payload, 'Could not load the project reference.'))
        if (!controller.signal.aborted) {
          setReference(resolveDeclaredStageReference(payload && typeof payload === 'object' && 'referenceSystem' in payload ? payload.referenceSystem : null))
        }
      } catch (error) {
        if (!controller.signal.aborted) setReferenceError(error instanceof Error ? error.message : 'Could not load the project reference.')
      }
    }
    void loadReference()
    return () => controller.abort()
  }, [endpoint, open, retry])

  async function storePoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reference?.code || pending.current) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const read = (name: string) => String(fields.get(name) ?? '').trim()
    const pointName = read('pointName')
    const east = read('easting'), north = read('northing'), height = read('elevation')
    const easting = Number(east), northing = Number(north), elevation = height ? Number(height) : null
    setSavedName('')
    if (!pointName || !east || !north || !Number.isFinite(easting) || !Number.isFinite(northing) || (elevation !== null && !Number.isFinite(elevation))) {
      setSaveError('Enter a point ID and valid easting and northing. Leave an unknown height blank.')
      return
    }

    pending.current = true
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(`${endpoint}/points`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointName, easting, northing, elevation,
          code: read('code') || undefined, description: read('description') || undefined,
          expectedReference: { horizontalCrs: reference.code, verticalDatum: reference.verticalDatum },
        }),
      })
      const payload: unknown = await response.json()
      if (response.status !== 201 || !payload || typeof payload !== 'object' || !('data' in payload) ||
          !payload.data || typeof payload.data !== 'object' || !('point_name' in payload.data) || payload.data.point_name !== pointName) {
        throw new Error(responseMessage(payload, 'Point storage could not be confirmed. Check the project register before retrying.'))
      }
      form.reset()
      setSavedName(pointName)
      onSaved()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Point storage could not be confirmed. Check the project register before retrying.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    if (savedName && !saving) pointIdInput.current?.focus()
  }, [savedName, saving])

  return (
    <Dialog open={open} onOpenChange={next => {
      if (pending.current) return
      if (next) { setSaveError(''); setSavedName('') }
      setOpen(next)
    }}>
      <DialogTrigger asChild><button type="button" className="btn btn-secondary min-h-11">Key in point</button></DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] gap-3 overflow-y-auto p-4 sm:max-w-md sm:p-5" onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }}>
        <DialogTitle>Key in a detail point</DialogTitle>
        <DialogDescription>Enter coordinates from your field book in the declared project grid. The register records the source as manual entry.</DialogDescription>
        {!reference && !referenceError && <p role="status" className="text-sm">Loading the project reference…</p>}
        {referenceError && <p role="alert" className="text-sm text-[var(--error)]">{referenceError} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry reference</button></p>}
        {reference && !reference.code && <p role="alert" className="text-sm text-[var(--error)]">Declare the project reference system before entering coordinates.</p>}
        {reference?.code && <form onSubmit={storePoint} className="space-y-3">
          <p className="rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-sm"><strong>{reference.code}</strong> · metres<br />Height datum: {reference.verticalDatum ?? 'not declared'}</p>
          <fieldset disabled={saving} className="space-y-3 disabled:opacity-70">
            <label className="block text-sm">Point ID<input ref={pointIdInput} name="pointName" required maxLength={100} className={inputClass} placeholder="e.g. CREW-A-024" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 text-sm">Easting (m)<input name="easting" type="number" inputMode="decimal" step="any" required className={coordinateClass} /></label>
              <label className="min-w-0 text-sm">Northing (m)<input name="northing" type="number" inputMode="decimal" step="any" required className={coordinateClass} /></label>
              <label className="min-w-0 text-sm">Height (m)<input name="elevation" type="number" inputMode="decimal" step="any" min={-10000} max={100000} disabled={!reference.verticalDatum} placeholder="Unknown" className={coordinateClass} /></label>
              <label className="min-w-0 text-sm">Feature code<input name="code" maxLength={20} className={inputClass} placeholder="e.g. KERB" /></label>
            </div>
            <label className="block text-sm">Field remarks<textarea name="description" maxLength={4000} rows={2} className={inputClass} placeholder="e.g. Top of kerb at gate" /></label>
            <button type="submit" className="btn btn-primary min-h-11 w-full">{saving ? 'Storing point…' : 'Store point'}</button>
          </fieldset>
          {savedName && <p role="status" className="break-words text-sm text-[var(--success)]">{savedName} stored in the project register.</p>}
          {saveError && <p role="alert" className="break-words text-sm text-[var(--error)]">{saveError}</p>}
        </form>}
        <button type="button" className="btn btn-secondary min-h-11" disabled={saving} onClick={() => setOpen(false)}>Close point entry</button>
      </DialogContent>
    </Dialog>
  )
}
