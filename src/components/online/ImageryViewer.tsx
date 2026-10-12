'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { imageryCatalogueSchema, imageryTileTemplate, imageryViewSchema, type ImageryCatalogue } from '@/lib/online/satellite'
import type { ImageryMapConfiguration, ImageryMapController, ImageryMapStatus } from '@/lib/map/imageryViewerMap'
import { exportImageryZip } from '@/lib/surveyMapEngine/io/imageryExport'
import MetarduLogo from '@/components/MetarduLogo'

export default function ImageryViewer() {
  const [catalogue, setCatalogue] = useState<ImageryCatalogue | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('esri-world')
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('')
  const [zoom, setZoom] = useState('14'), [date, setDate] = useState('')
  const [configuration, setConfiguration] = useState<ImageryMapConfiguration | null>(null)
  const [status, setStatus] = useState<ImageryMapStatus | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false), [expanded, setExpanded] = useState(false)
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const mapTarget = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<ImageryMapController | null>(null)
  const exportGeneration = useRef(0)
  const provider = catalogue?.providers.find(source => source.id === selectedId)
  const resetView = useCallback(() => { exportGeneration.current++; setConfiguration(null); setStatus(null); setActionError(null); setDownload(null); setExporting(false) }, [])
  useEffect(() => () => { exportGeneration.current++ }, [])
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url) }, [download])

  useEffect(() => {
    const request = new AbortController()
    const timeout = setTimeout(() => {
      setCatalogue(null); setMetadataError('Imagery source information did not finish loading. Retry the catalogue.'); setMetadataLoading(false); request.abort()
    }, 20000)
    setMetadataLoading(true); setMetadataError(null); resetView()
    void fetch('/api/imagery/catalogue', { signal: request.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Imagery source information could not be loaded. Retry the catalogue.')
      const result = imageryCatalogueSchema.safeParse(await response.json() as unknown)
      if (!result.success) throw new Error('Imagery source information is incomplete. Retry the catalogue.')
      if (!request.signal.aborted) {
        setCatalogue(result.data)
        setDate(previous => previous || result.data.providers.find(source => source.id === 'nasa-modis-terra')?.defaultDate || '')
      }
    }).catch(cause => {
      if (!request.signal.aborted) { setCatalogue(null); setMetadataError(cause instanceof Error ? cause.message : 'Imagery metadata is unavailable.') }
    }).finally(() => { clearTimeout(timeout); if (!request.signal.aborted) setMetadataLoading(false) })
    return () => { clearTimeout(timeout); request.abort() }
  }, [retry, resetView])

  useEffect(() => {
    const target = mapTarget.current
    if (!target || !configuration) return
    const request = new AbortController()
    setStatus({ phase: 'loading', message: 'Preparing the imagery view…' }); controller.current = null
    void import('@/lib/map/imageryViewerMap').then(module => module.createImageryMap(target, configuration, update => {
      if (!request.signal.aborted) {
        if (update.phase !== 'ready') { exportGeneration.current++; setDownload(null); setExporting(false) }
        setStatus(update)
      }
    }, request.signal)).then(map => {
      if (request.signal.aborted) map.destroy(); else controller.current = map
    }).catch(cause => {
      if (!request.signal.aborted) setStatus({ phase: 'error', message: cause instanceof Error ? cause.message : 'The imagery map could not be opened.' })
    })
    return () => { request.abort(); controller.current?.destroy(); controller.current = null }
  }, [configuration])

  const viewImagery = (event: React.FormEvent) => {
    event.preventDefault(); setActionError(null)
    if (!provider?.available || !catalogue) { setActionError(provider?.error ?? 'Load the imagery source information first.'); return }
    if (!latitude.trim() || !longitude.trim()) { setActionError('Enter both latitude and longitude.'); return }
    const view = imageryViewSchema.safeParse({ latitude: Number(latitude), longitude: Number(longitude), zoom: Number(zoom) })
    if (!view.success) { setActionError('Use valid WGS 84 coordinates within the Web Mercator latitude range, and a supported zoom.'); return }
    try {
      const dataDay = provider.dated ? date : null
      imageryTileTemplate(provider, dataDay)
      if (provider.minZoom == null || provider.maxZoom == null || view.data.zoom < provider.minZoom || view.data.zoom > provider.maxZoom) throw new Error('Choose a zoom supported by this imagery source.')
      setConfiguration({ provider, date: dataDay, view: view.data, catalogueRetrievedAt: catalogue.retrievedAt })
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The imagery request is invalid.') }
  }
  const toggleExpanded = () => {
    const element = dialog.current
    if (!element) return
    try {
      element.close()
      if (expanded) { element.show(); setExpanded(false) } else { element.showModal(); setExpanded(true) }
    } catch { element.setAttribute('open', ''); setActionError('Expanded map view is unavailable in this browser.'); setExpanded(false) }
  }
  const exportView = async () => {
    if (!controller.current) { setActionError('The imagery view is still preparing. Wait for the map, then try again.'); return }
    setExporting(true); setActionError(null); setDownload(null)
    const generation = ++exportGeneration.current
    try {
      const blob = await exportImageryZip(controller.current.exportFrame())
      if (generation !== exportGeneration.current) return
      setDownload({ url: URL.createObjectURL(blob), name: `METARDU-imagery-${configuration?.date ?? 'context'}.zip` })
    } catch (cause) { if (generation === exportGeneration.current) setActionError(cause instanceof Error ? cause.message : 'The imagery export failed.') }
    finally { if (generation === exportGeneration.current) setExporting(false) }
  }
  const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 text-[var(--text-primary)] tabular-nums'
  const canExport = Boolean(configuration?.provider.exportAllowed && status?.phase === 'ready' && !exporting)

  return <section className="flex flex-col gap-5 text-[var(--text-primary)]" aria-label="Imagery viewer">
    {metadataLoading && <p role="status" className="text-sm text-[var(--text-muted)]">Loading imagery source information…</p>}
    {metadataError && <p role="alert" className="text-sm text-[var(--text-primary)]">{metadataError}</p>}
    <fieldset><legend className="mb-2 text-sm font-medium">Imagery source</legend>
      <div className="grid gap-2 sm:grid-cols-2">{catalogue?.providers.map(source => <button type="button" key={source.id} aria-pressed={selectedId === source.id} disabled={!source.available}
        onClick={() => { resetView(); setSelectedId(source.id); setZoom(source.dated ? '8' : '14'); setDate(source.defaultDate ?? '') }}
        className={`min-h-11 rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${selectedId === source.id ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]' : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'}`}>
        <span className="block font-semibold">{source.name}</span><span className="block mt-1 text-xs text-[var(--text-muted)]">{source.available ? source.dated ? 'Dated regional imagery' : 'Mixed-source basemap for online viewing' : source.error}</span>
      </button>)}</div>
    </fieldset>
    <button type="button" onClick={() => setRetry(value => value + 1)} disabled={metadataLoading} className="min-h-11 text-sm underline underline-offset-4 disabled:opacity-50">Retry source catalogue</button>
    {provider && <div className="text-sm text-[var(--text-muted)] space-y-1"><p>{provider.sourceResolution}</p><p><a className="underline underline-offset-2" href={provider.sourceUrl} target="_blank" rel="noopener noreferrer">Source information</a> · <a className="underline underline-offset-2" href={provider.termsUrl} target="_blank" rel="noopener noreferrer">Data-use terms</a></p></div>}
    <form onSubmit={viewImagery} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span className="block">WGS 84 latitude (degrees)</span><input className={inputClass} type="number" step="any" min={-85.0511287798066} max={85.0511287798066} required value={latitude} onChange={event => { resetView(); setLatitude(event.target.value) }} placeholder="e.g. -1.2921"/></label>
        <label className="space-y-1 text-sm"><span className="block">WGS 84 longitude (degrees)</span><input className={inputClass} type="number" step="any" min={-180} max={180} required value={longitude} onChange={event => { resetView(); setLongitude(event.target.value) }} placeholder="e.g. 36.8219"/></label>
        <label className="space-y-1 text-sm"><span className="block">Zoom</span><select className={inputClass} value={zoom} onChange={event => { resetView(); setZoom(event.target.value) }}>{Array.from({ length: (provider?.maxZoom ?? 20) - (provider?.minZoom ?? 0) + 1 }, (_, index) => (provider?.minZoom ?? 0) + index).map(level => <option key={level} value={level}>{level}</option>)}</select></label>
        {provider?.dated && <label className="space-y-1 text-sm"><span className="block">Requested data day (UTC)</span><input className={inputClass} type="date" required value={date} onChange={event => { resetView(); setDate(event.target.value) }}/></label>}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Viewing imagery sends tile requests for this location to the selected provider. Use project survey observations for boundary and setting-out decisions.</p>
      <button type="submit" disabled={!provider?.available || metadataLoading} className="btn-primary min-h-11 px-4 disabled:opacity-50">View imagery</button>
    </form>
    <dialog ref={dialog} open aria-label="Imagery map" aria-modal={expanded} onCancel={event => { if (expanded) { event.preventDefault(); toggleExpanded() } }}
      className={`metardu-imagery-dialog border-0 p-0 bg-[var(--bg-card)] text-[var(--text-primary)] ${expanded ? 'metardu-imagery-dialog-expanded flex flex-col' : 'relative w-full'}`}>
      <div className="flex flex-wrap gap-2 items-center justify-between border border-[var(--border-color)] rounded-t-lg px-3 py-2">
        <div className="flex items-center gap-3 min-w-0 text-sm"><MetarduLogo size={24} showWordmark={false}/><div><p className="font-semibold">{configuration?.provider.name ?? 'Imagery map'}</p>{configuration?.date && <p className="text-xs text-[var(--text-muted)]">Requested data day {configuration.date} · acquisition time unknown</p>}</div></div>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary min-h-11 px-3 text-sm" onClick={toggleExpanded}>{expanded ? 'Close expanded map' : 'Expand map'}</button>
          <button type="button" className="btn-secondary min-h-11 px-3 text-sm disabled:opacity-50" disabled={!canExport} onClick={() => { void exportView() }}>{exporting ? 'Preparing ZIP…' : 'Export GIS ZIP'}</button></div>
      </div>
      <div className={`relative min-h-0 ${expanded ? 'flex-1' : 'h-[28rem]'}`}>
        <div ref={mapTarget} className="metardu-survey-map metardu-imagery-map h-full w-full bg-slate-100" tabIndex={0} aria-label="Interactive imagery map"/>
        {!configuration && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-600">Enter a location and select View imagery to load the map.</div>}
      </div>
      <div className="border border-[var(--border-color)] rounded-b-lg px-3 py-2 space-y-1 text-xs text-[var(--text-muted)]">
        {actionError && <p role="alert" className="text-sm text-[var(--text-primary)]">{actionError}</p>}
        {configuration?.provider.exportAllowed && <div className="min-h-11" data-testid="imagery-download-slot">{download && <a href={download.url} download={download.name} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 text-[var(--text-primary)]">Download prepared GIS ZIP</a>}</div>}
        {configuration && <div className="min-h-8">{status && <p role={status.phase === 'error' ? 'alert' : 'status'}>{status.message}</p>}</div>}
        {configuration && <div className="min-h-8"><p className="tabular-nums">View centre: {(status?.view ?? configuration.view).latitude.toFixed(5)}, {(status?.view ?? configuration.view).longitude.toFixed(5)} · zoom {(status?.view ?? configuration.view).zoom.toFixed(2)}</p></div>}
        {configuration?.provider.exportReason ? <p>{configuration.provider.exportReason}</p> : <p>The GIS ZIP contains PNG imagery, a pixel-centred world file, projection definition, source provenance and a separate attributed reference image.</p>}
      </div>
    </dialog>
  </section>
}
