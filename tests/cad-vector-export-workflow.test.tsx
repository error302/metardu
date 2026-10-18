/* eslint-disable no-restricted-syntax -- Explicit synthetic CRS fixtures, never production defaults. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CADEditor from '@/components/cad-editor/CADEditor'
import { exportDrawing } from './fixtures/cad-export-document'
import Papa from 'papaparse'

const originalUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:synthetic-export') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  jest.restoreAllMocks()
  if (originalUrl) Object.defineProperty(URL, 'createObjectURL', originalUrl); else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke); else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

function canvas() {
  const svg = screen.getByLabelText('CAD drawing canvas') as unknown as SVGSVGElement
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  Object.defineProperty(svg, 'createSVGPoint', { value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } }) })
  return svg
}

test('the editor displays saved line annotations instead of dropping their geometry', () => {
  render(<CADEditor initialDocument={exportDrawing()} />)
  const line = canvas().querySelector('g[transform="translate(100, 200)"] line')
  expect(line).not.toBeNull()
  expect(line).toHaveAttribute('x2', '100')
  expect(line).toHaveAttribute('y2', '0')
})

test('beacon labels clear an incident horizontal boundary rather than crossing its stroke', () => {
  render(<CADEditor initialDocument={exportDrawing()} />)
  const label = canvas().querySelector('g[transform="translate(100, 100)"] > text')
  expect(label).not.toBeNull()
  expect(Number(label?.getAttribute('y')) - Number(label?.getAttribute('font-size'))).toBeGreaterThan(1.5)
})

test('editor measurements include both adjacent closed faces and derive unique linework length from endpoints', async () => {
  const doc = exportDrawing()
  doc.metersPerPixel = 1; doc.originNorthing = 0
  doc.beacons = [['a',100,100],['b',200,100],['c',200,200],['d',100,200],['e',300,100],['f',300,200]].map(([id,x,y]) => ({id:String(id),label:String(id),x:Number(x),y:Number(y),easting:500000+Number(x),northing:794-Number(y)}))
  doc.boundaries = [['a','b'],['b','c'],['c','d'],['d','a'],['b','e'],['e','f'],['f','c']].map(([fromId,toId],i)=>({id:`edge-${i}`,fromId,toId,type:'standard',bearing:'0°',distance:'1.000',distanceM:1}))
  render(<CADEditor initialDocument={doc} />)
  await waitFor(() => expect(screen.getByText('Area (m²):').parentElement).toHaveTextContent('20000.00'))
  expect(screen.getByText(/Perimeter:|Linework length:/).parentElement).toHaveTextContent('700.00')
})

test('near-north bearing rounding carries seconds into zero degrees instead of displaying sixty seconds', async () => {
  const doc = exportDrawing()
  doc.beacons=[{id:'a',label:'A',x:100,y:600,easting:500050,northing:-250},{id:'b',label:'B',x:99.99903037265,y:100,easting:500049.9995151863,northing:0}]
  doc.boundaries=[]
  render(<CADEditor initialDocument={doc} />)
  const svg=canvas()
  fireEvent.click(screen.getByRole('button',{name:'Draw Boundary (L)'}))
  for (const [clientX,clientY] of [[100,600],[99.99903037265,100]]) {
    const event=new Event('pointerdown',{bubbles:true});Object.assign(event,{button:0,pointerId:1,isPrimary:true,clientX,clientY});fireEvent(svg,event)
    const up=new Event('pointerup',{bubbles:true});Object.assign(up,{pointerId:1,isPrimary:true});fireEvent(svg,up)
  }
  await waitFor(() => expect(svg.textContent).toContain('0°00\'00" 250.000m'))
  expect(svg.textContent).not.toContain('59\'60"')
})

test('SVG export omits the active line preview and includes coordinate-derived labels and reference metadata', async () => {
  const exported = jest.fn((_svg:string)=>{})
  render(<CADEditor initialDocument={exportDrawing()} onExportSVG={exported} />)
  const svg = canvas()
  fireEvent.click(screen.getByRole('button', { name: 'Draw Boundary (L)' }))
  // The test host has no native PointerEvent. Supply the fields used by the actual controller.
  const down = new Event('pointerdown', { bubbles: true })
  Object.assign(down, { button: 0, pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 })
  fireEvent(svg, down)
  expect(svg.querySelector('line[stroke="#2563eb"]')).not.toBeNull()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Vector SVG (.svg)' }))
  expect(exported).toHaveBeenCalledTimes(1)
  const result = new DOMParser().parseFromString(exported.mock.calls[0][0] as string, 'image/svg+xml')
  expect(result.querySelector('parsererror')).toBeNull()
  expect(result.querySelector('line[stroke="#2563eb"]')).toBeNull()
  expect(result.documentElement.textContent).toContain('100.000m')
  expect(result.documentElement.textContent).toContain('EPSG:32636')
  expect(result.documentElement.textContent).toContain('DRAFT — NOT CERTIFIED')
  expect(svg.querySelector('line[stroke="#2563eb"]')).not.toBeNull()
})

test('DXF export exposes reference errors and does not download inconsistent control geometry', async () => {
  const doc = exportDrawing()
  doc.beacons[0].x = 101
  render(<CADEditor initialDocument={doc} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'AutoCAD DXF (.dxf)' }))
  expect(screen.getByRole('alert',{name:'Export error'})).toHaveTextContent(/reference|align/i)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

test('CSV round-trips quoted point names, retains signed numbers and declares its coordinate reference', async () => {
  const doc = exportDrawing()
  doc.beacons[0].label = 'CP,"01"\nsecond line'
  doc.beacons[1].northing = -1.25
  doc.beacons[1].y = 102.5
  render(<CADEditor initialDocument={doc} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Coordinate Schedule (.csv)' }))
  const blob = (URL.createObjectURL as jest.MockedFunction<typeof URL.createObjectURL>).mock.calls[0][0] as Blob
  const csv = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob)
  })
  const result = Papa.parse<Record<string, string>>(csv, { header: true })
  expect(result.errors).toEqual([])
  expect(result.data[0]).toMatchObject({ Beacon: 'CP,"01"\nsecond line', Easting: '500050.000', Northing: '0.000', CRS: 'EPSG:32636', Units: 'metres', Reference: 'Declared grid (draft)' })
  expect(result.data[1].Northing).toBe('-1.250')
})

test('CSV neutralizes formula-like text without changing stored point identifiers', async () => {
  const doc = exportDrawing()
  doc.beacons[0].label = '=HYPERLINK("https://example.invalid")'
  render(<CADEditor initialDocument={doc} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Coordinate Schedule (.csv)' }))
  const blob = (URL.createObjectURL as jest.MockedFunction<typeof URL.createObjectURL>).mock.calls[0][0] as Blob
  const csv = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob) })
  expect(Papa.parse<Record<string, string>>(csv, { header: true }).data[0].Beacon).toBe('\t=HYPERLINK("https://example.invalid")')
  expect(doc.beacons[0].label).toBe('=HYPERLINK("https://example.invalid")')
})
test('touch zoom controls are labelled and fit drawing uses the same extents operation as the command',()=>{
  render(<CADEditor initialDocument={exportDrawing()} />)
  fireEvent.click(screen.getByRole('button',{name:'Zoom in'}))
  expect(screen.getByLabelText('Drawing zoom')).toHaveTextContent('110%')
  fireEvent.click(screen.getByRole('button',{name:'Zoom out'}))
  expect(screen.getByLabelText('Drawing zoom')).toHaveTextContent('100%')
  fireEvent.click(screen.getByRole('button',{name:'Fit drawing'}))
  expect(screen.getByRole('textbox',{name:'CAD command'})).toHaveAttribute('placeholder',expect.stringContaining('ZOOM EXTENTS'))
  expect(screen.getByRole('button',{name:'Toggle object snapping'})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByRole('button',{name:'Toggle object snapping'}))
  expect(screen.getByRole('button',{name:'Toggle object snapping'})).toHaveAttribute('aria-pressed','false')
})
test('SVG export includes geometry beyond the former sheet without exporting the camera or workspace grid',async()=>{
  const exported=jest.fn((_svg:string)=>{}),doc=exportDrawing({coordinateReferenceSystem:undefined,originEasting:undefined,originNorthing:undefined})
  doc.beacons.push({id:'offsheet',label:'OUTSIDE',x:-1500,y:2000})
  render(<CADEditor initialDocument={doc} onExportSVG={exported}/>)
  fireEvent.keyDown(screen.getByRole('button',{name:'Export'}),{key:'ArrowDown'})
  fireEvent.click(await screen.findByRole('menuitem',{name:'Vector SVG (.svg)'}))
  const result=new DOMParser().parseFromString(exported.mock.calls[0][0] as string,'image/svg+xml')
  const box=result.documentElement.getAttribute('viewBox');if(!box)throw new Error('Expected SVG model extents');const [x,y,w,h]=box.split(' ').map(Number)
  expect(x).toBeLessThan(-1500);expect(y+h).toBeGreaterThan(2000);expect(x+w).toBeGreaterThanOrEqual(1122)
  expect(result.querySelector('[fill="#ffffff"]')).not.toBeNull()
  expect(result.querySelector('[fill="url(#cad-grid)"]')).toBeNull()
  expect(result.documentElement.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
})
test('drawing controls collapse without replacing the canvas or changing document entities',()=>{
  const saved=jest.fn(),doc=exportDrawing()
  render(<CADEditor initialDocument={doc} isStandalone onSave={saved}/>)
  const drawing=screen.getByLabelText('CAD drawing canvas')
  fireEvent.click(screen.getByRole('button',{name:'Hide drawing tools'}))
  expect(screen.getByRole('button',{name:'Show drawing tools'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Show drawing tools'}))
  expect(screen.getByLabelText('CAD drawing canvas')).toBe(drawing)
  expect(saved).not.toHaveBeenCalled()
})
