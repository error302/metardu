import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import StandaloneCADEditorPage from '@/app/tools/cad-editor/page'
import type { CADDocument } from '@/components/cad-editor/CADEditor'

// Exercise the actual editor; only Next's lazy-loading boundary is synchronous.
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => require('@/components/cad-editor/CADEditor').default }))

const originalFetch = global.fetch
let storedProject: { adjustedStations: unknown[]; cadDocument?: unknown }

beforeEach(() => {
  localStorage.clear()
  storedProject = { adjustedStations: [{ pointName: 'CONTROL', adjustedEasting: 0, adjustedNorthing: 321.125, rawObservation: 'retained evidence' }] }
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/projects?limit=50') return { ok: true, status: 200, json: async () => ({ data: [{ id: 'owned-project', name: 'Real survey' }] }) } as Response
    if (url === '/api/project/owned-project/cad-document' && options?.method === 'PUT') {
      storedProject.cadDocument = JSON.parse(options.body as string).document
      return { ok: true, status: 200, json: async () => ({ saved: true }) } as Response
    }
    throw new Error(`Unexpected network write/read: ${String(url)}`)
  })
  jest.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks() })

function identityCanvas() {
  const canvas = screen.getByLabelText('CAD drawing canvas') as unknown as SVGSVGElement
  Object.defineProperty(canvas, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  Object.defineProperty(canvas, 'createSVGPoint', { value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } }) })
  Object.defineProperty(canvas, 'setPointerCapture', { value: () => {} })
  Object.defineProperty(canvas, 'hasPointerCapture', { value: () => false })
  Object.defineProperty(canvas, 'releasePointerCapture', { value: () => {} })
  return canvas
}

const originalPointerEvent = window.PointerEvent
beforeAll(() => {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true, writable: true })
})
afterAll(() => Object.defineProperty(window, 'PointerEvent', { value: originalPointerEvent, configurable: true, writable: true }))

async function gridDrawing(patch: Partial<CADDocument> = {}) {
  localStorage.setItem('metardu-standalone-cad', JSON.stringify({
    width:1122,height:794,metersPerPixel:1,originEasting:0,originNorthing:0,coordinateReferenceSystem:'EPSG:32636',
    beacons:[{id:'control',label:'CONTROL',x:100,y:100,easting:100,northing:694}],boundaries:[],annotations:[],
    northArrow:{x:1012,y:90,rotation:0,type:'grid',bearing:'0'},scaleBar:{x:70,y:744,scaleMeters:50},
    titleBlock:{projectName:'Synthetic gesture test',lrNumber:'',surveyor:'',regNo:'',date:'',scale:'Draft',sheet:'1 of 1'},
    ...patch,
  }))
  render(<StandaloneCADEditorPage />)
  const label = await screen.findByText('CONTROL', { selector: 'text' })
  const entity = label.closest('g')
  if (!entity) throw new Error('Control beacon group missing')
  return { canvas: identityCanvas(), entity }
}

async function addExplicitBeacon() {
  const command = await screen.findByPlaceholderText(/Command: Type L/)
  fireEvent.change(command, { target: { value: 'PT 250010 9800100 REAL1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
  await screen.findByText('REAL1', { selector: 'text' })
}

test('standalone edits reach the local draft instead of silently disappearing on reload', async () => {
  const page = render(<StandaloneCADEditorPage />)
  await addExplicitBeacon()
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
    expect(saved.beacons).toEqual([expect.objectContaining({ label: 'REAL1', easting: 250010, northing: 9800100 })])
  })
  page.unmount()
  render(<StandaloneCADEditorPage />)
  expect(await screen.findByText('REAL1', { selector: 'text' })).toBeVisible()
})

test('attaches the current drawing as an artifact while preserving independent adjusted stations', async () => {
  render(<StandaloneCADEditorPage />)
  await addExplicitBeacon()
  fireEvent.click(screen.getByRole('button', { name: 'Save to Project' }))
  await screen.findByRole('option', { name: 'Real survey' })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Sync' }))
  await waitFor(() => expect(storedProject.cadDocument).toEqual(expect.objectContaining({ beacons: [expect.objectContaining({ label: 'REAL1', easting: 250010, northing: 9800100 })] })))
  expect(storedProject.adjustedStations).toEqual([{ pointName: 'CONTROL', adjustedEasting: 0, adjustedNorthing: 321.125, rawObservation: 'retained evidence' }])
})

test('a new blank sheet has no invented metric scale or map origin', async () => {
  render(<StandaloneCADEditorPage />)
  await screen.findByRole('button', { name: 'Beacon Schedule (0)' })
  expect(screen.getByText('Uncalibrated')).toBeVisible()
  expect(screen.queryByText('SCALE BAR:', { exact: false })).not.toBeInTheDocument()
})

test('project-list authorization failure is visible rather than described as an empty workspace', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }) as Response)
  render(<StandaloneCADEditorPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save to Project' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/sign in/i)
  expect(screen.queryByText(/No existing projects found/)).not.toBeInTheDocument()
})

test('mobile properties can open and close without owning a permanent slice of the drawing', async () => {
  render(<StandaloneCADEditorPage />)
  const button = await screen.findByRole('button', { name: 'Properties' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Close properties' }))
  expect(button).toHaveAttribute('aria-expanded', 'false')
})

test('switching ORTHO while drawing updates the active line constraint immediately', async () => {
  render(<StandaloneCADEditorPage />)
  await screen.findByRole('button', { name: 'Draw Boundary (L)' })
  const canvas = screen.getByLabelText('CAD drawing canvas') as unknown as SVGSVGElement
  // JSDOM has no SVG geometry: this viewport has a hand-defined identity transform.
  Object.defineProperty(canvas, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  Object.defineProperty(canvas, 'createSVGPoint', { value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } }) })
  fireEvent.click(screen.getByRole('button', { name: 'Draw Boundary (L)' }))
  fireEvent.pointerDown(canvas, { clientX: 110, clientY: 100, pointerId:1, pointerType:'mouse', isPrimary:true, button:0 })
  fireEvent.pointerUp(canvas, { pointerId:1, pointerType:'mouse', isPrimary:true })
  fireEvent.click(screen.getByRole('button', { name: 'ORTHO' }))
  fireEvent.pointerMove(canvas, { clientX: 180, clientY: 120, pointerId:1, pointerType:'mouse', isPrimary:true })
  const preview = canvas.querySelector('line[stroke-dasharray="4 4"]')
  expect(preview).toHaveAttribute('x2', '180')
  expect(preview).toHaveAttribute('y2', '100')
})

test('rejects a CAD file with broken boundary references without replacing the current draft', async () => {
  const page = render(<StandaloneCADEditorPage />)
  await addExplicitBeacon()
  const original = localStorage.getItem('metardu-standalone-cad')!
  const invalid = { ...JSON.parse(original), titleBlock: { ...JSON.parse(original).titleBlock, projectName: 'INVALID IMPORT' }, boundaries: [{ id: 'bad', fromId: 'missing-a', toId: 'missing-b', bearing: '0', distance: '0', type: 'standard' }] }
  const input = page.container.querySelector('input[accept=".json,.metardu-cad"]')!
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(invalid)], 'invalid.metardu-cad', { type: 'application/json' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i)
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(original)
  expect(screen.getByText('REAL1', { selector: 'text' })).toBeVisible()
})

test('export opens as an actionable menu without hover and closes on Escape', async () => {
  render(<StandaloneCADEditorPage />)
  const button = await screen.findByRole('button', { name: 'Export' })
  fireEvent.keyDown(button, { key: 'ArrowDown', code: 'ArrowDown' })
  const menu = await screen.findByRole('menu')
  expect(screen.getByRole('menuitem', { name: 'Open CAD File...' })).toBeVisible()
  fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  await waitFor(() => expect(button).toHaveFocus())
})

test('Pan View starting over a control point moves the view without moving survey coordinates', async () => {
  const {canvas,entity} = await gridDrawing()
  const before = localStorage.getItem('metardu-standalone-cad')
  fireEvent.click(screen.getByRole('button',{name:'Pan View'}))
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,button:0,pointerId:1,pointerType:'mouse',isPrimary:true})
  fireEvent.pointerMove(canvas,{clientX:140,clientY:120,pointerId:1,pointerType:'mouse',isPrimary:true})
  fireEvent.pointerUp(canvas,{clientX:140,clientY:120,pointerId:1,pointerType:'mouse',isPrimary:true})
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
  expect(canvas.style.transform).toContain('translate(40px, 20px)')
})

test('a touch drag commits full-precision canvas and grid coordinates only when released', async () => {
  const {canvas,entity} = await gridDrawing()
  const before = localStorage.getItem('metardu-standalone-cad')
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:7,pointerType:'touch',isPrimary:true,button:0})
  fireEvent.pointerMove(canvas,{clientX:130.031,clientY:120.027,pointerId:7,pointerType:'touch',isPrimary:true})
  expect(entity).toHaveAttribute('transform','translate(130.031, 120.027)')
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
  fireEvent.pointerUp(canvas,{clientX:130.031,clientY:120.027,pointerId:7,pointerType:'touch',isPrimary:true})
  await waitFor(()=>{
    const saved=JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
    expect(saved.beacons[0].easting).toBeCloseTo(130.031,10)
    expect(saved.beacons[0].northing).toBeCloseTo(673.973,10)
  })
})

test('a cancelled drag restores the drawing and does not enter undo history',async()=>{
  const {canvas,entity}=await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:7,pointerType:'touch',isPrimary:true,button:0})
  fireEvent.pointerMove(canvas,{clientX:140,clientY:120,pointerId:7,pointerType:'touch',isPrimary:true})
  expect(entity).toHaveAttribute('transform','translate(140, 120)')
  fireEvent.pointerCancel(canvas,{pointerId:7,pointerType:'touch',isPrimary:true})
  expect(entity).toHaveAttribute('transform','translate(100, 100)')
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
  expect(screen.getByRole('button',{name:'Undo (Ctrl+Z)'})).toBeDisabled()
})

test('a valid CAD file imports zero grid coordinates and survives reload', async()=>{
  await gridDrawing()
  const valid=JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
  valid.beacons=[{id:'zero',label:'ZERO',x:0,y:794,easting:0,northing:0}]
  fireEvent.change(screen.getByLabelText('Open CAD file'),{target:{files:[new File([JSON.stringify(valid)],'zero.metardu-cad')]}})
  await screen.findByText('ZERO', { selector: 'text' })
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[0]).toMatchObject({easting:0,northing:0}))
  cleanup()
  render(<StandaloneCADEditorPage />)
  expect(await screen.findByText('ZERO', { selector: 'text' })).toBeVisible()
})

test('an oversized CAD file is rejected without overwriting the local draft',async()=>{
  await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  const file=new File([' '.repeat(8*1024*1024+1)],'oversized.metardu-cad')
  fireEvent.change(screen.getByLabelText('Open CAD file'),{target:{files:[file]}})
  expect(await screen.findByRole('alert')).toHaveTextContent(/8 MiB/)
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
})

test('a second touch cannot take over or finish the active drag',async()=>{
  const {canvas,entity}=await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:7,pointerType:'touch',isPrimary:true,button:0})
  fireEvent.pointerDown(entity,{clientX:500,clientY:400,pointerId:8,pointerType:'touch',isPrimary:false,button:0})
  fireEvent.pointerMove(canvas,{clientX:700,clientY:500,pointerId:8,pointerType:'touch',isPrimary:false})
  fireEvent.pointerUp(canvas,{pointerId:8,pointerType:'touch',isPrimary:false})
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
  fireEvent.pointerMove(canvas,{clientX:130,clientY:120,pointerId:7,pointerType:'touch',isPrimary:true})
  fireEvent.pointerUp(canvas,{pointerId:7,pointerType:'touch',isPrimary:true})
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[0]).toMatchObject({x:130,y:120,easting:130,northing:674}))
})

test('unexpected pointer capture loss rolls back a preview without saving it',async()=>{
  const {canvas,entity}=await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:7,pointerType:'pen',isPrimary:true,button:0})
  fireEvent.pointerMove(canvas,{clientX:140,clientY:120,pointerId:7,pointerType:'pen',isPrimary:true})
  expect(entity).toHaveAttribute('transform','translate(140, 120)')
  fireEvent(canvas,new window.PointerEvent('lostpointercapture',{pointerId:7,pointerType:'pen',isPrimary:true,bubbles:true}))
  expect(entity).toHaveAttribute('transform','translate(100, 100)')
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
  expect(screen.getByRole('button',{name:'Undo (Ctrl+Z)'})).toBeDisabled()
})

test('planting a beacon keeps its drawn position consistent with its grid coordinate at subpixel precision',async()=>{
  const {canvas}=await gridDrawing()
  fireEvent.click(screen.getByRole('button',{name:'Plant Beacon (B)'}))
  fireEvent.pointerDown(canvas,{clientX:130.031,clientY:120.027,pointerId:7,pointerType:'touch',isPrimary:true,button:0})
  fireEvent.pointerUp(canvas,{pointerId:7,pointerType:'touch',isPrimary:true})
  await waitFor(()=>{
    const point=JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[1]
    expect(point.x).toBeCloseTo(130.031,10)
    expect(point.y).toBeCloseTo(120.027,10)
    expect(point.easting).toBeCloseTo(130.031,10)
    expect(point.northing).toBeCloseTo(673.973,10)
  })
})

test('editing a grid coordinate preserves its full-precision drawing position',async()=>{
  const {canvas,entity}=await gridDrawing()
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:1,pointerType:'mouse',isPrimary:true,button:0})
  fireEvent.pointerUp(canvas,{pointerId:1,pointerType:'mouse',isPrimary:true})
  const easting=screen.getByPlaceholderText('Easting')
  fireEvent.change(easting,{target:{value:'130.031'}})
  fireEvent.blur(easting)
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[0]).toMatchObject({x:130.031,easting:130.031,y:100,northing:694}))
})

test('invalid coordinate text cannot partially overwrite an existing control point',async()=>{
  const {canvas,entity}=await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  fireEvent.pointerDown(entity,{clientX:100,clientY:100,pointerId:1,pointerType:'mouse',isPrimary:true,button:0})
  fireEvent.pointerUp(canvas,{pointerId:1,pointerType:'mouse',isPrimary:true})
  const easting=screen.getByPlaceholderText('Easting')
  fireEvent.change(easting,{target:{value:'130.031oops'}})
  fireEvent.blur(easting)
  expect(await screen.findByRole('alert')).toHaveTextContent(/coordinate/i)
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
})

test('coordinate commands accept signed scientific notation and keep zero northing',async()=>{
  await gridDrawing()
  fireEvent.change(screen.getByPlaceholderText(/Command: Type L/),{target:{value:'PT -2.0125e1 0 NEGATIVE'}})
  fireEvent.click(screen.getByRole('button',{name:'Enter'}))
  await screen.findByText('NEGATIVE', { selector: 'text' })
  expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[1]).toMatchObject({x:-20.125,y:794,easting:-20.125,northing:0})
})

test('malformed decimal commands do not create a beacon from their numeric prefix',async()=>{
  await gridDrawing()
  const before=localStorage.getItem('metardu-standalone-cad')
  fireEvent.change(screen.getByPlaceholderText(/Command: Type L/),{target:{value:'PT 130..031 674 BAD'}})
  fireEvent.click(screen.getByRole('button',{name:'Enter'}))
  expect(await screen.findByRole('alert')).toHaveTextContent(/coordinate/i)
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
})

test('calibrating a raster in a referenced drawing preserves its grid frame and control coordinates',async()=>{
  const {canvas}=await gridDrawing({backgroundImage:{id:'raster',url:'data:image/png;base64,AA==',name:'Synthetic raster',x:20,y:20,width:400,height:300,opacity:0.5,rotation:0,locked:false,visible:true}})
  fireEvent.click(screen.getByRole('button',{name:'Calibrate Image Scale'}))
  for(const [x,y] of [[50,50],[150,50]]) {
    fireEvent.pointerDown(canvas,{clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,button:0})
    fireEvent.pointerUp(canvas,{pointerId:1,pointerType:'mouse',isPrimary:true})
  }
  fireEvent.change(screen.getByPlaceholderText('e.g. 50.0'),{target:{value:'50'}})
  fireEvent.click(screen.getByRole('button',{name:'Apply Scale'}))
  await waitFor(()=>{
    const saved=JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
    expect(saved.metersPerPixel).toBe(1)
    expect(saved.beacons[0]).toMatchObject({x:100,y:100,easting:100,northing:694})
    expect(saved.backgroundImage).toMatchObject({x:35,y:35,width:200,height:150})
  })
})

test('coordinate reference settings preserve known controls through a scale change, undo and reload', async () => {
  const page = await gridDrawing({ beacons: [
    { id: 'control', label: 'CONTROL', x: 100, y: 100, easting: 100, northing: 694 },
    { id: 'other', label: 'OTHER', x: 200, y: 100, easting: 200, northing: 694 },
  ] })
  fireEvent.click(screen.getByText('Coordinate reference', { selector: 'summary' }))
  fireEvent.change(screen.getByLabelText('Metres per canvas unit'), { target: { value: '0.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply reference' }))
  await waitFor(() => {
    const doc = JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
    expect(doc.beacons[1]).toMatchObject({ x: 300, y: 100, easting: 200, northing: 694 })
    expect(doc.metersPerPixel).toBe(0.5)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').metersPerPixel).toBe(1))
  fireEvent.click(screen.getByRole('button', { name: 'Redo (Ctrl+Y)' }))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}').beacons[1].x).toBe(300))
  expect(page.canvas).toBeInTheDocument()
  cleanup()
  render(<StandaloneCADEditorPage />)
  await screen.findByText('OTHER', { selector: 'text' })
  expect(screen.getByLabelText('Metres per canvas unit')).toHaveValue('0.5')
})

test('the reference form rejects display-only CRS without changing the local draft', async () => {
  await gridDrawing()
  const before = localStorage.getItem('metardu-standalone-cad')
  fireEvent.click(screen.getByText('Coordinate reference', { selector: 'summary' }))
  fireEvent.change(screen.getByLabelText('Project CRS code'), { target: { value: 'EPSG:3857' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply reference' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/display|survey/i)
  expect(localStorage.getItem('metardu-standalone-cad')).toBe(before)
})

test('a supplied standalone point can be referenced explicitly without inventing a default CRS', async () => {
  render(<StandaloneCADEditorPage />)
  await addExplicitBeacon()
  fireEvent.click(screen.getByText('Coordinate reference', { selector: 'summary' }))
  expect(screen.getByLabelText('Project CRS code')).toHaveValue('')
  expect(screen.getByLabelText('Anchor Easting (m)')).toHaveValue('250010')
  const staged=JSON.parse(localStorage.getItem('metardu-standalone-cad')||'{}') as CADDocument
  expect(staged.originEasting).toBeUndefined()
  expect(staged.originNorthing).toBeUndefined()
  expect(staged.metersPerPixel).toBeUndefined()
  fireEvent.change(screen.getByLabelText('Project CRS code'), { target: { value: 'EPSG:32636' } })
  fireEvent.change(screen.getByLabelText('Metres per canvas unit'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply reference' }))
  await waitFor(() => {
    const doc = JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}')
    expect(doc.coordinateReferenceSystem).toBe('EPSG:32636')
    expect(doc.beacons[0]).toMatchObject({ easting: 250010, northing: 9800100 })
    expect(Number.isFinite(doc.originEasting)).toBe(true)
  })
})

test('dragging a saved line annotation translates both endpoints and preserves its length', async () => {
  const { canvas } = await gridDrawing({ annotations: [{ id: 'line', type: 'line', x: 100, y: 200, x2: 200, y2: 200 }] })
  const line = canvas.querySelector('g[transform="translate(100, 200)"] line')
  if (!line) throw new Error('Saved line annotation was not drawn')
  fireEvent.pointerDown(line, { clientX: 150, clientY: 200, pointerId: 1, button: 0, isPrimary: true })
  fireEvent.pointerMove(canvas, { clientX: 180.031, clientY: 220.125, pointerId: 1, button: 0, isPrimary: true })
  fireEvent.pointerUp(canvas, { pointerId: 1, isPrimary: true })
  await waitFor(() => {
    const doc = JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}') as CADDocument
    expect(doc.annotations[0].x).toBeCloseTo(130.031, 10)
    expect(doc.annotations[0].y).toBeCloseTo(220.125, 10)
    expect(doc.annotations[0].x2).toBeCloseTo(230.031, 10)
    expect(doc.annotations[0].y2).toBeCloseTo(220.125, 10)
  })
})

test('moving an unreferenced layout preserves supplied point coordinates rather than deleting them', async () => {
  const { canvas, entity } = await gridDrawing({ metersPerPixel: undefined, originEasting: undefined, originNorthing: undefined, coordinateReferenceSystem: undefined })
  fireEvent.pointerDown(entity, { clientX: 100, clientY: 100, pointerId: 1, button: 0, isPrimary: true })
  fireEvent.pointerMove(canvas, { clientX: 130.031, clientY: 120.125, pointerId: 1, button: 0, isPrimary: true })
  fireEvent.pointerUp(canvas, { pointerId: 1, isPrimary: true })
  await waitFor(() => {
    const doc = JSON.parse(localStorage.getItem('metardu-standalone-cad') || '{}') as CADDocument
    expect(doc.beacons[0]).toMatchObject({ easting: 100, northing: 694 })
    expect(doc.beacons[0].x).toBeCloseTo(130.031, 10)
    expect(doc.coordinateReferenceSystem).toBeUndefined()
  })
})
