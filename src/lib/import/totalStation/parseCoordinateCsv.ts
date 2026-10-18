import Papa from 'papaparse'
import { coordinateNumber } from './coordinateNumber'
import type { UnifiedImportResult, UnifiedRawPoint } from './unifiedTypes'

export type CoordinateColumnOrder = 'EN' | 'NE'
const aliases: Record<string, string[]> = {
  id: ['id','pointid','pointname','pointno','pointnumber','name','station'],
  easting: ['e','easting','east','x'], northing: ['n','northing','north','y'],
  elevation: ['z','elevation','height','rl','level'], code: ['code','description','featurecode'],
}
export function parseCoordinateCsv(content: string, order?: CoordinateColumnOrder): UnifiedImportResult {
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: 'greedy' })
  const errors = parsed.errors.map(error => `CSV record ${(error.row ?? 0)+1}: ${error.message}`)
  const rows = parsed.data
  const header = rows[0]?.map(value => value.trim().toLowerCase().replace(/[\s_-]/g,'')) ?? []
  const column = (field: string) => header.findIndex(value => aliases[field].includes(value))
  const labelled = column('id') >= 0 && column('easting') >= 0 && column('northing') >= 0
  const points: UnifiedRawPoint[] = []
  const ambiguous=Object.entries(aliases).filter(([,names])=>header.filter(value=>names.includes(value)).length>1).map(([field])=>field)
  if(ambiguous.length) return {format:'csv',instrument:'Coordinate CSV',stationName:'',observations:[],meanedObservations:[],rawPoints:[],errors:[`Ambiguous duplicate CSV headers: ${ambiguous.join(', ')}. Keep one column for each coordinate field.`],warnings:[]}
  if (!labelled && !order) errors.push('Choose the Easting/Northing column order for an unlabelled coordinate file, or add id,easting,northing headers.')
  else {
    const indices = labelled ? { id:column('id'), easting:column('easting'), northing:column('northing'), elevation:column('elevation'), code:column('code') }
      : { id:0, easting:order==='EN'?1:2, northing:order==='EN'?2:1, elevation:3, code:4 }
    for (let index=labelled?1:0;index<rows.length;index++) {
      const row=rows[index]
      points.push({ id:row[indices.id]?.trim() ?? '', easting:coordinateNumber(row[indices.easting]), northing:coordinateNumber(row[indices.northing]),
        elevation:coordinateNumber(row[indices.elevation]), code:row[indices.code]?.trim() ?? '', sourceRow:index+1 })
    }
  }
  return { format:'csv',instrument:'Coordinate CSV',stationName:'',observations:[],meanedObservations:[],rawPoints:points,errors,warnings:[] }
}
