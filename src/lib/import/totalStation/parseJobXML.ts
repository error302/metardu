import { XMLParser } from 'fast-xml-parser'
import { coordinateNumber } from './coordinateNumber'

export interface JobXMLRecord {
  pointId: string
  easting?: number
  northing?: number
  elevation?: number
  code?: string
  note?: string
}

export function parseJobXML(content: string): {
  ok: boolean
  records: JobXMLRecord[]
  warnings: string[]
  jobName?: string
} {
  const warnings: string[] = []
  const records: JobXMLRecord[] = []

  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('External XML declarations are not allowed')
    const doc: unknown = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: true }).parse(content, true)
    let jobName: string | undefined
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(visit); return }
      const object = node as Record<string, unknown>
      for (const [key, value] of Object.entries(object)) {
        const items = Array.isArray(value) ? value : [value]
        if (key === 'JOBFile' && value && typeof value === 'object') jobName = String((value as Record<string,unknown>)['@_JobName'] ?? '') || undefined
        if (key === 'PointRecord') for (const item of items) {
          const point = item as Record<string, unknown>
          const grid = point.Grid && typeof point.Grid === 'object' ? point.Grid as Record<string,unknown> : {}
          records.push({ pointId:String(point.Name ?? '').trim(), easting:coordinateNumber(grid.East), northing:coordinateNumber(grid.North), elevation:coordinateNumber(grid.Elev), code:typeof point.Code==='string'?point.Code.trim():undefined })
        }
        if (key === 'RawObservation') for (const item of items) warnings.push(`Raw observation for ${String((item as Record<string,unknown>).TargetID ?? 'unknown target')} — no coordinates computed`)
        visit(value)
      }
    }
    visit(doc)
    return { ok: records.length > 0, records, warnings, jobName }

  } catch {
    return { 
      ok: false, 
      records: [], 
      warnings: ['Failed to parse JobXML file — check file format'] 
    }
  }
}
