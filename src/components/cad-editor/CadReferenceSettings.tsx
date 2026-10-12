'use client'

import { useEffect, useId, useState } from 'react'
import type { CADDocument } from './CADEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyCadReferenceFrame, hasCadReferenceFrame, cadReferenceErrorMessage } from '@/lib/cad/cadReferenceFrame'
import { parseCadGridCoordinate } from '@/lib/cad/cadDocumentValidation'

export function CadReferenceSettings({ document: doc, onApply }: { document: CADDocument; onApply: (document: CADDocument) => void }) {
  const id = useId()
  const [anchorId, setAnchorId] = useState(doc.beacons[0]?.id ?? '')
  const [crs, setCrs] = useState(doc.coordinateReferenceSystem ?? '')
  const [scale, setScale] = useState(doc.metersPerPixel?.toString() ?? '')
  const [easting, setEasting] = useState('')
  const [northing, setNorthing] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const anchor = doc.beacons.find(point => point.id === anchorId)

  useEffect(() => {
    setCrs(doc.coordinateReferenceSystem ?? '')
    setScale(doc.metersPerPixel?.toString() ?? '')
  }, [doc])

  useEffect(() => {
    const selected = doc.beacons.find(point => point.id === anchorId) ?? doc.beacons[0]
    setAnchorId(selected?.id ?? '')
    setEasting(selected?.easting?.toString() ?? '')
    setNorthing(selected?.northing?.toString() ?? '')
    setError('')
  }, [doc, anchorId])

  const fieldClass = 'min-h-11 bg-gray-900 border-gray-700 text-gray-100 text-xs font-mono'
  return (
    <details className="p-2.5 rounded-lg bg-gray-950 border border-gray-800">
      <summary className="cursor-pointer min-h-11 flex items-center font-semibold text-gray-200">Coordinate reference</summary>
      <p className="text-gray-400 leading-relaxed mb-3">
        {hasCadReferenceFrame(doc) ? `${doc.coordinateReferenceSystem} · grid north up.` : 'No complete survey grid reference.'}
        {' '}Use the project CRS and a known point. Declaring a frame does not verify survey accuracy.
      </p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        setError(''); setStatus('')
        const mpp = parseCadGridCoordinate(scale)
        const e = parseCadGridCoordinate(easting)
        const n = parseCadGridCoordinate(northing)
        if (mpp === undefined || mpp <= 0 || e === undefined || n === undefined) {
          setError('Enter a complete positive scale and complete Easting/Northing coordinates.'); return
        }
        try {
          onApply(applyCadReferenceFrame(doc, { coordinateReferenceSystem: crs, metersPerPixel: mpp, anchorId, easting: e, northing: n }))
          setStatus('Reference applied. Supplied point coordinates were preserved.')
        } catch (failure) { setError(cadReferenceErrorMessage(failure)) }
      }}>
        <div>
          <label htmlFor={`${id}-crs`} className="block mb-1 text-gray-400">Project CRS code</label>
          <Input id={`${id}-crs`} value={crs} onChange={event => setCrs(event.target.value)} placeholder="Enter the project EPSG code" className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-scale`} className="block mb-1 text-gray-400">Metres per canvas unit</label>
          <Input id={`${id}-scale`} value={scale} onChange={event => setScale(event.target.value)} placeholder="Positive layout scale" className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-anchor`} className="block mb-1 text-gray-400">Reference anchor</label>
          <select id={`${id}-anchor`} value={anchorId} onChange={event => { setAnchorId(event.target.value); setStatus('') }} className={`${fieldClass} w-full border rounded-md px-2`}>
            {!doc.beacons.length && <option value="">Place or import a point first</option>}
            {doc.beacons.map(point => <option key={point.id} value={point.id}>{point.label || point.id}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-e`} className="block mb-1 text-gray-400">Anchor Easting (m)</label>
          <Input id={`${id}-e`} value={easting} readOnly={anchor?.easting !== undefined} onChange={event => setEasting(event.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-n`} className="block mb-1 text-gray-400">Anchor Northing (m)</label>
          <Input id={`${id}-n`} value={northing} readOnly={anchor?.northing !== undefined} onChange={event => setNorthing(event.target.value)} className={fieldClass} />
        </div>
        <p className="text-gray-500 leading-relaxed">Known point coordinates remain unchanged. Uncoordinated design points receive coordinates in the declared grid.</p>
        {error && <p role="alert" className="text-amber-300 leading-relaxed">{error}</p>}
        {status && <p role="status" className="text-emerald-300 leading-relaxed">{status}</p>}
        <Button type="submit" disabled={!anchor} className="min-h-11 w-full bg-cyan-700 text-white hover:bg-cyan-600 text-xs">Apply reference</Button>
      </form>
    </details>
  )
}
