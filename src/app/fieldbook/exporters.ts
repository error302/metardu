'use client';

import { bearingToString } from '@/lib/engine/angles'
import { polar3DWithHeights } from '@/lib/engine/polar'
import { asBearing, asNumber, downloadBlob } from './helpers'
import type {
  ControlSetup,
  FieldbookType,
  HydroRow,
  LevelRow,
  MiningRow,
  TravRow,
} from './types'
import type { FieldbookComputations } from './useFieldbookComputations'

interface ExportParams {
  fieldbookId: string | null
  type: FieldbookType
  name: string
  projectId: string
  currentDataPayload: () => Record<string, unknown>
  levelRows: LevelRow[]
  travRows: TravRow[]
  controlSetups: ControlSetup[]
  hydroRows: HydroRow[]
  miningRows: MiningRow[]
  computations: FieldbookComputations
}

export function exportJSONFn(p: ExportParams) {
  const payload = { id: p.fieldbookId, type: p.type, name: p.name.trim() || `${p.type.toUpperCase()} Field Book`, projectId: p.projectId, createdAt: new Date().toISOString(), data: p.currentDataPayload() }
  downloadBlob(`metardu-fieldbook-${p.type}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
}

export async function exportCSVFn(p: ExportParams) {
  let rows: Array<Record<string, string>> = []
  if (p.type === 'leveling') {
    rows = p.levelRows.map((r) => ({ Station: r.station, BS: r.bs, IS: r.is, FS: r.fs, Remarks: r.remarks }))
  } else if (p.type === 'traverse') {
    rows = p.travRows.map((r) => ({ Station: r.station, Bearing: r.bearing, SlopeDist: r.slopeDist, Remarks: r.remarks }))
  } else if (p.type === 'control') {
    rows = p.controlSetups.flatMap((setup) =>
      setup.rows.map((r) => ({
        Station: setup.station.name,
        PointID: r.pointId,
        IH: r.instrumentHeight,
        TH: r.targetHeight,
        Bearing: r.bearing,
        VAngle: r.verticalAngle,
        SlopeDist: r.slopeDistance,
        Remarks: r.remarks,
      }))
    )
  } else if (p.type === 'hydrographic') {
    rows = p.hydroRows.map((r) => ({ SoundingID: r.soundingId, Easting: r.easting, Northing: r.northing, Depth: r.depth, Tide: r.tide, Remarks: r.remarks }))
  } else {
    rows = p.miningRows.map((r) => ({ PointID: r.pointId, Bearing: r.bearing, VAngle: r.verticalAngle, SlopeDist: r.slopeDistance, Remarks: r.remarks }))
  }

  const Papa = (await import('papaparse')).default
  downloadBlob(`metardu-fieldbook-${p.type}.csv`, new Blob([Papa.unparse(rows)], { type: 'text/csv' }))
}

export async function exportPDFFn(p: ExportParams) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const title = p.name.trim() || `${p.type.toUpperCase()} Field Book`
  doc.setFontSize(14)
  doc.text('METARDU — Digital Field Book', 14, 14)
  doc.setFontSize(11)
  doc.text(title, 14, 22)
  doc.setFontSize(9)
  doc.text(`Type: ${p.type}   Project: ${p.projectId || '—'}   Generated: ${new Date().toLocaleString()}`, 14, 28)

  const { levelingComputed, traverseComputed, hydroComputed, miningComputed } = p.computations

  if (p.type === 'leveling') {
    autoTable(doc, { startY: 32, head: [['Station', 'BS', 'IS', 'FS', 'Rise', 'Fall', 'RL', 'Remarks']], body: levelingComputed.ok ? levelingComputed.calc.readings.filter((r) => r.station !== 'BM').map((r) => [r.station, r.bs ?? '', r.is ?? '', r.fs ?? '', r.rise ?? '', r.fall ?? '', r.reducedLevel ?? '', '']) : [], styles: { fontSize: 8 } })
  } else if (p.type === 'traverse') {
    autoTable(doc, {
      startY: 32,
      head: [['Station', 'Bearing', 'Distance', 'Lat (ΔN)', 'Dep (ΔE)', 'Easting', 'Northing', 'Remarks']],
      body: (() => {
        if (!traverseComputed.ok) return []
        if (traverseComputed.mode === 'open') return traverseComputed.raw.legs.map((l) => [l.to, l.bearingDMS, l.distance, l.deltaN, l.deltaE, l.easting, l.northing, ''])
        return traverseComputed.adjusted.legs.map((l) => [l.to, l.bearingDMS, l.distance, l.adjDeltaN, l.adjDeltaE, l.adjEasting, l.adjNorthing, ''])
      })(),
      styles: { fontSize: 8 },
    })
  } else if (p.type === 'hydrographic') {
    autoTable(doc, { startY: 32, head: [['Sounding', 'Easting', 'Northing', 'Depth', 'Tide', 'Corrected', 'Remarks']], body: hydroComputed.ok ? hydroComputed.rows.map((r) => [r.soundingId, r.easting, r.northing, r.depth, r.tide, r.corrected ?? '', r.remarks]) : [], styles: { fontSize: 8 } })
  } else if (p.type === 'control') {
    let y = 32
    for (const setup of p.controlSetups) {
      const e0 = asNumber(setup.station.e)
      const n0 = asNumber(setup.station.n)
      const z0 = asNumber(setup.station.z)

      doc.setFontSize(10)
      doc.text(
        `Station: ${setup.station.name}   E: ${setup.station.e}   N: ${setup.station.n}   RL: ${setup.station.z}`,
        14,
        y
      )
      y += 4

      const body = (() => {
        if (e0 === null || n0 === null || z0 === null) return []
        return setup.rows.map((r) => {
          const b = asBearing(r.bearing)
          const v = asNumber(r.verticalAngle)
          const s = asNumber(r.slopeDistance)
          const hi = asNumber(r.instrumentHeight)
          const ht = asNumber(r.targetHeight)
          const computed =
            b !== null && v !== null && s !== null && hi !== null && ht !== null
              ? polar3DWithHeights({
                  station: { easting: e0, northing: n0, elevation: z0 },
                  bearing: b,
                  verticalAngle: v,
                  slopeDistance: s,
                  instrumentHeight: hi,
                  targetHeight: ht,
                })
              : null
          const bearingOut = b !== null ? bearingToString(b) : r.bearing
          return [
            r.pointId,
            r.instrumentHeight,
            r.targetHeight,
            bearingOut,
            r.verticalAngle,
            r.slopeDistance,
            computed ? computed.easting : '',
            computed ? computed.northing : '',
            computed ? computed.elevation : '',
            r.remarks,
          ]
        })
      })()

      autoTable(doc, {
        startY: y,
        head: [['Point', 'IH', 'TH', 'Bearing', 'V.Ang', 'Slope', 'Easting', 'Northing', 'RL', 'Remarks']],
        body,
        styles: { fontSize: 8 },
      })

      const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      y = (typeof lastY === 'number' ? lastY : y) + 8
      if (y > 270) {
        doc.addPage()
        y = 20
      }
    }
  } else {
    autoTable(doc, { startY: 32, head: [['Point', 'Bearing', 'V.Ang', 'Slope', 'Easting', 'Northing', 'RL', 'Remarks']], body: miningComputed.ok ? miningComputed.rows.map((r) => [r.pointId, r.bearingNum !== null && r.bearingNum !== undefined ? bearingToString(r.bearingNum) : r.bearing, r.verticalAngle, r.slopeDistance, r.computed ? r.computed.easting : '', r.computed ? r.computed.northing : '', r.computed ? r.computed.elevation : '', r.remarks]) : [], styles: { fontSize: 8 } })
  }

  downloadBlob(`metardu-fieldbook-${p.type}.pdf`, doc.output('blob'))
}
