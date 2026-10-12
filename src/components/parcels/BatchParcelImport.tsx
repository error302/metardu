'use client'

/**
 * BatchParcelImport — Bulk import parcels from CSV/GeoJSON
 *
 * Solves the Mwavumbo Ward problem: importing 200+ parcels with owner data.
 */

import { useState, useCallback, useRef } from 'react'
import {
  Upload, Loader2, CheckCircle2, AlertTriangle,
  Download, Table, Layers, Users,
} from 'lucide-react'
import { parseCsvRecords } from '@/lib/parcel/csvRecords'

interface GeoJSONParcelProps {
  parcel_number?: string
  parcelNumber?: string
  name?: string
  owner_name?: string
  ownerName?: string
  owner?: string
  owner_id?: string
  ownerId?: string
  national_id?: string
  lr_number?: string
  lrNumber?: string
  title_deed?: string
  area_ha?: string
  area?: string
}

interface GeoJSONGeometry {
  type?: string
  coordinates?: unknown
}

interface GeoJSONFeature {
  properties?: GeoJSONParcelProps
  geometry?: GeoJSONGeometry
}

interface ParsedParcel {
  id: string
  parcelNumber: string
  ownerName?: string
  ownerId?: string
  lrNumber?: string
  areaHa?: number
  vertices: Array<{ easting: number; northing: number }>
  valid: boolean
  errors: string[]
}

interface BatchParcelImportProps {
  projectId: string
  onImport?: (parcels: ParsedParcel[]) => void
}

export function BatchParcelImport({ projectId, onImport }: BatchParcelImportProps) {
  const [parcels, setParcels] = useState<ParsedParcel[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceCrs, setSourceCrs] = useState('')
  const [confirmTransformation, setConfirmTransformation] = useState(false)
  const [importNotes, setImportNotes] = useState<string[]>([])
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseCSV = useCallback((text: string): ParsedParcel[] => {
    const records = parseCsvRecords(text)
    if (records.length < 2) throw new Error('CSV needs a header and at least one data row.')

    const header = records[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim().toLowerCase())
    const parcelsMap = new Map<string, ParsedParcel>()

    const colIdx = {
      parcelNumber: header.findIndex(h => ['parcel_number', 'parcel', 'parcel_no', 'plot_number', 'plot_no'].includes(h)),
      easting: header.findIndex(h => h.includes('easting') || h === 'e'),
      northing: header.findIndex(h => h.includes('northing') || h === 'n'),
      ownerName: header.findIndex(h => h.includes('owner') && h.includes('name')),
      ownerId: header.findIndex(h => h.includes('owner') && h.includes('id')),
      lrNumber: header.findIndex(h => h.includes('lr') || h.includes('title')),
      areaHa: header.findIndex(h => h.includes('area') || h.includes('ha')),
    }

    if (colIdx.parcelNumber < 0 || colIdx.easting < 0 || colIdx.northing < 0) {
      throw new Error('CSV needs parcel_number, easting, and northing columns. Each data row represents one vertex.')
    }

    for (let i = 1; i < records.length; i++) {
      const cols = records[i]
      const parcelNum = cols[colIdx.parcelNumber]?.trim()
      const easting = colIdx.easting >= 0 ? parseFloat(cols[colIdx.easting]) : NaN
      const northing = colIdx.northing >= 0 ? parseFloat(cols[colIdx.northing]) : NaN

      if (!parcelNum) throw new Error(`CSV row ${i + 1} has no parcel number; parcel names are never generated.`)

      let parcelEntry = parcelsMap.get(parcelNum)
      if (!parcelEntry) {
        parcelEntry = {
          id: crypto.randomUUID(),
          parcelNumber: parcelNum,
          ownerName: colIdx.ownerName >= 0 ? cols[colIdx.ownerName] : undefined,
          ownerId: colIdx.ownerId >= 0 ? cols[colIdx.ownerId] : undefined,
          lrNumber: colIdx.lrNumber >= 0 ? cols[colIdx.lrNumber] : undefined,
          areaHa: colIdx.areaHa >= 0 && Number.isFinite(parseFloat(cols[colIdx.areaHa])) ? parseFloat(cols[colIdx.areaHa]) : undefined,
          vertices: [],
          valid: true,
          errors: [],
        }
        parcelsMap.set(parcelNum, parcelEntry)
      }

      parcelEntry.vertices.push({ easting, northing })
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
        parcelEntry.valid = false
        parcelEntry.errors.push(`Row ${i + 1}: coordinates must be finite numbers`)
      }
    }

    const parcels = Array.from(parcelsMap.values())
    for (const parcel of parcels) {
      if (parcel.vertices.length < 3) {
        parcel.errors.push('Needs at least 3 vertices')
        parcel.valid = false
      }
      if (!parcel.parcelNumber) {
        parcel.errors.push('Missing parcel number')
        parcel.valid = false
      }
    }

    return parcels
  }, [])

  const parseGeoJSON = useCallback((text: string): ParsedParcel[] => {
    const geojson = JSON.parse(text) as { features?: GeoJSONFeature[] }
    if (!geojson.features || !Array.isArray(geojson.features)) return []

    return geojson.features.map((feature) => {
      const props: GeoJSONParcelProps = feature.properties || {}
      const geom: GeoJSONGeometry = feature.geometry || {}

      let vertices: Array<{ easting: number; northing: number }> = []
      const errors: string[] = []

      if (geom.type === 'Polygon') {
        const rings = Array.isArray(geom.coordinates) ? geom.coordinates : []
        if (rings.length !== 1) errors.push('Only a single-ring Polygon is supported; polygon holes need separate review.')
        const ring = (rings[0] as number[][] | undefined) || []
        const closed = ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0]
          && ring[0]?.[1] === ring[ring.length - 1]?.[1]
        const verts = closed ? ring.slice(0, -1) : ring
        vertices = verts.map((c) => ({
          easting: typeof c?.[0] === 'number' ? c[0] : Number.NaN,
          northing: typeof c?.[1] === 'number' ? c[1] : Number.NaN,
        }))
      } else if (geom.type === 'MultiPolygon') {
        errors.push('MultiPolygon features are not supported as one parcel; split each part into a separately identified parcel before import.')
      } else {
        errors.push('Geometry must be a Polygon.')
      }

      if (vertices.length < 3) errors.push('Needs at least 3 vertices')
      if (vertices.some((vertex) => !Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing))) {
        errors.push('Coordinates must be finite numbers')
      }

      return {
        id: crypto.randomUUID(),
        parcelNumber: props.parcel_number || props.parcelNumber || props.name || '',
        ownerName: props.owner_name || props.ownerName || props.owner,
        ownerId: props.owner_id || props.ownerId || props.national_id,
        lrNumber: props.lr_number || props.lrNumber || props.title_deed,
        areaHa: props.area_ha ? parseFloat(props.area_ha) : props.area ? parseFloat(props.area) : undefined,
        vertices,
        valid: errors.length === 0,
        errors,
      }
    })
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setError(null)
    setImportResult(null)
    setImportNotes([])
    setConfirmTransformation(false)

    try {
      const text = await file.text()
      const ext = file.name.split('.').pop()?.toLowerCase()

      let parsed: ParsedParcel[] = []
      if (ext === 'geojson' || ext === 'json') {
        const document = JSON.parse(text) as { crs?: { properties?: { name?: string } } }
        // RFC 7946 GeoJSON without an explicit legacy crs is WGS 84 lon/lat.
        // eslint-disable-next-line metardu/no-hardcoded-srid-default -- RFC 7946 defines GeoJSON coordinates as WGS 84 longitude/latitude.
        setSourceCrs(document.crs?.properties?.name?.toUpperCase() || 'EPSG:4326')
        parsed = parseGeoJSON(text)
      } else {
        // A CSV has no standard CRS declaration; require the surveyor to supply it.
        setSourceCrs('')
        parsed = parseCSV(text)
      }

      const unnamed = parsed.find((parcel) => !parcel.parcelNumber.trim())
      if (unnamed) throw new Error('Every GeoJSON feature needs a parcel_number, parcelNumber, or name property. Parcel names are never generated.')

      setParcels(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setParsing(false)
    }
  }, [parseCSV, parseGeoJSON])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const validCount = parcels.filter(p => p.valid).length
  const invalidCount = parcels.length - validCount

  const handleImport = useCallback(async () => {
    if (parcels.length === 0) return
    if (!sourceCrs.trim()) {
      setError('Enter the source EPSG code before importing.')
      return
    }
    setImporting(true)
    setImportProgress(0)
    setError(null)
    setImportNotes([])

    try {
      const sendChunk = async (chunk: ParsedParcel[]) => {
        const response = await fetch(`/api/projects/${projectId}/parcels/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceCrs: sourceCrs.trim().toUpperCase(),
            confirmTransformation,
            parcels: chunk.map(p => ({
              parcelNumber: p.parcelNumber,
              ownerName: p.ownerName,
              ownerId: p.ownerId,
              lrNumber: p.lrNumber,
              areaHa: p.areaHa,
              vertices: p.vertices,
            })),
          }),
        })
        const result = (await response.json()) as {
          error?: string
          errors?: string[]
          data?: { imported?: number; failed?: number; errors?: string[]; warnings?: string[] }
        }
        if (!response.ok) throw new Error(result.error || 'Import failed')
        return result.data
      }

      // For large imports (100+ parcels), process in chunks to avoid UI freeze
      if (parcels.length > 100) {
        const validParcels = parcels.filter(p => p.valid)
        const chunkSize = 50
        const totalChunks = Math.ceil(validParcels.length / chunkSize)

        let totalSuccess = 0
        let totalFailed = 0
        const notes: string[] = []

        for (let i = 0; i < validParcels.length; i += chunkSize) {
          const chunk = validParcels.slice(i, i + chunkSize)
          const currentChunk = Math.floor(i / chunkSize) + 1

          setImportProgress((currentChunk / totalChunks) * 100)

          try {
            const result = await sendChunk(chunk)
            totalSuccess += result?.imported ?? 0
            totalFailed += result?.failed ?? chunk.length
            notes.push(...(result?.errors ?? []), ...(result?.warnings ?? []))
          } catch (err) {
            totalFailed += chunk.length
            notes.push(err instanceof Error ? err.message : 'Import failed')
          }

          // Yield to event loop so UI can update
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        setImportProgress(100)
        setImportResult({ success: totalSuccess, failed: totalFailed })
        setImportNotes(notes.slice(0, 8))
        if (totalSuccess > 0) onImport?.(parcels)
      } else {
        // Small import — single request
        const result = await sendChunk(parcels.filter(p => p.valid))
        setImportResult({
          success: result?.imported ?? 0,
          failed: (result?.failed ?? 0) + invalidCount,
        })
        setImportNotes([...(result?.errors ?? []), ...(result?.warnings ?? [])].slice(0, 8))
        setImportProgress(100)
        if ((result?.imported ?? 0) > 0) onImport?.(parcels)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [parcels, projectId, onImport, sourceCrs, confirmTransformation, invalidCount])

  const downloadTemplate = useCallback(() => {
    const csv = `parcel_number,easting,northing,owner_name,owner_id,lr_number,area_ha
MWAVUMBO/001,534850.123,9574220.456,John Doe,12345678,LR/12345/678,0.5000
MWAVUMBO/001,534852.456,9574221.789,John Doe,12345678,LR/12345/678,0.5000
MWAVUMBO/001,534854.789,9574222.123,John Doe,12345678,LR/12345/678,0.5000
MWAVUMBO/001,534850.123,9574220.456,John Doe,12345678,LR/12345/678,0.5000
MWAVUMBO/002,534860.000,9574230.000,Jane Smith,87654321,LR/12345/679,0.7500
MWAVUMBO/002,534862.000,9574231.000,Jane Smith,87654321,LR/12345/679,0.7500
MWAVUMBO/002,534864.000,9574232.000,Jane Smith,87654321,LR/12345/679,0.7500
MWAVUMBO/002,534860.000,9574230.000,Jane Smith,87654321,LR/12345/679,0.7500`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'metardu-parcel-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          dragOver ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]' : 'border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.geojson,.json"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mb-2" />
            <p className="text-sm text-gray-400">Parsing file...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center mb-3">
              <Upload className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Drop CSV or GeoJSON here, or click to browse
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              Supports parcel boundaries with owner data — up to 1000 parcels
            </p>
          </div>
        )}
      </div>

      {parcels.length > 0 && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <div>
            <label htmlFor="parcel-source-crs" className="block text-xs font-semibold text-[var(--text-primary)]">
              Source coordinate system
            </label>
            <p className="mt-1 text-xs text-gray-400">
              Enter the EPSG code used by the file. GeoJSON defaults to EPSG:4326 longitude/latitude.
            </p>
          </div>
          <input
            id="parcel-source-crs"
            value={sourceCrs}
            onChange={(event) => { setSourceCrs(event.target.value); setConfirmTransformation(false) }}
            placeholder="EPSG:21037"
            className="w-full max-w-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          <label className="flex items-start gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={confirmTransformation}
              onChange={(event) => setConfirmTransformation(event.target.checked)}
              className="mt-0.5"
            />
            <span>I have checked the source datum and approve transformation if the project CRS differs. The original coordinates are retained.</span>
          </label>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs text-gray-400 hover:text-gray-200"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV Template
        </button>
        {parcels.length > 0 && (
          <button onClick={() => setParcels([])} className="text-[10px] text-gray-500 hover:text-gray-300">
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {importResult && (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-emerald-400 font-medium">
              Import reviewed: {importResult.success} parcels imported
            </p>
            {importResult.failed > 0 && (
              <p className="text-[10px] text-amber-400">{importResult.failed} failed</p>
            )}
          </div>
        </div>
      )}

      {importNotes.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
          <p className="font-semibold">Import review</p>
          <ul className="mt-1 list-disc pl-4 space-y-1">
            {importNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
          </ul>
        </div>
      )}

      {parcels.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Preview ({parcels.length} parcels)
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                {validCount} ready to submit
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  {invalidCount} errors
                </span>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--bg-card)]">
                <tr className="border-b border-[var(--border-color)]">
                  <th className="px-2 py-2 text-left text-[9px] text-gray-500 uppercase">Parcel No.</th>
                  <th className="px-2 py-2 text-left text-[9px] text-gray-500 uppercase">Owner</th>
                  <th className="px-2 py-2 text-center text-[9px] text-gray-500 uppercase">Vertices</th>
                  <th className="px-2 py-2 text-right text-[9px] text-gray-500 uppercase">File area (ha)</th>
                  <th className="px-2 py-2 text-center text-[9px] text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map(parcel => (
                  <tr key={parcel.id} className="border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                    <td className="px-2 py-2 text-xs font-mono text-[var(--text-primary)]">{parcel.parcelNumber}</td>
                    <td className="px-2 py-2 text-xs text-gray-400">{parcel.ownerName || '—'}</td>
                    <td className="px-2 py-2 text-xs text-center text-gray-400">{parcel.vertices.length}</td>
                    <td className="px-2 py-2 text-xs text-right font-mono text-gray-400">{parcel.areaHa ? parcel.areaHa.toFixed(4) : '—'}</td>
                    <td className="px-2 py-2 text-center">
                      {parcel.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400 inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={importing || validCount === 0 || !sourceCrs.trim()}
            className="w-full mt-3 flex items-center justify-center gap-2 h-10 rounded-lg bg-[var(--accent)] text-black text-sm font-semibold hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {importing ? `${importProgress > 0 ? Math.round(importProgress) + '%' : 'Importing...'}` : `Import ${validCount} Parcels to Project`}
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Users className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-[10px] text-blue-400/70 leading-relaxed">
          <p className="font-medium mb-1">CSV Format:</p>
          <p>Each row = one vertex. Multiple rows with the same parcel_number = one parcel&apos;s vertices.</p>
          <p className="mt-1">Columns: parcel_number, easting, northing, owner_name, owner_id, lr_number, area_ha</p>
          <p className="mt-1 font-medium">GeoJSON: Polygon features; owner fields are retained as source metadata. Stored area is calculated from the project-coordinate geometry.</p>
        </div>
      </div>
    </div>
  )
}
