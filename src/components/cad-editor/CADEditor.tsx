'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * METARDU CAD Editor — In-Browser Survey Plan & Map Digitizing Canvas
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Professional survey drafting and deed plan editor:
 * - Standalone or Project-Connected mode with seamless synchronization
 * - Scanned map / orthophoto / deed plan image attachment & 2-point scale calibration
 * - Interactive boundary drawing with real-time Whole Circle Bearings (WCB) & distances
 * - Beacon placing with UTM Easting/Northing coordination & lock/unlock
 * - Snap-to-beacon and orthogonal (90°) constraints
 * - Draggable cartographic elements (North Arrow, Scale Bar, Title Block)
 * - Built-in AutoCAD Command Line (CLI) for keyboard-first surveyors
 * - Instant export to DXF (AutoCAD), SVG, PDF, and CSV coordinate schedules
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  MousePointer2, Move, Type, Download,
  Undo2, Redo2, Trash2, Plus, Minus, Lock, Unlock, X,
  MapPin, PenTool, Image as ImageIcon, Ruler,
  Maximize2, Eye, EyeOff, Check, FolderOpen,
  Compass, Scaling
} from 'lucide-react'
import { generateCADDocumentDXF } from './cadDxfExport'
import { SubdivisionPlanModal } from './SubdivisionPlanModal'
import { cadCanvasToProject, projectToCadCanvas } from '@/lib/cad/projectCadDocument'
import { parseCadDocument, parseCadGridCoordinate } from '@/lib/cad/cadDocumentValidation'
import { calibrateCadScale, hasCadReferenceFrame, cadReferenceErrorMessage } from '@/lib/cad/cadReferenceFrame'
import { CadReferenceSettings } from './CadReferenceSettings'
import * as Dialog from '@radix-ui/react-dialog'
import { generateCadCoordinateCsv } from '@/lib/cad/cadCoordinateCsv'
import { generateCadDocumentSvg } from '@/lib/cad/cadSvgExport'
import { measureCadCanvasSegment } from '@/lib/cadGeometry'
import { useCadTopology } from '@/lib/cad/useCadTopology'
import type { CadTopologyInput } from '@/lib/cad/cadTopologyProtocol'
import { CadMeasurementsPanel } from './CadMeasurementsPanel'
import {cadViewport,fitCadGeometry,zoomCadAt,CAD_MIN_ZOOM,CAD_MAX_ZOOM} from '@/lib/cad/cadViewport'
import workspaceStyles from './CadWorkspace.module.css'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CADBeacon {
  id: string
  label: string
  x: number         // SVG coordinates
  y: number
  easting?: number  // real-world UTM (meters)
  northing?: number
  symbol?: string    // 'concrete_beacon' | 'iron_peg' | etc.
  locked?: boolean
}

export interface CADBoundary {
  id: string
  fromId: string
  toId: string
  bearing: string    // display text (e.g. "87°14'22\"")
  bearingDeg?: number
  distance: string   // display text (e.g. "124.83")
  distanceM?: number
  type: 'standard' | 'road' | 'water' | 'fence'
  roadLabel?: string
}

export interface CADAnnotation {
  id: string
  type: 'text' | 'line'
  x: number
  y: number
  text?: string
  fontSize?: number
  color?: string
  x2?: number
  y2?: number
}

export interface CADNorthArrow {
  x: number
  y: number
  rotation: number   // degrees
  type: 'grid' | 'true' | 'magnetic'
  bearing: string
}

export interface CADScaleBar {
  x: number
  y: number
  scaleMeters: number  // length of scale bar in real-world meters
}

export interface CADTitleBlock {
  projectName: string
  lrNumber: string
  surveyor: string
  regNo: string
  date: string
  scale: string
  sheet: string
}

export interface CADBackgroundImage {
  id: string
  url: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  opacity: number     // 0 to 1
  rotation: number    // degrees
  locked: boolean
  visible: boolean
}

export interface CADDocument {
  beacons: CADBeacon[]
  boundaries: CADBoundary[]
  annotations: CADAnnotation[]
  northArrow: CADNorthArrow
  scaleBar: CADScaleBar
  titleBlock: CADTitleBlock
  backgroundImage?: CADBackgroundImage | null
  width: number
  height: number
  metersPerPixel?: number // Real-world scale (e.g. 0.1 means 10px = 1m)
  originEasting?: number
  originNorthing?: number
  /** The explicitly registered project CRS; absent means coordinates are unreferenced. */
  coordinateReferenceSystem?: string
}

export type Tool =
  | 'select'
  | 'pan'
  | 'line'
  | 'beacon'
  | 'annotate-text'
  | 'measure'
  | 'calibrate'

type SelectedItem =
  | { type: 'beacon'; id: string }
  | { type: 'boundary'; id: string }
  | { type: 'annotation'; id: string }
  | { type: 'north'; id: string }
  | { type: 'scale'; id: string }
  | { type: 'image'; id: string }
  | null

export interface CADEditorProps {
  initialDocument: CADDocument
  projectName?: string
  projectId?: string
  isStandalone?: boolean
  onSave?: (doc: CADDocument) => void
  onExportSVG?: (svg: string) => void
  onExportPDF?: () => void
  onExportDXF?: () => void
  onAttachToProject?: () => void
}

function getProjectCoordinates(doc: CADDocument, x: number, y: number) {
  if (!hasCadReferenceFrame(doc)) return undefined
  const { metersPerPixel, originEasting, originNorthing } = doc
  if (
    typeof metersPerPixel !== 'number' || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0 ||
    typeof originEasting !== 'number' || !Number.isFinite(originEasting) ||
    typeof originNorthing !== 'number' || !Number.isFinite(originNorthing)
  ) return undefined
  return cadCanvasToProject(
    x,
    y,
    originEasting,
    originNorthing,
    doc.height,
    metersPerPixel,
  )
}

function isScaleKnown(doc: CADDocument): doc is CADDocument & { metersPerPixel: number } {
  return Number.isFinite(doc.metersPerPixel) && (doc.metersPerPixel ?? 0) > 0
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// ─── Standard Cadastral Beacon Glyphs (Survey of Kenya / Cap 299) ─────────
function BeaconGlyph({
  symbol,
  locked,
  isSelected,
  isSnapTarget,
}: {
  symbol?: string
  locked?: boolean
  isSelected?: boolean
  isSnapTarget?: boolean
}) {
  const strokeColor = locked ? '#94a3b8' : '#0f172a'
  const fillColor = '#ffffff'

  return (
    <g>
      {/* Selection Ring */}
      {isSelected && (
        <circle data-cad-editor-only="selection" r={14} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="3 2" />
      )}

      {/* Snap Ring Indicator */}
      {isSnapTarget && (
        <circle data-cad-editor-only="snap" r={12} fill="none" stroke="#06b6d4" strokeWidth={2} className="animate-pulse" />
      )}

      {/* Cadastral Symbol Variations */}
      {symbol === 'control_pillar' ? (
        // Triangulation / Geodetic Pillar (Triangle with central dot)
        <g>
          <polygon points="0,-7 6,4 -6,4" fill={fillColor} stroke={strokeColor} strokeWidth={1.4} />
          <circle cx={0} cy={1} r={1.5} fill={strokeColor} />
        </g>
      ) : symbol === 'iron_peg' ? (
        // Iron Peg in Concrete (Square with cross)
        <g>
          <rect x={-5} y={-5} width={10} height={10} fill={fillColor} stroke={strokeColor} strokeWidth={1.4} />
          <line x1={-3} y1={0} x2={3} y2={0} stroke={strokeColor} strokeWidth={1} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke={strokeColor} strokeWidth={1} />
        </g>
      ) : symbol === 'iron_pin' ? (
        // Iron Pin / Nail (Circle with crosshair)
        <g>
          <circle r={5} fill={fillColor} stroke={strokeColor} strokeWidth={1.4} />
          <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke={strokeColor} strokeWidth={1} />
          <line x1={0} y1={-3.5} x2={0} y2={3.5} stroke={strokeColor} strokeWidth={1} />
        </g>
      ) : symbol === 'natural_mark' ? (
        // Natural Mark / Rock / Tree (Diamond with dot)
        <g>
          <polygon points="0,-6 6,0 0,6 -6,0" fill={fillColor} stroke="#16a34a" strokeWidth={1.4} />
          <circle cx={0} cy={0} r={1.5} fill="#16a34a" />
        </g>
      ) : (
        // Standard Concrete Beacon (Concentric rings)
        <g>
          <circle r={5} fill={locked ? '#94a3b8' : '#0f172a'} stroke="#ffffff" strokeWidth={1.5} />
          <circle r={1.5} fill="#ffffff" />
        </g>
      )}
    </g>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CADEditor({
  initialDocument,
  projectName,
  isStandalone = false,
  onSave,
  onExportSVG,
  onExportPDF,
  onExportDXF,
  onAttachToProject,
}: CADEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef=useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)
  const cadReaderRef = useRef<FileReader | null>(null)
  const importGeneration = useRef(0)
  const [fileError, setFileError] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
  const [exportError, setExportError] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => () => {
    importGeneration.current++
    if (cadReaderRef.current?.readyState === FileReader.LOADING) cadReaderRef.current.abort()
  }, [])

  // Document state with undo/redo history
  const [doc, setDoc] = useState<CADDocument>(() => ({ ...initialDocument }))
  const [history, setHistory] = useState<CADDocument[]>([initialDocument])
  const [historyIdx, setHistoryIdx] = useState(0)
  const lastDraftRef = useRef(doc)

  useEffect(() => {
    if (!isStandalone || !onSave || lastDraftRef.current === doc || doc !== history[historyIdx]) return
    lastDraftRef.current = doc
    onSave(doc)
  }, [doc, history, historyIdx, isStandalone, onSave])

  // Active Tool & Selection
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<SelectedItem>(null)
  const [orthoSnap, setOrthoSnap] = useState(false)
  const [snappingEnabled, setSnappingEnabled] = useState(true)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [toolsCollapsed,setToolsCollapsed]=useState(false)
  const propertiesId = React.useId()

  // Viewport transforms
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [viewportSize,setViewportSize]=useState({width:initialDocument.width,height:initialDocument.height})
  useEffect(()=>{
    const element=viewportRef.current
    if(!element||typeof ResizeObserver==='undefined')return
    const update=()=>{const rect=element.getBoundingClientRect();if(rect.width>0&&rect.height>0)setViewportSize({width:rect.width,height:rect.height})}
    update();const observer=new ResizeObserver(update);observer.observe(element)
    return()=>observer.disconnect()
  },[])
  const camera=cadViewport(viewportSize,doc,zoom,pan)
  const gridStep=10**Math.ceil(Math.log10(24/camera.scale))

  // Interactive line drawing state
  const [activeLineStart, setActiveLineStart] = useState<{ id?: string; x: number; y: number } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [snappedBeacon, setSnappedBeacon] = useState<CADBeacon | null>(null)

  // Measure mode state
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null)
  const [measureResult, setMeasureResult] = useState<{ distM: number; bearingStr: string } | null>(null)

  // Calibration tool state
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{ x: number; y: number }>>([])
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false)
  const [calibrationDistanceInput, setCalibrationDistanceInput] = useState('')
  const [calibrationError, setCalibrationError] = useState('')
  const calibrationReturnFocus = useRef<HTMLElement | null>(null)

  // CLI Command Line state
  const [cmdInput, setCmdInput] = useState('')
  const [cmdLog, setCmdLog] = useState<string>('Command: Type L (Line), B (Beacon), T (Text), IMG (Image), M (Measure), ZE (Zoom Extents)')

  // Spacebar pan & Schedule view states
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showSubdivisionPlanModal, setShowSubdivisionPlanModal] = useState(false)

  // Controlled coordinate inputs for active beacon
  const [beaconEastInput, setBeaconEastInput] = useState('')
  const [beaconNorthInput, setBeaconNorthInput] = useState('')

  // Document reference for atomic updates
  const docRef = useRef<CADDocument>(doc)
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  // Drag interaction tracking
  const dragRef = useRef<{
    type: string
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
    origX2?: number
    origY2?: number
    origMouseSvgX?: number
    origMouseSvgY?: number
  } | null>(null)
  const pointerGesture = useRef<{
    pointerId: number
    document: CADDocument
    history: CADDocument[]
    historyIdx: number
    pan: typeof pan
    tool: Tool
    selected: SelectedItem
    lineStart: typeof activeLineStart
    measureStart: typeof measureStart
    measureResult: typeof measureResult
    calibrationPoints: typeof calibrationPoints
    calibrationDialogOpen: boolean
  } | null>(null)

  const releasePointer = useCallback((pointerId: number) => {
    try {
      if (svgRef.current?.hasPointerCapture(pointerId)) svgRef.current.releasePointerCapture(pointerId)
    } catch { /* The browser may already have released a cancelled pointer. */ }
  }, [])

  const cancelPointerGesture = useCallback(() => {
    const gesture = pointerGesture.current
    if (!gesture) return
    pointerGesture.current = null
    dragRef.current = null
    docRef.current = gesture.document
    setDoc(gesture.document); setHistory(gesture.history); setHistoryIdx(gesture.historyIdx)
    setPan(gesture.pan); setTool(gesture.tool); setSelected(gesture.selected)
    setActiveLineStart(gesture.lineStart); setMeasureStart(gesture.measureStart); setMeasureResult(gesture.measureResult)
    setCalibrationPoints(gesture.calibrationPoints); setCalibrationDialogOpen(gesture.calibrationDialogOpen)
    setSnappedBeacon(null)
    releasePointer(gesture.pointerId)
  }, [releasePointer])

  const beginPointerGesture = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.isPrimary === false || pointerGesture.current || (event.button !== 0 && event.button !== 1)) {
      event.preventDefault(); event.stopPropagation(); return
    }
    pointerGesture.current = {
      pointerId: event.pointerId, document: docRef.current, history, historyIdx, pan, tool, selected,
      lineStart: activeLineStart, measureStart, measureResult, calibrationPoints, calibrationDialogOpen,
    }
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Capture is unavailable for a synthetic pointer. */ }
  }, [history, historyIdx, pan, tool, selected, activeLineStart, measureStart, measureResult, calibrationPoints, calibrationDialogOpen])

  const handlePointerCancel = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerGesture.current?.pointerId === event.pointerId) cancelPointerGesture()
  }, [cancelPointerGesture])

  // History updater
  const pushHistory = useCallback((newDoc: CADDocument) => {
    docRef.current = newDoc
    const newHistory = history.slice(0, historyIdx + 1)
    newHistory.push(newDoc)
    if (newHistory.length > 50) newHistory.shift()
    setHistory(newHistory)
    setHistoryIdx(newHistory.length - 1)
    setDoc(newDoc)
  }, [history, historyIdx])

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1)
      setDoc(history[historyIdx - 1])
    }
  }, [history, historyIdx])

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1)
      setDoc(history[historyIdx + 1])
    }
  }, [history, historyIdx])

  // ─── Snapping detection ──────────────────────────────────────────────────
  const getSnapCoords = useCallback((svgX: number, svgY: number): { x: number; y: number; beacon: CADBeacon | null } => {
    if (!snappingEnabled || doc.beacons.length === 0) return { x: svgX, y: svgY, beacon: null }
    const SNAP_RADIUS = 16 / camera.scale
    let nearest: CADBeacon | null = null
    let minDist = SNAP_RADIUS

    for (const b of doc.beacons) {
      const d = Math.hypot(b.x - svgX, b.y - svgY)
      if (d < minDist) {
        minDist = d
        nearest = b
      }
    }

    if (nearest) {
      return { x: nearest.x, y: nearest.y, beacon: nearest }
    }
    return { x: svgX, y: svgY, beacon: null }
  }, [doc.beacons, snappingEnabled, camera.scale])

  // Convert client mouse coordinates to SVG diagram space
  const clientToSvgCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const pt = svgRef.current.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svgRef.current.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inverted = pt.matrixTransform(ctm.inverse())
    return { x: inverted.x, y: inverted.y }
  }, [])

  // ─── Command Line (AutoCAD CLI) ──────────────────────────────────────────
  // ─── Beacon & Line Operations ────────────────────────────────────────────

  const plantBeacon = useCallback((x: number, y: number, customLabel?: string, eastingVal?: number, northingVal?: number, symbol?: string) => {
    const currentDoc = docRef.current
    const label = customLabel || `B${currentDoc.beacons.length + 1}`
    const projectCoordinates = getProjectCoordinates(currentDoc, x, y)
    const easting = eastingVal ?? projectCoordinates?.easting
    const northing = northingVal ?? projectCoordinates?.northing

    const newBeacon: CADBeacon = {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      x,
      y,
      easting,
      northing,
      symbol: symbol || 'concrete_beacon',
      locked: false,
    }

    const nextDoc: CADDocument = {
      ...currentDoc,
      beacons: [...currentDoc.beacons, newBeacon],
    }
    pushHistory(nextDoc)
    return newBeacon
  }, [pushHistory])

  const connectBoundary = useCallback((fromBeacon: CADBeacon, toBeacon: CADBeacon) => {
    if (fromBeacon.id === toBeacon.id) return
    const currentDoc = docRef.current

    const measurement=measureCadCanvasSegment(fromBeacon,toBeacon,currentDoc.metersPerPixel)

    const newBoundary: CADBoundary = {
      id: `bdy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromId: fromBeacon.id,
      toId: toBeacon.id,
      ...measurement,
      type: 'standard',
    }

    const nextDoc: CADDocument = {
      ...currentDoc,
      boundaries: [...currentDoc.boundaries, newBoundary],
    }
    pushHistory(nextDoc)
  }, [pushHistory])

  const updateBeaconCoordinate = useCallback((beaconId: string, newEasting?: number, newNorthing?: number) => {
    const currentDoc = docRef.current
    const beacon = currentDoc.beacons.find(b => b.id === beaconId)
    if (!beacon) return

    const easting = newEasting ?? beacon.easting
    const northing = newNorthing ?? beacon.northing
    const frame=hasCadReferenceFrame(currentDoc)?currentDoc:null
    const coordinates = frame && typeof easting==='number' && Number.isFinite(easting) && typeof northing==='number' && Number.isFinite(northing)
      ? projectToCadCanvas(easting,northing,frame.originEasting,frame.originNorthing,frame.height,frame.metersPerPixel)
      : null
    const metersPerPx = isScaleKnown(currentDoc) ? currentDoc.metersPerPixel : undefined
    const newX = coordinates?.x ?? beacon.x
    const newY = coordinates?.y ?? beacon.y

    const nextBeacons = currentDoc.beacons.map(b => b.id === beaconId ? {
      ...b,
      x: newX,
      y: newY,
      easting,
      northing,
    } : b)

    // Recalculate attached boundaries
    const nextBoundaries = currentDoc.boundaries.map(bdy => {
      if (bdy.fromId === beaconId || bdy.toId === beaconId) {
        const fb = nextBeacons.find(bn => bn.id === bdy.fromId)
        const tb = nextBeacons.find(bn => bn.id === bdy.toId)
        if (fb && tb && metersPerPx !== undefined) {
          return { ...bdy, ...measureCadCanvasSegment(fb,tb,metersPerPx) }
        }
      }
      return bdy
    })

    pushHistory({
      ...currentDoc,
      beacons: nextBeacons,
      boundaries: nextBoundaries,
    })
  }, [pushHistory])

  // ─── Delete Selected ─────────────────────────────────────────────────────
  const commitGridCoordinate = useCallback((beaconId: string, axis: 'easting' | 'northing', input: string) => {
    const value = parseCadGridCoordinate(input)
    if (value === undefined) {
      setCoordinateError('Enter a complete finite decimal coordinate between −1,000,000,000 and 1,000,000,000 metres. The previous coordinate is retained.')
      return
    }
    setCoordinateError('')
    updateBeaconCoordinate(beaconId, axis === 'easting' ? value : undefined, axis === 'northing' ? value : undefined)
  }, [updateBeaconCoordinate])

  const deleteSelected = useCallback(() => {
    if (!selected) return
    const currentDoc = docRef.current

    if (selected.type === 'beacon') {
      const nextDoc: CADDocument = {
        ...currentDoc,
        beacons: currentDoc.beacons.filter(b => b.id !== selected.id),
        boundaries: currentDoc.boundaries.filter(b => b.fromId !== selected.id && b.toId !== selected.id),
      }
      pushHistory(nextDoc)
    } else if (selected.type === 'boundary') {
      const nextDoc: CADDocument = {
        ...currentDoc,
        boundaries: currentDoc.boundaries.filter(b => b.id !== selected.id),
      }
      pushHistory(nextDoc)
    } else if (selected.type === 'annotation') {
      const nextDoc: CADDocument = {
        ...currentDoc,
        annotations: currentDoc.annotations.filter(a => a.id !== selected.id),
      }
      pushHistory(nextDoc)
    } else if (selected.type === 'image') {
      const nextDoc: CADDocument = {
        ...currentDoc,
        backgroundImage: null,
      }
      pushHistory(nextDoc)
    }
    setSelected(null)
  }, [selected, pushHistory])

  // ─── Zoom Extents (ZE) ───────────────────────────────────────────────────

  const zoomExtents = useCallback(() => {
    const currentDoc = docRef.current
    const camera=fitCadGeometry(viewportSize,currentDoc,[...currentDoc.beacons,...currentDoc.annotations.flatMap(annotation=>annotation.type==='line'&&annotation.x2!==undefined&&annotation.y2!==undefined?[annotation,{x:annotation.x2,y:annotation.y2}]:[annotation])])
    setZoom(camera.zoom);setPan(camera.pan)
    setCmdLog('Command: ZOOM EXTENTS > View focused on survey boundaries')
  }, [viewportSize])

  // ─── Mouse Wheel Zoom with Focal Point Pinning ───────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
    // Snapshot event geometry before scheduling state updates. React clears
    // currentTarget after the handler returns, so reading it inside a state
    // updater can throw when the updater runs later.
    const container = e.currentTarget.getBoundingClientRect()
    const next=zoomCadAt(zoom,pan,zoom*zoomFactor,{x:e.clientX-container.left,y:e.clientY-container.top},viewportSize)
    setZoom(next.zoom);setPan(next.pan)
  }, [zoom,pan,viewportSize])

  // ─── Command Line (AutoCAD CLI) ──────────────────────────────────────────

  const handleCommandSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const raw = cmdInput.trim()
    if (!raw) return
    setCmdInput('')
    const upper = raw.toUpperCase()
    setCoordinateError('')

    // 1. Direct coordinate placement: PT/BEACON <Easting> <Northing> [Label]
    const ptMatch = raw.match(/^(?:PT|B|BEACON)\s+([^,\s]+)[,\s]+([^,\s]+)(?:\s+(.+))?$/i)
    if (ptMatch) {
      const easting = parseCadGridCoordinate(ptMatch[1])
      const northing = parseCadGridCoordinate(ptMatch[2])
      if (easting === undefined || northing === undefined) {
        setCoordinateError('Use complete finite decimal coordinates within the supported project grid range. No beacon was created.')
        return
      }
      const label = ptMatch[3] ? ptMatch[3].trim() : undefined
      const currentDoc = docRef.current
      const position=hasCadReferenceFrame(currentDoc)
        ? projectToCadCanvas(easting,northing,currentDoc.originEasting,currentDoc.originNorthing,currentDoc.height,currentDoc.metersPerPixel)
        : {x:currentDoc.width/2+(currentDoc.beacons.length%5)*20,y:currentDoc.height/2+(Math.floor(currentDoc.beacons.length/5)%5)*20}

      const planted = plantBeacon(position.x,position.y,label,easting,northing)
      setCmdLog(`Command: BEACON > Stored ${planted.label} at E=${easting.toFixed(2)}, N=${northing.toFixed(2)}${hasCadReferenceFrame(currentDoc)?'':'. Staged in the drawing; apply Coordinate reference to plot it on the survey grid.'}`)
      return
    }

    // 2. Direct line connection: LINE/L <FromLabel> <ToLabel>
    const lineMatch = raw.match(/^(?:L|LINE)\s+([A-Z0-9_-]+)\s+([A-Z0-9_-]+)$/i)
    if (lineMatch) {
      const fromLabel = lineMatch[1]
      const toLabel = lineMatch[2]
      const currentDoc = docRef.current
      const fb = currentDoc.beacons.find(b => b.label.toUpperCase() === fromLabel.toUpperCase() || b.id === fromLabel)
      const tb = currentDoc.beacons.find(b => b.label.toUpperCase() === toLabel.toUpperCase() || b.id === toLabel)
      if (fb && tb) {
        connectBoundary(fb, tb)
        setCmdLog(`Command: LINE > Connected ${fb.label} → ${tb.label}`)
      } else {
        setCmdLog(`Command: LINE > Error: Could not find beacons "${fromLabel}" or "${toLabel}"`)
      }
      return
    }

    // 3. Tool selections and standard commands
    if (upper === 'L' || upper === 'LINE') {
      setTool('line')
      setActiveLineStart(null)
      setCmdLog('Command: LINE > Click start beacon or canvas point')
    } else if (upper === 'B' || upper === 'BEACON' || upper === 'PT') {
      setTool('beacon')
      setCmdLog('Command: BEACON > Click canvas or type "PT <Easting> <Northing> [Label]"')
    } else if (upper === 'T' || upper === 'TEXT') {
      setTool('annotate-text')
      setCmdLog('Command: TEXT > Click canvas to place annotation')
    } else if (upper === 'IMG' || upper === 'IMAGE') {
      fileInputRef.current?.click()
      setCmdLog('Command: IMAGEATTACH > Select raster map image to attach')
    } else if (upper === 'CAL' || upper === 'CALIBRATE' || upper === 'SCALE') {
      setTool('calibrate')
      setCalibrationPoints([])
      setCmdLog('Command: CALIBRATE > Click 1st reference point on image')
    } else if (upper === 'M' || upper === 'DIST' || upper === 'MEASURE') {
      setTool('measure')
      setMeasureStart(null)
      setCmdLog('Command: DIST > Click 1st point to measure')
    } else if (upper === 'P' || upper === 'PAN') {
      setTool('pan')
      setCmdLog('Command: PAN > Drag view to pan canvas')
    } else if (upper === 'ZE' || upper === 'Z' || upper === 'ZOOM') {
      zoomExtents()
    } else if (upper === 'ORTHO' || upper === 'F8') {
      setOrthoSnap(prev => {
        setCmdLog(`Command: ORTHO ${!prev ? 'ON' : 'OFF'}`)
        return !prev
      })
    } else if (upper === 'DEL' || upper === 'E' || upper === 'ERASE') {
      deleteSelected()
      setCmdLog('Command: ERASE > Removed selected entity')
    } else if (upper === 'U' || upper === 'UNDO') {
      undo()
      setCmdLog('Command: UNDO > Reverted last operation')
    } else if (upper === 'REDO') {
      redo()
      setCmdLog('Command: REDO > Restored operation')
    } else if (upper === 'ESC' || upper === 'CANCEL') {
      setTool('select')
      setActiveLineStart(null)
      setMeasureStart(null)
      setCmdLog('Command: CANCEL > Switched to Select mode')
    } else {
      setCmdLog(`Command: Unknown "${raw}". Commands: L, B, PT <E> <N>, T, IMG, CAL, M, PAN, ZE, ORTHO, DEL, U, REDO`)
    }
  }, [cmdInput, plantBeacon, connectBoundary, zoomExtents, deleteSelected, undo, redo])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.target instanceof Element && e.target.closest('[role="menu"], [role="dialog"]')) return

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true)
      } else if (e.key === 'F8') {
        e.preventDefault()
        setOrthoSnap(prev => {
          setCmdLog(`Command: ORTHO ${!prev ? 'ON' : 'OFF'}`)
          return !prev
        })
      } else if (e.key === 'Escape') {
        setTool('select')
        setActiveLineStart(null)
        setMeasureStart(null)
        setCalibrationPoints([])
        setSelected(null)
        setCmdLog('Command: Canceled')
      } else if (e.key === 'Enter') {
        if (activeLineStart) {
          setActiveLineStart(null)
          setCmdLog('Command: LINE > Finished boundary sequence')
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [deleteSelected, undo, redo, activeLineStart])

  // ─── Canvas Mouse Handling ───────────────────────────────────────────────

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.isPrimary === false || (pointerGesture.current && pointerGesture.current.pointerId !== e.pointerId)) return
    const coords = clientToSvgCoords(e.clientX, e.clientY)
    const snap = getSnapCoords(coords.x, coords.y)
    let { x, y } = snap
    const { beacon } = snap

    // Orthogonal constraint (90°) when drawing lines
    if (tool === 'line' && activeLineStart && (orthoSnap || e.shiftKey) && !beacon) {
      const dx = x - activeLineStart.x
      const dy = y - activeLineStart.y
      if (Math.abs(dx) > Math.abs(dy)) {
        y = activeLineStart.y
      } else {
        x = activeLineStart.x
      }
    }

    setMousePos({ x, y })
    setSnappedBeacon(beacon)

    // Handle viewport pan
    if (dragRef.current && dragRef.current.type === 'pan') {
      const dx = (e.clientX - dragRef.current.startX)
      const dy = (e.clientY - dragRef.current.startY)
      setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
      return
    }

      // Handle entity dragging in exact SVG coordinates
      if (dragRef.current && dragRef.current.type !== 'pan') {
        const d = dragRef.current
        let dx = (e.clientX - d.startX) / zoom
        let dy = (e.clientY - d.startY) / zoom
        if (d.origMouseSvgX !== undefined && d.origMouseSvgY !== undefined) {
          const curSvg = clientToSvgCoords(e.clientX, e.clientY)
          dx = curSvg.x - d.origMouseSvgX
          dy = curSvg.y - d.origMouseSvgY
        }
        if (dx === 0 && dy === 0 && docRef.current === pointerGesture.current?.document) return
        const newX = d.origX + dx
        const newY = d.origY + dy

          const prev = docRef.current
          const next = { ...prev }
          if (d.type === 'beacon') {
            const projectCoordinates = getProjectCoordinates(prev, newX, newY)
            const metersPerPx = isScaleKnown(prev) ? prev.metersPerPixel : undefined
            next.beacons = prev.beacons.map(b => b.id === d.id ? {
              ...b,
              x: newX,
              y: newY,
              ...(projectCoordinates ? { easting: projectCoordinates.easting, northing: projectCoordinates.northing } : {}),
            } : b)
            // Recalculate attached boundaries
            next.boundaries = prev.boundaries.map(bdy => {
              if (bdy.fromId === d.id || bdy.toId === d.id) {
                const fb = next.beacons.find(bn => bn.id === bdy.fromId)
                const tb = next.beacons.find(bn => bn.id === bdy.toId)
                if (fb && tb && metersPerPx !== undefined) {
                  return { ...bdy, ...measureCadCanvasSegment(fb,tb,metersPerPx) }
                }
              }
              return bdy
            })
          } else if (d.type === 'annotation') {
            next.annotations = prev.annotations.map(a => a.id === d.id ? { ...a, x: newX, y: newY,
              ...(a.type === 'line' && d.origX2 !== undefined && d.origY2 !== undefined ? { x2: d.origX2 + dx, y2: d.origY2 + dy } : {}),
            } : a)
          } else if (d.type === 'north') {
            next.northArrow = { ...prev.northArrow, x: newX, y: newY }
          } else if (d.type === 'scale') {
            next.scaleBar = { ...prev.scaleBar, x: newX, y: newY }
          } else if (d.type === 'image' && prev.backgroundImage && !prev.backgroundImage.locked) {
            next.backgroundImage = { ...prev.backgroundImage, x: newX, y: newY }
          }
          docRef.current = next
          setDoc(next)
      }
  }, [clientToSvgCoords, getSnapCoords, zoom, tool, activeLineStart, orthoSnap])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Middle click, Pan tool, or Spacebar held
    if (tool === 'pan' || isSpacePressed || e.button === 1) {
      e.preventDefault()
      dragRef.current = { type: 'pan', id: '', startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y }
      return
    }

    const coords = clientToSvgCoords(e.clientX, e.clientY)
    const { x, y, beacon } = getSnapCoords(coords.x, coords.y)

    // 1. Line Tool Click (Atomic Beacon + Boundary Creation)
    if (tool === 'line') {
      const currentDoc = docRef.current
      let currentB = beacon
      let updatedDoc = currentDoc

      if (!currentB) {
        // Plant a new beacon if clicked empty canvas
        const label = `B${currentDoc.beacons.length + 1}`
        const projectCoordinates = getProjectCoordinates(currentDoc, x, y)

        currentB = {
          id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          x,
          y,
          easting: projectCoordinates?.easting,
          northing: projectCoordinates?.northing,
          symbol: 'concrete_beacon',
          locked: false,
        }

        updatedDoc = {
          ...currentDoc,
          beacons: [...currentDoc.beacons, currentB],
        }
      }

      if (!activeLineStart) {
        if (updatedDoc !== currentDoc) {
          pushHistory(updatedDoc)
        }
        setActiveLineStart({ id: currentB.id, x: currentB.x, y: currentB.y })
        setCmdLog(`Command: LINE > Start at ${currentB.label}. Click next beacon or point`)
      } else {
        const startBeacon = updatedDoc.beacons.find(b => b.id === activeLineStart.id)
        if (startBeacon && currentB.id !== startBeacon.id) {
          const measurement=measureCadCanvasSegment(startBeacon,currentB,updatedDoc.metersPerPixel)

          const newBoundary: CADBoundary = {
            id: `bdy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromId: startBeacon.id,
            toId: currentB.id,
            ...measurement,
            type: 'standard',
          }

          const finalDoc: CADDocument = {
            ...updatedDoc,
            boundaries: [...updatedDoc.boundaries, newBoundary],
          }
          pushHistory(finalDoc)

          // Check if closing polygon boundary loop
          const isClosingLoop = updatedDoc.boundaries.some(bdyItem => bdyItem.fromId === currentB.id)
          if (isClosingLoop) {
            setActiveLineStart(null)
            setCmdLog(`Command: LINE > Connected existing linework at ${currentB.label}. Check Drawing topology for closed faces.`)
          } else {
            setActiveLineStart({ id: currentB.id, x: currentB.x, y: currentB.y })
            setCmdLog(`Command: LINE > Connected ${startBeacon.label} → ${currentB.label}. Click next point (Esc/Enter to finish)`)
          }
        }
      }
      return
    }

    // 2. Beacon Tool Click
    if (tool === 'beacon') {
      const created = plantBeacon(x, y)
      setCmdLog(`Command: BEACON > Created beacon ${created.label} at (${x.toFixed(1)}, ${y.toFixed(1)})`)
      return
    }

    // 3. Annotate Text Tool Click
    if (tool === 'annotate-text') {
      const newAnn: CADAnnotation = {
        id: `ann-${Date.now()}`,
        type: 'text',
        x,
        y,
        text: 'New Note',
        fontSize: 10,
        color: '#111827',
      }
      pushHistory({ ...doc, annotations: [...doc.annotations, newAnn] })
      setTool('select')
      setSelected({ type: 'annotation', id: newAnn.id })
      setCmdLog(`Command: TEXT > Placed annotation at (${x.toFixed(1)}, ${y.toFixed(1)})`)
      return
    }

    // 4. Measure Tool Click
    if (tool === 'measure') {
      if (!measureStart) {
        setMeasureStart({ x, y })
        setMeasureResult(null)
        setCmdLog(`Command: DIST > First point set. Click second point`)
      } else {
        if (!isScaleKnown(doc)) {
          setCmdLog('Command: DIST > Calibrate the drawing scale before measuring in metres')
          return
        }
        const measurement=measureCadCanvasSegment(measureStart,{x,y},doc.metersPerPixel)
        if (measurement.distanceM===undefined) return
        setMeasureResult({distM:measurement.distanceM,bearingStr:measurement.bearing})
        setCmdLog(`Command: DRAWING DIST = ${measurement.distanceM.toFixed(3)} m, Bearing = ${measurement.bearing}`)
        setMeasureStart(null)
      }
      return
    }

    // 5. Calibration Tool Click
    if (tool === 'calibrate') {
      if (calibrationPoints.length === 0) {
        setCalibrationPoints([{ x, y }])
        setCmdLog(`Command: CALIBRATE > Point 1 set. Click Point 2 on known distance line`)
      } else if (calibrationPoints.length === 1) {
        setCalibrationPoints(prev => [...prev, { x, y }])
        setCalibrationDialogOpen(true)
        calibrationReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setCalibrationDistanceInput('')
        setCalibrationError('')
        setCmdLog(`Command: CALIBRATE > Point 2 set. Enter known grid/drawing distance in metres`)
      }
      return
    }

    // Deselect if clicking on empty background
    if (tool === 'select' && !isSpacePressed && e.button === 0) {
      setSelected(null)
    }
  }, [tool, isSpacePressed, pan, clientToSvgCoords, getSnapCoords, activeLineStart, plantBeacon, pushHistory, doc, measureStart, calibrationPoints])

  const handleCanvasPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = pointerGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    pointerGesture.current = null
    if (dragRef.current && dragRef.current.type !== 'pan' && docRef.current !== gesture.document) {
      pushHistory(docRef.current)
    }
    dragRef.current = null
    releasePointer(event.pointerId)
  }, [pushHistory, releasePointer])

  // ─── Calibration Math ────────────────────────────────────────────────────
  const applyScaleCalibration = useCallback(() => {
    const distM = parseCadGridCoordinate(calibrationDistanceInput)
    try {
      if (distM === undefined || distM <= 0) throw new RangeError('Enter a complete positive distance in metres.')
      const nextDoc = calibrateCadScale(doc, calibrationPoints, distM)
      pushHistory(nextDoc)
      setCalibrationDialogOpen(false)
      setCalibrationPoints([])
      setCalibrationError('')
      setTool('select')
      setCmdLog(hasCadReferenceFrame(doc)
        ? 'Command: CALIBRATE > Image calibrated; drawing frame and supplied grid coordinates preserved.'
        : `Command: CALIBRATE > Drawing scale set to ${nextDoc.metersPerPixel} m per canvas unit. Coordinate reference still required.`)
    } catch (failure) {
      setCalibrationError(cadReferenceErrorMessage(failure))
    }
  }, [calibrationDistanceInput, calibrationPoints, doc, pushHistory])

  // ─── Background Map Photo Upload ─────────────────────────────────────────
  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const img = new window.Image()
      img.onload = () => {
        // Fit image inside canvas while maintaining aspect ratio
        const aspect = img.width / img.height
        let targetW = doc.width * 0.8
        let targetH = targetW / aspect
        if (targetH > doc.height * 0.8) {
          targetH = doc.height * 0.8
          targetW = targetH * aspect
        }
        const imgX = (doc.width - targetW) / 2
        const imgY = (doc.height - targetH) / 2

        const bgImg: CADBackgroundImage = {
          id: `img-${Date.now()}`,
          url,
          name: file.name,
          x: imgX,
          y: imgY,
          width: targetW,
          height: targetH,
          opacity: 0.55,
          rotation: 0,
          locked: false,
          visible: true,
        }

        pushHistory({
          ...doc,
          backgroundImage: bgImg,
        })
        setSelected({ type: 'image', id: bgImg.id })
        setCmdLog(`Command: IMAGEATTACH > Attached "${file.name}". Adjust opacity or run CALIBRATE to scale`)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }, [doc, pushHistory])

  // ─── Export & File IO ────────────────────────────────────────────────────
  const exportDXF = useCallback(() => {
    setExportError('')
    let dxfString: string
    try {
      dxfString = generateCADDocumentDXF(doc)
    } catch (error) {
      setExportError(cadReferenceErrorMessage(error))
      return
    }
    const blob = new Blob([dxfString], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(doc.titleBlock.projectName || 'cad_plan').replace(/\s+/g, '_')}_${Date.now()}.dxf`
    a.click()
    URL.revokeObjectURL(url)
    onExportDXF?.()
    setCmdLog('Command: EXPORT DXF > Downloaded AutoCAD DXF')
  }, [doc, onExportDXF])

  const exportSVG = useCallback(() => {
    if (!svgRef.current) return
    setExportError('')
    let svgString: string
    try { svgString = generateCadDocumentSvg(svgRef.current, doc) }
    catch (error) { setExportError(cadReferenceErrorMessage(error)); return }
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(doc.titleBlock.projectName || 'cad_plan').replace(/\s+/g, '_')}.svg`
    a.click()
    URL.revokeObjectURL(url)
    onExportSVG?.(svgString)
    setCmdLog('Command: EXPORT SVG > Downloaded vector SVG')
  }, [doc, onExportSVG])

  const exportCSV = useCallback(() => {
    setExportError('')
    let csv: string
    try { csv = generateCadCoordinateCsv(doc) }
    catch (error) { setExportError(cadReferenceErrorMessage(error)); return }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coordinate_schedule_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setCmdLog('Command: EXPORT CSV > Schedule downloaded with CRS and units. Formula-like names have a spreadsheet-safe tab prefix; original names remain in the CAD file.')
  }, [doc])

  const exportJSON = useCallback(() => {
    const jsonStr = JSON.stringify(doc, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(doc.titleBlock.projectName || 'cad_project').replace(/\s+/g, '_')}.metardu-cad`
    a.click()
    URL.revokeObjectURL(url)
    setCmdLog('Command: SAVE FILE > Downloaded .metardu-cad state file')
  }, [doc])

  const importJSON = useCallback((file: File) => {
    cancelPointerGesture()
    const generation = ++importGeneration.current
    if (cadReaderRef.current?.readyState === FileReader.LOADING) cadReaderRef.current.abort()
    setFileError('')
    setImporting(false)
    if (file.size > 8 * 1024 * 1024) {
      setFileError('This CAD file exceeds the 8 MiB import limit. The current drawing has been retained.')
      return
    }
    const reader = new FileReader()
    cadReaderRef.current = reader
    setImporting(true)
    reader.onload = () => {
      if (generation !== importGeneration.current) return
      try {
        if (typeof reader.result !== 'string') throw new Error('The file could not be read as text.')
        const parsed = parseCadDocument(JSON.parse(reader.result) as unknown)
        if (!parsed) throw new Error('The document has invalid fields or point references.')
        pushHistory(parsed)
        setCoordinateError('')
        setSelected(null); setActiveLineStart(null); setMeasureStart(null); setMeasureResult(null)
        setCalibrationPoints([]); setCalibrationDialogOpen(false)
        setZoom(1); setPan({ x: 0, y: 0 })
        setCmdLog(`Command: OPEN FILE > Loaded "${file.name}"`)
      } catch {
        setFileError('Invalid CAD document. Check its fields and boundary point references; the current drawing has been retained.')
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      if (generation !== importGeneration.current) return
      setImporting(false)
      setFileError('The CAD file could not be read. The current drawing has been retained; retry the file.')
    }
    reader.readAsText(file)
  }, [pushHistory, cancelPointerGesture])

  const geometryInput=useMemo<CadTopologyInput>(()=>({width:doc.width,height:doc.height,metersPerPixel:doc.metersPerPixel,originEasting:doc.originEasting,originNorthing:doc.originNorthing,coordinateReferenceSystem:doc.coordinateReferenceSystem,
    beacons:doc.beacons,boundaries:doc.boundaries,
  }),[doc.width,doc.height,doc.metersPerPixel,doc.originEasting,doc.originNorthing,doc.coordinateReferenceSystem,doc.beacons,doc.boundaries])
  const topology=useCadTopology(geometryInput)
  const visibleBoundaries=useMemo(()=>{
    const measurements=new Map(topology.result?.measurements.map(edge=>[edge.id,edge])??[])
    return doc.boundaries.map(edge=>({...edge,...(measurements.get(edge.id)??{bearing:'—',bearingDeg:undefined,distance:topology.loading?'Checking…':'Unchecked',distanceM:undefined})}))
  },[doc.boundaries,topology.result,topology.loading])

  const selectedBeacon = selected?.type === 'beacon' ? doc.beacons.find(b => b.id === selected.id) : null
  const selectedBoundary = selected?.type === 'boundary' ? visibleBoundaries.find(b => b.id === selected.id) : null
  const selectedAnnotation = selected?.type === 'annotation' ? doc.annotations.find(a => a.id === selected.id) : null

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`${workspaceStyles.workspace} flex flex-col h-full min-h-0 bg-[var(--bg-primary)] text-[var(--text-primary)] select-none overflow-hidden`}>
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleImageFile(f)
        }}
      />
      <input
        ref={jsonFileInputRef}
        type="file"
        aria-label="Open CAD file"
        accept=".json,.metardu-cad"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) importJSON(f)
          e.target.value = ''
        }}
      />

      {/* ── Top Header Toolbar ── */}
      {toolsCollapsed&&<div className="flex min-h-11 shrink-0 items-center justify-between border-b border-[var(--border-color)] px-3"><span className="text-xs text-[var(--text-secondary)]">Drawing controls hidden</span><button className="min-h-11 text-xs text-[var(--accent)]" aria-expanded="false" aria-controls="cad-editor-tools" onClick={()=>setToolsCollapsed(false)}>Show drawing tools</button></div>}
      <div id="cad-editor-tools" className={`${toolsCollapsed?'hidden':'flex'} items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] shrink-0 gap-2 flex-wrap`}>
        {/* Left: Mode Badge & Title */}
        <div className="flex items-center gap-2">
          {isStandalone ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Standalone CAD
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" />
              {projectName || 'Project Workspace'}
            </span>
          )}
          <span className="text-xs font-semibold text-gray-300 hidden sm:inline">
            {doc.titleBlock.lrNumber ? `LR ${doc.titleBlock.lrNumber}` : 'Canvas'}
          </span>
        </div>

        {/* Center: Main Tool Palette */}
        <div role="group" aria-label="CAD tools" className="order-last flex w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-1 lg:order-none lg:w-auto [&>button]:shrink-0">
          <ToolButton active={tool === 'select'} onClick={() => { setTool('select'); setActiveLineStart(null) }} icon={MousePointer2} label="Select (Esc)" />
          <ToolButton active={tool === 'pan'} onClick={() => setTool('pan')} icon={Move} label="Pan View" />
          <ToolButton active={tool === 'line'} onClick={() => { setTool('line'); setActiveLineStart(null) }} icon={PenTool} label="Draw Boundary (L)" />
          <ToolButton active={tool === 'beacon'} onClick={() => setTool('beacon')} icon={MapPin} label="Plant Beacon (B)" />
          <ToolButton active={tool === 'annotate-text'} onClick={() => setTool('annotate-text')} icon={Type} label="Add Text (T)" />
          <ToolButton active={tool === 'measure'} onClick={() => { setTool('measure'); setMeasureStart(null) }} icon={Ruler} label="Measure (M)" />
          <ToolButton active={tool === 'calibrate'} onClick={() => { setTool('calibrate'); setCalibrationPoints([]) }} icon={Scaling} label="Calibrate Image Scale" />

          {/* Ortho (90° Snap) Toggle */}
          <button
            onClick={() => setOrthoSnap(v => !v)}
            aria-label="Toggle orthogonal drawing" aria-pressed={orthoSnap}
            className={`min-h-11 min-w-11 px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${
              orthoSnap
                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 font-bold'
                : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Orthogonal Mode (F8)"
          >
            <span className="text-[10px] font-mono">ORTHO</span>
          </button>
          {/* Raster Image Attachment */}
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach map image"
            className={`min-h-11 min-w-11 p-1.5 rounded text-xs flex items-center justify-center gap-1 transition-colors ${
              doc.backgroundImage ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Attach Map Picture (IMG)"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="text-[11px] hidden md:inline">{doc.backgroundImage ? 'Map Attached' : 'Attach Map'}</span>
          </button>
        </div>

        {/* Right: History, Zoom, Save & Export */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 lg:w-auto">
          <div className="flex items-center gap-0.5">
            <ToolButton onClick={undo} icon={Undo2} label="Undo (Ctrl+Z)" disabled={historyIdx === 0} />
            <ToolButton onClick={redo} icon={Redo2} label="Redo (Ctrl+Y)" disabled={historyIdx >= history.length - 1} />
            <ToolButton onClick={deleteSelected} icon={Trash2} label="Delete (Del)" disabled={!selected} />
          </div>

          <div className="w-px h-5 bg-gray-800 mx-1 hidden sm:block" />

          <div className="flex items-center bg-gray-950 rounded border border-gray-800 px-1">
            <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(CAD_MIN_ZOOM, z - 0.1))} className="min-h-11 min-w-11 p-1 hover:text-white text-gray-400"><Minus className="w-4 h-4" /></button>
            <span aria-label="Drawing zoom" className="text-[10px] font-mono px-1.5 tabular-nums">{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(CAD_MAX_ZOOM, z + 0.1))} className="min-h-11 min-w-11 p-1 hover:text-white text-gray-400"><Plus className="w-4 h-4" /></button>
            <button aria-label="Fit drawing" onClick={zoomExtents} className="min-h-11 min-w-11 p-1 hover:text-white text-gray-400" title="Zoom Extents (ZE)"><Maximize2 className="w-4 h-4" /></button>
          </div>

          {/* Save / Export buttons */}
          {onSave && !isStandalone && (
            <Button
              size="sm"
              onClick={() => onSave(doc)}
              className="min-h-11 bg-[var(--accent)] hover:opacity-90 text-[var(--bg-primary)] text-xs px-3 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              Save to Project
            </Button>
          )}

          {isStandalone && onAttachToProject && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAttachToProject}
              className="min-h-11 text-xs px-3 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--bg-tertiary)]"
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              Save to Project
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'text-xs h-auto min-h-11 px-3 border-gray-700' })}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Export
            </button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 max-h-[calc(100dvh-2rem)] bg-gray-900 border-gray-700 text-gray-200">
              <DropdownMenuItem
                onSelect={() => setShowSubdivisionPlanModal(true)}
                className="min-h-11 text-xs text-amber-400 font-semibold focus:bg-gray-800 focus:text-amber-300 flex items-center justify-between"
              >
                <span>Subdivision Scheme Plan</span>
                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">County</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportDXF} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">AutoCAD DXF (.dxf)</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportSVG} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">Vector SVG (.svg)</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportCSV} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">Coordinate Schedule (.csv)</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem onSelect={exportJSON} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">Save CAD File (.metardu-cad)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => jsonFileInputRef.current?.click()} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">Open CAD File...</DropdownMenuItem>
              {onExportPDF && (
                <DropdownMenuItem onSelect={onExportPDF} className="min-h-11 text-xs focus:bg-gray-800 focus:text-white">Print / PDF</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" aria-controls={propertiesId} aria-expanded={propertiesOpen}
            onClick={() => setPropertiesOpen(open => !open)}
            className="min-h-11 rounded-lg border border-gray-700 px-3 text-xs text-gray-200">
            Properties
          </button>
          <button type="button" aria-expanded="true" aria-controls="cad-editor-tools" onClick={()=>setToolsCollapsed(true)} className="min-h-11 rounded-lg px-3 text-xs text-[var(--text-secondary)]">Hide drawing tools</button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-gray-800 bg-gray-950 px-3 py-2 text-[11px] leading-5">
        <span className="text-gray-300"><span className="font-medium text-[var(--accent)]">{({select:'Select & edit',pan:'Pan drawing',line:'Connect boundaries',beacon:'Place beacon','annotate-text':'Add annotation',measure:'Measure distance',calibrate:'Calibrate image'})[tool]}</span> · {doc.beacons.length} points / {doc.boundaries.length} edges</span>
        <span className={hasCadReferenceFrame(doc)?'text-gray-400':'text-amber-300'}>{hasCadReferenceFrame(doc)?`${doc.coordinateReferenceSystem} · grid metres`:'Drawing reference not set'} · Draft, requires survey QA</span>
      </div>

      {fileError && <p role="alert" className="shrink-0 bg-amber-950 px-3 py-2 text-xs text-amber-200">{fileError}</p>}
      {coordinateError && <p role="alert" className="shrink-0 bg-amber-950 px-3 py-2 text-xs text-amber-200">{coordinateError}</p>}
      {exportError && <p role="alert" aria-label="Export error" className="shrink-0 bg-amber-950 px-3 py-2 text-xs text-amber-200">{exportError}</p>}
      {importing && <p role="status" className="shrink-0 px-3 py-2 text-xs text-gray-300">Reading and validating CAD file…</p>}

      {/* ── Main Canvas Viewport & Sidebar ── */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {/* SVG Drawing Canvas */}
        <div
          ref={viewportRef}
          className="flex-1 min-w-0 overflow-hidden bg-[var(--bg-primary)] relative flex items-center justify-center"
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            aria-label="CAD drawing canvas"
            width="100%"
            height="100%"
            viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
            preserveAspectRatio="none"
            style={{
              touchAction: 'none',
              cursor: (tool === 'pan' || isSpacePressed) ? 'grab' : tool === 'line' || tool === 'beacon' || tool === 'measure' || tool === 'calibrate' ? 'crosshair' : 'default',
            }}
            className={`${workspaceStyles.scene} w-full h-full`}
            onPointerDownCapture={beginPointerGesture}
            onPointerMove={handleCanvasPointerMove}
            onPointerDown={handleCanvasPointerDown}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
          >
            {/* The grid follows the view, including negative model coordinates. */}
            <defs data-cad-editor-only="grid">
              <pattern id="cad-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
                <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="var(--border-color)" strokeWidth={1/camera.scale} />
              </pattern>
            </defs>
            <rect data-cad-editor-only="grid" x={camera.x} y={camera.y} width={camera.width} height={camera.height} fill="url(#cad-grid)" pointerEvents="none" />

            {/* ── Background Map Image Layer ── */}
            {doc.backgroundImage && doc.backgroundImage.visible && (() => {
              const bg = doc.backgroundImage
              return (
                <g
                  transform={`rotate(${bg.rotation}, ${bg.x + bg.width / 2}, ${bg.y + bg.height / 2})`}
                  onPointerDown={e => {
                    if (tool === 'select' && !isSpacePressed && e.button === 0 && !bg.locked) {
                      e.stopPropagation()
                      const mSvg = clientToSvgCoords(e.clientX, e.clientY)
                      dragRef.current = {
                        type: 'image',
                        id: bg.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: bg.x,
                        origY: bg.y,
                        origMouseSvgX: mSvg.x,
                        origMouseSvgY: mSvg.y,
                      }
                      setSelected({ type: 'image', id: bg.id })
                    }
                  }}
                >
                  <image
                    href={bg.url}
                    x={bg.x}
                    y={bg.y}
                    width={bg.width}
                    height={bg.height}
                    opacity={bg.opacity}
                    style={{
                      cursor: bg.locked ? 'default' : 'move',
                      pointerEvents: bg.locked ? 'none' : 'auto',
                    }}
                    preserveAspectRatio="none"
                  />
                  {selected?.type === 'image' && !bg.locked && (
                    <rect
                      data-cad-editor-only="selection"
                      x={bg.x}
                      y={bg.y}
                      width={bg.width}
                      height={bg.height}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              )
            })()}

            {/* ── Boundaries (Lines) ── */}
            {visibleBoundaries.map(b => {
              const from = doc.beacons.find(bn => bn.id === b.fromId)
              const to = doc.beacons.find(bn => bn.id === b.toId)
              if (!from || !to) return null
              const isSelected = selected?.type === 'boundary' && selected.id === b.id

              const midX = (from.x + to.x) / 2
              const midY = (from.y + to.y) / 2
              const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI
              const textAngle = angle > 90 || angle < -90 ? angle + 180 : angle

              return (
                <g
                  key={b.id}
                  onClick={e => {
                    if (tool === 'select' && !isSpacePressed && e.button === 0) {
                      e.stopPropagation()
                      setSelected({ type: 'boundary', id: b.id })
                    }
                  }}
                  className="cursor-pointer group"
                >
                  <line
                    data-cad-export-stroke={b.type === 'road' ? '#475569' : '#0f172a'}
                    data-cad-export-stroke-width={b.type === 'road' ? 2.5 : 1.5}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isSelected ? '#2563eb' : b.type === 'road' ? '#475569' : '#0f172a'}
                    strokeWidth={isSelected ? 3 : b.type === 'road' ? 2.5 : 1.5}
                    strokeDasharray={b.type === 'water' ? '6 3' : b.type === 'fence' ? '3 3' : undefined}
                  />

                  {/* Bearing & Distance Label Badge */}
                  <g transform={`translate(${midX}, ${midY}) rotate(${textAngle})`}>
                    <rect
                      x={-42}
                      y={-14}
                      width={84}
                      height={12}
                      fill="#ffffff"
                      fillOpacity={0.9}
                      data-cad-export-stroke="#cbd5e1"
                      stroke={isSelected ? '#2563eb' : '#cbd5e1'}
                      strokeWidth={0.5}
                      rx={2}
                    />
                    <text
                      data-cad-boundary-label={b.id}
                      x={0}
                      y={-5}
                      textAnchor="middle"
                      fontSize={7.5}
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="#1e293b"
                    >
                      {b.bearing} {b.distanceM !== undefined ? `${b.distance}m` : b.distance}
                    </text>
                  </g>

                  {b.roadLabel && (
                    <text x={midX} y={midY + 14} textAnchor="middle" fontSize={7} fill="#64748b" fontStyle="italic">
                      {b.roadLabel}
                    </text>
                  )}
                </g>
              )
            })}

            {/* ── Active Line Drawing Rubber-Band Preview ── */}
            {tool === 'line' && activeLineStart && (
              <g data-cad-editor-only="line-preview">
                <line
                  x1={activeLineStart.x}
                  y1={activeLineStart.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#2563eb"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {/* Live Bearing & Distance Tag */}
                {(() => {
                  const measurement=measureCadCanvasSegment(activeLineStart,mousePos,doc.metersPerPixel)
                  const mx = (activeLineStart.x + mousePos.x) / 2
                  const my = (activeLineStart.y + mousePos.y) / 2
                  return (
                    <g transform={`translate(${mx}, ${my})`}>
                      <rect x={-45} y={-16} width={90} height={14} fill="#1e293b" rx={3} />
                      <text x={0} y={-6} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="#38bdf8">
                        {measurement.bearing} | {measurement.distanceM !== undefined ? `${measurement.distanceM.toFixed(2)}m` : 'scale uncalibrated'}
                      </text>
                    </g>
                  )
                })()}
              </g>
            )}

            {/* ── Active Measure Preview ── */}
            {tool === 'measure' && measureStart && (
              <g data-cad-editor-only="measure-preview">
                <line
                  x1={measureStart.x}
                  y1={measureStart.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#e11d48"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
                <circle cx={measureStart.x} cy={measureStart.y} r={4} fill="#e11d48" />
              </g>
            )}

            {/* ── Active Calibration Points ── */}
            {tool === 'calibrate' && calibrationPoints.map((cp, idx) => (
              <g data-cad-editor-only="calibration" key={idx} transform={`translate(${cp.x}, ${cp.y})`}>
                <circle r={6} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
                <text x={9} y={4} fontSize={9} fontWeight="bold" fill="#0891b2">Pt {idx + 1}</text>
              </g>
            ))}

            {/* ── Beacons (Control & Boundary Points) ── */}
            {doc.beacons.map(b => {
              const isSelected = selected?.type === 'beacon' && selected.id === b.id
              const isSnapTarget = snappedBeacon?.id === b.id

              return (
                <g
                  key={b.id}
                  transform={`translate(${b.x}, ${b.y})`}
                  onPointerDown={e => {
                    if (tool === 'select' && !isSpacePressed && e.button === 0) {
                      e.stopPropagation()
                      if (!b.locked) {
                        const mSvg = clientToSvgCoords(e.clientX, e.clientY)
                        dragRef.current = {
                          type: 'beacon',
                          id: b.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: b.x,
                          origY: b.y,
                          origMouseSvgX: mSvg.x,
                          origMouseSvgY: mSvg.y,
                        }
                      }
                      setSelected({ type: 'beacon', id: b.id })
                    }
                  }}
                  className="cursor-pointer"
                >
                  {/* Cadastral Beacon Symbol */}
                  <BeaconGlyph
                    symbol={b.symbol}
                    locked={b.locked}
                    isSelected={isSelected}
                    isSnapTarget={isSnapTarget}
                  />

                  {/* Label */}
                  <text
                    x={9}
                    y={14}
                    fontSize={8.5}
                    fontFamily="monospace"
                    fontWeight="bold"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth={0.4}
                  >
                    {b.label}
                  </text>
                </g>
              )
            })}

            {/* ── Text Annotations ── */}
            {doc.annotations.map(a => {
              const isSelected = selected?.type === 'annotation' && selected.id === a.id
              return (
                <g
                  key={a.id}
                  transform={`translate(${a.x}, ${a.y})`}
                  onPointerDown={e => {
                    if (tool === 'select' && !isSpacePressed && e.button === 0) {
                      e.stopPropagation()
                      const mSvg = clientToSvgCoords(e.clientX, e.clientY)
                      dragRef.current = {
                        type: 'annotation',
                        id: a.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: a.x,
                        origY: a.y,
                        origX2: a.x2,
                        origY2: a.y2,
                        origMouseSvgX: mSvg.x,
                        origMouseSvgY: mSvg.y,
                      }
                      setSelected({ type: 'annotation', id: a.id })
                    }
                  }}
                  className="cursor-move"
                >
                  {isSelected && (
                    <rect
                      data-cad-editor-only="selection"
                      x={-3}
                      y={-(a.fontSize || 10) - 2}
                      width={(a.text?.length || 4) * 7 + 6}
                      height={(a.fontSize || 10) + 6}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      rx={2}
                    />
                  )}
                  {a.type === 'line' ? (
                    <line x1={0} y1={0} x2={(a.x2 ?? a.x) - a.x} y2={(a.y2 ?? a.y) - a.y} stroke={a.color || '#1e293b'} strokeWidth={1.5} />
                  ) : <text
                    fontSize={a.fontSize || 10}
                    fontFamily="sans-serif"
                    fontWeight="500"
                    fill={a.color || '#1e293b'}
                  >
                    {a.text}
                  </text>}
                </g>
              )
            })}

            {/* ── Cartographic Elements: North Arrow ── */}
            <g
              transform={`translate(${doc.northArrow.x}, ${doc.northArrow.y}) rotate(${doc.northArrow.rotation})`}
              onPointerDown={e => {
                if (tool === 'select' && !isSpacePressed && e.button === 0) {
                  e.stopPropagation()
                  const mSvg = clientToSvgCoords(e.clientX, e.clientY)
                  dragRef.current = {
                    type: 'north',
                    id: '',
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: doc.northArrow.x,
                    origY: doc.northArrow.y,
                    origMouseSvgX: mSvg.x,
                    origMouseSvgY: mSvg.y,
                  }
                  setSelected({ type: 'north', id: '' })
                }
              }}
              className="cursor-move"
            >
              <line x1={0} y1={25} x2={0} y2={-25} stroke="#0f172a" strokeWidth={1.5} />
              <polygon points="0,-25 -4,-8 4,-8" fill="#0f172a" />
              <text x={0} y={-30} textAnchor="middle" fontSize={10} fontWeight="bold" fontFamily="monospace">N</text>
              <text x={0} y={36} textAnchor="middle" fontSize={7} fontFamily="monospace">{doc.northArrow.type.toUpperCase()}</text>
            </g>

            {/* ── Cartographic Elements: Scale Bar ── */}
            {(() => {
              if (!isScaleKnown(doc) || doc.scaleBar.scaleMeters <= 0) return null
              const barPixels = doc.scaleBar.scaleMeters / doc.metersPerPixel
              return (
                <g
                  transform={`translate(${doc.scaleBar.x}, ${doc.scaleBar.y})`}
                  onPointerDown={e => {
                    if (tool === 'select' && !isSpacePressed && e.button === 0) {
                      e.stopPropagation()
                      const mSvg = clientToSvgCoords(e.clientX, e.clientY)
                      dragRef.current = {
                        type: 'scale',
                        id: '',
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: doc.scaleBar.x,
                        origY: doc.scaleBar.y,
                        origMouseSvgX: mSvg.x,
                        origMouseSvgY: mSvg.y,
                      }
                      setSelected({ type: 'scale', id: '' })
                    }
                  }}
                  className="cursor-move"
                >
                  <line x1={0} y1={0} x2={barPixels} y2={0} stroke="#0f172a" strokeWidth={2.5} />
                  <line x1={0} y1={-4} x2={0} y2={4} stroke="#0f172a" strokeWidth={1.5} />
                  <line x1={barPixels / 2} y1={-3} x2={barPixels / 2} y2={3} stroke="#0f172a" strokeWidth={1} />
                  <line x1={barPixels} y1={-4} x2={barPixels} y2={4} stroke="#0f172a" strokeWidth={1.5} />
                  <text x={barPixels / 2} y={-7} textAnchor="middle" fontSize={8} fontFamily="monospace" fontWeight="bold">
                    SCALE BAR: {doc.scaleBar.scaleMeters} m
                  </text>
                </g>
              )
            })()}

            {/* ── Official Survey Title Block ── */}
            <g transform={`translate(${doc.width - 280}, ${doc.height - 80})`}>
              <rect width={270} height={70} fill="#ffffff" stroke="#0f172a" strokeWidth={1.2} />
              <line x1={0} y1={22} x2={270} y2={22} stroke="#0f172a" strokeWidth={0.8} />
              <line x1={135} y1={22} x2={135} y2={70} stroke="#0f172a" strokeWidth={0.8} />

              <text x={8} y={15} fontSize={8.5} fontFamily="monospace" fontWeight="bold" fill="#0f172a">
                {doc.titleBlock.projectName}
              </text>
              <text x={8} y={35} fontSize={7} fontFamily="monospace" fill="#334155">LR: {doc.titleBlock.lrNumber}</text>
              <text x={8} y={48} fontSize={7} fontFamily="monospace" fill="#334155">SURV: {doc.titleBlock.surveyor}</text>
              <text x={8} y={61} fontSize={7} fontFamily="monospace" fill="#334155">REG: {doc.titleBlock.regNo}</text>

              <text x={142} y={35} fontSize={7} fontFamily="monospace" fill="#334155">SCALE: {doc.titleBlock.scale}</text>
              <text x={142} y={48} fontSize={7} fontFamily="monospace" fill="#334155">DATE: {doc.titleBlock.date}</text>
              <text x={142} y={61} fontSize={7} fontFamily="monospace" fill="#334155">SHEET: {doc.titleBlock.sheet}</text>
            </g>
          </svg>

          <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">Continuous canvas · Pan tool / Space + drag · Zoom + / −</p>

          {/* Measure Result Banner */}
          {measureResult && (
            <div className="absolute top-4 left-4 bg-gray-900/90 border border-cyan-500/40 backdrop-blur px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-3 text-cyan-300">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Distance: <b>{measureResult.distM.toFixed(3)} m</b></span>
              <span>WCB: <b>{measureResult.bearingStr}</b></span>
              <button onClick={() => setMeasureResult(null)} className="text-gray-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>

        {/* ── Right Properties & Controls Sidebar ── */}
        <div id={propertiesId} className={`${propertiesOpen ? 'block' : 'hidden'} absolute inset-y-0 right-0 z-20 w-72 max-w-full bg-gray-900 border-l border-gray-800 p-3 overflow-y-auto text-xs space-y-4 lg:static lg:shrink-0`}>
          <button type="button" onClick={() => setPropertiesOpen(false)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-gray-700 px-3 text-gray-200">
            Close properties <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <CadMeasurementsPanel result={topology.result} loading={topology.loading} error={topology.error}
            scaleText={isScaleKnown(doc)?`1 px ≈ ${doc.metersPerPixel.toFixed(3)} m`:'Uncalibrated'}
            pointCount={doc.beacons.length} onSchedule={()=>setShowScheduleModal(true)} />
          {/* Background Map Image Panel */}
          <CadReferenceSettings document={doc} onApply={next => {
            pushHistory(next)
            setSelected(null); setActiveLineStart(null); setMeasureStart(null); setMeasureResult(null)
            setCalibrationPoints([]); setTool('select')
            setCmdLog('Command: REFERENCE > Declared grid applied; supplied coordinates preserved.')
          }} />
          {doc.backgroundImage && (
            <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
              <div className="flex items-center justify-between font-semibold text-gray-300">
                <span className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Map Image</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (!doc.backgroundImage) return
                      const nextBg = { ...doc.backgroundImage, visible: !doc.backgroundImage.visible }
                      pushHistory({ ...doc, backgroundImage: nextBg })
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                    title={doc.backgroundImage.visible ? 'Hide Image' : 'Show Image'}
                  >
                    {doc.backgroundImage.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      if (!doc.backgroundImage) return
                      const nextBg = { ...doc.backgroundImage, locked: !doc.backgroundImage.locked }
                      pushHistory({ ...doc, backgroundImage: nextBg })
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                    title={doc.backgroundImage.locked ? 'Unlock Image' : 'Lock Image'}
                  >
                    {doc.backgroundImage.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => pushHistory({ ...doc, backgroundImage: null })}
                    className="p-1 text-gray-400 hover:text-red-400"
                    title="Remove Image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 uppercase">Opacity: {Math.round(doc.backgroundImage.opacity * 100)}%</label>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={doc.backgroundImage.opacity}
                  onChange={e => {
                    const opacity = parseFloat(e.target.value)
                    setDoc(prev => ({
                      ...prev,
                      backgroundImage: prev.backgroundImage ? { ...prev.backgroundImage, opacity } : null,
                    }))
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setTool('calibrate'); setCalibrationPoints([]) }}
                  className="w-full text-[11px] h-7 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <Scaling className="w-3 h-3 mr-1" />
                  Calibrate Scale (2-Pt)
                </Button>
              </div>
            </div>
          )}

          {/* Selected Item Properties */}
          {selectedBeacon && (
            <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
              <div className="flex items-center justify-between font-semibold text-gray-300">
                <span>Beacon: {selectedBeacon.label}</span>
                <button
                  onClick={() => {
                    const nextBeacons = doc.beacons.map(b => b.id === selectedBeacon.id ? { ...b, locked: !b.locked } : b)
                    pushHistory({ ...doc, beacons: nextBeacons })
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  {selectedBeacon.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Label</label>
                <Input
                  value={selectedBeacon.label}
                  onChange={e => {
                    const label = e.target.value
                    setDoc(prev => ({
                      ...prev,
                      beacons: prev.beacons.map(b => b.id === selectedBeacon.id ? { ...b, label } : b),
                    }))
                  }}
                  onBlur={() => pushHistory(doc)}
                  className="h-7 text-xs bg-gray-900 border-gray-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Beacon Symbol</label>
                <select
                  value={selectedBeacon.symbol || 'concrete_beacon'}
                  onChange={e => {
                    const sym = e.target.value
                    const next = doc.beacons.map(b => b.id === selectedBeacon.id ? { ...b, symbol: sym } : b)
                    pushHistory({ ...doc, beacons: next })
                  }}
                  className="w-full h-7 bg-gray-900 border border-gray-800 rounded px-2 text-xs"
                >
                  <option value="concrete_beacon">Concrete Beacon (Standard)</option>
                  <option value="iron_peg">Iron Peg in Concrete</option>
                  <option value="iron_pin">Iron Pin / Nail</option>
                  <option value="control_pillar">Trig / Control Pillar</option>
                  <option value="natural_mark">Natural Mark / Tree</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase">Project grid coordinates (m)</label>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                  <div>
                    <span className="text-[9px] text-gray-500 block mb-0.5">Easting (m)</span>
                    <Input
                      value={beaconEastInput}
                      onChange={e => setBeaconEastInput(e.target.value)}
                      onBlur={() => commitGridCoordinate(selectedBeacon.id, 'easting', beaconEastInput)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          commitGridCoordinate(selectedBeacon.id, 'easting', beaconEastInput)
                        }
                      }}
                      placeholder="Easting"
                      className="h-7 text-xs bg-gray-900 border-gray-800 font-mono px-2"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 block mb-0.5">Northing (m)</span>
                    <Input
                      value={beaconNorthInput}
                      onChange={e => setBeaconNorthInput(e.target.value)}
                      onBlur={() => commitGridCoordinate(selectedBeacon.id, 'northing', beaconNorthInput)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          commitGridCoordinate(selectedBeacon.id, 'northing', beaconNorthInput)
                        }
                      }}
                      placeholder="Northing"
                      className="h-7 text-xs bg-gray-900 border-gray-800 font-mono px-2"
                    />
                  </div>
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={deleteSelected} className="w-full text-xs h-7">
                Delete Beacon
              </Button>
            </div>
          )}

          {selectedBoundary && (
            <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
              <span className="font-semibold text-gray-300 block">Boundary Leg</span>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                <div className="p-1.5 bg-gray-900 rounded border border-gray-800">
                  <span className="text-gray-500 block">Distance</span>
                  <span>{selectedBoundary.distanceM !== undefined ? `${selectedBoundary.distance} m` : selectedBoundary.distance}</span>
                </div>
                <div className="p-1.5 bg-gray-900 rounded border border-gray-800">
                  <span className="text-gray-500 block">Bearing (WCB)</span>
                  <span>{selectedBoundary.bearing}</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Boundary Type</label>
                <select
                  value={selectedBoundary.type}
                  onChange={e => {
                    const type = e.target.value as CADBoundary['type']
                    const next = doc.boundaries.map(b => b.id === selectedBoundary.id ? { ...b, type } : b)
                    pushHistory({ ...doc, boundaries: next })
                  }}
                  className="w-full h-7 bg-gray-900 border border-gray-800 rounded px-2 text-xs"
                >
                  <option value="standard">Standard Cadastral</option>
                  <option value="road">Road Reserve</option>
                  <option value="fence">Fence / Hedge</option>
                  <option value="water">Riparian / Water</option>
                </select>
              </div>
              <Button size="sm" variant="destructive" onClick={deleteSelected} className="w-full text-xs h-7">
                Delete Boundary
              </Button>
            </div>
          )}

          {selectedAnnotation && (
            <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
              <span className="font-semibold text-gray-300 block">Text Annotation</span>
              <Input
                value={selectedAnnotation.text || ''}
                onChange={e => {
                  const text = e.target.value
                  setDoc(prev => ({
                    ...prev,
                    annotations: prev.annotations.map(a => a.id === selectedAnnotation.id ? { ...a, text } : a),
                  }))
                }}
                onBlur={() => pushHistory(doc)}
                className="h-7 text-xs bg-gray-900 border-gray-800"
              />
              <Button size="sm" variant="destructive" onClick={deleteSelected} className="w-full text-xs h-7">
                Delete Text
              </Button>
            </div>
          )}

          {/* Title Block Editor */}
          <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-1.5">
            <span className="font-semibold text-gray-300 block">Title Block Details</span>
            <div>
              <label className="text-[9px] text-gray-500 uppercase">Project / Owner</label>
              <Input
                value={doc.titleBlock.projectName}
                onChange={e => {
                  const projectNameVal = e.target.value
                  setDoc(prev => ({ ...prev, titleBlock: { ...prev.titleBlock, projectName: projectNameVal } }))
                }}
                onBlur={() => pushHistory(doc)}
                className="h-6 text-[11px] bg-gray-900 border-gray-800"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase">LR Number</label>
              <Input
                value={doc.titleBlock.lrNumber}
                onChange={e => {
                  const lrVal = e.target.value
                  setDoc(prev => ({ ...prev, titleBlock: { ...prev.titleBlock, lrNumber: lrVal } }))
                }}
                onBlur={() => pushHistory(doc)}
                className="h-6 text-[11px] bg-gray-900 border-gray-800"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase">Surveyor & Reg</label>
              <Input
                value={doc.titleBlock.surveyor}
                onChange={e => {
                  const sVal = e.target.value
                  setDoc(prev => ({ ...prev, titleBlock: { ...prev.titleBlock, surveyor: sVal } }))
                }}
                onBlur={() => pushHistory(doc)}
                className="h-6 text-[11px] bg-gray-900 border-gray-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom AutoCAD CLI Bar ── */}
      <div className="bg-gray-900 border-t border-gray-800 px-3 py-1.5 shrink-0 flex items-center gap-2">
        <form onSubmit={handleCommandSubmit} className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-mono text-cyan-400 font-bold text-xs uppercase shrink-0">Command:</span>
          <input
            type="text"
            value={cmdInput}
            aria-label="CAD command"
            onChange={e => setCmdInput(e.target.value)}
            placeholder={cmdLog}
            className="min-h-11 min-w-0 flex-1 bg-gray-950 border border-gray-800 rounded px-2.5 py-1 text-base sm:text-xs font-mono text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            className="min-h-11 px-3 py-1 bg-[var(--accent)] hover:opacity-90 text-[var(--bg-primary)] font-medium text-xs rounded"
          >
            Enter
          </button>
        </form>

        <div className="text-[10px] font-mono text-gray-400 flex items-center gap-3">
          <span className="hidden lg:inline">X: {mousePos.x.toFixed(1)}</span>
          <span className="hidden lg:inline">Y: {mousePos.y.toFixed(1)}</span>
          <button
            aria-label="Toggle object snapping" aria-pressed={snappingEnabled}
            onClick={() => setSnappingEnabled(v => !v)}
            className={`min-h-11 px-2 py-0.5 rounded border text-[10px] ${snappingEnabled ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-gray-700 text-gray-500'}`}
          >
            SNAP {snappingEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── 2-Point Scale Calibration Modal ── */}
      <Dialog.Root open={calibrationDialogOpen} onOpenChange={open => {
        setCalibrationDialogOpen(open)
        if (!open) { setCalibrationPoints([]); setCalibrationError('') }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); calibrationReturnFocus.current?.focus() }}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-gray-900 border-gray-800 p-5 space-y-4 text-gray-100">
            <Dialog.Title className="text-sm font-bold flex items-center gap-2">
              <Scaling className="w-4 h-4 text-cyan-400" /> Calibrate image / drawing scale
            </Dialog.Title>
            <Dialog.Description className="text-xs text-gray-400">
              {hasCadReferenceFrame(doc)
                ? 'Enter the known project grid distance between the two image points. Only the image will resize; survey controls stay unchanged.'
                : 'Enter the known metric distance between the two picked points. This sets drawing scale without assigning a CRS or grid origin.'}
              {' '}Convert ground distances to grid in the survey calculation workflow when required.
            </Dialog.Description>
            <form onSubmit={event => { event.preventDefault(); applyScaleCalibration() }} className="space-y-4">
            <div>
              <label htmlFor="cad-calibration-distance" className="text-xs text-gray-400 uppercase font-mono block mb-1">Known grid / drawing distance (metres)</label>
              <Input
                id="cad-calibration-distance"
                type="text"
                placeholder="e.g. 50.0"
                value={calibrationDistanceInput}
                onChange={e => setCalibrationDistanceInput(e.target.value)}
                autoFocus
                className="bg-gray-950 border-gray-800 text-white font-mono text-sm"
              />
            </div>
            {calibrationError && <p role="alert" className="text-xs text-amber-300">{calibrationError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setCalibrationDialogOpen(false); setCalibrationPoints([]) }}
                className="flex-1 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
              >
                Apply Scale
              </Button>
            </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Coordinate Schedule Table Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-xl w-full max-h-[85vh] flex flex-col space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" /> Cadastral Beacon Coordinate Schedule
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-80 border border-gray-800 rounded-lg">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-gray-950 text-gray-400 sticky top-0 border-b border-gray-800">
                  <tr>
                    <th className="py-2 px-3">Beacon</th>
                    <th className="py-2 px-3">Easting (m)</th>
                    <th className="py-2 px-3">Northing (m)</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {doc.beacons.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-500 italic">No beacons planted yet</td>
                    </tr>
                  ) : (
                    doc.beacons.map(b => (
                      <tr key={b.id} className="hover:bg-gray-800/50">
                        <td className="py-1.5 px-3 font-bold text-cyan-400">{b.label}</td>
                        <td className="py-1.5 px-3 text-gray-200">{b.easting?.toFixed(3) ?? '—'}</td>
                        <td className="py-1.5 px-3 text-gray-200">{b.northing?.toFixed(3) ?? '—'}</td>
                        <td className="py-1.5 px-3 text-gray-400">{b.symbol || 'beacon'}</td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            onClick={() => {
                              setSelected({ type: 'beacon', id: b.id })
                              setShowScheduleModal(false)
                            }}
                            className="text-cyan-400 hover:underline text-[11px]"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-800">
              <span className="text-[11px] text-gray-400">Total: {doc.beacons.length} beacons</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportCSV} className="text-xs h-7">
                  <Download className="w-3 h-3 mr-1" /> Download CSV
                </Button>
                <Button size="sm" onClick={() => setShowScheduleModal(false)} className="text-xs h-7 bg-cyan-600 hover:bg-cyan-500 text-white font-bold">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Official County Subdivision / Amalgamation Scheme Plan Modal */}
      <SubdivisionPlanModal
        isOpen={showSubdivisionPlanModal}
        onClose={() => setShowSubdivisionPlanModal(false)}
        cadDoc={doc}
      />
    </div>
  )
}

// ─── Toolbar Icon Button ───────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active?: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`min-h-11 min-w-11 p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors ${
        active
          ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200 border border-transparent'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
