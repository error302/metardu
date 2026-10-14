/**
 * Pile / Column Grid Setting-Out Computation Engine
 *
 * Pure functions — no side effects, no DB, no React imports.
 * Generates pile grid coordinates, computes setting-out data
 * (bearing & distance from instrument station), DXF export,
 * and CSV import/export.
 *
 * Reference:
 *   Basak §8.5 – Foundation Setting Out
 *   Ghilani & Wolf §24.1 – Construction Surveying
 */

import Papa from 'papaparse'
import { engineeringScheduleCsv } from './engineeringScheduleCsv'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { normalizeBearing } from '@/lib/engine/angles'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface PileGridDefinition {
  name: string;
  originEasting: number;
  originNorthing: number;
  /** Optional design level; null means the grid is horizontal-only. */
  originRL: number | null;
  rows: number;
  columns: number;
  rowSpacing: number;
  columnSpacing: number;
  rotation: number;           // degrees clockwise from north
  startLabel: string;
  labelRowsAs: 'alpha' | 'numeric';
  labelColumnsAs: 'alpha' | 'numeric';
  pileType: 'pile' | 'column' | 'pier' | 'abutment';
  pileDiameter?: number;      // mm
  depth?: number;             // meters
  coordinateSystem: string;
}

export interface PileCoordinate {
  label: string;
  row: number;
  column: number;
  easting: number;
  northing: number;
  designRL: number | null;
  gridOffsetE: number;
  gridOffsetN: number;
}

export interface PileGridResult {
  definition: PileGridDefinition;
  piles: PileCoordinate[];
  boundingBox: { minE: number; minN: number; maxE: number; maxN: number };
  totalPiles: number;
  area: number;
}

/** Guard synchronous generation and persistence from accidental or hostile mega-grids. */
export const MAX_PILE_GRID_POINTS = 5000

export interface PileSettingOutData {
  pile: PileCoordinate;
  bearingDeg: number | null;
  bearingDMS: string | null;
  horizontalDistance: number;
  /** Legacy field: signed design-ground RL minus instrument-axis RL, NOT prism height. */
  targetHeight: number | null;
  /** Instrument-axis RL minus design RL; a negative value is above the sight horizon. */
  staffReading: number | null;
  horizontalAngleDeg: number | null;
  prismVerticalDifference: number | null;
  verticalAngleDeg: number | null;
  slopeDistance: number | null;
}

export interface PileInstrumentOptions { backsight?: { easting: number; northing: number }; prismHeight?: number }

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Convert a 0-based index to an Excel-style column letter: 0 -> A, 25 -> Z, 26 -> AA */
function indexToAlpha(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function indexToNumeric(idx: number): string {
  return String(idx + 1);
}

function labelForRow(rowIdx: number, mode: 'alpha' | 'numeric'): string {
  return mode === 'alpha' ? indexToAlpha(rowIdx) : indexToNumeric(rowIdx);
}

function labelForColumn(colIdx: number, mode: 'alpha' | 'numeric'): string {
  return mode === 'alpha' ? indexToAlpha(colIdx) : indexToNumeric(colIdx);
}

/** Determine how the start label is structured (row-part + col-part). */
function parseStartLabel(
  startLabel: string,
  rowMode: 'alpha' | 'numeric',
  colMode: 'alpha' | 'numeric',
): { rowOffset: number; colOffset: number } {
  const alpha = (text: string) => { let index = 0; for (const letter of text.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64; return index - 1 }
  const checked = (rowOffset: number, colOffset: number) => {
    if (![rowOffset,colOffset].every(n=>Number.isSafeInteger(n) && n>=0 && n<=1000000)) throw new RangeError('Starting label indices must be positive and within the supported label range.')
    return {rowOffset,colOffset}
  }
  if (rowMode === colMode) {
    const parts = startLabel.trim().match(rowMode === 'numeric' ? /^(\d+)-(\d+)$/ : /^([A-Za-z]+)-([A-Za-z]+)$/)
    if (!parts) throw new RangeError('Same-format grid labels need a separator, for example 1-1 or A-A; ambiguous labels are not renamed automatically.')
    return checked(rowMode==='numeric' ? Number(parts[1])-1 : alpha(parts[1]), rowMode==='numeric' ? Number(parts[2])-1 : alpha(parts[2]))
  }
  // Try "A1" style labels (alpha row, numeric col)
  const alphaMatch = startLabel.match(/^([A-Za-z]+)(\d+)$/);
  if (alphaMatch && rowMode === 'alpha' && colMode === 'numeric') {
    const rowLetters = alphaMatch[1].toUpperCase();
    let rowIdx = 0;
    for (let i = 0; i < rowLetters.length; i++) {
      rowIdx = rowIdx * 26 + (rowLetters.charCodeAt(i) - 64);
    }
    rowIdx--; // zero-based
    const colIdx = parseInt(alphaMatch[2], 10) - 1;
    return checked(rowIdx, colIdx);
  }

  // Try "1A" style (numeric row, alpha column)
  const numAlphaMatch = startLabel.match(/^(\d+)([A-Za-z]+)$/);
  if (numAlphaMatch && rowMode === 'numeric' && colMode === 'alpha') {
    const rowIdx = parseInt(numAlphaMatch[1], 10) - 1;
    const colLetters = numAlphaMatch[2].toUpperCase();
    let colIdx = 0;
    for (let i = 0; i < colLetters.length; i++) {
      colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64);
    }
    colIdx--;
    return checked(rowIdx, colIdx);
  }

  throw new RangeError('Starting label must match the selected row/column formats, for example A1 or 1A.')
}

// ─── CORE FUNCTIONS ───────────────────────────────────────────────────────────

/**
 * Generate all pile coordinates from a grid definition.
 *
 * Rotation convention:
 *   0 deg  = grid aligned with north (row spacing along N, column spacing along E)
 *   90 deg = columns toward south, rows toward east
 *   Positive = clockwise
 *
 * For each (col, row):
 *   lx = col * columnSpacing
 *   ly = row * rowSpacing
 *   rx = lx * cos(theta) + ly * sin(theta)
 *   ry = -lx * sin(theta) + ly * cos(theta)
 *   easting  = originE + rx
 *   northing = originN + ry
 */
export function generatePileGrid(def: PileGridDefinition): PileGridResult {
  if (!['alpha','numeric'].includes(def.labelRowsAs) || !['alpha','numeric'].includes(def.labelColumnsAs)) throw new RangeError('Grid label formats must be alpha or numeric.')
  for (const n of [def.pileDiameter,def.depth]) if (n != null && (!Number.isFinite(n) || n<=0)) throw new RangeError('Supplied diameter/depth must be finite and positive.')
  if (!Number.isInteger(def.rows) || def.rows < 1 || !Number.isInteger(def.columns) || def.columns < 1) {
    throw new RangeError('Grid rows and columns must be positive whole numbers.')
  }
  if (def.rows * def.columns > MAX_PILE_GRID_POINTS) {
    throw new RangeError(`A set-out grid cannot exceed ${MAX_PILE_GRID_POINTS.toLocaleString()} points.`)
  }
  if (!Number.isFinite(def.originEasting) || !Number.isFinite(def.originNorthing)) {
    throw new RangeError('Grid origin Easting and Northing must be finite coordinates.')
  }
  if (def.originRL !== null && !Number.isFinite(def.originRL)) {
    throw new RangeError('Design RL must be finite or left blank when no design level is available.')
  }
  if (!Number.isFinite(def.rowSpacing) || def.rowSpacing <= 0 || !Number.isFinite(def.columnSpacing) || def.columnSpacing <= 0) {
    throw new RangeError('Grid row and column spacing must be finite positive distances.')
  }
  if (!Number.isFinite(def.rotation)) {
    throw new RangeError('Grid rotation must be a finite angle.')
  }
  const width = (def.columns-1)*def.columnSpacing, height = (def.rows-1)*def.rowSpacing
  if (![width,height,width*height].every(Number.isFinite)) throw new RangeError('Grid extent/area exceeds the finite calculation range.')

  const theta = normalizeBearing(def.rotation) * Math.PI / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const parsed = parseStartLabel(def.startLabel, def.labelRowsAs, def.labelColumnsAs);
  const numericParts = def.startLabel.match(/\d+/g) ?? []
  const rowWidth = def.labelRowsAs === 'numeric' ? numericParts[0]?.length ?? 1 : 0
  const colWidth = def.labelColumnsAs === 'numeric' ? numericParts[def.labelRowsAs === 'numeric' ? 1 : 0]?.length ?? 1 : 0

  const piles: PileCoordinate[] = [];
  const coordinates = new Set<string>()

  for (let r = 0; r < def.rows; r++) {
    for (let c = 0; c < def.columns; c++) {
      const lx = c * def.columnSpacing;
      const ly = r * def.rowSpacing;

      const rx = lx * cosT + ly * sinT;
      const ry = -lx * sinT + ly * cosT;

      const rowLabel = labelForRow(parsed.rowOffset + r, def.labelRowsAs).padStart(rowWidth, '0');
      const colLabel = labelForColumn(parsed.colOffset + c, def.labelColumnsAs).padStart(colWidth, '0');
      const label = def.labelRowsAs === def.labelColumnsAs ? `${rowLabel}-${colLabel}` : rowLabel + colLabel;
      if (![lx,ly,rx,ry,def.originEasting+rx,def.originNorthing+ry].every(Number.isFinite)) throw new RangeError('Grid coordinates exceed the finite calculation range.')
      const location = `${def.originEasting+rx},${def.originNorthing+ry}`
      if (coordinates.has(location)) throw new RangeError('Grid spacing cannot produce distinct coordinates at this origin precision.')
      coordinates.add(location)

      piles.push({
        label,
        row: r,
        column: c,
        easting: def.originEasting + rx,
        northing: def.originNorthing + ry,
        designRL: def.originRL,
        gridOffsetE: rx,
        gridOffsetN: ry,
      });
    }
  }

  // Bounding box from actual pile positions
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (const p of piles) {
    if (p.easting < minE) minE = p.easting;
    if (p.northing < minN) minN = p.northing;
    if (p.easting > maxE) maxE = p.easting;
    if (p.northing > maxN) maxN = p.northing;
  }

  const area =
    (Math.max(def.columns - 1, 0) * def.columnSpacing) *
    (Math.max(def.rows - 1, 0) * def.rowSpacing);
  if (![area,maxE-minE,maxN-minN].every(Number.isFinite)) throw new RangeError('Grid extent/area exceeds the finite calculation range.')

  return {
    definition: def,
    piles,
    boundingBox: { minE, minN, maxE, maxN },
    totalPiles: piles.length,
    area,
  };
}

/**
 * Compute setting-out data: bearing, distance, and target height
 * from an instrument station to each pile.
 *
 * Bearing = atan2(dE, dN), normalised to 0-360 degrees.
 * Distance = sqrt(dE^2 + dN^2)
 * Signed ground offset = designRL - (stationRL + instrument height).
 * Level staff reading = (stationRL + instrument height) - designRL.
 * Prism offset includes the explicitly supplied prism height; orientation needs a backsight.
 */
export function computeSettingOut(
  piles: PileCoordinate[],
  stationE: number,
  stationN: number,
  stationRL: number | null,
  heightOfInstrument: number | null,
  options: PileInstrumentOptions = {},
): PileSettingOutData[] {
  if (![stationE,stationN].every(Number.isFinite)) throw new RangeError('Instrument coordinates must be finite.')
  if ((stationRL==null)!==(heightOfInstrument==null)) throw new RangeError('Enter station RL and instrument height together, or leave both unknown.')
  if (stationRL != null && !Number.isFinite(stationRL) || heightOfInstrument != null && (!Number.isFinite(heightOfInstrument) || heightOfInstrument<0)) throw new RangeError('Station RL must be finite and instrument height finite and non-negative.')
  if (options.prismHeight != null && (!Number.isFinite(options.prismHeight) || options.prismHeight<0)) throw new RangeError('Prism height must be finite and non-negative.')
  if (piles.length>MAX_PILE_GRID_POINTS || new Set(piles.map(p=>p.label)).size!==piles.length) throw new RangeError('Target labels must be unique and the point count bounded.')
  const inverse = (e: number,n: number) => {
    const de=e-stationE,dn=n-stationN,distance=Math.hypot(de,dn)
    if (![e,n,de,dn,distance].every(Number.isFinite)) throw new RangeError('Target coordinates/distances exceed the finite calculation range.')
    return {distance,bearing:distance===0 ? null : normalizeBearing(Math.atan2(de,dn)*180/Math.PI)}
  }
  const bs = options.backsight ? inverse(options.backsight.easting,options.backsight.northing) : null
  if (bs && bs.bearing==null) throw new RangeError('Backsight must be distinct from the instrument station.')
  const axis = stationRL!=null && heightOfInstrument!=null ? stationRL+heightOfInstrument : null
  if (axis!=null && !Number.isFinite(axis)) throw new RangeError('Instrument axis height exceeds the finite range.')
  return piles.map((pile) => {
    if (pile.designRL!=null && !Number.isFinite(pile.designRL)) throw new RangeError('Target design level must be finite or unknown.')
    const point=inverse(pile.easting,pile.northing), bearingDeg=point.bearing, horizontalDistance=point.distance
    const targetHeight=pile.designRL!=null && axis!=null ? pile.designRL-axis : null
    const prismVerticalDifference=targetHeight!=null && options.prismHeight!=null ? targetHeight+options.prismHeight : null
    const verticalAngleDeg=prismVerticalDifference!=null && horizontalDistance>0 ? Math.atan2(prismVerticalDifference,horizontalDistance)*180/Math.PI : null
    const slopeDistance=prismVerticalDifference!=null && horizontalDistance>0 ? Math.hypot(horizontalDistance,prismVerticalDifference) : null
    for (const n of [targetHeight,prismVerticalDifference,verticalAngleDeg,slopeDistance]) if (n!=null && !Number.isFinite(n)) throw new RangeError('Target height/distance exceeds the finite range.')

    return {
      pile,
      bearingDeg,
      bearingDMS: bearingDeg==null ? null : formatBearingDMS(bearingDeg),
      horizontalDistance,
      targetHeight,
      staffReading:targetHeight==null ? null : -targetHeight,
      horizontalAngleDeg:bs?.bearing!=null && bearingDeg!=null ? normalizeBearing(bearingDeg-bs.bearing) : null,
      prismVerticalDifference,verticalAngleDeg,slopeDistance,
    };
  });
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

/**
 * Convert a bearing in degrees to a DMS string.
 * Convention: 0 deg = North, clockwise positive.
 * Output: e.g. "127\u00B030'15.2\""
 */
export function formatBearingDMS(degrees: number): string {
  if (!Number.isFinite(degrees)) throw new RangeError('Bearing must be finite.')
  const ticks=Math.round(normalizeBearing(degrees)*36000)%12960000
  const deg=Math.floor(ticks/36000),min=Math.floor(ticks%36000/600),sec=(ticks%600)/10
  return `${deg}°${String(min).padStart(2,'0')}'${sec.toFixed(1).padStart(4,'0')}"`
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into a partial PileGridDefinition.
 * Expected format: "Parameter,Value" per line.
 */
export function parsePileGridCSV(csv: string): Partial<PileGridDefinition> {
  if (!csv.trim()) return {}
  if (csv.length>65536) throw new RangeError('Use a grid definition CSV smaller than 64 KiB.')
  const parsed=Papa.parse<string[]>(csv,{skipEmptyLines:'greedy'})
  if (parsed.errors.length || parsed.data.length>100) throw new RangeError('Supply complete Parameter,Value rows, up to 100.')
  const values=new Map<string,string>()
  for (const row of parsed.data) {
    if (row.length!==2) throw new RangeError('Each definition row needs one parameter and one value.')
    const key=row[0].trim(),value=row[1].trim()
    if (key.toLowerCase()==='parameter' && value.toLowerCase()==='value') continue
    if (values.has(key)) throw new RangeError('Duplicate parameter: '+key)
    values.set(key,value)
  }
  const result: Partial<PileGridDefinition>={}
  const strings: Record<string,'name'|'startLabel'|'coordinateSystem'>={'Name':'name','Start Label':'startLabel','Coordinate System':'coordinateSystem'}
  const numbers: Record<string,'originEasting'|'originNorthing'|'originRL'|'rows'|'columns'|'rowSpacing'|'columnSpacing'|'rotation'|'pileDiameter'|'depth'>={
    'Origin E':'originEasting','Origin N':'originNorthing','Origin RL':'originRL','Rows':'rows','Columns':'columns','Row Spacing':'rowSpacing','Column Spacing':'columnSpacing','Rotation':'rotation','Pile Diameter':'pileDiameter','Depth':'depth'}
  for (const [key,value] of values) {
    if (strings[key]) result[strings[key]]=value
    else if (numbers[key]) {
      if (key==='Origin RL' && !value) { result.originRL=null; continue }
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new RangeError(key+': supply a complete finite decimal.')
      const n=Number(value)
      if ((key==='Rows'||key==='Columns') && (!Number.isInteger(n)||n<1)) throw new RangeError(key+': supply a positive whole number.')
      result[numbers[key]]=n
    } else if (key==='Label Rows As'||key==='Label Columns As') {
      const mode=value.toLowerCase()
      if (mode!=='alpha' && mode!=='numeric') throw new RangeError('Label format must be alpha or numeric.')
      if (key==='Label Rows As') result.labelRowsAs=mode; else result.labelColumnsAs=mode
    } else if (key==='Pile Type') {
      const kind=value.toLowerCase()
      if (!['pile','column','pier','abutment'].includes(kind)) throw new RangeError('Select a supported element type.')
      result.pileType=kind as PileGridDefinition['pileType']
    } else throw new RangeError('Unsupported grid parameter: '+key)
  }
  return result
}

function checkedGrid(result: PileGridResult): PileGridResult {
  const fresh=generatePileGrid(result.definition)
  if (JSON.stringify(fresh)!==JSON.stringify(result)) throw new RangeError('Grid result is stale; regenerate from current design inputs.')
  if (assertProjectedCrs(fresh.definition.coordinateSystem).units!=='metres') throw new RangeError('Declare a projected metre CRS before exporting design targets.')
  return fresh
}
export function pileGridToCSV(result: PileGridResult, heightReference?: string | null): string {
  const fresh=checkedGrid(result)
  return engineeringScheduleCsv(['Label','Row','Column','Easting','Northing','Design RL','Grid Offset E','Grid Offset N','Declared_CRS','Declared_height_reference','Issue_status'],
    fresh.piles.map(p=>[p.label,p.row,p.column,p.easting,p.northing,p.designRL,p.gridOffsetE,p.gridOffsetN,fresh.definition.coordinateSystem,heightReference,'DRAFT']))
}

// ─── DXF GENERATION ───────────────────────────────────────────────────────────

/**
 * Generate a raw DXF text string for the pile grid setting-out drawing.
 *
 * Layers:
 *   SETOUT_POINTS  - pile positions (POINT entities)
 *   ANNOTATIONS    - pile labels (TEXT entities)
 *   BORDER         - grid outline (LINE entities)
 *   GRID           - internal grid lines (LINE entities, dashed)
 *   PILE_CIRCLE    - pile diameter circles (CIRCLE entities)
 */
export function generatePileGridDXF(result: PileGridResult, heightReference?: string | null): string {
  const {definition:def,piles,boundingBox}=checkedGrid(result)
  const hasHeight=!!heightReference?.trim() && def.originRL!=null
  const z=hasHeight ? def.originRL as number : 0
  const theta=normalizeBearing(def.rotation)*Math.PI/180,cosT=Math.cos(theta),sinT=Math.sin(theta)
  const rotate=(e:number,n:number)=>({e:e*cosT+n*sinT+def.originEasting,n:-e*sinT+n*cosT+def.originNorthing})
  const width=(def.columns-1)*def.columnSpacing,height=(def.rows-1)*def.rowSpacing
  let dxf=''
  const pair=(code:number,value:string|number)=>{ dxf+=String(code)+'\n'+String(value)+'\n' }
  const safe=(text:string)=>text.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').slice(0,500)
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1015');pair(9,'$INSUNITS');pair(70,6);pair(9,'$MEASUREMENT');pair(70,1)
  pair(9,'$EXTMIN');pair(10,boundingBox.minE);pair(20,boundingBox.minN);pair(30,z)
  pair(9,'$EXTMAX');pair(10,boundingBox.maxE);pair(20,boundingBox.maxN);pair(30,z);pair(0,'ENDSEC')
  pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LTYPE');pair(70,1)
  pair(0,'LTYPE');pair(2,'CONTINUOUS');pair(70,0);pair(3,'Solid');pair(72,65);pair(73,0);pair(40,0);pair(0,'ENDTAB')
  const layers=['SETOUT_POINTS','ANNOTATIONS','BORDER','GRID','PILE_CIRCLE','DRAFT_REFERENCE']
  pair(0,'TABLE');pair(2,'LAYER');pair(70,layers.length)
  for (const layer of layers) { pair(0,'LAYER');pair(2,layer);pair(70,0);pair(62,7);pair(6,'CONTINUOUS') }
  pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES')
  const point=(p:{e:number;n:number},end=false)=>{pair(end?11:10,p.e);pair(end?21:20,p.n);if(hasHeight)pair(end?31:30,z)}
  const line=(layer:string,a:{e:number;n:number},b:{e:number;n:number})=>{pair(0,'LINE');pair(8,layer);point(a);point(b,true)}
  const corners=[rotate(0,0),rotate(width,0),rotate(width,height),rotate(0,height)]
  for(let i=0;i<4;i++) if (width>0 && height>0) line('BORDER',corners[i],corners[(i+1)%4])
  for(let row=0;row<def.rows;row++) if(width>0) line('GRID',rotate(0,row*def.rowSpacing),rotate(width,row*def.rowSpacing))
  for(let col=0;col<def.columns;col++) if(height>0) line('GRID',rotate(col*def.columnSpacing,0),rotate(col*def.columnSpacing,height))
  const textHeight=Math.max(Math.min(def.rowSpacing,def.columnSpacing)*0.12,0.01)
  for (const p of piles) {
    const pxy={e:p.easting,n:p.northing}
    pair(0,'POINT');pair(8,'SETOUT_POINTS');point(pxy)
    if (def.pileDiameter!=null) {pair(0,'CIRCLE');pair(8,'PILE_CIRCLE');point(pxy);pair(40,def.pileDiameter/2000)}
    pair(0,'TEXT');pair(8,'ANNOTATIONS');point({e:p.easting+textHeight,n:p.northing+textHeight});pair(40,textHeight);pair(1,safe(p.label))
  }
  const notes=['DRAFT - DESIGN TARGETS; FIELD CONTROL AND APPROVED REVISION REQUIRED',
    'Declared projected CRS: '+def.coordinateSystem+'; metre units',
    hasHeight ? 'Design RL height reference: '+safe(heightReference as string) : '2D PLAN ONLY - NO DESIGN OR SURVEYED Z ENCODED; HEIGHT REFERENCE NOT USED']
  notes.forEach((note,i)=>{pair(0,'TEXT');pair(8,'DRAFT_REFERENCE');point({e:boundingBox.minE,n:boundingBox.minN-(i+2)*textHeight*1.6});pair(40,textHeight);pair(1,note)})
  pair(0,'ENDSEC');pair(0,'EOF');return dxf
}
