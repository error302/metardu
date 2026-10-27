'use client'
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  Route,
  Box,
  ChartNoAxesCombined,
  Columns2,
} from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import type { RoadDesignData } from '@/types/engineering'
import type { QuantityReference } from '@/lib/engineering/roadQuantity'
import {
  buildRoadWorkbenchModel,
  roadWorkbenchSection,
} from '@/lib/engineering/roadWorkbench'
import RoadWorkbench3D from './RoadWorkbench3D'
import { roadWorkbenchPlot } from '@/lib/engineering/roadWorkbenchPlot'
import {terrainPreviewRoad,sectionFromRetainedTerrain,type RoadTerrainData} from '@/lib/engineering/roadTerrain'
import {roadHorizontalStation} from '@/lib/engineering/roadCoordinateSetout'
import {assessRoadTerrainCoverage} from '@/lib/engineering/roadTerrainCoverage'
import {assessRoadCorridorOverlap} from '@/lib/engineering/roadCorridorOverlap'
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded border border-[var(--border-color)] px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40'
const value = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : 'Unassessed'
type View = 'all' | 'plan' | 'profile' | 'section' | '3d'
export default function RoadWorkbench({
  projectId,
  road,
  reference,
  sourceLabel,
  terrain,
}: {
  projectId?: string
  road: RoadDesignData | null
  reference: QuantityReference
  sourceLabel?: string
  terrain?: RoadTerrainData
}) {
  const [groundSource,setGroundSource]=useState<'measured'|'terrain'>('measured')
  const exactTerrain=!!(road?.retainedTerrain&&terrain&&terrain.identity.revisionId===road.retainedTerrain.revisionId&&terrain.identity.meshHash===road.retainedTerrain.meshHash&&(!projectId||terrain.identity.projectId===projectId&&road.retainedTerrain.projectId===projectId))
  const [coverage,setCoverage]=useState<{projectId?:string;road:RoadDesignData;terrain:RoadTerrainData;reference:QuantityReference;text:string}|null>(null)
  const [corridor,setCorridor]=useState<{projectId?:string;road:RoadDesignData;terrain:RoadTerrainData;reference:QuantityReference;text:string}|null>(null)
  useEffect(()=>{
    if(groundSource!=='terrain'||!road?.retainedTerrain||!terrain||!exactTerrain)return
    const controller=new AbortController()
    void assessRoadCorridorOverlap(road,reference,road.retainedTerrain.halfWidthM,controller.signal).then(result=>{
      if(!controller.signal.aborted)setCorridor({projectId,road,terrain,reference,text:result.status==='clear'?result.reason:`Overlap unassessed: ${result.reason}`})
    }).catch(()=>{
      if(!controller.signal.aborted)setCorridor({projectId,road,terrain,reference,text:'Corridor overlap could not be checked. Separation and volumes remain unassessed.'})
    })
    void assessRoadTerrainCoverage(road,reference,terrain.mesh,road.retainedTerrain.halfWidthM,controller.signal).then(result=>{
      if(!controller.signal.aborted)setCoverage({projectId,road,terrain,reference,text:result.status==='covered'?result.reason:`Coverage unassessed: ${result.reason}`})
    }).catch(()=>{
      if(!controller.signal.aborted)setCoverage({projectId,road,terrain,reference,text:'Continuous terrain coverage could not be checked. Coverage and volumes remain unassessed.'})
    })
    return()=>controller.abort()
  },[road,reference,terrain,groundSource,projectId,exactTerrain])
  const model = useMemo(
    () => {
      if(groundSource==='measured')return buildRoadWorkbenchModel(road,reference)
      try{
        if(!road?.retainedTerrain||!terrain||!exactTerrain)throw Error('Load the exact selected project terrain before reviewing computed sections.')
        const computed=buildRoadWorkbenchModel(terrainPreviewRoad(road,reference,terrain.mesh,road.retainedTerrain),reference,{assessQuantities:false})
        computed.issues.push('Terrain section areas are computed from retained faces. Whole-road terrain volumes remain unassessed until continuous coverage and volume integration are verified.')
        return computed
      }catch(cause){const empty=buildRoadWorkbenchModel(null,reference);empty.issues=[cause instanceof Error?cause.message:'Terrain review could not be computed.'];return empty}
    },
    [road, reference,terrain,groundSource,exactTerrain],
  )
  const [chosen, setChosen] = useState<string | null>(null),
    [view, setView] = useState<View>('all')
  const chainage =
    chosen === null
      ? (model.start ?? Number.NaN)
      : chosen.trim()
        ? Number(chosen)
        : Number.NaN
  const section = useMemo(
    () => {
      if(groundSource!=='terrain'||!terrain||!road?.retainedTerrain||!model.horizontal||model.stationByChainage.has(chainage))return roadWorkbenchSection(model,chainage)
      try{
        const position=roadHorizontalStation(model.horizontal,chainage)
        if(!position)return roadWorkbenchSection(model,chainage)
        const groundProfile=sectionFromRetainedTerrain(terrain.mesh,position,road.retainedTerrain.halfWidthM)
        const centre=groundProfile.find(p=>p.offset===0)
        if(!centre)return roadWorkbenchSection(model,chainage)
        const stations=new Map(model.stationByChainage);stations.set(chainage,{chainage,groundLevel:centre.level,groundProfile,designLevelSource:'vertical-alignment'})
        return roadWorkbenchSection({...model,stationByChainage:stations},chainage)
      }catch(cause){const empty=roadWorkbenchSection({...model,stationByChainage:new Map()},chainage);empty.issues=[cause instanceof Error?cause.message:'Terrain coverage is unknown.'];return empty}
    },
    [model, chainage,groundSource,terrain,road],
  )
  const href = (step: string) =>
    `/project/${encodeURIComponent(projectId ?? '')}/engineering?tab=workflow&step=${step}`
  const select = (n: number) => setChosen(String(n))
  const modes: [View, string, typeof Layers][] = [
    ['all', 'All views', Layers],
    ['plan', 'Plan only', Route],
    ['3d', '3D only', Box],
    ['profile', 'Profile only', ChartNoAxesCombined],
    ['section', 'Section only', Columns2],
  ]
  const measured = model.stations.map((s) => s.chainage)
  const previous = [...measured].reverse().find((ch) => ch < chainage),
    next = measured.find((ch) => ch > chainage)
  const xy = model.plan.map((p) => [p.easting, p.northing] as [number, number])
  const profile = model.profile.map(
    (p) => [p.chainage, p.elevation] as [number, number],
  )
  return (
    <section
      aria-label="Road visual workspace"
      className="min-w-0 space-y-4 text-[var(--text-primary)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-color)] pb-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <GeomaticsIcon symbol="traverse" className="h-4 w-4" />
            {sourceLabel ?? (projectId
              ? 'Saved project design · visual review'
              : 'Synthetic worked example · visual review')}
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold">
            {road?.roadName || 'Road workspace'}
          </h1>
          <p className="mt-1 max-w-prose text-xs text-[var(--text-secondary)]">
            {reference.code || 'Project CRS not declared'} ·{' '}
            {reference.verticalDatum || 'Height reference not declared'} ·{' '}
            {reference.distanceMode || 'Distance basis not declared'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {projectId ? (
            <>
              <Link className={button} href={href('horizontal')}>
                Edit alignment inputs
              </Link>
              <Link className={button} href={href('export')}>
                Open delivery schedules
              </Link>
            </>
          ) : (
            <Link className={button} href="/dashboard">
              Open your project
            </Link>
          )}
        </div>
      </header>
      {road?.retainedTerrain&&<div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] pb-3" aria-label="Ground review source">
        <button type="button" className={button} aria-pressed={groundSource==='measured'} onClick={()=>setGroundSource('measured')}>Measured sections</button>
        <button type="button" className={button} aria-pressed={groundSource==='terrain'} disabled={!exactTerrain} onClick={()=>setGroundSource('terrain')}>Retained terrain (computed)</button>
        <p className="min-w-0 text-xs text-[var(--text-secondary)]">{road.retainedTerrain.name} · R{road.retainedTerrain.revision} · {groundSource==='terrain'?'Computed terrain sections; original measurements are unchanged.':'Original station observations.'}</p>
      </div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Road view modes" className="flex flex-wrap gap-1">
          {modes.map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              className={`${button} ${view === mode ? 'bg-[var(--bg-secondary)] font-semibold' : ''}`}
              onClick={() => setView(mode)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className={button}
            aria-label={groundSource==='terrain'?'Previous computed terrain section':'Previous measured section'}
            disabled={previous === undefined}
            onClick={() => {
              if (previous !== undefined) select(previous)
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <label className="block text-xs">
            <span>Selected chainage (m)</span>
            <input
              type="number"
              step="any"
              value={
                chosen ?? (model.start === null ? '' : String(model.start))
              }
              onChange={(e) => setChosen(e.target.value)}
              className="mt-1 block min-h-11 w-40 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 font-mono"
            />
          </label>
          <button
            type="button"
            className={button}
            aria-label={groundSource==='terrain'?'Next computed terrain section':'Next measured section'}
            disabled={next === undefined}
            onClick={() => {
              if (next !== undefined) select(next)
            }}
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-[var(--border-color)] py-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ['Selected easting', section.position?.easting],
            ['Selected northing', section.position?.northing],
            ['Selected target level', section.target],
            ['Selected cut area', section.cutArea],
            [groundSource==='terrain'?'Terrain preview cut volume':'Draft cut volume', model.quantity?.result.totalCut],
            [groundSource==='terrain'?'Terrain preview fill volume':'Draft fill volume', model.quantity?.result.totalFill],
          ] as const
        ).map(([name, n]) => (
          <div key={name} className="min-w-0">
            <dt className="text-[var(--text-secondary)]">
              {name}
              {name.includes('volume')
                ? ' (m³)'
                : name.includes('area')
                  ? ' (m²)'
                  : ' (m)'}
            </dt>
            <dd
              aria-label={name}
              className="mt-1 break-all font-mono text-sm tabular-nums"
            >
              {value(n)}
            </dd>
          </div>
        ))}
      </dl>
      {groundSource==='terrain'&&<p role="status" aria-label="Continuous terrain coverage" className="break-words border-l-2 border-[var(--border-color)] pl-3 text-xs text-[var(--text-secondary)]">
        {!exactTerrain?'Load the exact selected terrain to check continuous coverage. Coverage and volumes remain unassessed.':coverage&&coverage.projectId===projectId&&coverage.road===road&&coverage.terrain===terrain&&coverage.reference===reference?coverage.text:'Checking the full terrain review strip between sections… Coverage and volumes remain unassessed.'}
      </p>}
      {groundSource==='terrain'&&<p role="status" aria-label="Corridor overlap review" className="break-words border-l-2 border-[var(--border-color)] pl-3 text-xs text-[var(--text-secondary)]">
        {!exactTerrain?'Load the exact selected terrain to review the corridor strip. Separation and volumes remain unassessed.':corridor&&corridor.projectId===projectId&&corridor.road===road&&corridor.terrain===terrain&&corridor.reference===reference?corridor.text:'Checking the complete corridor strip for overlap… Separation and volumes remain unassessed.'}
      </p>}
      {model.issues.length > 0 && (
        <div
          role="status"
          className="space-y-1 border-l-2 border-amber-500/60 pl-3 text-xs text-[var(--text-secondary)]"
        >
          {model.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
      <div
        className={`grid min-w-0 gap-3 ${view === 'all' ? 'xl:grid-cols-2' : ''}`}
      >
        {(view === 'all' || view === 'plan') && (
          <Pane
            title="Plan view"
            detail="Grid metres: easting right, northing up. Select the alignment."
          >
            <RoadPlot
              label="Plan view"
              paths={[{ points: xy, kind: 'design' }]}
              markers={
                section.position
                  ? [[section.position.easting, section.position.northing]]
                  : []
              }
              onPick={(_, index) => {
                if (model.plan[index]) select(model.plan[index].chainage)
              }}
            />
          </Pane>
        )}
        {(view === 'all' || view === '3d') && (
          <Pane
            title={groundSource==='terrain'?'3D formation and retained terrain':'3D formation and measured sections'}
            detail={groundSource==='terrain'?'Exact retained mesh and computed section lines. Draft review only.':'Design preview and measured section lines. No terrain TIN is inferred.'}
          >
            {model.horizontal && reference.verticalDatum ? (
              <RoadWorkbench3D model={model} chainage={chainage} terrain={groundSource==='terrain'?terrain:undefined}/>
            ) : (
              <p className="flex min-h-64 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
                A valid alignment and declared height reference are required for
                3D.
              </p>
            )}
          </Pane>
        )}
        {(view === 'all' || view === 'profile') && (
          <Pane
            title="Longitudinal profile"
            detail={groundSource==='terrain'?'Evaluated vertical design and terrain-derived ground. Profile axes use independent scales.':'Evaluated vertical design; measured ground marks. Profile axes use independent scales.'}
          >
            <RoadPlot
              label="Longitudinal profile"
              paths={[{ points: profile, kind: 'design' }]}
              dots={model.stations
                .filter((s) => Number.isFinite(s.groundLevel))
                .map((s) => [s.chainage, s.groundLevel])}
              markers={
                model.vertical && Number.isFinite(chainage)
                  ? ([[chainage, section.target ?? Number.NaN]].filter((p) =>
                      p.every(Number.isFinite),
                    ) as [number, number][])
                  : []
              }
              onPick={(x) => select(x)}
            />
          </Pane>
        )}
        {(view === 'all' || view === 'section') && (
          <Pane
            title="Cross-section"
            detail={`${Number.isFinite(chainage) ? chainage.toFixed(3) : 'Unselected'} m · ${section.targetSource || 'No target source'} · ${section.measured ? groundSource==='terrain'?'computed terrain section':'saved measured station' : 'no ground section'}`}
          >
            <RoadPlot
              label="Cross-section"
              paths={[
                {
                  points: section.ground.map((p) => [p.offset, p.level]),
                  kind: 'ground',
                },
                {
                  points: section.formation.map((p) => [p.offset, p.level]),
                  kind: 'design',
                },
              ]}
            />
            {section.issues.length > 0 && (
              <div
                role="status"
                className="space-y-1 border-t border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-secondary)]"
              >
                {section.issues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            )}
          </Pane>
        )}
      </div>
      <footer className="flex flex-wrap justify-between gap-3 text-xs text-[var(--text-secondary)]">
        <p className="max-w-prose">
          Amber: evaluated design. Green: {groundSource==='terrain'?'computed retained terrain':'measured ground'}.{' '}
          {projectId
            ? 'Views use the same saved project draft.'
            : 'All example inputs are synthetic.'}{' '}
          Field verification, adopted criteria and construction approval remain
          separate.
        </p>
        {projectId && (
          <div className="flex flex-wrap gap-3">
            <Link
              className="underline underline-offset-4"
              href={href('vertical')}
            >
              Vertical inputs
            </Link>
            <Link
              className="underline underline-offset-4"
              href={href('cross_section')}
            >
              Section template
            </Link>
            <Link
              className="underline underline-offset-4"
              href={href('stations')}
            >
              Measured section inputs
            </Link>
          </div>
        )}
      </footer>
    </section>
  )
}
function Pane({
  title,
  detail,
  children,
}: {
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-color)] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>
      </header>
      {children}
    </section>
  )
}
function RoadPlot({
  label,
  paths,
  dots = [],
  markers = [],
  onPick,
}: {
  label: string
  paths: Array<{ points: [number, number][]; kind: 'ground' | 'design' }>
  dots?: [number, number][]
  markers?: [number, number][]
  onPick?: (x: number, index: number) => void
}) {
  const points = [...paths.flatMap((p) => p.points), ...dots].filter((p) =>
    p.every(Number.isFinite),
  )
  const plotRef = useRef<SVGSVGElement>(null),
    [plotWidth, setPlotWidth] = useState(800)
  const hasPoints = points.length > 0
  useEffect(() => {
    const element = plotRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const resize = () =>
      setPlotWidth(
        Math.max(260, Math.round(element.getBoundingClientRect().width)),
      )
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    return () => observer.disconnect()
  }, [hasPoints])
  if (!points.length)
    return (
      <div
        aria-label={label}
        className="flex min-h-64 items-center justify-center p-6 text-sm text-[var(--text-secondary)]"
      >
        No evaluated source is available for this view.
      </div>
    )
  const {
    xMin: minX,
    xMax: maxX,
    yMin: minY,
    yMax: maxY,
    project,
    chainageAt,
    right,
  } = roadWorkbenchPlot(points, label !== 'Longitudinal profile', plotWidth)
  function pick(e: MouseEvent<SVGSVGElement>) {
    if (!onPick) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = ((e.clientX - rect.left) / rect.width) * plotWidth,
      py = ((e.clientY - rect.top) / rect.height) * 280
    if (label === 'Plan view') {
      let nearest = 0,
        distance = Infinity
      paths[0]?.points.forEach((p, i) => {
        const q = project(p),
          d = Math.hypot(q[0] - px, q[1] - py)
        if (d < distance) {
          distance = d
          nearest = i
        }
      })
      onPick(paths[0]?.points[nearest]?.[0] ?? minX, nearest)
    } else onPick(chainageAt(px), 0)
  }
  return (
    <svg
      aria-label={label}
      role="img"
      ref={plotRef}
      viewBox={`0 0 ${plotWidth} 280`}
      className="block h-[280px] w-full"
      onClick={pick}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line
            x1="112"
            x2={right}
            y1={40 + i * 50}
            y2={40 + i * 50}
            stroke="currentColor"
            opacity=".1"
          />
          <text
            x="106"
            y={44 + i * 50}
            textAnchor="end"
            fontSize="12"
            fill="currentColor"
            opacity=".8"
          >
            {(maxY - ((maxY - minY) * i) / 4).toFixed(2)}
          </text>
        </g>
      ))}
      {paths.map((path, i) => (
        <polyline
          key={i}
          data-layer={path.kind}
          points={path.points.map((p) => project(p).join(',')).join(' ')}
          fill="none"
          stroke={path.kind === 'ground' ? '#88a99d' : '#dfb364'}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {dots.map((p, i) => {
        const q = project(p)
        return <circle key={i} cx={q[0]} cy={q[1]} r="2.5" fill="#88a99d" />
      })}
      {markers.map((p, i) => {
        const q = project(p)
        return (
          <g key={i}>
            <circle
              cx={q[0]}
              cy={q[1]}
              r="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d={`M${q[0] - 9} ${q[1]}h18M${q[0]} ${q[1] - 9}v18`}
              stroke="currentColor"
            />
          </g>
        )
      })}
      <text x="112" y="265" fontSize="12" fill="currentColor">
        {minX.toFixed(2)}
      </text>
      <text
        x={right}
        y="265"
        textAnchor="end"
        fontSize="12"
        fill="currentColor"
      >
        {maxX.toFixed(2)}
      </text>
    </svg>
  )
}
