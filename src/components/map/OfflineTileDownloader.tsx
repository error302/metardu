'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Download,
  X,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ZoomIn,
  HardDrive,
} from 'lucide-react'
import { useMapContext, type MapExtent } from '@/app/map/MapReactContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import {
  calculateTileCount,
  estimateStorageSize,
  downloadTilesForBounds,
  getOfflineTileSourceRestriction,
  getTileSourceId,
  type DownloadProgress,
} from '@/lib/offline/tileCache'

type DownloadState = 'idle' | 'estimating' | 'downloading' | 'complete' | 'error'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OfflineTileDownloader() {
  const {
    offlineDialogOpen: open,
    toggleOfflineDialog: onOpenChange,
    offlineMapExtent: mapExtent,
  } = useMapContext()
  // Source selection
  const [customUrl, setCustomUrl] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customAttribution, setCustomAttribution] = useState('')

  // Bounds
  const [minLat, setMinLat] = useState('-1.5')
  const [maxLat, setMaxLat] = useState('-1.2')
  const [minLon, setMinLon] = useState('36.6')
  const [maxLon, setMaxLon] = useState('37.0')

  // Zoom
  const [zoomRange, setZoomRange] = useState([10, 15])

  // State
  const [downloadState, setDownloadState] = useState<DownloadState>('idle')
  const [estimate, setEstimate] = useState<{ tiles: number; sizeBytes: number } | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDownloadState('idle')
      setEstimate(null)
      setProgress(null)
      setErrorMsg(null)
    }
  }, [open])

  // Fill bounds from map extent
  const useMapExtent = useCallback(() => {
    if (!mapExtent) return
    setMinLat(mapExtent.minLat.toFixed(6))
    setMaxLat(mapExtent.maxLat.toFixed(6))
    setMinLon(mapExtent.minLon.toFixed(6))
    setMaxLon(mapExtent.maxLon.toFixed(6))
  }, [mapExtent])

  // Offline packs require an explicitly licensed or self-hosted XYZ source.
  const getCurrentSource = useCallback(() => {
    const label = customLabel.trim() || 'Licensed tile source'
    const url = customUrl.trim()
    return {
      id: getTileSourceId(url),
      label,
      url,
      attribution: customAttribution.trim(),
      type: 'custom' as const,
    }
  }, [customUrl, customLabel, customAttribution])

  // Estimate tiles
  const estimateTiles = useCallback(() => {
    const bounds: MapExtent = {
      minLat: parseFloat(minLat),
      maxLat: parseFloat(maxLat),
      minLon: parseFloat(minLon),
      maxLon: parseFloat(maxLon),
    }

    if (isNaN(bounds.minLat) || isNaN(bounds.maxLat) || isNaN(bounds.minLon) || isNaN(bounds.maxLon)) {
      setErrorMsg('Invalid coordinates. Please enter valid latitude/longitude values.')
      return
    }

    if (bounds.minLat >= bounds.maxLat || bounds.minLon >= bounds.maxLon) {
      setErrorMsg('Invalid bounds: min values must be less than max values.')
      return
    }

    const source = getCurrentSource()
    if (!source.url) {
      setErrorMsg('Enter an XYZ tile URL from a provider that permits offline downloads.')
      setEstimate(null)
      return
    }
    if (!source.attribution) {
      setErrorMsg('Enter the attribution text required by your tile provider. It will be shown on the map.')
      setEstimate(null)
      return
    }
    const hasPlaceholders = /\{z\}/i.test(source.url) && /\{x\}/i.test(source.url) && /\{y\}/i.test(source.url)
    if (!hasPlaceholders) {
      setErrorMsg('Tile URL must contain {z}, {x}, and {y} placeholders.')
      setEstimate(null)
      return
    }
    const sourceRestriction = getOfflineTileSourceRestriction(source.url)
    if (sourceRestriction) {
      setErrorMsg(sourceRestriction)
      setEstimate(null)
      return
    }

    let total: number
    try {
      total = calculateTileCount(bounds, zoomRange[0], zoomRange[1]).total
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid bounds or zoom range.')
      setEstimate(null)
      return
    }
    const sizeBytes = estimateStorageSize(total, source.type)

    if (total > 500000) {
      setErrorMsg(`Estimated ${formatNumber(total)} tiles exceeds the 500K safety limit. Please reduce the area or zoom range.`)
      setEstimate(null)
      return
    }

    setErrorMsg(null)
    setEstimate({ tiles: total, sizeBytes })
  }, [minLat, maxLat, minLon, maxLon, zoomRange, getCurrentSource])

  // Start download
  const startDownload = useCallback(async () => {
    const bounds: MapExtent = {
      minLat: parseFloat(minLat),
      maxLat: parseFloat(maxLat),
      minLon: parseFloat(minLon),
      maxLon: parseFloat(maxLon),
    }

    if (isNaN(bounds.minLat) || isNaN(bounds.maxLat) || isNaN(bounds.minLon) || isNaN(bounds.maxLon)) {
      setErrorMsg('Invalid coordinates.')
      return
    }

    const source = getCurrentSource()
    if (!source.url) {
      setErrorMsg('Enter an XYZ tile URL from a provider that permits offline downloads.')
      return
    }
    if (!source.attribution) {
      setErrorMsg('Enter the attribution text required by your tile provider. It will be shown on the map.')
      return
    }
    const hasPlaceholders = /\{z\}/i.test(source.url) && /\{x\}/i.test(source.url) && /\{y\}/i.test(source.url)
    if (!hasPlaceholders) {
      setErrorMsg('Tile URL must contain {z}, {x}, and {y} placeholders.')
      return
    }
    const sourceRestriction = getOfflineTileSourceRestriction(source.url)
    if (sourceRestriction) {
      setErrorMsg(sourceRestriction)
      setEstimate(null)
      return
    }

    const abortController = new AbortController()
    abortRef.current = abortController

    setDownloadState('downloading')
    setErrorMsg(null)
    setProgress(null)

    try {
      const result = await downloadTilesForBounds(
        source.id,
        source.url,
        bounds,
        zoomRange[0],
        zoomRange[1],
        source.type,
        (p: DownloadProgress) => setProgress({ ...p }),
        abortController.signal,
        {
          label: source.label,
          urlTemplate: source.url,
          attribution: source.attribution,
          minZoom: zoomRange[0],
          maxZoom: zoomRange[1],
        },
      )

      if (!abortController.signal.aborted) {
        setProgress(result)
        setDownloadState('complete')
        if (result.downloaded + result.skipped > 0) {
          window.dispatchEvent(new Event('metardu:offline-tiles-updated'))
        }
      }
    } catch (err: unknown) {
      if (((err as Error)?.name) !== 'AbortError') {
        setErrorMsg((err as Error).message ?? 'Download failed')
        setDownloadState('error')
      }
    }
  }, [minLat, maxLat, minLon, maxLon, zoomRange, getCurrentSource])

  // Cancel download
  const cancelDownload = useCallback(() => {
    abortRef.current?.abort()
    setDownloadState('idle')
  }, [])

  // Close dialog
  const handleClose = useCallback(() => {
    if (downloadState === 'downloading') {
      cancelDownload()
    }
    onOpenChange(false)
  }, [downloadState, cancelDownload, onOpenChange])

  const isDownloading = downloadState === 'downloading'
  const isComplete = downloadState === 'complete'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--text-primary)]">
            <Download className="w-5 h-5 text-[var(--accent)]" />
            Download Offline Tiles
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            Cache an area for offline work using a tile provider that expressly permits offline downloads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ─── Tile Source ─────────────────────────────────────────── */}
          <section>
            <div className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              <Layers className="w-4 h-4 inline mr-1.5" />
              Licensed or Self-hosted Tile Source
            </div>
            <div className="mt-3 space-y-3">
              <Input
                aria-label="Tile source label"
                placeholder="Label (e.g. Kenya Topo)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                disabled={isDownloading}
                className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
              <Input
                aria-label="Licensed XYZ tile URL"
                placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={isDownloading}
                className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono text-xs"
              />
              <Input
                aria-label="Tile provider attribution"
                placeholder="Required map attribution (e.g. © Provider, data source)"
                value={customAttribution}
                onChange={(e) => setCustomAttribution(e.target.value)}
                disabled={isDownloading}
                className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-xs"
              />
              <p className="text-xs text-[var(--text-muted)]">
                Use an XYZ source in Web Mercator whose terms allow offline caching. This downloader blocks the public OpenStreetMap and Esri tile hosts and does not import Esri offline packages. Attribution is shown on the map.
              </p>
            </div>
          </section>

          {/* ─── Bounding Box ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[var(--text-secondary)]">
                <MapPin className="w-4 h-4 inline mr-1.5" />
                Bounding Box (WGS84)
              </div>
              {mapExtent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={useMapExtent}
                  disabled={isDownloading}
                  className="text-xs border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Use current map view
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="otd-min-lat" className="block text-xs text-[var(--text-muted)] mb-1">Min Latitude</label>
                <Input
                  id="otd-min-lat"
                  type="number"
                  step="0.000001"
                  value={minLat}
                  onChange={(e) => setMinLat(e.target.value)}
                  disabled={isDownloading}
                  className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="otd-max-lat" className="block text-xs text-[var(--text-muted)] mb-1">Max Latitude</label>
                <Input
                  id="otd-max-lat"
                  type="number"
                  step="0.000001"
                  value={maxLat}
                  onChange={(e) => setMaxLat(e.target.value)}
                  disabled={isDownloading}
                  className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="otd-min-lon" className="block text-xs text-[var(--text-muted)] mb-1">Min Longitude</label>
                <Input
                  id="otd-min-lon"
                  type="number"
                  step="0.000001"
                  value={minLon}
                  onChange={(e) => setMinLon(e.target.value)}
                  disabled={isDownloading}
                  className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="otd-max-lon" className="block text-xs text-[var(--text-muted)] mb-1">Max Longitude</label>
                <Input
                  id="otd-max-lon"
                  type="number"
                  step="0.000001"
                  value={maxLon}
                  onChange={(e) => setMaxLon(e.target.value)}
                  disabled={isDownloading}
                  className="bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] font-mono text-sm"
                />
              </div>
            </div>
          </section>

          {/* ─── Zoom Range ──────────────────────────────────────────── */}
          <section>
            <div className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              <ZoomIn className="w-4 h-4 inline mr-1.5" />
              Zoom Range: {zoomRange[0]} – {zoomRange[1]}
            </div>
            <Slider
              value={zoomRange}
              onValueChange={setZoomRange}
              min={0}
              max={20}
              step={1}
              disabled={isDownloading}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
              <span>0 (world)</span>
              <span>20 (street)</span>
            </div>
          </section>

          {/* ─── Error Message ───────────────────────────────────────── */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* ─── Estimate & Download Button ──────────────────────────── */}
          {!isComplete && !isDownloading && (
            <div className="flex flex-col gap-4">
              <Button
                variant="outline"
                onClick={estimateTiles}
                disabled={isDownloading}
                className="w-full border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--accent)]"
              >
                <HardDrive className="w-4 h-4 mr-2" />
                Estimate Tile Count
              </Button>

              {estimate && (
                <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Estimated tiles</span>
                    <span className="text-[var(--text-primary)] font-mono font-semibold">
                      {formatNumber(estimate.tiles)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Estimated size</span>
                    <span className="text-[var(--text-primary)] font-mono font-semibold">
                      {formatBytes(estimate.sizeBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Source</span>
                    <span className="text-[var(--text-primary)]">
                      {getCurrentSource().label}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Zoom levels</span>
                    <span className="text-[var(--text-primary)] font-mono">
                      {zoomRange[0]} – {zoomRange[1]}
                    </span>
                  </div>
                </div>
              )}

              {estimate && (
                <Button
                  onClick={startDownload}
                  disabled={isDownloading}
                  className="w-full bg-[var(--accent)] text-black font-semibold hover:brightness-110"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download {formatNumber(estimate.tiles)} Tiles
                </Button>
              )}
            </div>
          )}

          {/* ─── Download Progress ───────────────────────────────────── */}
          {isDownloading && progress && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">
                    Downloading zoom level {progress.currentZoom}…
                  </span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {Math.round((progress.downloaded / progress.total) * 100)}%
                  </span>
                </div>
                <Progress
                  value={Math.round((progress.downloaded / progress.total) * 100)}
                  className="h-2 bg-[var(--bg-secondary)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-3">
                  <div className="text-lg font-bold text-[var(--accent)] font-mono">
                    {formatNumber(progress.downloaded)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Downloaded</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-3">
                  <div className="text-lg font-bold text-[var(--text-primary)] font-mono">
                    {formatNumber(progress.skipped)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Cached</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-3">
                  <div className="text-lg font-bold text-[var(--text-primary)] font-mono">
                    {formatBytes(progress.bytesDownloaded)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Size</div>
                </div>
              </div>

              {progress.failed > 0 && (
                <p className="text-xs text-yellow-500 text-center">
                  {progress.failed} tile{progress.failed !== 1 ? 's' : ''} failed to download
                </p>
              )}
            </div>
          )}

          {isDownloading && !progress && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <span className="ml-3 text-sm text-[var(--text-muted)]">Starting download…</span>
            </div>
          )}

          {/* ─── Complete Summary ────────────────────────────────────── */}
          {isComplete && progress && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Download Complete</span>
              </div>

              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Tiles downloaded</span>
                  <span className="text-[var(--text-primary)] font-mono font-semibold">
                    {formatNumber(progress.downloaded)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Tiles already cached</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {formatNumber(progress.skipped)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Failed</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {formatNumber(progress.failed)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Total data downloaded</span>
                  <span className="text-[var(--text-primary)] font-mono font-semibold">
                    {formatBytes(progress.bytesDownloaded)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Source</span>
                  <span className="text-[var(--text-primary)]">
                    {getCurrentSource().label}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isDownloading ? (
            <Button
              variant="destructive"
              onClick={cancelDownload}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Download
            </Button>
          ) : isComplete ? (
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-[var(--accent)] text-black font-semibold hover:brightness-110"
            >
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
