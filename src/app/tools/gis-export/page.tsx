'use client';

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/api-client/client'
import { generateGeoJSON } from '@/lib/export/generateGeoJSON'
import type { SurveyPoint } from '@/types/surveyPoint'
import { generateLandXML } from '@/lib/export/generateLandXML'
import { reportCrs, type VerifiedReportCrs } from '@/lib/generators/reportCrs'
import { utmToWgs84 } from '@/lib/spatial/projectReferenceSystem'
import { PageHeader } from '@/components/shared/PageHeader'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

function download(content: string, filename: string, mime = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = filename; a.click()
}

// ── WKT projection string generator ─────────────────────────────────────────
// Datum/ellipsoid come from the declared project CRS — never assumed WGS 84.
function getWKT(crs: VerifiedReportCrs): string {
  const isArc = crs.ellipsoid === 'Clarke 1880 (RGS)'
  const geogName = isArc ? 'Arc 1960' : 'WGS 84'
  const datumName = isArc ? 'Arc_1960' : 'WGS_1984'
  const spheroidName = isArc ? 'Clarke 1880 (RGS)' : 'WGS 84'
  const isNorth = crs.hemi === 'N'
  const zoneNum = crs.zone
  const centralMeridian = -183 + zoneNum * 6
  return `PROJCS["${crs.crsName}",
  GEOGCS["${geogName}",
    DATUM["${datumName}",SPHEROID["${spheroidName}",${crs.ellipsoidA},${crs.ellipsoidInvF}]],
    PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],
  PROJECTION["Transverse_Mercator"],
  PARAMETER["latitude_of_origin",0],
  PARAMETER["central_meridian",${centralMeridian}],
  PARAMETER["scale_factor",0.9996],
  PARAMETER["false_easting",500000],
  PARAMETER["false_northing",${isNorth ? 0 : 10000000}],
  UNIT["metre",1],AUTHORITY["EPSG","${crs.epsg}"]]`
}

// ── PRJ file for shapefiles ──────────────────────────────────────────────────
function getPRJ(crs: VerifiedReportCrs): string {
  return getWKT(crs)
}

// ── MapInfo TAB-compatible CSV ───────────────────────────────────────────────
// ── Row types for the client-side queries below ───────────────────────────────
interface ProjectRow {
  id: string
  name: string
  utm_zone: number | null
  hemisphere: 'N' | 'S' | null
  datum: string | null
}

interface PrsRow {
  vertical_datum: string | null
  vertical_reference: string | null
  geoid_model: string | null
  benchmark_basis: string | null
}

function generateMapInfoCSV(points: SurveyPoint[], utmZone: number, hemisphere: 'N' | 'S', datum: string, _projectName: string): string {
  const lines = [`"Name","Easting","Northing","Elevation","Type","Lat_WGS84","Lon_WGS84"`]
  points.forEach((p) => {
    const { lat, lon } = utmToWgs84(p.easting, p.northing, utmZone, hemisphere, datum)
    lines.push(`"${p.name}",${p.easting.toFixed(4)},${p.northing.toFixed(4)},${(p.elevation||0).toFixed(4)},"${p.is_control?'Control':'Survey'}",${lat.toFixed(8)},${lon.toFixed(8)}`)
  })
  return lines.join('\n')
}

// ── KML for Google Earth / Maps ──────────────────────────────────────────────
function generateKML(points: SurveyPoint[], utmZone: number, hemisphere: 'N' | 'S', datum: string, projectName: string): string {
  const placemarks = points.map((p) => {
    const { lat, lon } = utmToWgs84(p.easting, p.northing, utmZone, hemisphere, datum)
    const color = p.is_control ? 'ff0080ff' : 'ff00ff80'
    return `  <Placemark>
    <name>${p.name}</name>
    <description>E: ${p.easting.toFixed(4)} N: ${p.northing.toFixed(4)} Z: ${(p.elevation||0).toFixed(3)} — ${p.is_control?'Control':'Survey'}</description>
    <Style><IconStyle><color>${color}</color><scale>1.0</scale></IconStyle></Style>
    <Point><coordinates>${lon.toFixed(8)},${lat.toFixed(8)},${(p.elevation||0).toFixed(3)}</coordinates></Point>
  </Placemark>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${projectName}</name>
  <description>Survey points exported from METARDU. Orange = Control, Green = Survey</description>
${placemarks}
</Document>
</kml>`
}

function GISExportPage() {
  const { t } = useLanguage()
  const [projects, setProjects]   = useState<ProjectRow[]>([])
  const [projectId, setProjectId] = useState('')
  const [points, setPoints]       = useState<SurveyPoint[]>([])
  const [prs, setPrs]             = useState<PrsRow | null>(null)
  const [loading, setLoading]     = useState(false)
  const [exports, setExports]     = useState<Set<string>>(new Set())
  const [exportError,setExportError] = useState('')

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      sb.from('projects').select('id,name,utm_zone,hemisphere,datum').eq('user_id', user.id)
        .order('created_at', { ascending: false }).then(({ data }) => { if (data) setProjects(data as ProjectRow[]) })
    })
  }, [])

  useEffect(() => {
    if (!projectId) { setPoints([]); setPrs(null); return }
    setLoading(true)
    const sb = createClient()
    Promise.all([
      sb.from('survey_points').select('*').eq('project_id', projectId),
      sb.from('project_reference_systems').select('vertical_datum, vertical_reference, geoid_model, benchmark_basis').eq('project_id', projectId).limit(1),
    ]).then(([ptsRes, prsRes]) => {
      if (ptsRes.data) setPoints(ptsRes.data as SurveyPoint[])
      const rows = (prsRes.data ?? []) as PrsRow[]
      setPrs(rows[0] ?? null)
      setLoading(false)
    })
  }, [projectId])

  const project = projects.find((p) => p.id === projectId)
  const crs = reportCrs({
    utmZone: project?.utm_zone ?? undefined,
    hemisphere: project?.hemisphere ?? undefined,
    datum: project?.datum ?? undefined,
  })
  const ptsMapped = points.map((p) => ({
    name: p.name, easting: p.easting, northing: p.northing,
    elevation: p.elevation ?? null, is_control: p.is_control ?? false,
  }))

  const markExported = (key: string) => setExports(prev => { const s = new Set(Array.from(prev)); s.add(key); return s })

  const doExport = (type: string) => {
    if (!project || !points.length) return
    setExportError('')
    // Fail closed: converting UTM to lat/lon without a declared zone would
    // silently assume one and produce wrong coordinates.
    if (!crs.verified) {
      alert('Set the project CRS (datum, UTM zone, hemisphere) in Project Settings before exporting.')
      return
    }
    const z = crs.zone; const h = crs.hemi as 'N'|'S'
    const name = project.name
    const datum = crs.datum
    const vertical = {
      datum: prs?.vertical_datum ?? undefined,
      reference: prs?.vertical_reference ?? undefined,
      geoidModel: prs?.geoid_model ?? undefined,
      benchmarkBasis: prs?.benchmark_basis ?? undefined,
    }

    try { switch(type) {
      case 'geojson':
        download(generateGeoJSON(ptsMapped, name, z, h, datum, vertical), `${name}_WGS84.geojson`, 'application/geo+json')
        break
      case 'kml':
        download(generateKML(ptsMapped, z, h, datum, name), `${name}.kml`, 'application/vnd.google-earth.kml+xml')
        break
      case 'landxml':
        download(generateLandXML({
          name, utm_zone: z, hemisphere: h, datum,
          vertical_datum: vertical.datum,
          vertical_reference: vertical.reference,
          geoid_model: vertical.geoidModel,
          benchmark_basis: vertical.benchmarkBasis,
        }, ptsMapped), `${name}.xml`, 'application/xml')
        break
      case 'csv':
        download(generateMapInfoCSV(ptsMapped, z, h, datum, name), `${name}_points.csv`)
        break
      case 'prj':
        download(getPRJ(crs), `${name}_UTM${z}${h}.prj`)
        break
      case 'wkt':
        download(getWKT(crs), `${name}_CRS.wkt`)
        break
      // AUDIT FIX (2026-07-03): Added DXF + Shapefile exports.
      // The API routes existed but weren't exposed in the UI.
      case 'dxf':
        // Call the server-side DXF export route
        fetch('/api/compute/export/dxf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: ptsMapped, projectName: name, utmZone: z, hemisphere: h }),
        }).then(r => r.text()).then(dxf => {
          download(dxf, `${name}_survey.dxf`, 'application/dxf')
        }).catch(() => alert('DXF export failed — try the server-side export route'))
        break
      case 'shapefile':
        // Call the server-side Shapefile export route (returns a ZIP)
        fetch('/api/compute/export/shapefile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: ptsMapped, projectName: name, utmZone: z, hemisphere: h }),
        }).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `${name}_shapefile.zip`; a.click()
          URL.revokeObjectURL(url)
        }).catch(() => alert('Shapefile export failed — try the server-side export route'))
        break
    }
    markExported(type)
    }catch(error){setExportError(error instanceof Error?error.message:'The export could not be generated. Source points are retained.')}
  }

  const exportAll = () => {
    ['geojson','dxf','shapefile','kml','landxml','csv','prj','wkt'].forEach((t, i) =>
      setTimeout(() => doExport(t), i * 200)
    )
  }

  const EXPORT_ITEMS = [
    {
      key: 'geojson', icon: '{}',
      title: 'GeoJSON (WGS84)',
      desc: 'Universal format — drop directly into QGIS, ArcGIS, Mapbox, Leaflet, PostGIS.',
      note: 'Coordinates converted to WGS84 lat/lon as required by spec.',
      software: 'QGIS · ArcGIS · Mapbox · PostGIS',
    },
    // AUDIT FIX (2026-07-03): Added DXF + Shapefile export cards.
    {
      key: 'dxf', icon: '△',
      title: 'DXF (AutoCAD/Civil 3D)',
      desc: 'Drawing Exchange Format — the standard for CAD interoperability. Points as POINT entities with layer separation.',
      note: 'Control points on CONTROL layer, survey points on SURVEY layer.',
      software: 'AutoCAD · Civil 3D · MicroStation · BricsCAD',
    },
    {
      key: 'shapefile', icon: '▦',
      title: 'Shapefile (ESRI)',
      desc: 'Industry-standard GIS format. Includes .shp, .shx, .dbf, and .prj files bundled as a ZIP.',
      note: 'Point geometry with attributes (name, elevation, type).',
      software: 'ArcGIS · QGIS · MapInfo · Global Mapper',
    },
    {
      key: 'kml', icon: '◉',
      title: 'KML — Google Earth',
      desc: 'Open in Google Earth Pro to verify positions on satellite imagery before submitting.',
      note: 'Orange pins = control points, green = survey.',
      software: 'Google Earth Pro · Google Maps · QGIS',
    },
    {
      key: 'landxml', icon: '</>',
      title: 'LandXML',
      desc: 'LandXML 1.2 coordinate exchange for CAD and survey systems.',
      note: 'Includes CgPoints with full coordinate metadata.',
      software: 'Civil 3D · 12d · QGIS · Trimble Business Center',
    },
    {
      key: 'csv', icon: '≡',
      title: 'CSV with WGS84',
      desc: 'Spreadsheet-compatible with both UTM and WGS84 columns.',
      note: 'Import into MapInfo, QGIS, ArcGIS, or share with clients.',
      software: 'QGIS · ArcGIS · MapInfo · Excel · Google Sheets',
    },
    {
      key: 'prj', icon: '⊕',
      title: '.prj CRS file',
      desc: 'Projection file for your UTM zone. Attach to shapefile exports to declare coordinate system.',
      note: 'Prevents "unknown coordinate system" errors in GIS software.',
      software: 'ArcGIS · QGIS · MapInfo (attach alongside .shp)',
    },
    {
      key: 'wkt', icon: '◻',
      title: 'WKT Projection String',
      desc: 'Well-Known Text definition of your project coordinate system for database import.',
      note: crs.verified ? crs.epsgCode : 'CRS not declared',
      software: 'PostGIS · SpatiaLite · Oracle Spatial',
    },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <PageHeader
          title={t('tools.gisExport')}
          subtitle={t('tools.gisExportDesc')}
        />

        {/* Project selector */}
        {exportError&&<p role="alert" className="mb-4 rounded-lg border border-red-400 bg-red-950 p-3 text-sm text-red-100">{exportError}</p>}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-48">
              {projects.length === 0
                ? <p className="text-sm text-[var(--text-muted)]">No projects. <Link href="/project/new" className="text-[var(--accent)]">Create one →</Link></p>
                : <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input w-full">
                    <option value="">— Select project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
              }
            </div>
            {project && (
              <div className="text-sm text-[var(--text-muted)] flex-shrink-0">
                {crs.verified
                  ? <>UTM Zone {crs.zone}{crs.hemi} · {crs.epsgCode} · </>
                  : <>CRS not declared · </>}
                {loading ? ' loading…' : ` ${points.length} points`}
              </div>
            )}
            {points.length > 0 && (
              <button onClick={exportAll} className="btn btn-primary flex-shrink-0">
                Download all 8 formats
              </button>
            )}
          </div>
        </div>

        {/* Export grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXPORT_ITEMS.map((item) => {
            const done = exports.has(item.key)
            return (
              <div key={item.key}
                className={`bg-[var(--bg-card)] border rounded-xl p-5 transition-colors ${done ? 'border-green-700/40' : 'border-[var(--border-color)]'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex items-center justify-center text-sm font-mono text-[var(--accent)] font-bold flex-shrink-0">
                    {item.icon}
                  </div>
                  {done && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                      Downloaded
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{item.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">{item.desc}</p>
                <p className="text-[10px] text-[var(--text-muted)] mb-3">{item.note}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{item.software}</p>
                  <button
                    onClick={() => doExport(item.key)}
                    disabled={!points.length}
                    className={`ml-2 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                      done
                        ? 'bg-green-900/30 text-green-400 border border-green-700/30'
                        : 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]'
                    }`}>
                    {done ? 'Re-download' : 'Download'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* CRS explainer */}
        {project && (
          <div className="mt-6 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Coordinate system for this project</h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {[
                { label: 'Projected CRS', value: crs.verified ? crs.crsName : 'Not declared' },
                { label: 'EPSG code', value: crs.verified ? crs.epsgCode : 'UNVERIFIED' },
                { label: 'Geographic CRS', value: 'WGS84 (EPSG:4326)' },
                { label: 'Units', value: 'Metres (projected) / Degrees (geographic)' },
                { label: 'False Easting', value: '500,000 m' },
                { label: 'False Northing', value: crs.verified && crs.hemi === 'S' ? '10,000,000 m' : crs.verified ? '0 m' : 'UNVERIFIED' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--bg-secondary)] rounded-lg p-3">
                  <p className="text-xs text-[var(--text-muted)]">{label}</p>
                  <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5 font-mono">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Include this information when sending data to GIS teams so they can correctly set the coordinate system in their software without guessing.
            </p>
          </div>
        )}

        {points.length === 0 && projectId && !loading && (
          <div className="mt-4 bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 text-sm text-amber-400">
            No survey points found in this project. Add points in the workspace first.
          </div>
        )}
      </div>
    </div>
  )
}

// P0-2 (2026-07-24): Wrap in <ToolGate> so direct-URL access can't
// bypass the plan check. The catalog page (/tools) shows lock badges,
// but those are display-only — this gate enforces the same check at
// the page level. Server-side enforcement for any export API this
// tool calls happens via the requirePlan() decorator on the route.
import { ToolGate } from '@/components/shared/ToolGate'

export default function GISExportPageGated() {
  return (
    <ToolGate toolPath="/tools/gis-export">
      <GISExportPage />
    </ToolGate>
  )
}
